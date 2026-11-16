import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Known DDoS/cyber threat corridors (source → target) with relative threat levels
// Based on public Cloudflare Radar reports and CISA data
const THREAT_CORRIDORS = [
  { source: 'RU', target: 'US', lat1: 55.8, lon1: 37.6, lat2: 38.9, lon2: -77.0, level: 'high' },
  { source: 'CN', target: 'US', lat1: 35.9, lon1: 104.2, lat2: 38.9, lon2: -77.0, level: 'high' },
  { source: 'RU', target: 'UA', lat1: 55.8, lon1: 37.6, lat2: 50.4, lon2: 30.5, level: 'critical' },
  { source: 'CN', target: 'TW', lat1: 35.9, lon1: 104.2, lat2: 25.0, lon2: 121.5, level: 'high' },
  { source: 'KP', target: 'KR', lat1: 39.0, lon1: 125.8, lat2: 37.6, lon2: 127.0, level: 'elevated' },
  { source: 'IR', target: 'IL', lat1: 35.7, lon1: 51.4, lat2: 31.8, lon2: 35.2, level: 'high' },
  { source: 'RU', target: 'DE', lat1: 55.8, lon1: 37.6, lat2: 52.5, lon2: 13.4, level: 'elevated' },
  { source: 'CN', target: 'JP', lat1: 35.9, lon1: 104.2, lat2: 35.7, lon2: 139.7, level: 'elevated' },
  { source: 'RU', target: 'GB', lat1: 55.8, lon1: 37.6, lat2: 51.5, lon2: -0.1, level: 'elevated' },
  { source: 'IR', target: 'SA', lat1: 35.7, lon1: 51.4, lat2: 24.7, lon2: 46.7, level: 'elevated' },
  { source: 'CN', target: 'IN', lat1: 35.9, lon1: 104.2, lat2: 28.6, lon2: 77.2, level: 'moderate' },
  { source: 'RU', target: 'FR', lat1: 55.8, lon1: 37.6, lat2: 48.9, lon2: 2.3, level: 'moderate' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const cfToken = process.env.CLOUDFLARE_RADAR_TOKEN;

  // If we have a Cloudflare Radar token, fetch real data
  if (cfToken) {
    try {
      const response = await fetch('https://api.cloudflare.com/client/v4/radar/attacks/layer3/summary', {
        headers: {
          Authorization: `Bearer ${cfToken}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const data = await response.json();
        return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({
          corridors: THREAT_CORRIDORS,
          liveData: data,
          source: 'cloudflare-radar',
        });
      }
    } catch {
      // Fall through to static data
    }
  }

  // Fallback: return known threat corridors (always available)
  return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({
    corridors: THREAT_CORRIDORS,
    liveData: null,
    source: 'static-corridors',
  });
}
