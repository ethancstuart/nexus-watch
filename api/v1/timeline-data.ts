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

  const days = Math.min(30, Math.max(1, parseInt(String(req.query.days || '7'), 10)));
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
      // CII history — one score per country per day
      sql`
        SELECT DISTINCT ON (country_code, (timestamp::date))
          country_code, country_name, score, components, timestamp::date as day
        FROM country_cii_history
        WHERE timestamp > NOW() - make_interval(days => ${days})
        ORDER BY country_code, (timestamp::date), timestamp DESC
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
      countries: Array<{ code: string; name: string; score: number; components: Record<string, number> }>;
    }> = [];

    if (ciiResult.status === 'fulfilled') {
      const byDay = new Map<
        string,
        Array<{ code: string; name: string; score: number; components: Record<string, number> }>
      >();
      for (const row of ciiResult.value as Record<string, unknown>[]) {
        const day = String(row.day);
        const entries = byDay.get(day) || [];
        entries.push({
          code: String(row.country_code),
          name: String(row.country_name),
          score: Number(row.score),
          components: row.components as Record<string, number>,
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

    return res.setHeader('Cache-Control', 'public, max-age=300').json({
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
