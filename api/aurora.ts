import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, applyRateLimitHeaders } from './_lib/rateLimit.js';

export const config = { runtime: 'nodejs', maxDuration: 8 };

/**
 * NOAA SWPC Aurora — proxy + 5-min cache.
 *
 * Upstream: https://services.swpc.noaa.gov/json/ovation_aurora_latest.json
 * Returns a 1-degree grid of (lon, lat, strength) where strength is
 * the aurora probability (0–100). We pass this through unchanged so
 * the client can render it as a heatmap or filled polygon.
 */

let cached: unknown = null;
let cachedAt = 0;
const TTL = 5 * 60 * 1000;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const rl = await rateLimit(req, { key: 'aurora', limit: 60, windowSec: 60 });
  applyRateLimitHeaders(res, rl);
  if (!rl.ok) return res.status(429).json({ error: 'rate-limited', retryAfterSec: rl.retryAfterSec });

  if (cached && Date.now() - cachedAt < TTL) {
    return res
      .setHeader('Cache-Control', 'public, max-age=300, s-maxage=300')
      .json({ ...(cached as object), cached: true });
  }

  try {
    const upstream = await fetch('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', {
      signal: AbortSignal.timeout(6000),
    });
    if (!upstream.ok) throw new Error(`SWPC HTTP ${upstream.status}`);
    const data = await upstream.json();
    cached = data;
    cachedAt = Date.now();
    return res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300').json(data);
  } catch (err) {
    if (cached) {
      return res.setHeader('Cache-Control', 'public, max-age=60').json({ ...(cached as object), stale: true });
    }
    return res
      .status(502)
      .json({ error: 'SWPC upstream failed', message: err instanceof Error ? err.message : String(err) });
  }
}
