import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * GET /api/v1/cii-sparklines?days=30&codes=IR,UA,TW
 *
 * Returns lightweight per-country time-series suitable for inline
 * sparkline rendering. 30-day window by default; response shape:
 *
 *   {
 *     days: 30,
 *     series: {
 *       IR: [ [YYYY-MM-DD, score], … ],
 *       UA: [ … ],
 *       …
 *     }
 *   }
 *
 * Missing days are filled from the prior day's score when available so
 * the sparkline renders as a continuous line.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  const days = Math.min(180, Math.max(7, parseInt(String(req.query.days ?? '30'), 10) || 30));
  const codesParam = typeof req.query.codes === 'string' ? req.query.codes : '';
  const codes = codesParam
    .split(',')
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  try {
    const rows = (codes.length > 0
      ? await sql`
          SELECT country_code, date, cii_score::float AS score
          FROM cii_daily_snapshots
          WHERE country_code = ANY(${codes}::text[])
            AND date > (CURRENT_DATE - make_interval(days => ${days}))
          ORDER BY country_code, date ASC
        `
      : await sql`
          SELECT country_code, date, cii_score::float AS score
          FROM cii_daily_snapshots
          WHERE date > (CURRENT_DATE - make_interval(days => ${days}))
          ORDER BY country_code, date ASC
        `) as unknown as Array<{ country_code: string; date: string; score: number }>;

    const series: Record<string, Array<[string, number]>> = {};
    for (const r of rows) {
      const key = r.country_code;
      const day = typeof r.date === 'string' ? r.date.slice(0, 10) : new Date(r.date).toISOString().slice(0, 10);
      const list = series[key] ?? (series[key] = []);
      list.push([day, r.score]);
    }

    res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600');
    return res.json({ days, series });
  } catch (err) {
    console.error('[api/v1/cii-sparklines] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'query_failed' });
  }
}
