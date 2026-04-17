import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { sendSlackMessage, formatCiiSlackBlocks, formatCrisisSlackBlocks } from '../_slack/send.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Slack Alert Dispatch Cron
 *
 * Runs every 30 min. Mirrors telegram-alerts.ts exactly:
 *   1. Checks CII thresholds for each subscriber's watchlist
 *   2. Sends crisis triggers within 35-min window
 *   3. Deactivates subscriptions with deleted webhooks (404/410)
 *
 * Cron: every 30 min — see vercel.json
 */

const NAME_MAP: Record<string, string> = {
  UA: 'Ukraine',
  RU: 'Russia',
  CN: 'China',
  TW: 'Taiwan',
  IR: 'Iran',
  IQ: 'Iraq',
  SY: 'Syria',
  IL: 'Israel',
  YE: 'Yemen',
  SD: 'Sudan',
  KP: 'North Korea',
  KR: 'South Korea',
  TR: 'Turkey',
  SA: 'Saudi Arabia',
  EG: 'Egypt',
  PK: 'Pakistan',
  AF: 'Afghanistan',
  MM: 'Myanmar',
  ET: 'Ethiopia',
  SO: 'Somalia',
  CD: 'DR Congo',
  LB: 'Lebanon',
  VE: 'Venezuela',
  NG: 'Nigeria',
  LY: 'Libya',
  US: 'United States',
  JP: 'Japan',
  DE: 'Germany',
  GB: 'United Kingdom',
  FR: 'France',
  IN: 'India',
  BR: 'Brazil',
  PL: 'Poland',
  RO: 'Romania',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization?.replace('Bearer ', '');
    if (auth !== cronSecret) return res.status(401).json({ error: 'unauthorized' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });

  const sql = neon(dbUrl);
  const stats = { subscribers: 0, alerts_sent: 0, crises_sent: 0, deleted: 0, errors: 0 };

  try {
    const subs = (await sql`
      SELECT id, webhook_url, team_name, channel_name, country_codes, cii_threshold, last_alerted_at
      FROM slack_subscriptions WHERE active = TRUE
    `) as unknown as Array<{
      id: number;
      webhook_url: string;
      team_name: string | null;
      channel_name: string | null;
      country_codes: string[];
      cii_threshold: number;
      last_alerted_at: string | null;
    }>;

    stats.subscribers = subs.length;
    if (subs.length === 0) return res.json({ ok: true, ...stats });

    // Latest CII scores
    const ciiScores = (await sql`
      SELECT DISTINCT ON (country_code) country_code, score
      FROM country_cii_history ORDER BY country_code, timestamp DESC
    `) as unknown as Array<{ country_code: string; score: number }>;
    const ciiMap = new Map(ciiScores.map((r) => [r.country_code, r.score]));

    // Recent crisis triggers
    const crises = (await sql`
      SELECT id, playbook_key, country_code, trigger_type, cii_score, cii_delta, notes, triggered_at
      FROM crisis_triggers
      WHERE triggered_at > NOW() - INTERVAL '35 minutes' AND resolved_at IS NULL
    `) as unknown as Array<{
      id: number;
      playbook_key: string;
      country_code: string | null;
      trigger_type: string;
      cii_score: number | null;
      cii_delta: number | null;
      notes: string | null;
    }>;

    for (const sub of subs) {
      const watchAll = !sub.country_codes || sub.country_codes.length === 0;
      const watchSet = new Set(sub.country_codes || []);

      // CII threshold alerts (25-min cooldown)
      const lastAlert = sub.last_alerted_at ? new Date(sub.last_alerted_at).getTime() : 0;
      if (Date.now() - lastAlert > 25 * 60 * 1000) {
        const breaches: Array<{ code: string; score: number }> = [];
        for (const [code, score] of ciiMap) {
          if (!watchAll && !watchSet.has(code)) continue;
          if (score >= sub.cii_threshold) breaches.push({ code, score });
        }
        breaches.sort((a, b) => b.score - a.score);

        if (breaches.length > 0) {
          const top = breaches.slice(0, 5);
          const blocks =
            top.length === 1
              ? formatCiiSlackBlocks({
                  countryCode: top[0].code,
                  countryName: NAME_MAP[top[0].code] || top[0].code,
                  ciiScore: top[0].score,
                  threshold: sub.cii_threshold,
                })
              : [
                  {
                    type: 'header',
                    text: {
                      type: 'plain_text',
                      text: `:warning: ${top.length} countries above CII ${sub.cii_threshold}`,
                      emoji: true,
                    },
                  },
                  {
                    type: 'section',
                    text: {
                      type: 'mrkdwn',
                      text: top.map((b) => `*${NAME_MAP[b.code] || b.code}* (${b.code}): CII *${b.score}*`).join('\n'),
                    },
                  },
                  {
                    type: 'actions',
                    elements: [
                      {
                        type: 'button',
                        text: { type: 'plain_text', text: 'View Intel Map' },
                        url: 'https://nexuswatch.dev/#/intel',
                      },
                    ],
                  },
                ];

          const result = await sendSlackMessage(sub.webhook_url, blocks);
          if (result.deleted) {
            stats.deleted++;
            await sql`UPDATE slack_subscriptions SET active = FALSE WHERE id = ${sub.id}`;
            continue;
          }
          if (result.ok) stats.alerts_sent++;
          else stats.errors++;

          await sql`UPDATE slack_subscriptions SET last_alerted_at = NOW() WHERE id = ${sub.id}`;
        }
      }

      // Crisis triggers
      for (const crisis of crises) {
        if (!watchAll && crisis.country_code && !watchSet.has(crisis.country_code)) continue;

        const blocks = formatCrisisSlackBlocks({
          countryName: crisis.country_code ? NAME_MAP[crisis.country_code] || crisis.country_code : 'Global',
          countryCode: crisis.country_code,
          triggerType: crisis.trigger_type,
          ciiScore: crisis.cii_score,
          ciiDelta: crisis.cii_delta,
          notes: crisis.notes,
        });

        const result = await sendSlackMessage(sub.webhook_url, blocks);
        if (result.deleted) {
          stats.deleted++;
          await sql`UPDATE slack_subscriptions SET active = FALSE WHERE id = ${sub.id}`;
          break;
        }
        if (result.ok) stats.crises_sent++;
        else stats.errors++;
      }
    }

    return res.json({ ok: true, ...stats });
  } catch (err) {
    console.error('[cron/slack-alerts]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'unknown' });
  }
}
