import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Module-level cache
let cachedOutages: InternetOutage[] = [];
let lastFetch = 0;
const CACHE_TTL = 300_000; // 5 minutes

interface InternetOutage {
  country: string;
  code: string;
  lat: number;
  lon: number;
  severity: string;
  type: string;
  description: string;
  score: number;
}

// Countries to monitor — expanded for global coverage
// High-risk (conflict/authoritarian) + strategically important
const MONITORED_COUNTRIES: Array<{ code: string; name: string; lat: number; lon: number }> = [
  // Conflict zones & authoritarian states (highest risk)
  { code: 'IR', name: 'Iran', lat: 32.4, lon: 53.7 },
  { code: 'MM', name: 'Myanmar', lat: 19.8, lon: 96.1 },
  { code: 'ET', name: 'Ethiopia', lat: 9.1, lon: 40.5 },
  { code: 'RU', name: 'Russia', lat: 55.8, lon: 37.6 },
  { code: 'CN', name: 'China', lat: 35.9, lon: 104.2 },
  { code: 'CU', name: 'Cuba', lat: 21.5, lon: -80.0 },
  { code: 'SD', name: 'Sudan', lat: 15.5, lon: 32.5 },
  { code: 'IQ', name: 'Iraq', lat: 33.2, lon: 43.7 },
  { code: 'SY', name: 'Syria', lat: 34.8, lon: 38.9 },
  { code: 'VE', name: 'Venezuela', lat: 8.0, lon: -66.0 },
  { code: 'UA', name: 'Ukraine', lat: 48.4, lon: 31.2 },
  { code: 'PS', name: 'Palestine', lat: 31.9, lon: 35.2 },
  { code: 'YE', name: 'Yemen', lat: 15.6, lon: 48.5 },
  { code: 'KP', name: 'North Korea', lat: 40.0, lon: 127.0 },
  { code: 'AF', name: 'Afghanistan', lat: 33.9, lon: 67.7 },
  { code: 'LY', name: 'Libya', lat: 26.3, lon: 17.2 },
  { code: 'SO', name: 'Somalia', lat: 2.0, lon: 45.3 },
  { code: 'CD', name: 'DR Congo', lat: -1.5, lon: 29.0 },
  { code: 'SS', name: 'South Sudan', lat: 4.9, lon: 31.6 },
  // High-risk for disruption (history of shutdowns)
  { code: 'PK', name: 'Pakistan', lat: 30.4, lon: 69.3 },
  { code: 'IN', name: 'India', lat: 28.6, lon: 77.2 },
  { code: 'BD', name: 'Bangladesh', lat: 23.7, lon: 90.4 },
  { code: 'TZ', name: 'Tanzania', lat: -6.8, lon: 35.7 },
  { code: 'UG', name: 'Uganda', lat: 0.3, lon: 32.6 },
  { code: 'NG', name: 'Nigeria', lat: 9.1, lon: 7.5 },
  { code: 'KE', name: 'Kenya', lat: -1.3, lon: 36.8 },
  { code: 'ML', name: 'Mali', lat: 12.6, lon: -8.0 },
  { code: 'BF', name: 'Burkina Faso', lat: 12.3, lon: -1.5 },
  { code: 'TD', name: 'Chad', lat: 12.1, lon: 15.0 },
  { code: 'NE', name: 'Niger', lat: 13.5, lon: 2.1 },
  // Strategic / major economies
  { code: 'TR', name: 'Turkey', lat: 39.9, lon: 32.9 },
  { code: 'EG', name: 'Egypt', lat: 30.0, lon: 31.2 },
  { code: 'SA', name: 'Saudi Arabia', lat: 24.7, lon: 46.7 },
  { code: 'IL', name: 'Israel', lat: 31.0, lon: 35.0 },
  { code: 'TW', name: 'Taiwan', lat: 23.5, lon: 121.0 },
  { code: 'PH', name: 'Philippines', lat: 14.6, lon: 121.0 },
  { code: 'ID', name: 'Indonesia', lat: -2.5, lon: 118.0 },
  { code: 'BR', name: 'Brazil', lat: -15.8, lon: -47.9 },
  { code: 'MX', name: 'Mexico', lat: 19.4, lon: -99.1 },
  { code: 'CO', name: 'Colombia', lat: 4.6, lon: -74.3 },
];

