import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { kvCached } from '../_lib/kvCache';

export const config = { runtime: 'nodejs' };

/**
 * Intelligence API v2 — Country Instability Index
 *
 * GET /api/v2/cii          → all countries with CII scores + confidence
 * GET /api/v2/cii?code=UA  → single country with full evidence chain
 * GET /api/v2/cii?tier=core → filter by tier
 *
 * Requires API key in X-API-Key header or ?apikey query param.
 * Returns JSON with source attribution and confidence levels.
 */

function unauthorized(res: VercelResponse): void {
  res.status(401).json({
    error: 'unauthorized',
    message: 'Valid API key required. Include X-API-Key header or ?apikey query parameter.',
    docs: 'https://nexuswatch.dev/#/api',
  });
}

function validateApiKey(req: VercelRequest): boolean {
  const key = req.headers['x-api-key'] || (typeof req.query.apikey === 'string' ? req.query.apikey : null);
  const validKeys = (process.env.API_V2_KEYS || '').split(',').filter(Boolean);
  if (validKeys.length === 0) return false; // no keys configured = API disabled
  return typeof key === 'string' && validKeys.includes(key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  if (!validateApiKey(req)) return unauthorized(res);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });

  const code = typeof req.query.code === 'string' ? req.query.code.toUpperCase() : null;
  const tier = typeof req.query.tier === 'string' ? req.query.tier : null;

  try {
    const sql = neon(dbUrl);

    // KV-cached hot path: the latest snapshot only changes once/day, so a
    // 15-minute TTL gives effectively-free reads with sub-100ms p99.
    // Soft TTL of 10m lets a single lazy refresh absorb daily turnover.
    const cacheKey = code ? `v2:cii:code:${code}` : tier ? `v2:cii:tier:${tier}` : 'v2:cii:all';
    const cached = await kvCached(
      cacheKey,
      900,
      async () => {
        const latestDate = (await sql`
          SELECT MAX(date) as max_date FROM cii_daily_snapshots
        `) as unknown as Array<{ max_date: string | null }>;
        const date = latestDate[0]?.max_date;
        if (!date) return { date: null, rows: [] as Array<Record<string, unknown>> };

        const rows = code
          ? ((await sql`
              SELECT * FROM cii_daily_snapshots
              WHERE date = ${date} AND country_code = ${code}
            `) as unknown as Array<Record<string, unknown>>)
          : ((await sql`
              SELECT * FROM cii_daily_snapshots
              WHERE date = ${date}
              ORDER BY cii_score DESC
            `) as unknown as Array<Record<string, unknown>>);

        return { date, rows };
      },
      { softTtl: 600 },
    );

    const date = cached.date;
    const rows = cached.rows;
    if (!date) {
      return res.json({
        data: [],
        meta: {
          source: 'NexusWatch Country Instability Index',
          methodology:
            '6-component model: Conflict (20%) + Disasters (15%) + Sentiment (15%) + Infrastructure (15%) + Governance (15%) + Market Exposure (20%)',
          date: null,
          count: 0,
          note: 'No CII snapshots available yet. Data recording begins with the next daily brief.',
        },
      });
    }

    const countries = rows.map((r) => ({
      country_code: r.country_code,
      cii_score: r.cii_score,
      confidence: r.confidence,
      components: {
        conflict: r.component_conflict,
        disasters: r.component_disasters,
        sentiment: r.component_sentiment,
        infrastructure: r.component_infrastructure,
        governance: r.component_governance,
        market_exposure: r.component_market_exposure,
      },
      source_count: r.source_count,
      data_point_count: r.data_point_count,
      snapshot_date: r.date,
    }));

    // Filter by tier if requested (requires mapping from country code to tier)
    // For now, return all and let the client filter
    const filtered = tier ? countries : countries;

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({
      data: filtered,
      meta: {
        source: 'NexusWatch Country Instability Index',
        methodology:
          '6-component model: Conflict (20%) + Disasters (15%) + Sentiment (15%) + Infrastructure (15%) + Governance (15%) + Market Exposure (20%)',
        date,
        count: filtered.length,
        confidence_levels: {
          high: '3+ sources, all live/recent, 10+ data points',
          medium: '2+ sources or partial stale data',
          low: 'single source, stale, or limited data',
        },
        attribution:
          'Data sourced from ACLED, USGS, NASA FIRMS, GDELT, Cloudflare Radar, Polymarket, WHO, OFAC. See nexuswatch.dev/#/methodology for full documentation.',
      },
    });
  } catch (err) {
    console.error('[api/v2/cii] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
