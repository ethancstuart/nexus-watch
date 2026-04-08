import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Module-level cache to avoid GDELT rate limiting (1 req per 5 seconds)
let cachedArticles: unknown[] = [];
let lastFetch = 0;
const CACHE_TTL = 900_000; // 15 minutes

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Serve from cache if fresh (GDELT rate-limits aggressively)
  if (cachedArticles.length > 0 && Date.now() - lastFetch < CACHE_TTL) {
    return res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900').json({
      articles: cachedArticles,
      cached: true,
    });
  }

  const query = (req.query.query as string) || '';
  const maxrecords = (req.query.maxrecords as string) || '75';
  const timespan = (req.query.timespan as string) || '1440';

  try {
    const params = new URLSearchParams({
      query: query || 'conflict OR crisis OR earthquake OR attack OR protest',
      mode: 'artlist',
      maxrecords,
      timespan: `${timespan}min`,
      format: 'json',
      sort: 'DateDesc',
    });
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      // Rate limited — serve stale cache
      if (response.status === 429 && cachedArticles.length > 0) {
        return res.setHeader('Cache-Control', 'public, max-age=900').json({
          articles: cachedArticles,
          cached: true,
          rateLimited: true,
        });
      }
      return res.status(response.status).json({ error: 'GDELT API error' });
    }

    const text = await response.text();
    // GDELT sometimes returns plain text rate limit message instead of JSON
    if (text.startsWith('Please limit')) {
      if (cachedArticles.length > 0) {
        return res.setHeader('Cache-Control', 'public, max-age=900').json({
          articles: cachedArticles,
          cached: true,
          rateLimited: true,
        });
      }
      return res.status(429).json({ error: 'GDELT rate limited', articles: [] });
    }

    const data = JSON.parse(text) as {
      articles?: {
        title: string;
        url: string;
        source: string;
        sourcecountry: string;
        tone: number;
        socialimage: string;
        domain: string;
        language: string;
        seendate: string;
      }[];
    };

    const articles = (data.articles || []).map((a) => ({
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

    if (articles.length > 0) {
      cachedArticles = articles;
      lastFetch = Date.now();
    }

    return res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900').json({ articles });
  } catch (err) {
    console.error('GDELT API error:', err instanceof Error ? err.message : err);
    if (cachedArticles.length > 0) {
      return res.setHeader('Cache-Control', 'public, max-age=300').json({
        articles: cachedArticles,
        cached: true,
        stale: true,
      });
    }
    return res.status(502).json({ error: 'GDELT service error', articles: [] });
  }
}
