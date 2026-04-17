import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { kvCached } from '../_lib/kvCache.js';

export const config = { runtime: 'nodejs' };

/**
 * Intelligence API v2 — Systematic Trading Factors
 *
 * GET /api/v2/factors
 *   Returns NexusWatch-derived factors designed to be consumed as alpha
 *   signals by systematic trading systems (Quant Engine, Meridian, and
 *   external institutional clients).
 *
 * Query params:
 *   lookback_days (default 30, max 180) — rolling window for momentum calcs
 *   codes=XX,YY,...                      — comma-separated country filter
 *
 * Factors emitted per country:
 *   cii                 — current composite score
 *   cii_z_30d           — z-score of current CII vs 30-day distribution
 *   cii_momentum_7d     — 7-day CII change
 *   cii_momentum_30d    — 30-day CII change
 *   cii_realized_vol_30d — stddev of 30-day daily changes (volatility factor)
 *   confidence          — snapshot confidence
 *
 * Shape:
 *   {
 *     snapshot_date: "YYYY-MM-DD",
 *     lookback_days: 30,
 *     factors: { [country_code]: {...} }
 *   }
 *
 * Designed for: batch pull once per day, join to holdings on country code.
 * Stable output schema — add-only changes only, never renames.
 */

function validateApiKey(req: VercelRequest): boolean {
  const key = req.headers['x-api-key'] || (typeof req.query.apikey === 'string' ? req.query.apikey : null);
  const validKeys = (process.env.API_V2_KEYS || '').split(',').filter(Boolean);
  if (validKeys.length === 0) return false;
  return typeof key === 'string' && validKeys.includes(key);
}

interface FactorRow {
  country_code: string;
  score: number;
  confidence: string;
  date: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!validateApiKey(req))
    return res.status(401).json({ error: 'unauthorized', docs: 'https://nexuswatch.dev/#/api' });

  const lookback = Math.min(180, Math.max(7, parseInt(String(req.query.lookback_days ?? '30'), 10) || 30));
  const codesParam = typeof req.query.codes === 'string' ? req.query.codes : '';
  const codes = codesParam
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    // Cached by (lookback, codes). Factors change once/day; 15-min TTL w/ soft
    // refresh keeps p99 sub-100ms without serving data that drifted a full day.
    const codesKey = codes.length > 0 ? codes.slice().sort().join(',') : 'ALL';
    const cached = await kvCached(
      `v2:factors:${lookback}:${codesKey}`,
      900,
      async () => {
        const latest = (await sql`SELECT MAX(date) AS d FROM cii_daily_snapshots`) as unknown as Array<{
          d: string | null;
        }>;
        const snapDate = latest[0]?.d ?? null;
        const rows = (codes.length > 0
          ? await sql`
              SELECT country_code, cii_score::float AS score, confidence, date::text AS date
              FROM cii_daily_snapshots
              WHERE country_code = ANY(${codes}::text[])
                AND date > (CURRENT_DATE - make_interval(days => ${lookback}))
              ORDER BY country_code, date ASC
            `
          : await sql`
              SELECT country_code, cii_score::float AS score, confidence, date::text AS date
              FROM cii_daily_snapshots
              WHERE date > (CURRENT_DATE - make_interval(days => ${lookback}))
              ORDER BY country_code, date ASC
            `) as unknown as FactorRow[];
        return { snapDate, rows };
      },
      { softTtl: 600 },
    );
    const snapDate = cached.snapDate;
    const rows = cached.rows;
    if (!snapDate) return res.json({ snapshot_date: null, lookback_days: lookback, factors: {} });

    const byCountry = new Map<string, FactorRow[]>();
    for (const r of rows) {
      const list = byCountry.get(r.country_code) ?? [];
      list.push(r);
      byCountry.set(r.country_code, list);
    }

    const factors: Record<string, Record<string, number | string | null>> = {};
    for (const [code, series] of byCountry) {
      if (series.length === 0) continue;
      const scores = series.map((s) => s.score);
      const latestScore = scores[scores.length - 1];
      const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
      const variance = scores.reduce((s, x) => s + (x - mean) ** 2, 0) / scores.length;
      const stdev = Math.sqrt(variance);
      const zScore = stdev > 0 ? (latestScore - mean) / stdev : 0;

      const sevenIdx = Math.max(0, series.length - 8);
      const sevenAgo = scores[sevenIdx];
      const mom7 = latestScore - sevenAgo;

      const firstScore = scores[0];
      const mom30 = latestScore - firstScore;

      // Realized vol: stddev of daily deltas over lookback.
      let dailyDeltaSumSq = 0;
      let dailyCount = 0;
      for (let i = 1; i < scores.length; i++) {
        const d = scores[i] - scores[i - 1];
        dailyDeltaSumSq += d * d;
        dailyCount++;
      }
      const realizedVol = dailyCount > 0 ? Math.sqrt(dailyDeltaSumSq / dailyCount) : 0;

      factors[code] = {
        cii: round2(latestScore),
        cii_z_30d: round2(zScore),
        cii_momentum_7d: round2(mom7),
        cii_momentum_30d: round2(mom30),
        cii_realized_vol_30d: round2(realizedVol),
        confidence: series[series.length - 1].confidence,
      };
    }

    res.setHeader('Cache-Control', 'public, max-age=900');
    return res.json({
      snapshot_date: snapDate,
      lookback_days: lookback,
      factors,
      meta: {
        source: 'NexusWatch Systematic Factor Feed v1',
        methodology:
          'cii_z is the standardized score over the lookback window. Momentum factors are simple differences. Realized vol is stddev of daily changes. All factors use deterministic CII snapshots — batched daily.',
        docs: 'https://nexuswatch.dev/#/api',
      },
    });
  } catch (err) {
    console.error('[api/v2/factors] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
