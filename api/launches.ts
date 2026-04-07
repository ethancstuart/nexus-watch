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

// Known launch site coordinates as fallback for geocoding
const KNOWN_PADS: Record<string, [number, number]> = {
  'Space Launch Complex 4E': [34.632, -120.611],
  'Space Launch Complex 40': [28.562, -80.577],
  'Launch Complex 39A': [28.608, -80.604],
  'Vandenberg': [34.632, -120.611],
  'Kennedy': [28.573, -80.649],
  'Cape Canaveral': [28.489, -80.578],
  'Boca Chica': [25.997, -97.157],
  'Guiana': [5.239, -52.769],
  'Kourou': [5.239, -52.769],
  'Jiuquan': [40.958, 100.291],
  'Wenchang': [19.614, 110.951],
  'Baikonur': [45.965, 63.305],
  'Plesetsk': [62.929, 40.450],
  'Satish Dhawan': [13.733, 80.235],
  'Tanegashima': [30.370, 131.000],
  'Mahia': [-39.262, 177.865],
  'Xichang': [28.246, 102.027],
  'Taiyuan': [38.849, 111.608],
  'Vostochny': [51.884, 128.334],
};

function resolveCoords(
  pad: { latitude?: string; longitude?: string; name?: string; location?: { country_code?: string } } | string | null,
  location: string | null,
): { lat: number; lon: number; country: string } | null {
  if (pad && typeof pad === 'object') {
    if (pad.latitude && pad.longitude) {
      return {
        lat: parseFloat(pad.latitude),
        lon: parseFloat(pad.longitude),
        country: pad.location?.country_code || '',
      };
    }
    // Fallback: try matching pad name against known pads
    if (pad.name) {
      for (const [key, coords] of Object.entries(KNOWN_PADS)) {
        if (pad.name.includes(key)) {
          return { lat: coords[0], lon: coords[1], country: pad.location?.country_code || '' };
        }
      }
    }
  }
  // Fallback: try matching location string against known pads
  if (location && typeof location === 'string') {
    for (const [key, coords] of Object.entries(KNOWN_PADS)) {
      if (location.includes(key)) {
        return { lat: coords[0], lon: coords[1], country: '' };
      }
    }
  }
  return null;
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
    // mode=normal gives pad coordinates without bloated descriptions
    const response = await fetch(
      'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=25&mode=normal',
      { signal: AbortSignal.timeout(10000) },
    );

    if (!response.ok) {
      if (response.status === 429) {
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
        launch_service_provider?: { name: string; country_code?: string } | null;
        lsp_name?: string;
        pad?: { latitude?: string; longitude?: string; name?: string; location?: { country_code: string; name?: string } } | string | null;
        location?: string | null;
        rocket?: { configuration?: { name: string } } | null;
        mission?: { name: string; type: string } | string | null;
        image?: string | null;
      }>;
    };

    const launches: Launch[] = data.results
      .map((l) => {
        const coords = resolveCoords(
          l.pad as { latitude?: string; longitude?: string; name?: string; location?: { country_code?: string } } | string | null,
          typeof l.location === 'string' ? l.location : null,
        );
        if (!coords) return null;

        const provider = (typeof l.launch_service_provider === 'object' && l.launch_service_provider?.name)
          || l.lsp_name || 'Unknown';
        const vehicle = (typeof l.rocket === 'object' && l.rocket?.configuration?.name) || 'Unknown';
        const mission = (typeof l.mission === 'object' && l.mission?.name) || (typeof l.mission === 'string' ? l.mission : l.name);

        return {
          name: l.name,
          provider,
          country: coords.country,
          lat: coords.lat,
          lon: coords.lon,
          date: l.net,
          vehicle,
          mission,
          status: l.status.name,
          image: l.image || null,
        };
      })
      .filter((l): l is Launch => l !== null);

    if (launches.length > 0) {
      cachedLaunches = launches;
      lastFetch = Date.now();
    }

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
