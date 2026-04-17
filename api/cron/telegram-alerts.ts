import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { sendMessage, formatCiiAlert, formatCrisisAlert } from '../_telegram/send.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Telegram Alert Dispatch Cron
 *
 * Runs every 30 minutes. For each active Telegram subscriber:
 *   1. Checks if any watched country's CII exceeds their threshold
 *   2. Checks for new crisis triggers since last alert
 *   3. Sends formatted Telegram messages with inline buttons
 *   4. Deactivates subscribers who blocked the bot
 *
 * Cron: every 30 min — see vercel.json
 */

const NAME_MAP: Record<string, string> = {
  UA: 'Ukraine', RU: 'Russia', CN: 'China', TW: 'Taiwan', IR: 'Iran',
  IQ: 'Iraq', SY: 'Syria', IL: 'Israel', YE: 'Yemen', SD: 'Sudan',
  KP: 'North Korea', KR: 'South Korea', TR: 'Turkey', SA: 'Saudi Arabia',
  EG: 'Egypt', PK: 'Pakistan', AF: 'Afghanistan', MM: 'Myanmar',
  ET: 'Ethiopia', SO: 'Somalia', CD: 'DR Congo', LB: 'Lebanon',
  VE: 'Venezuela', NG: 'Nigeria', LY: 'Libya', US: 'United States',
  JP: 'Japan', DE: 'Germany', GB: 'United Kingdom', FR: 'France',
  IN: 'India', BR: 'Brazil', PL: 'Poland', RO: 'Romania',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Cron auth
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization?.replace('Bearer ', '');
    if (auth !== cronSecret) return res.status(401).json({ error: 'unauthorized' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });

  if (!process.env.TELEGRAM_BOT_TOKEN) {
    return res.json({ skipped: true, reason: 'TELEGRAM_BOT_TOKEN not set' });
  }

  const sql = neon(dbUrl);
  const stats = { subscribers: 0, alerts_sent: 0, crises_sent: 0, blocked: 0, errors: 0 };

  try {
    // Get active subscribers
    const subs = (await sql`
      SELECT id, chat_id, username, country_codes, cii_threshold, last_alerted_at
      FROM telegram_subscriptions
      WHERE active = TRUE
    `) as unknown as Array<{
      id: number;
      chat_id: string;
      username: string | null;
      country_codes: string[];
      cii_threshold: number;
      last_alerted_at: string | null;
    }>;

    stats.subscribers = subs.length;
    if (subs.length === 0) {
      return res.json({ ok: true, ...stats, note: 'no_active_subscribers' });
    }

    // Get latest CII scores (from country_cii_history — populated by compute-cii cron)
    const ciiScores = (await sql`
      SELECT DISTINCT ON (country_code)
        country_code, score, components
      FROM country_cii_history
      ORDER BY country_code, created_at DESC
    `) as unknown as Array<{
      country_code: string;
      score: number;
      components: Record<string, number>;
    }>;

    const ciiMap = new Map(ciiScores.map((r) => [r.country_code, r]));

    // Get new crisis triggers (last 35 min to overlap with 30-min cron)
    const crises = (await sql`
      SELECT id, playbook_key, country_code, trigger_type,
             cii_score, cii_delta, magnitude, notes, triggered_at
      FROM crisis_triggers
      WHERE triggered_at > NOW() - INTERVAL '35 minutes'
        AND resolved_at IS NULL
    `) as unknown as Array<{
      id: number;
      playbook_key: string;
      country_code: string | null;
      trigger_type: string;
      cii_score: number | null;
      cii_delta: number | null;
      magnitude: number | null;
      notes: string | null;
      triggered_at: string;
    }>;

    // Process each subscriber
    for (const sub of subs) {
      const chatId = Number(sub.chat_id);
      const watchAll = !sub.country_codes || sub.country_codes.length === 0;
      const watchSet = new Set(sub.country_codes || []);

      // --- CII threshold alerts ---
      // Only send if we haven't alerted this subscriber in the last 25 min (dedup)
      const lastAlert = sub.last_alerted_at ? new Date(sub.last_alerted_at).getTime() : 0;
      const now = Date.now();
      const cooldown = 25 * 60 * 1000; // 25 min

      if (now - lastAlert > cooldown) {
        const breaches: Array<{ code: string; score: number }> = [];
        for (const [code, data] of ciiMap) {
          if (!watchAll && !watchSet.has(code)) continue;
          if (data.score >= sub.cii_threshold) {
            breaches.push({ code, score: data.score });
          }
        }

        // Sort by score desc, limit to top 5 to avoid spam
        breaches.sort((a, b) => b.score - a.score);
        const topBreaches = breaches.slice(0, 5);

        if (topBreaches.length > 0) {
          // Send a consolidated alert for threshold breaches
          if (topBreaches.length === 1) {
            const b = topBreaches[0];
            const { text, markup } = formatCiiAlert({
              countryCode: b.code,
              countryName: NAME_MAP[b.code] || b.code,
              ciiScore: b.score,
              threshold: sub.cii_threshold,
            });
            const result = await sendMessage(chatId, text, { replyMarkup: markup });
            if (result.blocked) {
              stats.blocked++;
              await sql`UPDATE telegram_subscriptions SET active = FALSE WHERE id = ${sub.id}`;
              continue;
            }
            if (result.ok) stats.alerts_sent++;
            else stats.errors++;
          } else {
            // Multiple breaches — consolidated message
            const lines = [
              `<b>🟠 ${topBreaches.length} countries above CII ${sub.cii_threshold}</b>`,
              '',
              ...topBreaches.map((b) => `  <b>${NAME_MAP[b.code] || b.code}</b> (${b.code}): CII <b>${b.score}</b>`),
              '',
              `<i>NexusWatch Country Instability Index</i>`,
            ];
            const markup = {
              inline_keyboard: [[
                { text: '📊 View Intel Map', url: 'https://nexuswatch.dev/#/intel' },
              ]],
            };
            const result = await sendMessage(chatId, lines.join('\n'), { replyMarkup: markup });
            if (result.blocked) {
              stats.blocked++;
              await sql`UPDATE telegram_subscriptions SET active = FALSE WHERE id = ${sub.id}`;
              continue;
            }
            if (result.ok) stats.alerts_sent++;
            else stats.errors++;
          }

          // Update last_alerted_at
          await sql`UPDATE telegram_subscriptions SET last_alerted_at = NOW() WHERE id = ${sub.id}`;
        }
      }

      // --- Crisis triggers (always send, no cooldown) ---
      for (const crisis of crises) {
        if (!watchAll && crisis.country_code && !watchSet.has(crisis.country_code)) continue;

        const { text, markup } = formatCrisisAlert({
          playbookKey: crisis.playbook_key,
          countryCode: crisis.country_code,
          countryName: crisis.country_code ? (NAME_MAP[crisis.country_code] || crisis.country_code) : 'Global',
          triggerType: crisis.trigger_type,
          ciiScore: crisis.cii_score,
          ciiDelta: crisis.cii_delta,
          magnitude: crisis.magnitude,
          notes: crisis.notes,
        });

        const result = await sendMessage(chatId, text, { replyMarkup: markup });
        if (result.blocked) {
          stats.blocked++;
          await sql`UPDATE telegram_subscriptions SET active = FALSE WHERE id = ${sub.id}`;
          break; // Skip remaining crises for this blocked user
        }
        if (result.ok) stats.crises_sent++;
        else stats.errors++;

        // Rate limit: 30ms between messages
        await new Promise((r) => setTimeout(r, 30));
      }
    }

    return res.json({ ok: true, ...stats });
  } catch (err) {
    console.error('[cron/telegram-alerts]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'unknown' });
  }
}
