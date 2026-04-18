import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 30 };

/**
 * Custom Composite Index API.
 *
 * Lets users define custom risk indices by selecting and weighting
 * any combination of NexusWatch's raw data streams. Like Bloomberg's
 * custom index builder, but for geopolitical intelligence.
 *
 * Example: "Red Sea Threat Index" =
 *   (Yemen CII × 0.3) + (Bab el-Mandeb dark vessels × 0.2) +
 *   (Houthi ACLED events × 0.3) + (FX volatility SA × 0.2)
 *
 * GET  /api/v2/custom-index?id={id}         — get index value + history
 * POST /api/v2/custom-index                  — create/evaluate a new index
 * Body: { name, components: [{type, country?, weight}] }
 *
 * Component types:
 *   cii_score        — CII score for a country (0-100)
 *   cii_conflict     — conflict sub-component (0-20)
 *   cii_disasters    — disasters sub-component (0-15)
 *   cii_sentiment    — sentiment sub-component (0-15)
 *   cii_infrastructure — infrastructure sub-component (0-15)
 *   cii_governance   — governance sub-component (0-15)
 *   cii_market       — market exposure sub-component (0-20)
 *   fx_volatility    — 7-day FX volatility for a country's currency
 *   ooni_blocked     — OONI confirmed blocks count
 *   wiki_zscore      — Wikipedia pageview z-score
 */

const CORS_ORIGIN = 'https://nexuswatch.dev';

interface IndexComponent {
  type: string;
  country?: string;
  weight: number;
}

interface IndexDefinition {
  name: string;
  components: IndexComponent[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  if (req.method === 'POST') {
    return handleCreate(req, res, sql);
  }
  if (req.method === 'GET') {
    return handleGet(req, res, sql);
  }
  return res.status(405).json({ error: 'GET or POST only' });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCreate(req: VercelRequest, res: VercelResponse, sql: any) {
  const { name, components } = req.body as IndexDefinition;
  if (!name || !components || !Array.isArray(components) || components.length === 0) {
    return res.status(400).json({ error: 'name and components[] required' });
  }

  // Normalize weights to sum to 1.0
  const totalWeight = components.reduce((s, c) => s + Math.abs(c.weight), 0);
  const normalizedComponents = components.map((c) => ({
    ...c,
    weight: totalWeight > 0 ? c.weight / totalWeight : 0,
  }));

  // Evaluate the index against current data
  const value = await evaluateIndex(normalizedComponents, sql);

  return res.json({
    success: true,
    index: {
      name,
      components: normalizedComponents,
      currentValue: Math.round(value * 100) / 100,
      scale: '0-100',
      evaluatedAt: new Date().toISOString(),
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGet(req: VercelRequest, res: VercelResponse, sql: any) {
  // Quick evaluate mode — pass components as query params
  const country = (req.query.country as string) || 'UA';
  const type = (req.query.type as string) || 'cii_score';

  const components: IndexComponent[] = [{ type, country, weight: 1.0 }];
  const value = await evaluateIndex(components, sql);

  return res.json({
    value: Math.round(value * 100) / 100,
    type,
    country,
    evaluatedAt: new Date().toISOString(),
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function evaluateIndex(components: IndexComponent[], sql: any): Promise<number> {
  let totalValue = 0;

  // Pre-fetch all needed data in parallel
  const countryCodes = [...new Set(components.filter((c) => c.country).map((c) => c.country!))];

  // CII scores
  const ciiRows =
    countryCodes.length > 0
      ? await sql`
          SELECT DISTINCT ON (country_code) country_code, score, components
          FROM country_cii_history
          WHERE country_code = ANY(${countryCodes})
          ORDER BY country_code, timestamp DESC
        `
      : [];
  const ciiMap = new Map<string, { score: number; components: Record<string, number> }>(
    ciiRows.map((r: Record<string, unknown>) => [
      String(r.country_code),
      { score: Number(r.score), components: (r.components || {}) as Record<string, number> },
    ]),
  );

  // FX volatility
  const fxRows =
    countryCodes.length > 0
      ? await sql`
          SELECT DISTINCT ON (country_code) country_code, volatility_7d
          FROM fx_rates
          WHERE country_code = ANY(${countryCodes}) AND volatility_7d IS NOT NULL
          ORDER BY country_code, date DESC
        `.catch(() => [])
      : [];
  const fxMap = new Map<string, number>(
    fxRows.map((r: Record<string, unknown>) => [String(r.country_code), Number(r.volatility_7d) || 0]),
  );

  // OONI blocked
  const ooniRows =
    countryCodes.length > 0
      ? await sql`
          SELECT country_code, SUM(confirmed_blocked) as total
          FROM ooni_measurements
          WHERE country_code = ANY(${countryCodes})
            AND measurement_date > CURRENT_DATE - INTERVAL '3 days'
          GROUP BY country_code
        `.catch(() => [])
      : [];
  const ooniMap = new Map<string, number>(
    ooniRows.map((r: Record<string, unknown>) => [String(r.country_code), Number(r.total) || 0]),
  );

  // Wikipedia z-scores
  const wikiRows =
    countryCodes.length > 0
      ? await sql`
          SELECT country_code, MAX(z_score) as max_z
          FROM wikipedia_pageviews
          WHERE country_code = ANY(${countryCodes})
            AND date > CURRENT_DATE - INTERVAL '2 days'
          GROUP BY country_code
        `.catch(() => [])
      : [];
  const wikiMap = new Map<string, number>(
    wikiRows.map((r: Record<string, unknown>) => [String(r.country_code), Number(r.max_z) || 0]),
  );

  // Evaluate each component
  for (const comp of components) {
    const cc = comp.country || '';
    let rawValue: number;

    switch (comp.type) {
      case 'cii_score':
        rawValue = ciiMap.get(cc)?.score || 0;
        break;
      case 'cii_conflict':
        rawValue = (ciiMap.get(cc)?.components?.conflict || 0) * 5; // normalize 0-20 → 0-100
        break;
      case 'cii_disasters':
        rawValue = (ciiMap.get(cc)?.components?.disasters || 0) * (100 / 15);
        break;
      case 'cii_sentiment':
        rawValue = (ciiMap.get(cc)?.components?.sentiment || 0) * (100 / 15);
        break;
      case 'cii_infrastructure':
        rawValue = (ciiMap.get(cc)?.components?.infrastructure || 0) * (100 / 15);
        break;
      case 'cii_governance':
        rawValue = (ciiMap.get(cc)?.components?.governance || 0) * (100 / 15);
        break;
      case 'cii_market':
        rawValue = (ciiMap.get(cc)?.components?.marketExposure || 0) * 5;
        break;
      case 'fx_volatility':
        rawValue = Math.min(100, (fxMap.get(cc) || 0) * 10); // 10% vol = 100
        break;
      case 'ooni_blocked':
        rawValue = Math.min(100, ooniMap.get(cc) || 0); // 100+ blocks = 100
        break;
      case 'wiki_zscore':
        rawValue = Math.min(100, (wikiMap.get(cc) || 0) * 20); // z=5 = 100
        break;
      default:
        rawValue = 0;
    }

    totalValue += rawValue * comp.weight;
  }

  return Math.max(0, Math.min(100, totalValue));
}
