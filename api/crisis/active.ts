import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * GET /api/crisis/active
 *
 * Returns the active (not-yet-resolved) crisis triggers from the
 * crisis_triggers table (populated by /api/cron/crisis-detection).
 *
 * Called by the client-side crisisPlaybook.syncFromServerTriggers() to
 * surface server-detected crises in the modal + crisis-mode UI.
 *
 * Publicly readable (no auth) — these are triggers already driving the
 * public alert bar and platform state. No sensitive data exposed.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);
  try {
    const rows = (await sql`
      SELECT id, playbook_key, country_code, trigger_type,
             cii_score::float AS cii_score, cii_delta::float AS cii_delta,
             magnitude::float AS magnitude, source_ref, notes,
             triggered_at, dedup_key
      FROM crisis_triggers
      WHERE resolved_at IS NULL
      ORDER BY triggered_at DESC
      LIMIT 50
    `.catch(() => [] as unknown)) as unknown as Array<{
      id: number;
      playbook_key: string;
      country_code: string | null;
      trigger_type: string;
      cii_score: number | null;
      cii_delta: number | null;
      magnitude: number | null;
      source_ref: string | null;
      notes: string | null;
      triggered_at: string;
      dedup_key: string;
    }>;
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json({ triggers: Array.isArray(rows) ? rows : [] });
  } catch (err) {
    console.error('[api/crisis/active] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'query_failed' });
  }
}
