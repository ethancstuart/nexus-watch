import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Global monitored cities for Open-Meteo air-quality.
//
// Expanded 2026-04-11 (Track E.2.1) per the E.1 global-coverage audit.
// Same footprint as api/weather-alerts.ts MONITOR_POINTS — same 78
// points, so a single brief shows consistent AQI + weather coverage
// for any given city. Keep the two lists in sync going forward.
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
  // Central Asia + South Asia + Timor-Leste (added E.2.1)
  { name: 'Almaty', country: 'KZ', lat: 43.2, lon: 76.9 },
  { name: 'Ulaanbaatar', country: 'MN', lat: 47.9, lon: 106.9 },
  { name: 'Dili', country: 'TL', lat: -8.6, lon: 125.6 },
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
  { name: 'Cape Town', country: 'ZA', lat: -33.9, lon: 18.4 },
  { name: 'Johannesburg', country: 'ZA', lat: -26.2, lon: 28.0 },
  { name: 'Addis Ababa', country: 'ET', lat: 9.0, lon: 38.7 },
  { name: 'Casablanca', country: 'MA', lat: 33.6, lon: -7.6 },
  { name: 'Accra', country: 'GH', lat: 5.6, lon: -0.2 },
  // Sub-Saharan Africa expansion (added E.2.1)
  { name: 'Luanda', country: 'AO', lat: -8.8, lon: 13.2 },
  { name: 'Dakar', country: 'SN', lat: 14.7, lon: -17.4 },
  { name: 'Dar es Salaam', country: 'TZ', lat: -6.8, lon: 39.3 },
  { name: 'Antananarivo', country: 'MG', lat: -18.9, lon: 47.5 },
  { name: 'Kampala', country: 'UG', lat: 0.3, lon: 32.6 },
  { name: 'Harare', country: 'ZW', lat: -17.8, lon: 31.1 },
  { name: 'Abidjan', country: 'CI', lat: 5.3, lon: -4.0 },
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
  { name: 'Prague', country: 'CZ', lat: 50.1, lon: 14.4 },
  { name: 'Stockholm', country: 'SE', lat: 59.3, lon: 18.1 },
  // Americas
  { name: 'New York', country: 'US', lat: 40.7, lon: -74.0 },
  { name: 'Los Angeles', country: 'US', lat: 34.1, lon: -118.2 },
  { name: 'Chicago', country: 'US', lat: 41.9, lon: -87.6 },
  { name: 'Houston', country: 'US', lat: 29.8, lon: -95.4 },
  { name: 'Miami', country: 'US', lat: 25.8, lon: -80.2 },
  { name: 'Toronto', country: 'CA', lat: 43.7, lon: -79.4 },
  { name: 'Mexico City', country: 'MX', lat: 19.4, lon: -99.1 },
  { name: 'São Paulo', country: 'BR', lat: -23.5, lon: -46.6 },
  { name: 'Lima', country: 'PE', lat: -12.0, lon: -77.0 },
  { name: 'Buenos Aires', country: 'AR', lat: -34.6, lon: -58.4 },
  { name: 'Bogotá', country: 'CO', lat: 4.6, lon: -74.1 },
  // Central America + Caribbean (added E.2.1)
  { name: 'Guatemala City', country: 'GT', lat: 14.6, lon: -90.5 },
  { name: 'San José', country: 'CR', lat: 9.9, lon: -84.1 },
  { name: 'Panama City', country: 'PA', lat: 8.9, lon: -79.5 },
  { name: 'Kingston', country: 'JM', lat: 18.0, lon: -76.8 },
  { name: 'Havana', country: 'CU', lat: 23.1, lon: -82.4 },
  { name: 'Santo Domingo', country: 'DO', lat: 18.5, lon: -69.9 },
  { name: 'Port-au-Prince', country: 'HT', lat: 18.5, lon: -72.3 },
  // South America expansion (added E.2.1)
  { name: 'Santiago', country: 'CL', lat: -33.5, lon: -70.7 },
  { name: 'Caracas', country: 'VE', lat: 10.5, lon: -66.9 },
  { name: 'Quito', country: 'EC', lat: -0.2, lon: -78.5 },
  { name: 'La Paz', country: 'BO', lat: -16.5, lon: -68.1 },
  { name: 'Montevideo', country: 'UY', lat: -34.9, lon: -56.2 },
  { name: 'Georgetown', country: 'GY', lat: 6.8, lon: -58.2 },
  // Oceania
  { name: 'Sydney', country: 'AU', lat: -33.9, lon: 151.2 },
  { name: 'Melbourne', country: 'AU', lat: -37.8, lon: 145.0 },
  { name: 'Auckland', country: 'NZ', lat: -36.9, lon: 174.8 },
  // Oceania expansion (added E.2.1 — biggest pre-E.1 gap)
  { name: 'Wellington', country: 'NZ', lat: -41.3, lon: 174.8 },
  { name: 'Suva', country: 'FJ', lat: -18.1, lon: 178.4 },
  { name: 'Port Moresby', country: 'PG', lat: -9.5, lon: 147.2 },
  { name: 'Honiara', country: 'SB', lat: -9.4, lon: 160.0 },
  { name: 'Port Vila', country: 'VU', lat: -17.7, lon: 168.3 },
  { name: 'Apia', country: 'WS', lat: -13.8, lon: -171.8 },
  { name: 'Nukuʻalofa', country: 'TO', lat: -21.1, lon: -175.2 },
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
