import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

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
    if (!response.ok) return res.status(response.status).json({ error: 'GDELT API error' });

    const data = (await response.json()) as {
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

    return res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900').json({ articles });
  } catch (err) {
    console.error('GDELT API error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'GDELT service error' });
  }
}
