import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Slack Alert Subscription Management
 *
 * POST /api/slack/subscribe — register a Slack webhook for CII alerts
 *   Body: { webhook_url, team_name?, channel_name?, country_codes?, cii_threshold? }
 *
 * DELETE /api/slack/subscribe — unsubscribe
 *   Body: { webhook_url }
 *
 * GET /api/slack/subscribe?webhook_url=... — check subscription status
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });

  const sql = neon(dbUrl);

  if (req.method === 'POST') {
    const { webhook_url, team_name, channel_name, country_codes, cii_threshold } = req.body as {
      webhook_url?: string;
      team_name?: string;
      channel_name?: string;
      country_codes?: string[];
      cii_threshold?: number;
    };

    if (!webhook_url || !webhook_url.startsWith('https://hooks.slack.com/')) {
      return res.status(400).json({ error: 'Invalid webhook URL. Must start with https://hooks.slack.com/' });
    }

    const codes = (country_codes || []).map((c) => c.toUpperCase()).filter((c) => c.length === 2);
    const threshold = cii_threshold != null && cii_threshold >= 0 && cii_threshold <= 100 ? cii_threshold : 60;

    await sql`
      INSERT INTO slack_subscriptions (webhook_url, team_name, channel_name, country_codes, cii_threshold, active)
      VALUES (${webhook_url}, ${team_name || null}, ${channel_name || null}, ${codes}, ${threshold}, TRUE)
      ON CONFLICT (webhook_url) DO UPDATE SET
        team_name = COALESCE(${team_name || null}, slack_subscriptions.team_name),
        channel_name = COALESCE(${channel_name || null}, slack_subscriptions.channel_name),
        country_codes = ${codes},
        cii_threshold = ${threshold},
        active = TRUE
    `;

    return res.json({ ok: true, message: 'Subscribed', threshold, countries: codes.length === 0 ? 'all' : codes });
  }

  if (req.method === 'DELETE') {
    const { webhook_url } = req.body as { webhook_url?: string };
    if (!webhook_url) return res.status(400).json({ error: 'webhook_url required' });

    await sql`UPDATE slack_subscriptions SET active = FALSE WHERE webhook_url = ${webhook_url}`;
    return res.json({ ok: true, message: 'Unsubscribed' });
  }

  if (req.method === 'GET') {
    const url = req.query.webhook_url as string;
    if (!url) return res.status(400).json({ error: 'webhook_url query param required' });

    const rows = (await sql`
      SELECT country_codes, cii_threshold, active, created_at, last_alerted_at
      FROM slack_subscriptions WHERE webhook_url = ${url}
    `) as unknown as Array<Record<string, unknown>>;

    if (rows.length === 0) return res.json({ subscribed: false });
    return res.json({ subscribed: true, ...rows[0] });
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
