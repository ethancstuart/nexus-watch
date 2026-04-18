import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 15 };

/**
 * CII Forecasting API — Probabilistic Predictions.
 *
 * Computes 7/14/30-day CII forecasts with credible intervals.
 * Uses a Kalman-filter-inspired approach: trend decomposition +
 * mean reversion + volatility scaling from compound signals.
 *
 * Output: "Sudan CII: 87 today. 7-day forecast: 84-92 (80% CI).
 * P(CII > 90 within 30d) = 34%."
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
  const sql = neon(dbUrl);

  try {
    // Fetch 90 days of CII history for this country
    const history = await sql`
      SELECT score, date
      FROM cii_daily_snapshots
      WHERE country_code = ${country}
      ORDER BY date DESC
      LIMIT 90
    `;

    if (history.length < 7) {
      return res.json({
        country,
        forecasts: [],
        error: 'Insufficient history for forecasting (need 7+ days)',
        currentScore: history[0]?.score ?? null,
      });
    }

    const scores = history.map((r) => Number(r.score)).reverse(); // oldest first
    const currentScore = scores[scores.length - 1];

    // Compute statistics
    const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Trend: linear regression slope over last 14 days
    const recentScores = scores.slice(-14);
    const trendSlope = computeSlope(recentScores);

    // Volatility: standard deviation of daily changes
    const dailyChanges = [];
    for (let i = 1; i < scores.length; i++) {
      dailyChanges.push(scores[i] - scores[i - 1]);
    }
    const changeMean = dailyChanges.reduce((s, v) => s + v, 0) / dailyChanges.length;
    const changeStdDev = Math.sqrt(dailyChanges.reduce((s, v) => s + (v - changeMean) ** 2, 0) / dailyChanges.length);

    // Mean reversion rate: how quickly does the score revert to its mean?
    // Higher for stable countries, lower for volatile ones
    const meanReversionRate = Math.max(0.01, Math.min(0.15, 1 / (stdDev + 1)));

    // Generate forecasts for each horizon
    const forecasts: ForecastResult[] = horizons.map((horizon) => {
      // Trend projection with mean reversion
      const trendProjection = currentScore + trendSlope * horizon;
      const meanReverted = currentScore + (mean - currentScore) * (1 - Math.exp(-meanReversionRate * horizon));
      const forecastMean = 0.6 * trendProjection + 0.4 * meanReverted;

      // Uncertainty grows with sqrt(time) — Brownian motion assumption
      const forecastStdDev = changeStdDev * Math.sqrt(horizon);

      // Compute credible intervals
      const p10 = Math.max(0, Math.min(100, forecastMean - 1.28 * forecastStdDev));
      const p25 = Math.max(0, Math.min(100, forecastMean - 0.67 * forecastStdDev));
      const p50 = Math.max(0, Math.min(100, forecastMean));
      const p75 = Math.max(0, Math.min(100, forecastMean + 0.67 * forecastStdDev));
      const p90 = Math.max(0, Math.min(100, forecastMean + 1.28 * forecastStdDev));

      const direction: ForecastResult['direction'] =
        trendSlope > 0.5 ? 'rising' : trendSlope < -0.5 ? 'falling' : 'stable';

      // Confidence based on data availability and volatility
      const confidence = scores.length >= 60 && changeStdDev < 3 ? 'HIGH' : scores.length >= 30 ? 'MEDIUM' : 'LOW';

      return {
        horizon,
        mean: round(forecastMean),
        p10: round(p10),
        p25: round(p25),
        p50: round(p50),
        p75: round(p75),
        p90: round(p90),
        direction,
        confidence,
      };
    });

    // Probability of exceeding thresholds
    const forecast30 = forecasts.find((f) => f.horizon === 30);
    const probabilities = forecast30
      ? {
          p_above_50: round(normalCDF(forecast30.mean, changeStdDev * Math.sqrt(30), 50)),
          p_above_65: round(normalCDF(forecast30.mean, changeStdDev * Math.sqrt(30), 65)),
          p_above_80: round(normalCDF(forecast30.mean, changeStdDev * Math.sqrt(30), 80)),
          p_above_90: round(normalCDF(forecast30.mean, changeStdDev * Math.sqrt(30), 90)),
        }
      : null;

    return res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=300').json({
      country,
      currentScore: round(currentScore),
      historyDays: scores.length,
      statistics: {
        mean: round(mean),
        stdDev: round(stdDev),
        trendSlope: round(trendSlope),
        dailyVolatility: round(changeStdDev),
        meanReversionRate: round(meanReversionRate),
      },
      forecasts,
      probabilities,
      methodology:
        'Kalman-inspired model: 60% trend projection + 40% mean reversion. Uncertainty scales with sqrt(horizon). Credible intervals at 80% (p10-p90).',
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[forecast] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Forecast computation failed' });
  }
}

function computeSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den > 0 ? num / den : 0;
}

/** Probability that a normal(mean, std) variable exceeds threshold */
function normalCDF(mean: number, std: number, threshold: number): number {
  if (std <= 0) return mean >= threshold ? 1 : 0;
  const z = (threshold - mean) / std;
  // Approximation of 1 - Phi(z) using Abramowitz & Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327;
  const p =
    d *
    Math.exp((-z * z) / 2) *
    (t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))));
  return z >= 0 ? p : 1 - p;
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}
