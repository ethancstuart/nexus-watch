import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Module-level cache — LL2 allows 15 req/hr, so cache aggressively
let cachedLaunches: Launch[] = [];
let lastFetch = 0;
const CACHE_TTL = 300_000; // 5 minutes

interface Launch {
  name: string;
  provider: string;
  country: string;
  lat: number;
  lon: number;
  date: string;
  vehicle: string;
  mission: string;
  status: string;
  image: string | null;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (Date.now() - lastFetch < CACHE_TTL && cachedLaunches.length > 0) {
    return res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300').json({
      launches: cachedLaunches,
      count: cachedLaunches.length,
      cached: true,
    });
  }

  try {
    const response = await fetch(
      'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=25&mode=detailed',
      { signal: AbortSignal.timeout(10000) },
    );

    if (!response.ok) {
      if (response.status === 429) {
        // Rate limited — serve stale cache or empty
        if (cachedLaunches.length > 0) {
          return res.setHeader('Cache-Control', 'public, max-age=600').json({
            launches: cachedLaunches,
            count: cachedLaunches.length,
            cached: true,
            rateLimited: true,
          });
        }
        return res.status(429).json({ launches: [], count: 0, error: 'LL2 rate limited' });
      }
      throw new Error(`LL2 API returned ${response.status}`);
    }

    const data = await response.json() as {
      results: Array<{
        name: string;
        net: string;
        status: { name: string };
        launch_service_provider?: { name: string; country_code?: string };
        pad?: { latitude: string; longitude: string; location?: { country_code: string } };
        rocket?: { configuration?: { name: string } };
        mission?: { name: string; type: string } | null;
        image?: string | null;
      }>;
    };

    const launches: Launch[] = data.results
      .filter((l) => l.pad?.latitude && l.pad?.longitude)
      .map((l) => ({
        name: l.pad?.location?.country_code || '',
        provider: l.launch_service_provider?.name || 'Unknown',
        country: l.pad?.location?.country_code || l.launch_service_provider?.country_code || '',
        lat: parseFloat(l.pad!.latitude),
        lon: parseFloat(l.pad!.longitude),
        date: l.net,
        vehicle: l.rocket?.configuration?.name || 'Unknown',
        mission: l.mission?.name || l.name,
        status: l.status.name,
        image: l.image || null,
      }));

    cachedLaunches = launches;
    lastFetch = Date.now();

    return res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300').json({
      launches,
      count: launches.length,
    });
  } catch (err) {
    console.error('Launch API error:', err instanceof Error ? err.message : err);
    if (cachedLaunches.length > 0) {
      return res.setHeader('Cache-Control', 'public, max-age=60').json({
        launches: cachedLaunches,
        count: cachedLaunches.length,
        cached: true,
        stale: true,
      });
    }
    return res.status(500).json({ launches: [], count: 0, error: 'Launch Library 2 unavailable' });
  }
}
