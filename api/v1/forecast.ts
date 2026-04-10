import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const CORS = 'https://nexuswatch.dev';

/**
 * Predictive Intelligence API
 *
 * Analyzes 30/90-day CII trends to forecast which countries are likely
 * to cross critical thresholds. Uses linear regression + rate of change
 * for quantitative prediction, optionally enhanced with Sonnet analysis.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const sql = neon(dbUrl);
  const days = Math.min(90, Math.max(7, parseInt(String(req.query.days || '30'), 10)));

  try {
    // Get CII history — one score per country per day
    const rows = await sql`
      SELECT DISTINCT ON (country_code, (timestamp::date))
        country_code, country_name, score, timestamp::date as day
      FROM country_cii_history
      WHERE timestamp > NOW() - make_interval(days => ${days})
      ORDER BY country_code, (timestamp::date), timestamp DESC
    `;

    // Group by country
    const byCountry = new Map<string, { name: string; scores: { day: string; score: number }[] }>();
    for (const r of rows as Record<string, unknown>[]) {
      const code = r.country_code as string;
      const entry = byCountry.get(code) || { name: r.country_name as string, scores: [] };
      entry.scores.push({ day: String(r.day), score: r.score as number });
      byCountry.set(code, entry);
    }

    // Compute forecasts
    interface Forecast {
      code: string;
      name: string;
      currentScore: number;
      trend: 'rising' | 'falling' | 'stable' | 'volatile';
      ratePerDay: number; // CII points per day
      forecastScore14d: number; // predicted score in 14 days
      forecastScore30d: number; // predicted score in 30 days
      probabilityCritical14d: number; // % chance of crossing 70 in 14 days
      probabilityCritical30d: number; // % chance of crossing 70 in 30 days
      dataPoints: number;
      sparkline: number[];
    }

    const forecasts: Forecast[] = [];

    for (const [code, data] of byCountry) {
      if (data.scores.length < 5) continue; // Need at least 5 data points

      // Sort chronologically
      const sorted = data.scores.sort((a, b) => a.day.localeCompare(b.day));
      const scores = sorted.map((s) => s.score);
      const current = scores[scores.length - 1];
      const n = scores.length;

      // Linear regression (least squares)
      const xMean = (n - 1) / 2;
      const yMean = scores.reduce((s, v) => s + v, 0) / n;
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < n; i++) {
        numerator += (i - xMean) * (scores[i] - yMean);
        denominator += (i - xMean) ** 2;
      }
      const slope = denominator !== 0 ? numerator / denominator : 0; // CII points per day

      // Trend classification
      let trend: Forecast['trend'];
      const volatility = Math.max(...scores) - Math.min(...scores);
      if (volatility > 10 && Math.abs(slope) < 0.3) {
        trend = 'volatile';
      } else if (slope > 0.2) {
        trend = 'rising';
      } else if (slope < -0.2) {
        trend = 'falling';
      } else {
        trend = 'stable';
      }

      // Forecast scores
      const forecast14d = Math.round(Math.max(0, Math.min(100, current + slope * 14)));
      const forecast30d = Math.round(Math.max(0, Math.min(100, current + slope * 30)));

      // Probability of crossing critical (70) threshold
      // Based on: current distance from 70 + trend direction + volatility
      const distTo70 = 70 - current;
      let probCritical14d: number;
      let probCritical30d: number;

      if (current >= 70) {
        probCritical14d = 95;
        probCritical30d = 90;
      } else if (distTo70 <= 0) {
        probCritical14d = 95;
        probCritical30d = 90;
      } else {
        // Simple probability model: rate of approach + noise factor
        const daysTo70 = slope > 0 ? distTo70 / slope : Infinity;
        const noiseRange = volatility / 2;

        if (daysTo70 <= 14) {
          probCritical14d = Math.min(90, 50 + (14 - daysTo70) * 3 + noiseRange);
        } else {
          probCritical14d = Math.max(1, Math.min(40, (noiseRange / distTo70) * 100));
        }

        if (daysTo70 <= 30) {
          probCritical30d = Math.min(90, 50 + (30 - daysTo70) * 2 + noiseRange);
        } else {
          probCritical30d = Math.max(2, Math.min(50, (noiseRange / distTo70) * 150));
        }
      }

      forecasts.push({
        code,
        name: data.name,
        currentScore: current,
        trend,
        ratePerDay: Math.round(slope * 100) / 100,
        forecastScore14d: forecast14d,
        forecastScore30d: forecast30d,
        probabilityCritical14d: Math.round(probCritical14d),
        probabilityCritical30d: Math.round(probCritical30d),
        dataPoints: n,
        sparkline: scores.slice(-14),
      });
    }

    // Sort by probability of crossing critical (most likely first)
    forecasts.sort((a, b) => b.probabilityCritical14d - a.probabilityCritical14d);

    // Countries at highest risk
    const atRisk = forecasts.filter((f) => f.probabilityCritical14d >= 30 || f.currentScore >= 50);
    const rising = forecasts.filter((f) => f.trend === 'rising' && f.ratePerDay > 0.3);
    const falling = forecasts.filter((f) => f.trend === 'falling' && f.ratePerDay < -0.3);

    return res.setHeader('Cache-Control', 'public, max-age=300').json({
      forecasts,
      summary: {
        totalCountries: forecasts.length,
        atRisk: atRisk.length,
        rising: rising.length,
        falling: falling.length,
        highestRisk: forecasts[0]
          ? { name: forecasts[0].name, score: forecasts[0].currentScore, prob14d: forecasts[0].probabilityCritical14d }
          : null,
      },
      analyzedDays: days,
    });
  } catch (err) {
    console.error('Forecast API error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Forecast generation failed' });
  }
}
