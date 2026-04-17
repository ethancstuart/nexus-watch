import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from './_auth.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Admin — Data Health status endpoint (Track D.1).
 *
 *   GET /api/admin/data-health
 *     → current state for all 30 layers from data_health_current
 *   GET /api/admin/data-health?layer=earthquakes
 *     → 24h history for a single layer from data_health
 *
 * Requires the caller to be in the ADMIN_EMAILS / ADMIN_IDS allowlist, enforced
 * via the shared `resolveAdmin` helper in api/admin/_auth.ts (extracted 2026-04-11
 * during Track A.4).
 */

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
    const layerParam = typeof req.query.layer === 'string' ? req.query.layer : null;

    if (layerParam) {
      const history = await sql`
        SELECT id, layer, status, score, last_success, last_failure, error,
               fallback_used, latency_ms, record_count, freshness_seconds, created_at
        FROM data_health
        WHERE layer = ${layerParam}
          AND created_at > NOW() - INTERVAL '24 hours'
        ORDER BY created_at DESC
        LIMIT 500
      `;
      const currentRows = await sql`
        SELECT layer, status, score, last_success, last_failure, consecutive_failures,
               circuit_state, active_source, updated_at
        FROM data_health_current
        WHERE layer = ${layerParam}
        LIMIT 1
      `;
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({
        layer: layerParam,
        current: currentRows[0] ?? null,
        history,
      });
    }

    const rows = await sql`
      SELECT layer, status, score, last_success, last_failure, consecutive_failures,
             circuit_state, active_source, updated_at
      FROM data_health_current
      ORDER BY layer ASC
    `;
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ layers: rows });
  } catch (err) {
    console.error('admin/data-health error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'query_failed' });
  }
}
