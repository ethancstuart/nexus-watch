import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

const CORS = 'https://nexuswatch.dev';

/**
 * Gold Layer Data API — serves cached upstream data from Postgres.
 *
 * Query params:
 * - layer: layer ID (earthquakes, fires, disease-outbreaks, gdelt-news, launches, gdacs-disasters)
 * - history: number of snapshots to return (default 1 = latest only)
 *
 * Returns the latest cached data for the requested layer.
 * Falls back gracefully — if no cached data, returns empty array.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const layer = req.query.layer as string;
  const historyCount = Math.min(100, Math.max(1, parseInt(String(req.query.history || '1'), 10)));

  if (!layer) {
    // Return all available layers with latest counts
    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT DISTINCT ON (layer_id) layer_id, feature_count, fetched_at
      FROM data_lake ORDER BY layer_id, fetched_at DESC
    `;
    return res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60').json({
      layers: rows.map((r) => ({
        id: r.layer_id,
        count: r.feature_count,
        lastFetched: r.fetched_at,
      })),
    });
  }

  try {
    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT data, feature_count, fetched_at
      FROM data_lake
      WHERE layer_id = ${layer}
      ORDER BY fetched_at DESC
      LIMIT ${historyCount}
    `;

    if (rows.length === 0) {
      return res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30').json({
        layer,
        data: [],
        count: 0,
        source: 'data-lake',
        message: 'No cached data available. Data lake cron may not have run yet.',
      });
    }

    const latest = rows[0];
    return res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60').json({
      layer,
      data: latest.data,
      count: latest.feature_count,
      fetchedAt: latest.fetched_at,
      source: 'data-lake',
      ...(historyCount > 1
        ? {
            history: rows.map((r) => ({
              data: r.data,
              count: r.feature_count,
              fetchedAt: r.fetched_at,
            })),
          }
        : {}),
    });
  } catch (err) {
    console.error('Data lake API error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to read from data lake' });
  }
}
