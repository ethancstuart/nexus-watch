import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { kvCached } from '../_lib/kvCache';

export const config = { runtime: 'nodejs' };

/**
 * Intelligence API v2 — Active Alerts
 *
 * GET /api/v2/alerts
 *   query params (optional):
 *     threshold=60        — CII threshold, default 60
 *     min_delta=15        — only include movers with |Δ7d| ≥ this
 *     limit=100           — default 50, max 200
 *
 * Returns a unified "what's active right now" view combining:
 *   - countries above the CII threshold
 *   - 7-day CII movers (absolute delta ≥ min_delta)
 *   - recent M6+ earthquakes (last 48h) — reads from earthquakes fetch
 *     only if cached; otherwise omitted
 *   - crisis playbooks currently triggered (via crisis_triggers table
 *     when present — empty array otherwise, so older DBs still respond)
 *
 * Designed for B2B monitoring platforms: one call → everything actionable.
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
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }
  if (!validateApiKey(req)) {
    return res.status(401).json({ error: 'unauthorized', docs: 'https://nexuswatch.dev/#/api' });
  }

  const threshold = clamp(parseInt(String(req.query.threshold ?? '60'), 10), 0, 100, 60);
  const minDelta = clamp(parseInt(String(req.query.min_delta ?? '15'), 10), 0, 100, 15);
  const limit = clamp(parseInt(String(req.query.limit ?? '50'), 10), 1, 200, 50);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    // Cache the whole alerts payload for 60s — minute-grained freshness is
    // appropriate since CII snapshots update daily and crisis_triggers
    // update every 30min via cron.
    const cacheKey = `v2:alerts:t${threshold}:d${minDelta}:l${limit}`;
    const cached = await kvCached(
      cacheKey,
      60,
      async () => {
        const latestDate = (await sql`SELECT MAX(date) AS d FROM cii_daily_snapshots`) as unknown as Array<{
          d: string | null;
        }>;
        const date = latestDate[0]?.d ?? null;
        if (!date) return { date: null, breaches: [], movers: [], crisis: [] };

        const breaches = (await sql`
          SELECT country_code, cii_score, confidence
          FROM cii_daily_snapshots
          WHERE date = ${date} AND cii_score >= ${threshold}
          ORDER BY cii_score DESC
          LIMIT ${limit}
        `) as unknown as Array<{ country_code: string; cii_score: number; confidence: string }>;

        const moversRows = (await sql`
          WITH today AS (
            SELECT country_code, cii_score FROM cii_daily_snapshots WHERE date = ${date}
          ),
          week_ago AS (
            SELECT DISTINCT ON (country_code) country_code, cii_score
            FROM cii_daily_snapshots
            WHERE date <= (${date}::date - INTERVAL '7 days')::date
            ORDER BY country_code, date DESC
          )
          SELECT t.country_code, t.cii_score AS score_now, w.cii_score AS score_prev,
                 (t.cii_score - w.cii_score) AS delta
          FROM today t
          JOIN week_ago w ON w.country_code = t.country_code
          WHERE ABS(t.cii_score - w.cii_score) >= ${minDelta}
          ORDER BY ABS(t.cii_score - w.cii_score) DESC
          LIMIT ${limit}
        `) as unknown as Array<{ country_code: string; score_now: number; score_prev: number; delta: number }>;

        const crisisRows = (await sql`
          SELECT id, playbook_key, country_code, trigger_type, triggered_at, notes
          FROM crisis_triggers
          WHERE resolved_at IS NULL
          ORDER BY triggered_at DESC
          LIMIT ${limit}
        `.catch(() => [] as unknown)) as unknown as Array<{
          id: number;
          playbook_key: string;
          country_code: string | null;
          trigger_type: string;
          triggered_at: string;
          notes: string | null;
        }>;

        return {
          date,
          breaches,
          movers: moversRows,
          crisis: Array.isArray(crisisRows) ? crisisRows : [],
        };
      },
      { softTtl: 30 },
    );

    const date = cached.date;
    if (!date) {
      res.setHeader('Retry-After', '300');
      return res.status(503).json({
        error: 'data_not_ready',
        hint: 'cii_daily_snapshots has no rows yet. Run docs/migrations/*.sql and wait for the first /api/cron/compute-cii tick.',
      });
    }
    const breaches = cached.breaches;
    const moversRows = cached.movers;
    const crisisRows = cached.crisis;

    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.json({
      data: {
        threshold_breaches: breaches.map((r) => ({
          country_code: r.country_code,
          cii_score: r.cii_score,
          confidence: r.confidence,
          threshold,
        })),
        movers: moversRows.map((r) => ({
          country_code: r.country_code,
          score_now: r.score_now,
          score_prev: r.score_prev,
          delta_7d: Math.round(r.delta * 10) / 10,
          direction: r.delta > 0 ? 'up' : 'down',
        })),
        crisis_triggers: Array.isArray(crisisRows) ? crisisRows : [],
      },
      meta: {
        snapshot_date: date,
        threshold,
        min_delta: minDelta,
        limit,
        docs: 'https://nexuswatch.dev/#/api',
      },
    });
  } catch (err) {
    console.error('[api/v2/alerts] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
}

function clamp(n: number, lo: number, hi: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}
