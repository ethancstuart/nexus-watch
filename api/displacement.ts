import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Cache for 24 hours — UNHCR data is annual
let cachedFlows: DisplacementFlow[] = [];
let lastFetch = 0;
const CACHE_TTL = 86400_000; // 24 hours

interface DisplacementFlow {
  origin: string;
  originCode: string;
  destination: string;
  destinationCode: string;
  population: number;
  year: number;
}

// Country centroids for rendering arcs
const COUNTRY_COORDS: Record<string, [number, number]> = {
  AFG: [33.9, 67.7],
  AGO: [-12.3, 17.5],
  BDI: [-3.4, 29.4],
  BFA: [12.3, -1.5],
  BGD: [23.7, 90.4],
  BRA: [-15.8, -47.9],
  CAF: [6.6, 20.9],
  CHL: [-33.4, -70.6],
  CMR: [5.0, 12.4],
  COD: [-1.5, 29.0],
  COL: [4.6, -74.3],
  CRI: [10.0, -84.0],
  CZE: [50.1, 14.4],
  DEU: [52.5, 13.4],
  DOM: [18.5, -69.9],
  ECU: [-1.8, -78.2],
  EGY: [30.0, 31.2],
  ERI: [15.3, 39.0],
  ETH: [9.1, 40.5],
  GHA: [7.9, -1.0],
  GIN: [9.9, -13.7],
  HTI: [18.5, -72.3],
  IDN: [-2.5, 118.0],
  IND: [20.6, 78.9],
  IRN: [32.4, 53.7],
  IRQ: [33.2, 43.7],
  JOR: [31.0, 36.8],
  KEN: [-1.3, 36.8],
  LBN: [33.9, 35.5],
  LBY: [26.3, 17.2],
  MLI: [17.6, -4.0],
  MMR: [19.8, 96.1],
  MOZ: [-15.4, 40.5],
  MWI: [-13.3, 33.8],
  NER: [17.6, 8.1],
  NGA: [9.1, 7.5],
  NIC: [12.1, -86.3],
  PAK: [30.4, 69.3],
  PER: [-12.0, -77.0],
  POL: [52.0, 20.0],
  RUS: [55.8, 37.6],
  RWA: [-2.0, 29.9],
  SAU: [24.7, 46.7],
  SDN: [15.5, 32.5],
  SOM: [2.0, 45.3],
  SSD: [4.9, 31.6],
  SYR: [34.8, 38.9],
  TCD: [12.1, 15.0],
  TUR: [39.9, 32.9],
  TZA: [-6.8, 37.7],
  UGA: [0.3, 32.6],
  UKR: [48.4, 31.2],
  VEN: [8.0, -66.0],
  YEM: [15.6, 48.5],
  ZMB: [-15.4, 28.3],
};

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (Date.now() - lastFetch < CACHE_TTL && cachedFlows.length > 0) {
    return res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400').json({
      flows: cachedFlows,
      count: cachedFlows.length,
      cached: true,
    });
  }

  try {
    // Fetch latest UNHCR population data — top displacement corridors
    // coo_all=true&coa_all=true gives country-to-country breakdown
    const response = await fetch(
      'https://api.unhcr.org/population/v1/population/?year=2024&limit=500&coo_all=true&coa_all=true',
      { signal: AbortSignal.timeout(15000) },
    );

    if (!response.ok) throw new Error(`UNHCR API returned ${response.status}`);

    const data = (await response.json()) as {
      items: Array<{
        year: number;
        coo_name: string;
        coo_iso: string;
        coa_name: string;
        coa_iso: string;
        refugees: number | string;
        asylum_seekers: number | string;
      }>;
    };

    const flows: DisplacementFlow[] = data.items
      .filter((item) => {
        // UNHCR returns some numbers as strings — coerce
        const refugees = typeof item.refugees === 'string' ? parseInt(item.refugees, 10) || 0 : item.refugees || 0;
        const asylees =
          typeof item.asylum_seekers === 'string' ? parseInt(item.asylum_seekers, 10) || 0 : item.asylum_seekers || 0;
        const pop = refugees + asylees;
        return (
          pop > 50000 &&
          item.coo_iso !== '-' &&
          item.coa_iso !== '-' &&
          item.coo_iso !== item.coa_iso &&
          COUNTRY_COORDS[item.coo_iso] &&
          COUNTRY_COORDS[item.coa_iso]
        );
      })
      .map((item) => {
        const refugees = typeof item.refugees === 'string' ? parseInt(item.refugees, 10) || 0 : item.refugees || 0;
        const asylees =
          typeof item.asylum_seekers === 'string' ? parseInt(item.asylum_seekers, 10) || 0 : item.asylum_seekers || 0;
        return {
          origin: item.coo_name,
          originCode: item.coo_iso,
          destination: item.coa_name,
          destinationCode: item.coa_iso,
          population: refugees + asylees,
          year: item.year,
        };
      })
      .sort((a, b) => b.population - a.population)
      .slice(0, 30);

    // Attach coordinates
    const flowsWithCoords = flows.map((f) => ({
      ...f,
      lat1: COUNTRY_COORDS[f.originCode]?.[0] ?? 0,
      lon1: COUNTRY_COORDS[f.originCode]?.[1] ?? 0,
      lat2: COUNTRY_COORDS[f.destinationCode]?.[0] ?? 0,
      lon2: COUNTRY_COORDS[f.destinationCode]?.[1] ?? 0,
    }));

    if (flowsWithCoords.length > 0) {
      cachedFlows = flowsWithCoords;
      lastFetch = Date.now();
    }

    return res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400').json({
      flows: flowsWithCoords,
      count: flowsWithCoords.length,
      source: 'unhcr',
    });
  } catch (err) {
    console.error('Displacement API error:', err instanceof Error ? err.message : err);
    if (cachedFlows.length > 0) {
      return res.setHeader('Cache-Control', 'public, max-age=3600').json({
        flows: cachedFlows,
        count: cachedFlows.length,
        cached: true,
        stale: true,
      });
    }
    return res.status(500).json({ flows: [], count: 0, error: 'UNHCR API unavailable' });
  }
}
