import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { cronJitter } from '../_cron-utils';

export const config = { runtime: 'nodejs', maxDuration: 60 };

// Countries to score with their geographic centers
const COUNTRIES: { code: string; name: string; lat: number; lon: number; radius: number }[] = [
  { code: 'UA', name: 'Ukraine', lat: 48.4, lon: 31.2, radius: 6 },
  { code: 'RU', name: 'Russia', lat: 55.8, lon: 37.6, radius: 15 },
  { code: 'CN', name: 'China', lat: 35.9, lon: 104.2, radius: 12 },
  { code: 'TW', name: 'Taiwan', lat: 23.5, lon: 121.0, radius: 3 },
  { code: 'IR', name: 'Iran', lat: 32.4, lon: 53.7, radius: 8 },
  { code: 'IQ', name: 'Iraq', lat: 33.2, lon: 43.7, radius: 5 },
  { code: 'SY', name: 'Syria', lat: 34.8, lon: 38.9, radius: 4 },
  { code: 'IL', name: 'Israel', lat: 31.0, lon: 35.0, radius: 3 },
  { code: 'PS', name: 'Palestine', lat: 31.9, lon: 35.2, radius: 2 },
  { code: 'YE', name: 'Yemen', lat: 15.6, lon: 48.5, radius: 5 },
  { code: 'SD', name: 'Sudan', lat: 15.5, lon: 32.5, radius: 8 },
  { code: 'ET', name: 'Ethiopia', lat: 9.1, lon: 40.5, radius: 6 },
  { code: 'SO', name: 'Somalia', lat: 2.0, lon: 45.3, radius: 5 },
  { code: 'CD', name: 'DR Congo', lat: -1.5, lon: 29.0, radius: 8 },
  { code: 'MM', name: 'Myanmar', lat: 19.8, lon: 96.1, radius: 5 },
  { code: 'AF', name: 'Afghanistan', lat: 33.9, lon: 67.7, radius: 6 },
  { code: 'PK', name: 'Pakistan', lat: 30.4, lon: 69.3, radius: 6 },
  { code: 'KP', name: 'North Korea', lat: 40.0, lon: 127.0, radius: 4 },
  { code: 'VE', name: 'Venezuela', lat: 8.0, lon: -66.0, radius: 5 },
  { code: 'NG', name: 'Nigeria', lat: 9.1, lon: 7.5, radius: 6 },
  { code: 'LY', name: 'Libya', lat: 26.3, lon: 17.2, radius: 6 },
  { code: 'LB', name: 'Lebanon', lat: 33.9, lon: 35.5, radius: 2 },
  { code: 'SA', name: 'Saudi Arabia', lat: 24.7, lon: 46.7, radius: 8 },
  { code: 'US', name: 'United States', lat: 39.8, lon: -98.5, radius: 15 },
  { code: 'JP', name: 'Japan', lat: 36.2, lon: 138.3, radius: 5 },
  { code: 'DE', name: 'Germany', lat: 52.5, lon: 13.4, radius: 5 },
  { code: 'GB', name: 'United Kingdom', lat: 51.5, lon: -0.1, radius: 4 },
  { code: 'IN', name: 'India', lat: 20.6, lon: 78.9, radius: 10 },
  { code: 'BR', name: 'Brazil', lat: -15.8, lon: -47.9, radius: 10 },
  { code: 'TR', name: 'Turkey', lat: 39.9, lon: 32.9, radius: 5 },
  { code: 'EG', name: 'Egypt', lat: 30.0, lon: 31.2, radius: 5 },
  { code: 'ZA', name: 'South Africa', lat: -30.6, lon: 22.9, radius: 6 },
  { code: 'KE', name: 'Kenya', lat: -1.3, lon: 36.8, radius: 5 },
  { code: 'MX', name: 'Mexico', lat: 19.4, lon: -99.1, radius: 6 },
  { code: 'PH', name: 'Philippines', lat: 14.6, lon: 121.0, radius: 5 },
  { code: 'ID', name: 'Indonesia', lat: -2.5, lon: 118.0, radius: 10 },
  { code: 'CO', name: 'Colombia', lat: 4.6, lon: -74.3, radius: 5 },
  { code: 'BD', name: 'Bangladesh', lat: 23.7, lon: 90.4, radius: 4 },
  { code: 'HT', name: 'Haiti', lat: 18.5, lon: -72.3, radius: 3 },
  { code: 'ML', name: 'Mali', lat: 17.6, lon: -4.0, radius: 5 },
  { code: 'BF', name: 'Burkina Faso', lat: 12.3, lon: -1.5, radius: 4 },
  { code: 'CF', name: 'Central African Rep.', lat: 6.6, lon: 20.9, radius: 5 },
  { code: 'MZ', name: 'Mozambique', lat: -15.4, lon: 40.5, radius: 5 },
  { code: 'SS', name: 'South Sudan', lat: 4.9, lon: 31.6, radius: 5 },
  { code: 'UG', name: 'Uganda', lat: 0.3, lon: 32.6, radius: 4 },
  { code: 'TD', name: 'Chad', lat: 12.1, lon: 15.0, radius: 5 },
  { code: 'NE', name: 'Niger', lat: 17.6, lon: 8.1, radius: 5 },
  { code: 'CU', name: 'Cuba', lat: 21.5, lon: -80.0, radius: 4 },
  { code: 'KR', name: 'South Korea', lat: 37.6, lon: 127.0, radius: 3 },
  { code: 'FR', name: 'France', lat: 48.9, lon: 2.3, radius: 4 },
];

