import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Read from Postgres cache (populated by CII cron every 5 min)
  // GDELT rate-limits Vercel IPs, so we can't call them directly
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.json({ articles: [], error: 'No database configured' });

  try {
    const sql = neon(dbUrl);
    const rows = await sql`SELECT data, updated_at FROM cached_layer_data WHERE layer_id = 'gdelt-news'`;

    if (rows.length === 0 || !rows[0].data) {
      return res.json({ articles: [], error: 'Cache empty — cron populates every 5 min' });
    }

    const cached = rows[0].data as { articles?: Array<{ title: string; url: string; source: string; sourcecountry: string; tone: number; socialimage: string; domain: string; language: string; seendate: string }> };
    const articles = (cached.articles || []).map((a) => ({
      title: a.title,
      url: a.url,
      source: a.source,
      sourceCountry: a.sourcecountry || '',
      tone: typeof a.tone === 'number' ? a.tone : 0,
      domain: a.domain || '',
      language: a.language || 'English',
      image: a.socialimage || '',
      date: a.seendate || '',
    }));

    return res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300').json({
      articles,
      cachedAt: rows[0].updated_at,
    });
  } catch (err) {
    console.error('GDELT API error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ articles: [], error: 'Failed to read news cache' });
  }
}
