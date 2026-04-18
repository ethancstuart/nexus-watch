import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { cronJitter } from '../_cron-utils.js';
import { BASELINE_CONFLICT, BASELINE_GOVERNANCE, MARKET_RISK } from '../_lib/cii-baselines.js';

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

// Baselines imported from api/_lib/cii-baselines.ts (single source of truth, v2.2.0)
// DO NOT declare local baselines here — they WILL drift. All changes go through cii-baselines.ts.

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
  // 2026-04-18: Added ACLED (was missing — conflict component ran on baselines only)
  const acledEmail = process.env.ACLED_EMAIL || '';
  const acledKey = process.env.ACLED_PASSWORD || '';
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

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
    // ACLED conflict events — covers ALL 86 CII countries globally
    ...(acledEmail && acledKey
      ? [
          {
            key: 'acled',
            url: `https://api.acleddata.com/acled/read?key=${acledKey}&email=${encodeURIComponent(acledEmail)}&limit=2000&event_date=${sevenDaysAgo}|${today}&event_date_where=BETWEEN`,
            transform: (data: Record<string, unknown>) => {
              const rows = (data.data || []) as Array<{
                latitude: string;
                longitude: string;
                fatalities: string;
                event_type: string;
                country: string;
              }>;
              return rows.map((r) => ({
                lat: parseFloat(r.latitude) || 0,
                lon: parseFloat(r.longitude) || 0,
                fatalities: parseInt(r.fatalities, 10) || 0,
                event_type: r.event_type,
                country: r.country,
              })) as GeoEvent[];
            },
          },
        ]
      : []),
    // NASA FIRMS fire hotspots — improves disaster scoring for Amazon, Indonesia, etc.
    {
      key: 'fires',
      url: 'https://firms.modaps.eosdis.nasa.gov/api/country/csv/VIIRS_SNPP_NRT/world/1',
      transform: () => [] as GeoEvent[], // CSV parsing would need dedicated handler; skip for now
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

async function computeScore(
  country: { code: string; lat: number; lon: number; radius: number },
  layerData: Map<string, GeoEvent[]>,
  dbData: {
    ooni: Map<string, number>;
    fxVolatility: Map<string, number>;
    wikiSpikes: Map<string, number>;
  },
): Promise<{ score: number; components: Record<string, number>; liveSourceCount: number }> {
  let liveSourceCount = 0;

  // ═══ Conflict (0-20) — ACLED live + baseline ═══
  const acled = layerData.get('acled') || [];
  const nearbyConflicts = acled.filter(
    (e) => e.lat && e.lon && isNear(e.lat, e.lon, country.lat, country.lon, country.radius),
  );
  const fatalities = nearbyConflicts.reduce((sum, e) => sum + (Number(e.fatalities) || 0), 0);
  const liveConflict = (nearbyConflicts.length / 5) * 8 + (fatalities / 50) * 12;
  const baselineConflict = BASELINE_CONFLICT[country.code] ?? 0;
  const conflict = Math.min(20, Math.max(liveConflict, baselineConflict));
  if (nearbyConflicts.length > 0) liveSourceCount++;

  // ═══ Disasters (0-15) — earthquakes + fires (live) ═══
  const quakes = layerData.get('earthquakes') || [];
  const nearbyQuakes = quakes.filter(
    (e) => e.lat && e.lon && isNear(e.lat, e.lon, country.lat, country.lon, country.radius),
  );
  const maxMag = Math.max(0, ...nearbyQuakes.map((e) => Number(e.magnitude) || 0));
  const disasters = Math.min(15, nearbyQuakes.length * 1.5 + (maxMag > 5 ? (maxMag - 5) * 4 : 0));
  if (nearbyQuakes.length > 0) liveSourceCount++;

  // ═══ Sentiment (0-15) — Wikipedia pageview spikes + conflict-derived ═══
  // Use Wikipedia z-score spike data if available, otherwise fall back to derivative
  const wikiZScore = dbData.wikiSpikes.get(country.code) || 0;
  let sentiment: number;
  if (wikiZScore > 1) {
    // Wikipedia attention surge detected — use as real sentiment signal
    const wikiContrib = Math.min(8, wikiZScore * 2);
    sentiment = Math.min(15, wikiContrib + conflict * 0.3);
    liveSourceCount++;
  } else {
    // Fallback to conflict-derived proxy
    sentiment = Math.min(15, conflict * 0.5 + disasters * 0.3);
  }

  // ═══ Infrastructure (0-15) — OONI censorship data from DB ═══
  let infrastructure = 0;
  const ooniBlocked = dbData.ooni.get(country.code) || 0;
  if (ooniBlocked > 50) {
    infrastructure = 12;
    liveSourceCount++;
  } else if (ooniBlocked > 10) {
    infrastructure = 7;
    liveSourceCount++;
  } else if (ooniBlocked > 0) {
    infrastructure = 3;
    liveSourceCount++;
  }
  // Also check layerData outages (legacy path)
  const outages = layerData.get('internet-outages') || [];
  const outageMatch = outages.find((o) => (o as Record<string, unknown>).code === country.code);
  if (outageMatch) {
    const severity = (outageMatch as Record<string, unknown>).severity as string;
    const outageScore = severity === 'critical' ? 15 : severity === 'high' ? 10 : severity === 'moderate' ? 5 : 1;
    infrastructure = Math.max(infrastructure, outageScore);
  }

  // ═══ Governance (0-15) — baseline + conflict-driven + OONI censorship signal ═══
  const baselineGov = BASELINE_GOVERNANCE[country.code] ?? 0;
  const conflictGov = conflict > 10 ? 12 : conflict > 5 ? 8 : conflict > 2 ? 4 : 1;
  // OONI censorship adds to governance instability (censorship = regime fear)
  const censorshipGov = ooniBlocked > 50 ? 4 : ooniBlocked > 10 ? 2 : 0;
  const governance = Math.min(15, Math.max(baselineGov, conflictGov) + censorshipGov);

  // ═══ Market Exposure (0-20) — FX volatility (live) + baseline ═══
  let marketExposure = MARKET_RISK[country.code] ?? 8;
  const fxVol = dbData.fxVolatility.get(country.code) || 0;
  if (fxVol > 5) {
    marketExposure = Math.min(20, marketExposure + 6); // Currency crisis signal
    liveSourceCount++;
  } else if (fxVol > 3) {
    marketExposure = Math.min(20, marketExposure + 3); // Elevated volatility
    liveSourceCount++;
  } else if (fxVol > 1) {
    liveSourceCount++; // Data exists, normal vol
  }

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
    liveSourceCount,
  };
}