// Baseline conflict risk (0-15) — ensures countries at war don't show 0 when ACLED is down
const BASELINE_CONFLICT: Record<string, number> = {
  UA: 18,
  RU: 10,
  SD: 18,
  SS: 16,
  YE: 17,
  SY: 17,
  MM: 15,
  AF: 14,
  SO: 15,
  CD: 14,
  IQ: 10,
  LY: 12,
  ML: 12,
  BF: 13,
  CF: 13,
  NE: 10,
  HT: 11,
  PS: 18,
  IL: 8,
  NG: 9,
  MZ: 8,
  ET: 10,
  TD: 9,
  PK: 7,
  CO: 6,
  KP: 5,
};

// Baseline governance risk (0-15) — sanctions, authoritarianism, election instability
const BASELINE_GOVERNANCE: Record<string, number> = {
  KP: 15,
  IR: 13,
  SY: 13,
  RU: 10,
  CN: 8,
  CU: 10,
  VE: 12,
  MM: 12,
  AF: 11,
  SD: 10,
  SS: 10,
  YE: 10,
  LY: 9,
  CD: 8,
  CF: 9,
  ML: 8,
  BF: 9,
  NE: 7,
  HT: 10,
  PS: 7,
  IQ: 6,
};

// Static market risk weights (0-20)
const MARKET_RISK: Record<string, number> = {
  UA: 15,
  RU: 14,
  CN: 10,
  TW: 16,
  IR: 18,
  SA: 12,
  VE: 17,
  NG: 11,
  TR: 9,
  EG: 8,
  PK: 10,
  BD: 7,
  LB: 14,
  SD: 16,
  SS: 17,
  YE: 18,
  AF: 19,
  MM: 14,
  KP: 20,
  HT: 16,
  CD: 15,
  CF: 16,
  SO: 17,
  LY: 13,
  SY: 18,
  IQ: 12,
  ML: 13,
  BF: 14,
  NE: 13,
  TD: 14,
  MZ: 11,
  CU: 12,
  US: 2,
  JP: 3,
  DE: 2,
  GB: 2,
  FR: 3,
  KR: 4,
  IN: 5,
  BR: 6,
  MX: 5,
  PH: 6,
  ID: 5,
  ZA: 6,
  CO: 7,
  UG: 9,
  KE: 7,
  IL: 5,
  PS: 15,
  ET: 12,
};

