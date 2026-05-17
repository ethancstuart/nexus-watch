import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { combine, probAbove, DEFAULT_WEIGHTS } from '../_lib/forecast/ensemble.js';
import type { ModelId, ModelInputs } from '../_lib/forecast/models.js';

export const config = { runtime: 'nodejs', maxDuration: 15 };

/**
 * CII Forecasting API — Ensemble version (Phase 3 of tier-up).
 *
 * Six base learners (persistence, kalman, ar1, holt, acled_slope, neighbor)
 * combined via precision-weighted ensemble. Weights are loaded from the
 * forecast_weights table (refit weekly by the backtest cron) and fall
 * back to DEFAULT_WEIGHTS when no row exists.
 *
 * Response contract is the same as the prior trend-only endpoint —
 * p10/p25/p50/p75/p90 + threshold probabilities — so downstream clients
 * don't need to change. We add a `per_model` block exposing each base
 * learner's prediction + weight for transparency.
 *
 * GET /api/v2/forecast?country=SD&horizon=7,14,30
 */

const CORS_ORIGIN = 'https://nexuswatch.dev';

interface ForecastResult {
  horizon: number;
  mean: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  direction: 'rising' | 'falling' | 'stable';
  confidence: string;
  per_model: Array<{ model: ModelId; point: number; weight: number; hint: string }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const country = ((req.query.country as string) || 'UA').toUpperCase();
  const horizons = ((req.query.horizon as string) || '7,14,30')
    .split(',')
    .map(Number)
    .filter((n) => n > 0 && n <= 90);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    // 90 days of CII history (oldest first)
    const history = (await sql`
      SELECT cii_score::float AS score, date
      FROM cii_daily_snapshots
      WHERE country_code = ${country}
      ORDER BY date DESC
      LIMIT 90
    `) as unknown as Array<{ score: number; date: string }>;

    if (history.length < 7) {
      return res.json({
        country,
        forecasts: [],
        error: 'Insufficient history for forecasting (need 7+ days)',
        currentScore: history[0]?.score ?? null,
      });
    }

    const scores = history.map((r) => Number(r.score)).reverse();
    const currentScore = scores[scores.length - 1];

    // Load ensemble weights (use latest row); fall back to defaults
    let weightsByHorizon: Record<string, Partial<Record<ModelId, number>>> = {};
    try {
      const wRows = (await sql`
        SELECT weights FROM forecast_weights ORDER BY updated_at DESC LIMIT 1
      `) as unknown as Array<{ weights: Record<string, unknown> }>;
      const raw = wRows[0]?.weights;
      if (raw && typeof raw === 'object') {
        weightsByHorizon = raw as Record<string, Partial<Record<ModelId, number>>>;
      }
    } catch {
      /* fall back */
    }

    const forecasts: ForecastResult[] = horizons.map((horizon) => {
      const inputs: ModelInputs = { ciiHistory: scores, horizon };
      const weights = weightsByHorizon[String(horizon)] ?? DEFAULT_WEIGHTS;
      const out = combine(inputs, weights);
      const direction: ForecastResult['direction'] =
        out.ensemble.point > currentScore + 1 ? 'rising' : out.ensemble.point < currentScore - 1 ? 'falling' : 'stable';

      const confidence =
        scores.length >= 60 && out.ensemble.variance < 16
          ? 'HIGH'
          : scores.length >= 30 && out.ensemble.variance < 64
            ? 'MEDIUM'
            : 'LOW';

      return {
        horizon,
        mean: out.ensemble.point,
        p10: out.ensemble.p10,
        p25: out.ensemble.p25,
        p50: out.ensemble.p50,
        p75: out.ensemble.p75,
        p90: out.ensemble.p90,
        direction,
        confidence,
        per_model: out.perModel.map((m) => ({
          model: m.model,
          point: m.point,
          weight: m.weight,
          hint: m.hint,
        })),
      };
    });

    // 30-day threshold probabilities
    const forecast30 = forecasts.find((f) => f.horizon === 30);
    const probabilities = forecast30
      ? {
          p_above_50: probAbove(forecast30.mean, (forecast30.p90 - forecast30.p10) ** 2 / 6.55, 50),
          p_above_65: probAbove(forecast30.mean, (forecast30.p90 - forecast30.p10) ** 2 / 6.55, 65),
          p_above_80: probAbove(forecast30.mean, (forecast30.p90 - forecast30.p10) ** 2 / 6.55, 80),
          p_above_90: probAbove(forecast30.mean, (forecast30.p90 - forecast30.p10) ** 2 / 6.55, 90),
        }
      : null;

    return res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=300').json({
      country,
      currentScore: round(currentScore),
      historyDays: scores.length,
      forecasts,
      probabilities,
      methodology:
        'Ensemble of 6 base learners (persistence, kalman, ar1, holt, acled_slope, neighbor). Weights re-fit weekly from backtest residuals. Real-time endpoint omits ACLED + neighbor inputs; those models contribute only via the daily forecast-record cron.',
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[forecast] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Forecast computation failed' });
  }
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
