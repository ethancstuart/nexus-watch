import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { computeApiExposure, type ApiHolding } from './_holding-map';
import { kvCached } from '../_lib/kvCache';

export const config = { runtime: 'nodejs' };

/**
 * Intelligence API v2 — Portfolio Geopolitical Exposure
 *
 * POST /api/v2/exposure
 *   Authorization: X-API-Key or ?apikey
 *   Body: { "holdings": [{ "symbol": "TSM", "weight": 15 }, …] }
 *
 *   Returns a per-country exposure breakdown + CII-weighted risk score,
 *   elevated-country list (CII ≥ 60), and the list of unmapped symbols
 *   the caller should either map themselves or ignore.
 *
 * The supported symbol universe is documented at /#/api. Callers with
 * holdings outside that universe can either:
 *   (a) request additions via the docs page, or
 *   (b) aggregate at a higher level (e.g. map to an ETF we do support).
 *
 * Errors:
 *   401  invalid / missing API key
 *   400  empty or malformed holdings
 *   500  database unreachable
 */

function validateApiKey(req: VercelRequest): boolean {
  const key = req.headers['x-api-key'] || (typeof req.query.apikey === 'string' ? req.query.apikey : null);
  const validKeys = (process.env.API_V2_KEYS || '').split(',').filter(Boolean);
  if (validKeys.length === 0) return false;
  return typeof key === 'string' && validKeys.includes(key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!validateApiKey(req)) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Valid API key required. Include X-API-Key header or ?apikey query param.',
      docs: 'https://nexuswatch.dev/#/api',
    });
  }

  const body = (req.body ?? {}) as { holdings?: unknown };
  if (!Array.isArray(body.holdings) || body.holdings.length === 0) {
    return res.status(400).json({
      error: 'invalid_body',
      hint: 'Body must be { holdings: [{ symbol: string, weight: number }, …] }.',
    });
  }
  const holdings: ApiHolding[] = [];
  for (const h of body.holdings) {
    if (!h || typeof h !== 'object') continue;
    const rec = h as { symbol?: unknown; weight?: unknown };
    const symbol = typeof rec.symbol === 'string' ? rec.symbol.trim() : '';
    const weight = typeof rec.weight === 'number' ? rec.weight : parseFloat(String(rec.weight ?? ''));
    if (!symbol || !Number.isFinite(weight) || weight <= 0) continue;
    holdings.push({ symbol, weight });
  }
  if (holdings.length === 0) {
    return res.status(400).json({ error: 'no_valid_holdings' });
  }
  if (holdings.length > 200) {
    return res.status(400).json({ error: 'too_many_holdings', cap: 200 });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql: any = neon(dbUrl);

    // The CII snapshot is shared across all exposure callers; cache it
    // (15-min TTL) so every POST doesn't re-fetch the whole table. Portfolio
    // math itself is per-call (depends on holdings), not cached.
    const snapshot = await kvCached(
      'v2:exposure:cii-snapshot',
      900,
      async () => {
        const rows = (await sql`
          SELECT country_code, cii_score::float AS cii_score, confidence
          FROM cii_daily_snapshots
          WHERE date = (SELECT MAX(date) FROM cii_daily_snapshots)
        `) as unknown as Array<{ country_code: string; cii_score: number; confidence: string }>;
        const latest = (await sql`SELECT MAX(date) AS d FROM cii_daily_snapshots`) as unknown as Array<{
          d: string | null;
        }>;
        return { rows, date: latest[0]?.d ?? null };
      },
      { softTtl: 600 },
    );
    const ciiByCountry = new Map<string, { score: number; confidence: string }>();
    for (const r of snapshot.rows) ciiByCountry.set(r.country_code, { score: r.cii_score, confidence: r.confidence });

    const latest = [{ d: snapshot.date }];
    const report = computeApiExposure(holdings, ciiByCountry);
    res.setHeader('Cache-Control', 'no-store');
    return res.json({
      data: report,
      meta: {
        source: 'NexusWatch Portfolio Exposure Engine v1',
        methodology:
          'Per-holding country attribution mapped from public filings × live CII. weighted_risk = exposure_pct × (cii_score / 100). overall_risk is the exposure-weighted mean CII across mapped countries.',
        cii_snapshot_date: latest[0]?.d ?? null,
        docs: 'https://nexuswatch.dev/#/api',
      },
    });
  } catch (err) {
    console.error('[api/v2/exposure] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
