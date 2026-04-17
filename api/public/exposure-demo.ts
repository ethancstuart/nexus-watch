import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { computeApiExposure } from '../v2/_holding-map.js';
import { computeChokepointExposure } from '../v2/_chokepoint-map.js';

export const config = { runtime: 'nodejs' };

/**
 * Public demo endpoint for portfolio exposure.
 *
 * GET /api/public/exposure-demo
 *
 * Returns pre-computed geopolitical exposure for a fixed demo portfolio
 * (TSMC 25%, XOM 20%, AAPL 30%, VWO 25%). No auth required.
 * Used by the landing page "try it" widget.
 *
 * Cached for 5 minutes — the demo portfolio doesn't change, only CII scores do.
 */

const DEMO_HOLDINGS = [
  { symbol: 'TSM', weight: 25 },
  { symbol: 'XOM', weight: 20 },
  { symbol: 'AAPL', weight: 30 },
  { symbol: 'VWO', weight: 25 },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });

  try {
    const sql = neon(dbUrl);

    // Get latest CII scores
    const ciiRows = (await sql`
      SELECT DISTINCT ON (country_code) country_code, score
      FROM country_cii_history
      ORDER BY country_code, timestamp DESC
    `) as unknown as Array<{ country_code: string; score: number }>;

    const ciiMap = new Map(ciiRows.map((r) => [r.country_code, { score: r.score, confidence: 'medium' as const }]));

    // Compute exposure
    const { exposures, overall_risk, risk_label, coverage_pct, unmapped_symbols } = computeApiExposure(
      DEMO_HOLDINGS,
      ciiMap,
    );

    // Compute chokepoint exposure (needs country exposures, not holdings)
    const chokepoint_exposure = computeChokepointExposure(exposures);

    // Elevated countries (CII > 50)
    const elevated = exposures
      .filter((e) => (e.cii_score ?? 0) > 50)
      .sort((a, b) => (b.cii_score ?? 0) - (a.cii_score ?? 0));

    return res.json({
      demo: true,
      holdings: DEMO_HOLDINGS,
      overall_risk,
      risk_label,
      coverage_pct,
      exposures: exposures.slice(0, 10),
      elevated_countries: elevated,
      chokepoint_exposure: chokepoint_exposure.slice(0, 5),
      unmapped_symbols,
      cta: 'Run your own portfolio at nexuswatch.dev/#/portfolio (Pro tier)',
    });
  } catch (err) {
    console.error('[exposure-demo]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'demo_failed' });
  }
}
