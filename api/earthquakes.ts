import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const timeframe = (req.query.timeframe as string) || 'day';
  const minmagnitude = (req.query.minmagnitude as string) || '2.5';
  const limit = (req.query.limit as string) || '300';

  try {
    const url = `https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_${timeframe}.geojson`;
    const response = await fetch(url);
    if (!response.ok) return res.status(response.status).json({ error: 'USGS API error' });

    const data = (await response.json()) as {
      features: { id: string; properties: { mag: number; place: string; time: number; url: string; tsunami: number }; geometry: { coordinates: [number, number, number] } }[];
    };

    const minMag = parseFloat(minmagnitude);
    const maxCount = parseInt(limit, 10);
    const earthquakes = data.features
      .filter((f) => f.properties.mag >= minMag)
      .slice(0, maxCount)
      .map((f) => ({
        id: f.id, magnitude: f.properties.mag, place: f.properties.place,
        time: f.properties.time, url: f.properties.url, tsunami: f.properties.tsunami === 1,
        lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], depth: f.geometry.coordinates[2],
      }));

    return res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60').json({ earthquakes, count: earthquakes.length });
  } catch (err) {
    console.error('Earthquake API error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'Earthquake service error' });
  }
}
