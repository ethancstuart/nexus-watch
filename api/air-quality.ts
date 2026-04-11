import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

const CITIES = [
  // Asia — worst AQI globally, priority coverage
  { name: 'Beijing', country: 'CN', lat: 39.9, lon: 116.4 },
  { name: 'Shanghai', country: 'CN', lat: 31.2, lon: 121.5 },
  { name: 'Chengdu', country: 'CN', lat: 30.6, lon: 104.1 },
  { name: 'Delhi', country: 'IN', lat: 28.6, lon: 77.2 },
  { name: 'Mumbai', country: 'IN', lat: 19.1, lon: 72.9 },
  { name: 'Kolkata', country: 'IN', lat: 22.6, lon: 88.4 },
  { name: 'Dhaka', country: 'BD', lat: 23.8, lon: 90.4 },
  { name: 'Lahore', country: 'PK', lat: 31.5, lon: 74.3 },
  { name: 'Karachi', country: 'PK', lat: 24.9, lon: 67.1 },
  { name: 'Jakarta', country: 'ID', lat: -6.2, lon: 106.8 },
  { name: 'Bangkok', country: 'TH', lat: 13.8, lon: 100.5 },
  { name: 'Hanoi', country: 'VN', lat: 21.0, lon: 105.9 },
  { name: 'Manila', country: 'PH', lat: 14.6, lon: 121.0 },
  { name: 'Seoul', country: 'KR', lat: 37.6, lon: 127.0 },
  { name: 'Tokyo', country: 'JP', lat: 35.7, lon: 139.7 },
  { name: 'Hong Kong', country: 'HK', lat: 22.3, lon: 114.2 },
  { name: 'Taipei', country: 'TW', lat: 25.0, lon: 121.5 },
  { name: 'Singapore', country: 'SG', lat: 1.3, lon: 103.8 },
  // Middle East
  { name: 'Riyadh', country: 'SA', lat: 24.7, lon: 46.7 },
  { name: 'Dubai', country: 'AE', lat: 25.3, lon: 55.3 },
  { name: 'Tehran', country: 'IR', lat: 35.7, lon: 51.4 },
  { name: 'Baghdad', country: 'IQ', lat: 33.3, lon: 44.4 },
  { name: 'Istanbul', country: 'TR', lat: 41.0, lon: 29.0 },
  { name: 'Cairo', country: 'EG', lat: 30.0, lon: 31.2 },
  { name: 'Tel Aviv', country: 'IL', lat: 32.1, lon: 34.8 },
  // Africa
  { name: 'Lagos', country: 'NG', lat: 6.5, lon: 3.4 },
  { name: 'Nairobi', country: 'KE', lat: -1.3, lon: 36.8 },
  { name: 'Kinshasa', country: 'CD', lat: -4.3, lon: 15.3 },
  { name: 'Johannesburg', country: 'ZA', lat: -26.2, lon: 28.0 },
  { name: 'Addis Ababa', country: 'ET', lat: 9.0, lon: 38.7 },
  { name: 'Casablanca', country: 'MA', lat: 33.6, lon: -7.6 },
  { name: 'Accra', country: 'GH', lat: 5.6, lon: -0.2 },
  // Europe
  { name: 'London', country: 'GB', lat: 51.5, lon: -0.1 },
  { name: 'Paris', country: 'FR', lat: 48.9, lon: 2.3 },
  { name: 'Berlin', country: 'DE', lat: 52.5, lon: 13.4 },
  { name: 'Moscow', country: 'RU', lat: 55.8, lon: 37.6 },
  { name: 'Madrid', country: 'ES', lat: 40.4, lon: -3.7 },
  { name: 'Rome', country: 'IT', lat: 41.9, lon: 12.5 },
  { name: 'Warsaw', country: 'PL', lat: 52.2, lon: 21.0 },
  { name: 'Kyiv', country: 'UA', lat: 50.4, lon: 30.5 },
  { name: 'Athens', country: 'GR', lat: 37.9, lon: 23.7 },
  // Americas
  { name: 'New York', country: 'US', lat: 40.7, lon: -74.0 },
  { name: 'Los Angeles', country: 'US', lat: 34.1, lon: -118.2 },
  { name: 'Mexico City', country: 'MX', lat: 19.4, lon: -99.1 },
  { name: 'São Paulo', country: 'BR', lat: -23.5, lon: -46.6 },
  { name: 'Lima', country: 'PE', lat: -12.0, lon: -77.0 },
  { name: 'Buenos Aires', country: 'AR', lat: -34.6, lon: -58.4 },
  { name: 'Bogotá', country: 'CO', lat: 4.6, lon: -74.1 },
  // Oceania
  { name: 'Sydney', country: 'AU', lat: -33.9, lon: 151.2 },
  { name: 'Melbourne', country: 'AU', lat: -37.8, lon: 145.0 },
];

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  try {
    const lats = CITIES.map((c) => c.lat).join(',');
    const lons = CITIES.map((c) => c.lon).join(',');

    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lats}&longitude=${lons}&current=us_aqi,pm2_5,pm10`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Air quality API error' });
    }

    const data = (await response.json()) as
      | { current: { us_aqi: number; pm2_5: number; pm10: number } }[]
      | { current: { us_aqi: number; pm2_5: number; pm10: number } };

    const results = Array.isArray(data) ? data : [data];

    const readings = results.map((r, i) => ({
      ...CITIES[i],
      aqi: r.current?.us_aqi || 0,
      pm25: r.current?.pm2_5 || 0,
      pm10: r.current?.pm10 || 0,
    }));

    return res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800').json({
      readings,
      count: readings.length,
    });
  } catch (err) {
    console.error('Air quality error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'Air quality service error' });
  }
}
