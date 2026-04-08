import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

const CORS = 'https://dashpulse.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limiting handled at Vercel platform level

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const country = req.query.country as string | undefined;
  const sql = neon(dbUrl);

  try {
    if (country) {
      const code = country.toUpperCase();
      const rows = await sql`
        SELECT country_code, country_name, score, components, timestamp
        FROM country_cii_history
        WHERE country_code = ${code}
        ORDER BY timestamp DESC
        LIMIT 168
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'Country not found' });
      const latest = rows[0];
      return res.setHeader('Cache-Control', 'public, max-age=300').json({
        countryCode: latest.country_code,
        countryName: latest.country_name,
        score: latest.score,
        components: latest.components,
        history: rows.map((r) => ({ score: r.score, timestamp: r.timestamp })),
      });
    }

    // All countries — latest score each
    const rows = await sql`
      SELECT DISTINCT ON (country_code)
        country_code, country_name, score, components, timestamp
      FROM country_cii_history
      ORDER BY country_code, timestamp DESC
    `;

    return res.setHeader('Cache-Control', 'public, max-age=300').json({
      scores: rows.map((r) => ({
        countryCode: r.country_code,
        countryName: r.country_name,
        score: r.score,
        components: r.components,
        updatedAt: r.timestamp,
      })),
      count: rows.length,
    });
  } catch (err) {
    console.error('API v1 CII error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
