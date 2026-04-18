import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

const CORS = 'https://nexuswatch.dev';

/**
 * Timeline data API — returns event data + CII scores for a date range.
 * Used by the timeline scrubber to reconstruct map state at any point in time.
 *
 * Query params:
 * - days: 7 | 14 | 30 (default 7)
 * - layer: specific layer ID (optional, returns all if omitted)
 *
 * Returns:
 * - snapshots: timestamped event data grouped by layer
 * - cii: daily CII scores per country over the range
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const days = Math.min(365, Math.max(1, parseInt(String(req.query.days || '7'), 10)));
  const layer = req.query.layer as string | undefined;
  const sql = neon(dbUrl);

  try {
    const [snapshotResult, ciiResult] = await Promise.allSettled([
      // Event snapshots with actual data
      layer
        ? sql`
          SELECT layer_id, data, feature_count, timestamp
          FROM event_snapshots
          WHERE layer_id = ${layer} AND timestamp > NOW() - make_interval(days => ${days})
          ORDER BY timestamp ASC
        `
        : sql`
          SELECT layer_id, data, feature_count, timestamp
          FROM event_snapshots
          WHERE timestamp > NOW() - make_interval(days => ${days})
          ORDER BY timestamp ASC
        `,
      // CII history — prefer daily snapshots (newer table); fall back to legacy
      // country_cii_history rows for backfill before 2026-04-13. Both sources
      // are day-grained; if both tables have the same country/date, the
      // snapshots row wins via higher synthetic priority.
      sql`
        WITH snap AS (
          SELECT country_code, country_name, cii_score::float AS score,
                 jsonb_build_object(
                   'conflict', component_conflict,
                   'disasters', component_disasters,
                   'sentiment', component_sentiment,
                   'infrastructure', component_infrastructure,
                   'governance', component_governance,
                   'market_exposure', component_market_exposure
                 ) AS components,
                 confidence,
                 date AS day,
                 1 AS priority
          FROM cii_daily_snapshots
          WHERE date > (CURRENT_DATE - make_interval(days => ${days}))
        ),
        legacy AS (
          SELECT DISTINCT ON (country_code, (timestamp::date))
                 country_code, country_name, score::float,
                 components, NULL::text AS confidence,
                 (timestamp::date) AS day,
                 0 AS priority
          FROM country_cii_history
          WHERE timestamp > NOW() - make_interval(days => ${days})
          ORDER BY country_code, (timestamp::date), timestamp DESC
        ),
        combined AS (SELECT * FROM snap UNION ALL SELECT * FROM legacy)
        SELECT DISTINCT ON (country_code, day)
               country_code, country_name, score, components, confidence, day
        FROM combined
        ORDER BY country_code, day, priority DESC
      `,
    ]);

    // Process snapshots — group by timestamp (rounded to nearest snapshot interval)
    const snapshots: Array<{
      timestamp: string;
      layer: string;
      count: number;
      data: unknown[];
    }> = [];

    if (snapshotResult.status === 'fulfilled') {
      for (const row of snapshotResult.value as Record<string, unknown>[]) {
        snapshots.push({
          timestamp: String(row.timestamp),
          layer: String(row.layer_id),
          count: Number(row.feature_count),
          data: (row.data as unknown[]) || [],
        });
      }
    }

    // Process CII — group by day
    const cii: Array<{
      day: string;
      countries: Array<{
        code: string;
        name: string;
        score: number;
        components: Record<string, number>;
        confidence?: string;
      }>;
    }> = [];

    if (ciiResult.status === 'fulfilled') {
      const byDay = new Map<
        string,
        Array<{
          code: string;
          name: string;
          score: number;
          components: Record<string, number>;
          confidence?: string;
        }>
      >();
      for (const row of ciiResult.value as Record<string, unknown>[]) {
        const day = typeof row.day === 'string' ? row.day : new Date(row.day as string).toISOString().slice(0, 10);
        const entries = byDay.get(day) || [];
        entries.push({
          code: String(row.country_code),
          name: String(row.country_name),
          score: Number(row.score),
          components: (row.components as Record<string, number>) ?? {},
          confidence: row.confidence ? String(row.confidence) : undefined,
        });
        byDay.set(day, entries);
      }
      for (const [day, countries] of Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b))) {
        cii.push({ day, countries });
      }
    }

    // Build date range for the timeline axis
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000);
    const dateRange: string[] = [];
    for (let d = new Date(start); d <= now; d.setDate(d.getDate() + 1)) {
      dateRange.push(d.toISOString().split('T')[0]);
    }

    return res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300').json({
      days,
      dateRange,
      snapshots,
      cii,
      snapshotCount: snapshots.length,
      ciiDays: cii.length,
    });
  } catch (err) {
    console.error('Timeline data error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
