/**
 * Forecast Tournament leaderboard.
 *
 * Exposes the latest backtest scores per (model, horizon). Powers the
 * leaderboard table + reliability diagram on /#/accuracy.
 *
 * GET /api/accuracy/leaderboard
 *   → { rows: [{model, horizon_days, sample_size, mae, crps, brier, rank_in_horizon}],
 *       updated_at, models, horizons }
 *
 * 2026-05 tier-up Phase 3.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.json({ rows: [], updated_at: null, note: 'db_not_configured' });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql: any = neon(dbUrl);
    const rows = (await sql`
      WITH latest AS (
        SELECT DISTINCT ON (model, horizon_days) *
        FROM forecast_backtests
        ORDER BY model, horizon_days, run_at DESC
      )
      SELECT model, horizon_days, sample_size,
             mae::float AS mae,
             crps::float AS crps,
             brier::float AS brier,
             run_at
      FROM latest
      ORDER BY horizon_days, mae
    `) as unknown as Array<{
      model: string;
      horizon_days: number;
      sample_size: number;
      mae: number;
      crps: number;
      brier: number;
      run_at: string;
    }>;

    // Per-horizon rank
    const ranked: Array<{
      model: string;
      horizon_days: number;
      sample_size: number;
      mae: number;
      crps: number;
      brier: number;
      rank_in_horizon: number;
    }> = [];
    const horizons = Array.from(new Set(rows.map((r) => r.horizon_days)));
    for (const h of horizons) {
      const inH = rows.filter((r) => r.horizon_days === h).sort((a, b) => a.mae - b.mae);
      inH.forEach((r, i) => ranked.push({ ...r, rank_in_horizon: i + 1 }));
    }

    const ensembleSamples = await sql`
      SELECT COUNT(*)::int AS n,
             COUNT(*) FILTER (WHERE scored_at IS NOT NULL)::int AS scored,
             MIN(made_on) AS first_made,
             MAX(scored_at) AS last_scored
      FROM forecasts
      WHERE model = 'ensemble'
    `;
    const s = (ensembleSamples as Array<Record<string, unknown>>)[0] ?? {};

    return res.json({
      rows: ranked,
      updated_at: rows[0]?.run_at ?? null,
      coverage: {
        ensemble_total: Number(s.n) || 0,
        ensemble_scored: Number(s.scored) || 0,
        first_made: s.first_made ?? null,
        last_scored: s.last_scored ?? null,
      },
      methodology:
        'MAE = mean absolute error of p50 vs actual. CRPS = continuous ranked probability score (5-quantile approx). Brier = squared error of P(CII ≥ 65) vs realized indicator. Lower is better for all three. Window = last 60 days of scored forecasts.',
    });
  } catch (e) {
    console.error('[leaderboard]', e instanceof Error ? e.message : e);
    return res.status(500).json({ error: 'leaderboard_failed' });
  }
}
