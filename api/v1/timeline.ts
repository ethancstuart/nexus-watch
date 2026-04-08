import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

const CORS = 'https://dashpulse.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limiting handled at Vercel platform level

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;
  const layer = req.query.layer as string | undefined;

  const sql = neon(dbUrl);

  try {
    // Default: last 24 hours
    const fromDate = from || new Date(Date.now() - 86400_000).toISOString();
    const toDate = to || new Date().toISOString();

    let rows;
    if (layer) {
      rows = await sql`
        SELECT layer_id, feature_count, timestamp
        FROM event_snapshots
        WHERE layer_id = ${layer} AND timestamp >= ${fromDate} AND timestamp <= ${toDate}
        ORDER BY timestamp ASC
        LIMIT 500
      `;
    } else {
      rows = await sql`
        SELECT layer_id, feature_count, timestamp
        FROM event_snapshots
        WHERE timestamp >= ${fromDate} AND timestamp <= ${toDate}
        ORDER BY timestamp ASC
        LIMIT 1000
      `;
    }

    // Group by timestamp for timeline density
    const timeline = rows.map((r) => ({
      layer: r.layer_id,
      count: r.feature_count,
      timestamp: r.timestamp,
    }));

    return res.setHeader('Cache-Control', 'public, max-age=300').json({
      timeline,
      count: timeline.length,
      from: fromDate,
      to: toDate,
    });
  } catch (err) {
    console.error('API v1 timeline error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
