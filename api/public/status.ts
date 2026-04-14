import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Public data health status endpoint.
 * No auth required — radical transparency about service health.
 * GET /api/public/status → { layers: [...] }
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    // Return sample data if DB not configured
    return res.json({
      layers: [],
      note: 'Status endpoint not configured',
    });
  }

  try {
    const sql = neon(dbUrl);
    const rows = (await sql`
      SELECT layer, status, score, last_success, last_failure,
             active_source, circuit_state
      FROM data_health_current
      ORDER BY
        CASE status
          WHEN 'red' THEN 0
          WHEN 'degraded' THEN 1
          WHEN 'amber' THEN 2
          WHEN 'green' THEN 3
        END,
        layer
    `) as unknown as Array<{
      layer: string;
      status: string;
      score: number;
      last_success: string | null;
      last_failure: string | null;
      active_source: string | null;
      circuit_state: string;
    }>;

    // Cache for 60 seconds — public status doesn't need to be real-time
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.json({ layers: rows });
  } catch (err) {
    console.error('[api/public/status]', err instanceof Error ? err.message : err);
    return res.json({ layers: [] });
  }
}
