import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth';

export const config = { runtime: 'nodejs', maxDuration: 30 };

/**
 * POST /api/admin/brief/retry
 *
 * Retry a failed delivery channel for a past brief.
 *
 * Body:
 *   { brief_date: "YYYY-MM-DD", channel: "beehiiv"|"resend"|"buffer"|"notion"|"archive" }
 *
 * Flow:
 *   1. Look up the most recent brief_delivery_log row for (brief_date, channel).
 *   2. Require that row's status is 'failed' or 'partial' — refuse on 'sent' rows.
 *   3. Re-invoke the daily-brief cron with ?force_channel=<channel>&force_date=<date>.
 *      The cron reads these query params (see api/cron/daily-brief.ts) and runs
 *      only the requested channel for the requested date, re-using the already-
 *      persisted brief content from the archive.
 *   4. Return the new brief_delivery_log row id for the admin UI to poll.
 *
 * This endpoint is the Track A.4 follow-up explicitly deferred in the original
 * delivery-observability migration.
 */

interface RetryBody {
  brief_date?: string;
  channel?: 'beehiiv' | 'resend' | 'buffer' | 'notion' | 'archive';
}

const VALID_CHANNELS = new Set(['beehiiv', 'resend', 'buffer', 'notion', 'archive']);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = (req.body ?? {}) as RetryBody;
  const date = typeof body.brief_date === 'string' ? body.brief_date.trim() : '';
  const channel = body.channel ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'invalid_brief_date', hint: 'Expected YYYY-MM-DD.' });
  }
  if (!VALID_CHANNELS.has(channel)) {
    return res.status(400).json({ error: 'invalid_channel', valid: Array.from(VALID_CHANNELS) });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    const prior = (await sql`
      SELECT id, status, channel, brief_date, error_message
      FROM brief_delivery_log
      WHERE brief_date = ${date} AND channel = ${channel}
      ORDER BY id DESC
      LIMIT 1
    `) as unknown as Array<{
      id: number;
      status: string;
      channel: string;
      brief_date: string;
      error_message: string | null;
    }>;

    if (prior.length === 0) {
      return res.status(404).json({
        error: 'no_prior_delivery',
        hint: `No brief_delivery_log row for ${date}/${channel}. Check that the date is correct — we only retry channels that actually ran.`,
      });
    }
    const last = prior[0];
    if (last.status === 'sent') {
      return res.status(409).json({
        error: 'already_sent',
        hint: 'This channel already delivered successfully. Retry is only supported on failed/partial rows.',
      });
    }

    // Re-invoke the daily-brief cron with force flags. The cron reads
    // force_channel / force_date to run only the requested channel.
    const secret = process.env.CRON_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'cron_secret_not_configured' });
    }

    const baseUrl = `https://${process.env.VERCEL_URL || 'nexuswatch.dev'}`;
    const cronUrl = `${baseUrl}/api/cron/daily-brief?force_channel=${encodeURIComponent(channel)}&force_date=${encodeURIComponent(date)}`;

    const cronRes = await fetch(cronUrl, {
      method: 'GET',
      headers: { Authorization: `Bearer ${secret}` },
      signal: AbortSignal.timeout(25000),
    });
    const cronBody = await cronRes.json().catch(() => ({}));

    // Look up the new log row that the cron just wrote.
    const next = (await sql`
      SELECT id, status
      FROM brief_delivery_log
      WHERE brief_date = ${date} AND channel = ${channel}
      ORDER BY id DESC
      LIMIT 1
    `) as unknown as Array<{ id: number; status: string }>;

    return res.json({
      ok: cronRes.ok,
      cron_status: cronRes.status,
      cron_body: cronBody,
      prior_log_id: last.id,
      new_log_id: next[0]?.id ?? null,
      new_status: next[0]?.status ?? null,
    });
  } catch (err) {
    console.error('[admin/brief/retry]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'retry_failed' });
  }
}
