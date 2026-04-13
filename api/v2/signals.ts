import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

/**
 * Intelligence API v2 — Verified Signals
 *
 * GET /api/v2/signals → all currently active verified signals
 *
 * Returns cross-source verified events with:
 * - Verification level (CONFIRMED/CORROBORATED)
 * - Contributing sources
 * - Location and type
 *
 * Requires API key in X-API-Key header.
 */

function validateApiKey(req: VercelRequest): boolean {
  const key = req.headers['x-api-key'] || (typeof req.query.apikey === 'string' ? req.query.apikey : null);
  const validKeys = (process.env.API_V2_KEYS || '').split(',').filter(Boolean);
  if (validKeys.length === 0) return false;
  return typeof key === 'string' && validKeys.includes(key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  if (!validateApiKey(req)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Valid API key required.' });
  }

  // Signals are computed client-side from live layer data.
  // The API returns the methodology and a pointer to the live platform.
  // Future: compute server-side and cache in Neon for API consumers.
  return res.json({
    data: [],
    meta: {
      source: 'NexusWatch Verification Engine',
      methodology: {
        confirmed: '3+ independent sources agree (geo + 24h time window matching)',
        corroborated: '2 independent sources agree',
        unverified: 'Single source only',
        contested: 'Sources disagree on same event',
      },
      sources: ['ACLED', 'GDELT', 'USGS', 'NASA FIRMS', 'Cloudflare Radar', 'Polymarket'],
      note: 'Real-time verified signals are computed on the live platform. API access to cached signals is coming in v2.1.',
      live_url: 'https://nexuswatch.dev/#/intel',
    },
  });
}
