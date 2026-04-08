import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { rateLimit, getClientIp } from './_middleware';

export const config = { runtime: 'nodejs' };

const CORS = 'https://dashpulse.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = getClientIp(req.headers); if (!rateLimit(res, ip)) return;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const date = req.query.date as string | undefined;
  const sql = neon(dbUrl);

  try {
    if (date) {
      // Specific date
      const rows = await sql`
        SELECT brief_date, content, summary, generated_at
        FROM daily_briefs WHERE brief_date = ${date}
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'No brief for this date' });
      return res.json(rows[0]);
    }

    // Latest brief
    const rows = await sql`
      SELECT brief_date, content, summary, generated_at
      FROM daily_briefs ORDER BY brief_date DESC LIMIT 1
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'No briefs generated yet' });
    return res.setHeader('Cache-Control', 'public, max-age=3600').json(rows[0]);
  } catch (err) {
    console.error('API v1 brief error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
