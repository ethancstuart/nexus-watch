import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

// Public brief archive — SEO-indexable, no auth required
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const date = req.query.date as string | undefined;
  const sql = neon(dbUrl);

  try {
    if (date) {
      // Single brief
      const rows = await sql`
        SELECT brief_date, summary, generated_at FROM daily_briefs WHERE brief_date = ${date}
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'No brief for this date' });

      return res.setHeader('Cache-Control', 'public, max-age=3600').json({
        date: rows[0].brief_date,
        summary: rows[0].summary,
        generatedAt: rows[0].generated_at,
      });
    }

    // Archive — last 30 briefs
    const rows = await sql`
      SELECT brief_date, substring(summary from 1 for 300) as preview, generated_at
      FROM daily_briefs ORDER BY brief_date DESC LIMIT 30
    `;

    return res.setHeader('Cache-Control', 'public, max-age=3600').json({
      briefs: rows.map((r) => ({
        date: r.brief_date,
        preview: r.preview,
        generatedAt: r.generated_at,
      })),
      count: rows.length,
    });
  } catch (err) {
    console.error('Briefs archive error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to load briefs' });
  }
}
