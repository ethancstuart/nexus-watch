import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Public Lineage API — trace any data point back to its source.
 *
 * GET /api/v2/lineage/:id        → one lineage record by ID
 * GET /api/v2/lineage?layer=acled → recent fetches for a layer
 * GET /api/v2/lineage?layer=acled&limit=50
 *
 * No API key required — this IS the transparency product.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.json({ records: [], note: 'db not configured' });

  const layer = typeof req.query.layer === 'string' ? req.query.layer : null;
  const id = typeof req.query.id === 'string' ? req.query.id : null;
  const limit = Math.min(500, parseInt(String(req.query.limit || '50'), 10) || 50);

  try {
    const sql = neon(dbUrl);

    if (id) {
      const record = (await sql`
        SELECT * FROM data_lineage WHERE id = ${id}
      `.catch(() => [])) as unknown as Array<Record<string, unknown>>;
      if (record.length === 0) return res.status(404).json({ error: 'not_found' });
      return res.json({ record: record[0] });
    }

    if (!layer) {
      return res.status(400).json({ error: 'id or layer parameter required' });
    }

    const records = (await sql`
      SELECT * FROM data_lineage
      WHERE layer_id = ${layer}
      ORDER BY fetch_start_ms DESC
      LIMIT ${limit}
    `.catch(() => [])) as unknown as Array<Record<string, unknown>>;

    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.json({
      layer,
      count: records.length,
      records,
      meta: {
        source: 'NexusWatch Data Lineage',
        attribution: 'Every fetch logged — URL, status, latency, response size, quality filters, diffs.',
      },
    });
  } catch (err) {
    console.error('[api/v2/lineage]', err instanceof Error ? err.message : err);
    return res.json({ records: [], error: 'lineage_query_failed' });
  }
}
