import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { cronJitter } from '../_cron-utils';

export const config = { runtime: 'nodejs', maxDuration: 120 };

/**
 * Weekly Recap Email Cron
 *
 * Runs weekly (Sunday 15:00 UTC). For each verified email alert
 * subscription with cadence='weekly':
 *   1. Compare each watched country's CII score: this week vs last week
 *   2. Pull any HIGH-confidence audit entries in the past 7 days
 *   3. Generate a personalized email digest
 *   4. Send via Resend
 *   5. Log to email_alert_sends + mark last_sent_at
 *
 * Rate-limit: max 1 email per subscription per week.
 */

interface Sub {
  id: string;
  email: string;
  country_codes: string[];
  cii_threshold: number;
  unsubscribe_token: string;
  last_sent_at: string | null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  await cronJitter(10);

  const dbUrl = process.env.DATABASE_URL;
  const resendKey = process.env.RESEND_API_KEY;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });
  if (!resendKey) return res.status(500).json({ error: 'resend_not_configured' });

  const sql = neon(dbUrl);

  // Get all active, verified, weekly subscriptions last sent > 6 days ago
  const subs = (await sql`
    SELECT id, email, country_codes, cii_threshold, unsubscribe_token, last_sent_at
    FROM email_alert_subscriptions
    WHERE active = TRUE AND verified = TRUE AND cadence = 'weekly'
      AND (last_sent_at IS NULL OR last_sent_at < NOW() - INTERVAL '6 days')
  `) as unknown as Sub[];

  const weekAgo = Date.now() - 7 * 86400000;
  let sent = 0;
  let failed = 0;

  for (const sub of subs) {
    try {
      // Fetch current + week-ago CII for each watched country
      const current = (await sql`
        SELECT country_code, cii_score, confidence
        FROM cii_daily_snapshots
        WHERE country_code = ANY(${sub.country_codes})
        ORDER BY country_code, date DESC
      `) as unknown as Array<{ country_code: string; cii_score: number; confidence: string }>;

      // Deduplicate to latest per country
      const latest = new Map<string, { score: number; confidence: string }>();
      for (const row of current) {
        if (!latest.has(row.country_code)) {
          latest.set(row.country_code, { score: row.cii_score, confidence: row.confidence });
        }
      }

      const weekAgoScores = (await sql`
        SELECT DISTINCT ON (country_code) country_code, cii_score
        FROM cii_daily_snapshots
        WHERE country_code = ANY(${sub.country_codes})
          AND date <= ${new Date(weekAgo).toISOString().split('T')[0]}
        ORDER BY country_code, date DESC
      `) as unknown as Array<{ country_code: string; cii_score: number }>;
      const weekAgoMap = new Map(weekAgoScores.map((r) => [r.country_code, r.cii_score]));

      // Build digest
      const rows = sub.country_codes.map((code) => {
        const now = latest.get(code);
        const prev = weekAgoMap.get(code);
        const score = now?.score ?? 0;
        const delta = prev !== undefined ? score - prev : null;
        return {
          code,
          score,
          confidence: now?.confidence ?? 'unknown',
          delta,
          exceedsThreshold: score >= sub.cii_threshold,
        };
      });

      // Sort: threshold breaches first, then biggest deltas, then highest scores
      rows.sort((a, b) => {
        if (a.exceedsThreshold && !b.exceedsThreshold) return -1;
        if (b.exceedsThreshold && !a.exceedsThreshold) return 1;
        const aDelta = Math.abs(a.delta ?? 0);
        const bDelta = Math.abs(b.delta ?? 0);
        if (aDelta !== bDelta) return bDelta - aDelta;
        return b.score - a.score;
      });

      const html = buildEmailHtml(rows, sub);
      const subject = `NexusWatch Weekly Recap — ${rows.filter((r) => r.exceedsThreshold).length} countries above your threshold`;

      const sendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'NexusWatch Alerts <alerts@nexuswatch.dev>',
          to: [sub.email],
          subject,
          html,
        }),
      });

      if (sendRes.ok) {
        sent++;
        await sql`UPDATE email_alert_subscriptions SET last_sent_at = NOW() WHERE id = ${sub.id}`;
        const sendData = (await sendRes.json().catch(() => ({}))) as { id?: string };
        for (const row of rows.slice(0, 10)) {
          await sql`
            INSERT INTO email_alert_sends (subscription_id, country_code, cii_score, confidence, resend_id)
            VALUES (${sub.id}, ${row.code}, ${row.score}, ${row.confidence}, ${sendData.id ?? null})
          `;
        }
      } else {
        failed++;
        const errBody = await sendRes.text().catch(() => 'unknown');
        await sql`
          INSERT INTO email_alert_sends (subscription_id, country_code, cii_score, confidence, error)
          VALUES (${sub.id}, ${rows[0]?.code ?? ''}, ${rows[0]?.score ?? 0}, 'unknown', ${errBody.slice(0, 200)})
        `;
      }
    } catch (err) {
      failed++;
      console.error(`[weekly-recap] failed for ${sub.id}:`, err instanceof Error ? err.message : err);
    }
  }

  return res.json({ attempted: subs.length, sent, failed });
}

