import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Public Audit API — query the audit trail for any country or AI response.
 *
 * GET /api/v2/audit?country=UA  → CII computation history for Ukraine
 * GET /api/v2/audit?country=UA&limit=100&days=30
 * GET /api/v2/audit/ai?query_prefix=...
 *
 * No API key required for public audit — transparency is the product.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.json({ entries: [], note: 'db not configured' });

  const country = typeof req.query.country === 'string' ? req.query.country.toUpperCase() : null;
  const limit = Math.min(500, parseInt(String(req.query.limit || '100'), 10) || 100);
  const days = Math.min(365, parseInt(String(req.query.days || '30'), 10) || 30);

  if (!country) {
    return res.status(400).json({ error: 'country parameter required (ISO-2 code)' });
  }

  try {
    const sql = neon(dbUrl);
    const sinceMs = Date.now() - days * 86400000;

    const entries = (await sql`
      SELECT id, country_code, computed_at_ms, rule_version, input_lineage_ids,
             score, previous_score, components, confidence, applied_rules, gaps
      FROM audit_log
      WHERE country_code = ${country} AND computed_at_ms >= ${sinceMs}
      ORDER BY computed_at_ms DESC
      LIMIT ${limit}
    `.catch(() => [])) as unknown as Array<Record<string, unknown>>;

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    return res.json({
      country,
      days,
      count: entries.length,
      entries,
      meta: {
        source: 'NexusWatch CII Audit Trail',
        attribution: 'Every computation logged with rule version, inputs, outputs, and confidence level.',
      },
    });
  } catch (err) {
    console.error('[api/v2/audit]', err instanceof Error ? err.message : err);
    return res.json({ entries: [], error: 'audit_query_failed' });
  }
}
