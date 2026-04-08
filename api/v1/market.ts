import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, getClientIp } from './_middleware';

export const config = { runtime: 'nodejs' };

const CORS = 'https://dashpulse.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = getClientIp(req.headers); if (!rateLimit(res, ip)) return;

  try {
    const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://dashpulse.app';
    const response = await fetch(`${baseUrl}/api/market-data`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) return res.status(502).json({ error: 'Market data unavailable' });

    const data = await response.json();
    return res.setHeader('Cache-Control', 'public, max-age=60').json(data);
  } catch (err) {
    console.error('API v1 market error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