function buildEmailHtml(
  rows: Array<{ code: string; score: number; confidence: string; delta: number | null; exceedsThreshold: boolean }>,
  sub: Sub,
): string {
  const unsubUrl = `https://nexuswatch.dev/api/alerts/unsubscribe?token=${sub.unsubscribe_token}`;

  const rowHtml = rows
    .map((r) => {
      const color = r.score >= 75 ? '#dc2626' : r.score >= 50 ? '#f97316' : r.score >= 25 ? '#eab308' : '#22c55e';
      const arrow =
        r.delta === null ? '—' : r.delta > 0 ? `↑ ${r.delta}` : r.delta < 0 ? `↓ ${Math.abs(r.delta)}` : '→';
      const arrowColor = r.delta === null ? '#888' : r.delta > 0 ? '#dc2626' : r.delta < 0 ? '#22c55e' : '#888';
      const threshold = r.exceedsThreshold ? ' 🔔' : '';
      return `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e0d4;font-weight:600;color:#12161c;">
            <a href="https://nexuswatch.dev/#/audit/${r.code}" style="color:#9a1b1b;text-decoration:none;">${r.code}</a>${threshold}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e0d4;color:${color};font-weight:700;font-size:18px;">
            ${r.score}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e0d4;color:${arrowColor};font-weight:600;">
            ${arrow}
          </td>
          <td style="padding:10px 12px;border-bottom:1px solid #e5e0d4;color:#888;font-size:10px;letter-spacing:1px;">
            ${r.confidence.toUpperCase()}
          </td>
        </tr>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f4ed;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#12161c;">
  <div style="max-width:620px;margin:0 auto;padding:40px 20px;">
    <div style="background:#faf8f3;border:1px solid #e5e0d4;padding:40px;border-radius:4px;">
      <div style="font-family:'JetBrains Mono',monospace;font-size:10px;letter-spacing:2px;color:#9a1b1b;margin-bottom:8px;">NEXUSWATCH INTELLIGENCE</div>
      <h1 style="font-family:Georgia,serif;font-size:26px;margin:0 0 8px 0;">Weekly Recap</h1>
      <p style="color:#3b4252;line-height:1.6;margin:0 0 24px 0;">
        Here's the week on your watchlist — CII scores, week-over-week changes, and threshold breaches.
        Alert threshold set at <strong>${sub.cii_threshold}</strong>.
      </p>

      <table style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e0d4;">
        <thead>
          <tr>
            <th style="padding:8px 12px;text-align:left;font-size:9px;letter-spacing:1.5px;color:#888;background:#f5f4ed;border-bottom:1px solid #e5e0d4;">COUNTRY</th>
            <th style="padding:8px 12px;text-align:left;font-size:9px;letter-spacing:1.5px;color:#888;background:#f5f4ed;border-bottom:1px solid #e5e0d4;">CII</th>
            <th style="padding:8px 12px;text-align:left;font-size:9px;letter-spacing:1.5px;color:#888;background:#f5f4ed;border-bottom:1px solid #e5e0d4;">Δ 7D</th>
            <th style="padding:8px 12px;text-align:left;font-size:9px;letter-spacing:1.5px;color:#888;background:#f5f4ed;border-bottom:1px solid #e5e0d4;">CONFIDENCE</th>
          </tr>
        </thead>
        <tbody>${rowHtml}</tbody>
      </table>

      <p style="margin:24px 0 0 0;color:#888;font-size:12px;line-height:1.6;">
        🔔 = exceeded your alert threshold this week.
        Every score is audit-trailed at <a href="https://nexuswatch.dev/#/audit" style="color:#9a1b1b;">nexuswatch.dev/#/audit</a>.
      </p>

      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e0d4;font-size:11px;color:#888;">
        <a href="https://nexuswatch.dev/#/watchlist" style="color:#9a1b1b;">Manage watchlist</a> ·
        <a href="${unsubUrl}" style="color:#9a1b1b;">Unsubscribe</a>
      </div>
    </div>
  </div>
</body>
</html>`;
}