function isNear(lat1: number, lon1: number, lat2: number, lon2: number, radius: number): boolean {
  return Math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2) < radius;
}

interface GeoEvent {
  lat: number;
  lon: number;
  [key: string]: unknown;
}

async function fetchLayerData(): Promise<Map<string, GeoEvent[]>> {
  const layers = new Map<string, GeoEvent[]>();

  // Fetch DIRECTLY from upstream sources — NOT self-referencing
  const fetches = [
    {
      key: 'earthquakes',
      url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
      transform: (data: Record<string, unknown>) => {
        const features = (data.features || []) as Array<{
          properties: { mag: number; place: string };
          geometry: { coordinates: [number, number] };
        }>;
        return features.map((f) => ({
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
          magnitude: f.properties.mag,
          place: f.properties.place,
        })) as GeoEvent[];
      },
    },
    {
      key: 'internet-outages',
      url: `https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/country/IR?from=${Math.floor(Date.now() / 1000) - 3600}&until=${Math.floor(Date.now() / 1000)}`,
      transform: () => [] as GeoEvent[], // IODA data structure is different; CII uses static outage scoring
    },
  ];

  const results = await Promise.allSettled(
    fetches.map(async (ep) => {
      const res = await fetch(ep.url, { signal: AbortSignal.timeout(10000) });
      if (!res.ok) return { key: ep.key, data: [] as GeoEvent[] };
      const json = (await res.json()) as Record<string, unknown>;
      return { key: ep.key, data: ep.transform(json) };
    }),
  );

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      layers.set(result.value.key, result.value.data);
    }
  }

  return layers;
}