async function fetchIODA(countryCode: string): Promise<{ bgpScore: number; description: string } | null> {
  const now = Math.floor(Date.now() / 1000);
  const from = now - 3600; // last hour

  try {
    const res = await fetch(
      `https://api.ioda.inetintel.cc.gatech.edu/v2/signals/raw/country/${countryCode}?from=${from}&until=${now}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return null;

    const data = (await res.json()) as {
      data: Array<
        Array<{
          datasource: string;
          values: number[];
        }>
      >;
    };

    // Look for BGP signal
    const signals = data.data?.[0];
    if (!signals || signals.length === 0) return null;

    const bgp = signals.find((s) => s.datasource === 'bgp');
    if (!bgp || !bgp.values || bgp.values.length < 2) return null;

    // Compare latest value to the earlier value — detect drops
    const values = bgp.values.filter((v) => v !== null && v > 0);
    if (values.length < 2) return null;

    const baseline = values[0];
    const current = values[values.length - 1];
    const ratio = current / baseline;

    let description: string;
    if (ratio < 0.3) description = 'Major internet outage detected — BGP routes severely reduced';
    else if (ratio < 0.6) description = 'Significant internet disruption — partial BGP route loss';
    else if (ratio < 0.85) description = 'Moderate connectivity degradation detected';
    else description = 'Normal connectivity';

    return { bgpScore: ratio, description };
  } catch (err) {
    console.error('[internet-outages] BGP probe failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

function scoreSeverity(ratio: number): { severity: string; score: number } {
  if (ratio < 0.3) return { severity: 'critical', score: 1.0 };
  if (ratio < 0.6) return { severity: 'high', score: 0.75 };
  if (ratio < 0.85) return { severity: 'moderate', score: 0.5 };
  return { severity: 'normal', score: 0.1 };
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (Date.now() - lastFetch < CACHE_TTL && cachedOutages.length > 0) {
    return res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300').json({
      outages: cachedOutages,
      count: cachedOutages.length,
      cached: true,
      source: 'ioda',
    });
  }

  try {
    // Check all monitored countries in parallel (batched to avoid overwhelming IODA)
    const batch1 = MONITORED_COUNTRIES.slice(0, 10);
    const batch2 = MONITORED_COUNTRIES.slice(10);

    const results1 = await Promise.all(
      batch1.map(async (c) => {
        const ioda = await fetchIODA(c.code);
        return { country: c, ioda };
      }),
    );

    const results2 = await Promise.all(
      batch2.map(async (c) => {
        const ioda = await fetchIODA(c.code);
        return { country: c, ioda };
      }),
    );

    const allResults = [...results1, ...results2];

    const outages: InternetOutage[] = allResults
      .filter((r) => r.ioda !== null)
      .map((r) => {
        const { severity, score } = scoreSeverity(r.ioda!.bgpScore);
        return {
          country: r.country.name,
          code: r.country.code,
          lat: r.country.lat,
          lon: r.country.lon,
          severity,
          type: r.ioda!.bgpScore < 0.6 ? 'outage' : 'degradation',
          description: r.ioda!.description,
          score,
        };
      })
      .sort((a, b) => b.score - a.score);

    if (outages.length > 0) {
      cachedOutages = outages;
      lastFetch = Date.now();
    }

    return res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300').json({
      outages,
      count: outages.length,
      source: 'ioda',
    });
  } catch (err) {
    console.error('Internet outages API error:', err instanceof Error ? err.message : err);
    if (cachedOutages.length > 0) {
      return res.setHeader('Cache-Control', 'public, max-age=60').json({
        outages: cachedOutages,
        count: cachedOutages.length,
        cached: true,
        stale: true,
      });
    }
    // OONI DB fallback — query stored censorship measurements
    try {
      const { neon } = await import('@neondatabase/serverless');
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        const sql = neon(dbUrl);
        const rows = await sql`
          SELECT country_code, anomaly_count, confirmed_blocked, total_measurements, measurement_date
          FROM ooni_measurements
          WHERE measurement_date > CURRENT_DATE - INTERVAL '3 days'
            AND (anomaly_count > 5 OR confirmed_blocked > 0)
          ORDER BY confirmed_blocked DESC, anomaly_count DESC
          LIMIT 30
        `;
        if (rows.length > 0) {
          const ooniOutages: InternetOutage[] = rows.map((r) => {
            const mc = MONITORED_COUNTRIES.find((c) => c.code === r.country_code);
            const blocked = Number(r.confirmed_blocked) || 0;
            const anomalies = Number(r.anomaly_count) || 0;
            const sev = blocked > 50 ? 'critical' : blocked > 10 ? 'high' : anomalies > 20 ? 'moderate' : 'low';
            return {
              country: mc?.name || String(r.country_code),
              code: String(r.country_code),
              lat: mc?.lat || 0,
              lon: mc?.lon || 0,
              severity: sev,
              type: blocked > 0 ? 'censorship' : 'anomaly',
              description: `${blocked} confirmed blocks, ${anomalies} anomalies detected (OONI)`,
              score: blocked > 50 ? 1.0 : blocked > 10 ? 0.75 : anomalies > 20 ? 0.5 : 0.25,
            };
          });
          cachedOutages = ooniOutages;
          lastFetch = Date.now();
          return res.json({ outages: ooniOutages, count: ooniOutages.length, source: 'ooni-db' });
        }
      }
    } catch {
      // OONI DB also failed
    }

    // Never return 500
    return res.json({
      outages: [],
      count: 0,
      source: 'none',
      message: 'Internet outage data temporarily unavailable. IODA and OONI sources unreachable.',
    });
  }
}
