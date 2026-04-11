import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Admin — Daily Brief delivery status endpoint (Track A.4).
 *
 *   GET /api/admin/brief/last-run
 *     → most recent run's per-channel delivery status across beehiiv,
 *       Buffer, Resend, Notion, and the Postgres archive.
 *
 *   GET /api/admin/brief/last-run?date=YYYY-MM-DD
 *     → all runs for the given brief_date (useful if a cron was
 *       triggered multiple times on the same day).
 *
 *   GET /api/admin/brief/last-run?history=7
 *     → last 7 days of runs, one row per (date, channel) showing the
 *       latest status. Surfaces delivery trends for the dashboard.
 *
 * Requires the caller to be in the ADMIN_EMAILS / ADMIN_IDS allowlist.
 * Session is resolved via `resolveAdmin` in api/admin/_auth.ts. The hash
 * route `/#/admin` is NOT the security boundary — this endpoint is.
 */

interface DeliveryRow {
  id: number;
  run_id: string;
  brief_date: string;
  channel: string;
  status: string;
  recipient_count: number | null;
  failed_count: number | null;
  error: string | null;
  latency_ms: number | null;
  metadata: unknown;
  created_at: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  try {
    const sql = neon(dbUrl);
    const dateParam = typeof req.query.date === 'string' ? req.query.date : null;
    const historyParam = typeof req.query.history === 'string' ? req.query.history : null;

    // History mode: last N days, latest status per (brief_date, channel)
    if (historyParam) {
      const days = Math.max(1, Math.min(30, parseInt(historyParam, 10) || 7));
      const rows = await sql`
        SELECT DISTINCT ON (brief_date, channel)
          brief_date, channel, status, recipient_count, failed_count,
          error, latency_ms, created_at
        FROM brief_delivery_log
        WHERE created_at > NOW() - (${days} || ' days')::INTERVAL
        ORDER BY brief_date DESC, channel, created_at DESC
      `;
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({ mode: 'history', days, rows });
    }

    // Specific-date mode
    if (dateParam) {
      // Validate YYYY-MM-DD shape to prevent unexpected casts
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
        return res.status(400).json({ error: 'invalid_date_format' });
      }
      const rows = (await sql`
        SELECT id, run_id, brief_date, channel, status, recipient_count,
               failed_count, error, latency_ms, metadata, created_at
        FROM brief_delivery_log
        WHERE brief_date = ${dateParam}
        ORDER BY created_at ASC, channel ASC
      `) as unknown as DeliveryRow[];
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({ mode: 'date', date: dateParam, rows });
    }

    // Default: the most recent run_id and all its channel rows.
    const latest = (await sql`
      SELECT run_id
      FROM brief_delivery_log
      ORDER BY created_at DESC
      LIMIT 1
    `) as unknown as Array<{ run_id: string }>;

    if (latest.length === 0) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({ mode: 'last-run', run: null, rows: [] });
    }

    const runId = latest[0].run_id;
    const rows = (await sql`
      SELECT id, run_id, brief_date, channel, status, recipient_count,
             failed_count, error, latency_ms, metadata, created_at
      FROM brief_delivery_log
      WHERE run_id = ${runId}
      ORDER BY created_at ASC, channel ASC
    `) as unknown as DeliveryRow[];

    // Derive a roll-up verdict the dashboard can color-code.
    const channels = new Set(rows.map((r) => r.channel));
    const anyFailed = rows.some((r) => r.status === 'failed');
    const anyPartial = rows.some((r) => r.status === 'partial');
    const verdict = anyFailed ? 'red' : anyPartial ? 'amber' : 'green';

    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({
      mode: 'last-run',
      run: {
        run_id: runId,
        brief_date: rows[0]?.brief_date ?? null,
        verdict,
        channels_observed: Array.from(channels),
      },
      rows,
    });
  } catch (err) {
    console.error('[admin/brief/last-run] query failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'query_failed' });
  }
}
