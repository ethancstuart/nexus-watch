// api/cron/scheduled-emails.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 120 };

interface ScheduledEmail {
  id: number;
  user_id: string;
  email: string;
  tier: string;
  template: string;
}

function buildEmailContent(template: string): { subject: string; html: string } | null {
  if (template === 'welcome_d0') {
    return {
      subject: "You're in — here's what NexusWatch shows right now",
      html: `<div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:32px;max-width:600px;margin:0 auto;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#22c55e;margin-bottom:24px;">NEXUSWATCH</div><h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px;">Welcome to NexusWatch.</h1><p style="font-size:14px;color:#888;line-height:1.6;margin:0 0 24px;">Your access is active. Three things to do right now:</p><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:12px;"><a href="https://nexuswatch.dev/#/intel" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Open the Intel Map</a><p style="font-size:12px;color:#666;margin:4px 0 0;">45+ live layers. 150+ countries. Add your first watchlist country.</p></div><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:12px;"><a href="https://nexuswatch.dev/#/intel?open=ai-terminal" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Run a Sitrep</a><p style="font-size:12px;color:#666;margin:4px 0 0;">Ask the AI analyst: "What's the current situation in [region]?"</p></div><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:24px;"><a href="https://nexuswatch.dev/#/briefs" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Read the Brief Archive</a><p style="font-size:12px;color:#666;margin:4px 0 0;">Daily intelligence briefs, every morning.</p></div><p style="font-size:11px;color:#555;margin:0;">NexusWatch — nexuswatch.dev</p></div>`,
    };
  }

  if (template === 'nudge_d3') {
    return {
      subject: 'Have you run a sitrep yet?',
      html: `<div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:32px;max-width:600px;margin:0 auto;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#22c55e;margin-bottom:24px;">NEXUSWATCH</div><h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px;">The AI analyst is waiting.</h1><p style="font-size:14px;color:#888;line-height:1.6;margin:0 0 24px;">Ask it anything — regional instability, crisis trajectories, CII movement. It synthesizes live data across 45+ sources in seconds.</p><a href="https://nexuswatch.dev/#/intel?open=ai-terminal" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:13px;letter-spacing:1px;padding:12px 24px;border-radius:4px;text-decoration:none;margin-bottom:24px;">RUN YOUR FIRST SITREP →</a><p style="font-size:11px;color:#555;margin:0;">NexusWatch — nexuswatch.dev</p></div>`,
    };
  }

  // upgrade_d7 was a paywall artifact — silently drop any in-flight rows.
  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dbUrl = process.env.DATABASE_URL;
  const resendKey = process.env.RESEND_API_KEY;

  if (!dbUrl || !resendKey) {
    return res.status(200).json({ success: false, reason: 'Missing DATABASE_URL or RESEND_API_KEY' });
  }

  const sql = neon(dbUrl);

  const dueEmails = (await sql`
    UPDATE scheduled_emails
    SET claimed_at = NOW()
    WHERE id IN (
      SELECT id FROM scheduled_emails
      WHERE send_at <= NOW()
        AND sent_at IS NULL
        AND retry_count < 5
        AND (claimed_at IS NULL OR claimed_at < NOW() - INTERVAL '10 minutes')
      ORDER BY send_at ASC
      LIMIT 50
    )
    RETURNING id, user_id, email, tier, template
  `) as ScheduledEmail[];

  if (dueEmails.length === 0) {
    return res.status(200).json({ success: true, sent: 0, skipped: 0, errors: [] });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of dueEmails) {
    const content = buildEmailContent(row.template);

    if (!content) {
      await sql`UPDATE scheduled_emails SET sent_at = NOW() WHERE id = ${row.id}`;
      skipped++;
      continue;
    }

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({
          from: 'NexusWatch <hello@nexuswatch.dev>',
          to: row.email,
          subject: content.subject,
          html: content.html,
        }),
      });

      if (emailRes.ok) {
        await sql`UPDATE scheduled_emails SET sent_at = NOW() WHERE id = ${row.id}`;
        sent++;
      } else {
        const errBody = await emailRes.text();
        const errMsg = `${emailRes.status} ${errBody.slice(0, 100)}`;
        errors.push(`id=${row.id}: ${errMsg}`);
        await sql`
          UPDATE scheduled_emails
          SET retry_count = retry_count + 1, last_error = ${errMsg}
          WHERE id = ${row.id}
        `;
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown';
      errors.push(`id=${row.id}: ${errMsg}`);
      try {
        await sql`
          UPDATE scheduled_emails
          SET retry_count = retry_count + 1, last_error = ${errMsg}
          WHERE id = ${row.id}
        `;
      } catch {
        // Non-fatal — retry count update failure is acceptable
      }
    }
  }

  console.log('[scheduled-emails] sent=%d skipped=%d errors=%d', sent, skipped, errors.length);
  return res.status(200).json({ success: true, sent, skipped, errors });
}
