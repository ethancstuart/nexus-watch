import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// CelesTrak updates every 2 hours — cache accordingly
let cachedSatellites: SatelliteData[] = [];
let lastFetch = 0;
const CACHE_TTL = 7200_000; // 2 hours

interface SatelliteData {
  name: string;
  noradId: number;
  type: string;
  country: string;
  inclination: number;
  eccentricity: number;
  period: number;
  raan: number;
  argPericenter: number;
  meanAnomaly: number;
  meanMotion: number;
  epoch: string;
  altitude: number;
}

// Fetch multiple satellite groups from CelesTrak
async function fetchGroup(group: string, type: string): Promise<SatelliteData[]> {
  const res = await fetch(`https://celestrak.org/NORAD/elements/gp.php?GROUP=${group}&FORMAT=json`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{
    OBJECT_NAME: string;
    NORAD_CAT_ID: number;
    INCLINATION: number;
    ECCENTRICITY: number;
    PERIOD?: number;
    RA_OF_ASC_NODE: number;
    ARG_OF_PERICENTER: number;
    MEAN_ANOMALY: number;
    MEAN_MOTION: number;
    EPOCH: string;
    COUNTRY_CODE?: string;
  }>;

  return data.map((s) => {
    const period = s.PERIOD ?? 1440 / s.MEAN_MOTION;
    // Approximate altitude from period using Kepler's third law
    const earthRadius = 6371;
    const mu = 398600.4418;
    const semiMajor = Math.cbrt((mu * (period * 60) ** 2) / (4 * Math.PI ** 2));
    const altitude = Math.round(semiMajor - earthRadius);

    return {
      name: s.OBJECT_NAME,
      noradId: s.NORAD_CAT_ID,
      type,
      country: s.COUNTRY_CODE || '',
      inclination: s.INCLINATION,
      eccentricity: s.ECCENTRICITY,
      period,
      raan: s.RA_OF_ASC_NODE,
      argPericenter: s.ARG_OF_PERICENTER,
      meanAnomaly: s.MEAN_ANOMALY,
      meanMotion: s.MEAN_MOTION,
      epoch: s.EPOCH,
      altitude,
    };
  });
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (Date.now() - lastFetch < CACHE_TTL && cachedSatellites.length > 0) {
    return res.setHeader('Cache-Control', 'public, max-age=7200, s-maxage=7200').json({
      satellites: cachedSatellites,
      count: cachedSatellites.length,
      cached: true,
    });
  }

  try {
    // Fetch key groups in parallel: stations, military, navigation, notable
    const [stations, military, gps, glonass] = await Promise.all([
      fetchGroup('stations', 'station'),
      fetchGroup('military', 'reconnaissance'),
      fetchGroup('gps-ops', 'navigation'),
      fetchGroup('glo-ops', 'navigation'),
    ]);

    // Combine and limit — take all stations, sample others
    const satellites = [...stations, ...military.slice(0, 20), ...gps.slice(0, 10), ...glonass.slice(0, 10)];

    if (satellites.length > 0) {
      cachedSatellites = satellites;
      lastFetch = Date.now();
    }

    return res.setHeader('Cache-Control', 'public, max-age=7200, s-maxage=7200').json({
      satellites,
      count: satellites.length,
    });
  } catch (err) {
    console.error('Satellite API error:', err instanceof Error ? err.message : err);
    if (cachedSatellites.length > 0) {
      return res.setHeader('Cache-Control', 'public, max-age=3600').json({
        satellites: cachedSatellites,
        count: cachedSatellites.length,
        cached: true,
        stale: true,
      });
    }
    return res.status(500).json({ satellites: [], count: 0, error: 'CelesTrak unavailable' });
  }
}
