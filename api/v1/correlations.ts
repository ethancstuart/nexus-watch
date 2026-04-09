import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

const CORS = 'https://dashpulse.app';

const HIGH_RISK_COORDS: Record<string, [number, number]> = {
  UA: [48.4, 31.2],
  RU: [55.8, 37.6],
  SD: [15.5, 32.5],
  AF: [33.9, 67.7],
  YE: [15.6, 48.5],
  SY: [34.8, 38.9],
  MM: [19.8, 96.1],
  SO: [2.0, 45.3],
  CD: [-1.5, 29.0],
  SS: [4.9, 31.6],
  IR: [32.4, 53.7],
  IQ: [33.2, 43.7],
  KP: [40.0, 127.0],
  VE: [8.0, -66.0],
  LY: [26.3, 17.2],
  HT: [18.5, -72.3],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Fetch earthquake data directly from USGS — NOT self-referencing
    const [quakeRes, ciiData] = await Promise.allSettled([
      fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', {
        signal: AbortSignal.timeout(8000),
      }).then((r) => r.json()) as Promise<{
        features: Array<{ properties: { mag: number; place: string }; geometry: { coordinates: [number, number] } }>;
      }>,
      fetchHighRiskCountries(),
    ]);

    const correlations: Array<{
      type: string;
      severity: string;
      title: string;
      description: string;
      lat: number;
      lon: number;
    }> = [];

    // Significant earthquakes
    if (quakeRes.status === 'fulfilled') {
      for (const f of quakeRes.value.features || []) {
        if (f.properties.mag >= 5.0) {
          correlations.push({
            type: 'proximity',
            severity: f.properties.mag >= 6.0 ? 'critical' : 'elevated',
            title: `M${f.properties.mag.toFixed(1)} earthquake — potential infrastructure impact`,
            description: `Significant seismic event at ${f.properties.place || 'unknown'}. Monitoring for proximity to critical infrastructure.`,
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0],
          });
        }
      }
    }

    // High-CII countries
    if (ciiData.status === 'fulfilled') {
      for (const country of ciiData.value) {
        if (country.score >= 50) {
          correlations.push({
            type: 'escalation',
            severity: country.score >= 75 ? 'critical' : 'elevated',
            title: `Elevated instability — ${country.name}`,
            description: `${country.name} CII at ${country.score}/100. Multi-domain risk factors converging.`,
            lat: country.lat,
            lon: country.lon,
          });
        }
      }
    }

    return res.setHeader('Cache-Control', 'public, max-age=60').json({
      correlations,
      count: correlations.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('API v1 correlations error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error' });
  }
}

async function fetchHighRiskCountries(): Promise<
  Array<{ code: string; name: string; score: number; lat: number; lon: number }>
> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return [];
  try {
    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT DISTINCT ON (country_code) country_code, country_name, score
      FROM country_cii_history
      WHERE score >= 40
      ORDER BY country_code, timestamp DESC
    `;
    return rows.map((r) => {
      const coords = HIGH_RISK_COORDS[r.country_code as string] || [0, 0];
      return {
        code: r.country_code as string,
        name: r.country_name as string,
        score: r.score as number,
        lat: coords[0],
        lon: coords[1],
      };
    });
  } catch {
    return [];
  }
}