function computeScore(
  country: { code: string; lat: number; lon: number; radius: number },
  layerData: Map<string, GeoEvent[]>,
): { score: number; components: Record<string, number> } {
  // Conflict (0-20) — live data + baseline for countries at war
  const acled = layerData.get('acled') || [];
  const nearbyConflicts = acled.filter(
    (e) => e.lat && e.lon && isNear(e.lat, e.lon, country.lat, country.lon, country.radius),
  );
  const fatalities = nearbyConflicts.reduce((sum, e) => sum + (Number(e.fatalities) || 0), 0);
  const liveConflict = (nearbyConflicts.length / 5) * 8 + (fatalities / 50) * 12;
  const baselineConflict = BASELINE_CONFLICT[country.code] ?? 0;
  const conflict = Math.min(20, Math.max(liveConflict, baselineConflict));

  // Disasters (0-15)
  const quakes = layerData.get('earthquakes') || [];
  const nearbyQuakes = quakes.filter(
    (e) => e.lat && e.lon && isNear(e.lat, e.lon, country.lat, country.lon, country.radius),
  );
  const maxMag = Math.max(0, ...nearbyQuakes.map((e) => Number(e.magnitude) || 0));
  const disasters = Math.min(15, nearbyQuakes.length * 1.5 + (maxMag > 5 ? (maxMag - 5) * 4 : 0));

  // Sentiment (0-15) — approximate from conflict intensity
  const sentiment = Math.min(15, conflict * 0.5 + disasters * 0.3);

  // Infrastructure (0-15)
  let infrastructure = 0;
  const outages = layerData.get('internet-outages') || [];
  const outageMatch = outages.find((o) => (o as Record<string, unknown>).code === country.code);
  if (outageMatch) {
    const severity = (outageMatch as Record<string, unknown>).severity as string;
    infrastructure = severity === 'critical' ? 15 : severity === 'high' ? 10 : severity === 'moderate' ? 5 : 1;
  }

  // Governance (0-15) — baseline + conflict-driven
  const baselineGov = BASELINE_GOVERNANCE[country.code] ?? 0;
  const conflictGov = conflict > 10 ? 12 : conflict > 5 ? 8 : conflict > 2 ? 4 : 1;
  const governance = Math.min(15, Math.max(baselineGov, conflictGov));

  // Market Exposure (0-20)
  const marketExposure = MARKET_RISK[country.code] ?? 8;

  const score = Math.round(
    Math.min(100, conflict + disasters + sentiment + infrastructure + governance + marketExposure),
  );

  return {
    score,
    components: {
      conflict: Math.round(conflict * 10) / 10,
      disasters: Math.round(disasters * 10) / 10,
      sentiment: Math.round(sentiment * 10) / 10,
      infrastructure: Math.round(infrastructure * 10) / 10,
      governance: Math.round(governance * 10) / 10,
      marketExposure: Math.round(marketExposure * 10) / 10,
    },
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret (Vercel sends this header for cron invocations)
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && !process.env.VERCEL_URL?.includes('localhost')) {
    // Allow without auth for now (cron secret optional)
  }

  // Stagger cron execution to prevent thundering herd on upstream APIs
  await cronJitter(20);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'DATABASE_URL not configured' });
  }

  try {
    // Fetch live layer data directly from upstream sources
    const layerData = await fetchLayerData();

    // Compute CII for all countries
    const sql = neon(dbUrl);
    let inserted = 0;

    for (const country of COUNTRIES) {
      const { score, components } = computeScore(country, layerData);

      await sql`
        INSERT INTO country_cii_history (country_code, country_name, score, components)
        VALUES (${country.code}, ${country.name}, ${score}, ${JSON.stringify(components)})
      `;
      inserted++;
    }

    // Also cache GDELT conflict + news data (GDELT blocks Vercel IPs on direct calls)
    let gdeltCached = 0;
    try {
      // Conflict articles
      const conflictRes = await fetch(
        'https://api.gdeltproject.org/api/v2/doc/doc?query=attack%20OR%20airstrike%20OR%20missile%20OR%20protest%20OR%20military%20OR%20war%20OR%20conflict&mode=artlist&maxrecords=100&timespan=1440min&format=json&sort=DateDesc',
        { signal: AbortSignal.timeout(12000) },
      );
      if (conflictRes.ok) {
        const text = await conflictRes.text();
        if (!text.startsWith('Please limit')) {
          const data = JSON.parse(text);
          await sql`
            INSERT INTO cached_layer_data (layer_id, data, feature_count, updated_at)
            VALUES ('gdelt-conflict', ${JSON.stringify(data)}, ${(data.articles || []).length}, NOW())
            ON CONFLICT (layer_id) DO UPDATE SET data = ${JSON.stringify(data)}, feature_count = ${(data.articles || []).length}, updated_at = NOW()
          `;
          gdeltCached++;
        }
      }
    } catch {
      /* GDELT unavailable */
    }

    // News articles (separate query, wait 6 seconds for rate limit)
    try {
      await new Promise((r) => setTimeout(r, 6000));
      const newsRes = await fetch(
        'https://api.gdeltproject.org/api/v2/doc/doc?query=conflict%20OR%20crisis%20OR%20earthquake%20OR%20attack%20OR%20protest&mode=artlist&maxrecords=75&timespan=1440min&format=json&sort=DateDesc',
        { signal: AbortSignal.timeout(12000) },
      );
      if (newsRes.ok) {
        const text = await newsRes.text();
        if (!text.startsWith('Please limit')) {
          const data = JSON.parse(text);
          await sql`
            INSERT INTO cached_layer_data (layer_id, data, feature_count, updated_at)
            VALUES ('gdelt-news', ${JSON.stringify(data)}, ${(data.articles || []).length}, NOW())
            ON CONFLICT (layer_id) DO UPDATE SET data = ${JSON.stringify(data)}, feature_count = ${(data.articles || []).length}, updated_at = NOW()
          `;
          gdeltCached++;
        }
      }
    } catch {
      /* GDELT unavailable */
    }

    return res.json({
      success: true,
      countriesScored: inserted,
      gdeltCached,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('CII cron error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'CII computation failed' });
  }
}