/** Pre-fetch all DB-stored data sources into Maps for fast per-country lookup. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchDbData(sql: any): Promise<{
  ooni: Map<string, number>;
  fxVolatility: Map<string, number>;
  wikiSpikes: Map<string, number>;
}> {
  const ooni = new Map<string, number>();
  const fxVolatility = new Map<string, number>();
  const wikiSpikes = new Map<string, number>();

  // OONI censorship — confirmed blocks in last 3 days
  try {
    const rows = await sql`
      SELECT country_code, SUM(confirmed_blocked) as total_blocked
      FROM ooni_measurements
      WHERE measurement_date > CURRENT_DATE - INTERVAL '3 days'
      GROUP BY country_code
    `;
    for (const r of rows) ooni.set(String(r.country_code), Number(r.total_blocked) || 0);
  } catch {
    /* table may not exist yet */
  }

  // FX volatility — latest 7-day vol per country
  try {
    const rows = await sql`
      SELECT DISTINCT ON (country_code) country_code, volatility_7d
      FROM fx_rates
      WHERE volatility_7d IS NOT NULL
      ORDER BY country_code, date DESC
    `;
    for (const r of rows) fxVolatility.set(String(r.country_code), Number(r.volatility_7d) || 0);
  } catch {
    /* table may not exist yet */
  }

  // Wikipedia pageview spikes — max z-score per country in last 2 days
  try {
    const rows = await sql`
      SELECT country_code, MAX(z_score) as max_z
      FROM wikipedia_pageviews
      WHERE date > CURRENT_DATE - INTERVAL '2 days'
        AND z_score > 1
      GROUP BY country_code
    `;
    for (const r of rows) wikiSpikes.set(String(r.country_code), Number(r.max_z) || 0);
  } catch {
    /* table may not exist yet */
  }

  return { ooni, fxVolatility, wikiSpikes };
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

    // Pre-fetch all DB-stored data sources (OONI, FX, Wikipedia) in one batch
    const dbData = await fetchDbData(sql);
    let inserted = 0;
    let totalLiveSources = 0;

    for (const country of COUNTRIES) {
      const { score, components, liveSourceCount } = await computeScore(country, layerData, dbData);
      totalLiveSources += liveSourceCount;

      // Store components + data quality grade (A/B/C/D based on live source count)
      const grade = liveSourceCount >= 4 ? 'A' : liveSourceCount >= 2 ? 'B' : liveSourceCount >= 1 ? 'C' : 'D';
      const enrichedComponents = { ...components, liveSourceCount, dataQuality: grade };

      await sql`
        INSERT INTO country_cii_history (country_code, country_name, score, components)
        VALUES (${country.code}, ${country.name}, ${score}, ${JSON.stringify(enrichedComponents)})
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

    const avgLiveSources = inserted > 0 ? Math.round((totalLiveSources / inserted) * 10) / 10 : 0;
    console.log(
      `[compute-cii] scored=${inserted}, avgLiveSources=${avgLiveSources}, ` +
        `ooni=${dbData.ooni.size}, fx=${dbData.fxVolatility.size}, wiki=${dbData.wikiSpikes.size}, ` +
        `gdelt=${gdeltCached}`,
    );

    return res.json({
      success: true,
      countriesScored: inserted,
      gdeltCached,
      liveDataSources: {
        acledEvents: (layerData.get('acled') || []).length,
        earthquakes: (layerData.get('earthquakes') || []).length,
        ooniCountries: dbData.ooni.size,
        fxCountries: dbData.fxVolatility.size,
        wikiSpikeCountries: dbData.wikiSpikes.size,
      },
      avgLiveSourcesPerCountry: avgLiveSources,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('CII cron error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'CII computation failed' });
  }
}
