import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, getClientIp } from './_middleware';

export const config = { runtime: 'nodejs' };

const CORS = 'https://dashpulse.app';

// Cache tension state (populated by internal computation)
let cachedTension: { global: number; trend: string; components: Record<string, number> } | null = null;
let lastFetch = 0;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = getClientIp(req.headers); if (!rateLimit(res, ip)) return;

  // Fetch from internal tension endpoint
  if (!cachedTension || Date.now() - lastFetch > 60_000) {
    try {
      const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://dashpulse.app';
      const internal = await fetch(`${baseUrl}/api/cii`, { signal: AbortSignal.timeout(5000) });
      if (internal.ok) {
        const data = (await internal.json()) as { scores?: Array<{ score: number }> };
        const scores = data.scores || [];
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, c) => s + c.score, 0) / scores.length) : 0;
        const maxScore = scores.length > 0 ? Math.max(...scores.map((c) => c.score)) : 0;
        cachedTension = {
          global: Math.round((avgScore + maxScore) / 2),
          trend: 'stable',
          components: { avgCII: avgScore, maxCII: maxScore, countriesMonitored: scores.length },
        };
        lastFetch = Date.now();
      }
    } catch {
      // Use stale cache
    }
  }

  return res.setHeader('Cache-Control', 'public, max-age=60').json({
    tension: cachedTension || { global: 0, trend: 'stable', components: {} },
    timestamp: Date.now(),
  });
}
