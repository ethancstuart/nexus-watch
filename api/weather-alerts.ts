import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Major world cities to monitor
const MONITOR_POINTS = [
  { lat: 40.7, lon: -74.0, city: 'New York', country: 'US' },
  { lat: 51.5, lon: -0.1, city: 'London', country: 'GB' },
  { lat: 35.7, lon: 139.7, city: 'Tokyo', country: 'JP' },
  { lat: 48.9, lon: 2.3, city: 'Paris', country: 'FR' },
  { lat: 55.8, lon: 37.6, city: 'Moscow', country: 'RU' },
  { lat: 28.6, lon: 77.2, city: 'New Delhi', country: 'IN' },
  { lat: -23.5, lon: -46.6, city: 'São Paulo', country: 'BR' },
  { lat: 31.2, lon: 121.5, city: 'Shanghai', country: 'CN' },
  { lat: -33.9, lon: 18.4, city: 'Cape Town', country: 'ZA' },
  { lat: 30.0, lon: 31.2, city: 'Cairo', country: 'EG' },
  { lat: 19.4, lon: -99.1, city: 'Mexico City', country: 'MX' },
  { lat: -33.9, lon: 151.2, city: 'Sydney', country: 'AU' },
  { lat: 37.6, lon: 127.0, city: 'Seoul', country: 'KR' },
  { lat: 1.3, lon: 103.8, city: 'Singapore', country: 'SG' },
  { lat: 25.3, lon: 55.3, city: 'Dubai', country: 'AE' },
  { lat: 41.0, lon: 29.0, city: 'Istanbul', country: 'TR' },
  { lat: 6.5, lon: 3.4, city: 'Lagos', country: 'NG' },
  { lat: -1.3, lon: 36.8, city: 'Nairobi', country: 'KE' },
  { lat: 13.8, lon: 100.5, city: 'Bangkok', country: 'TH' },
  { lat: 52.5, lon: 13.4, city: 'Berlin', country: 'DE' },
];

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  try {
    const latitudes = MONITOR_POINTS.map((p) => p.lat).join(',');
    const longitudes = MONITOR_POINTS.map((p) => p.lon).join(',');

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitudes}&longitude=${longitudes}&current=temperature_2m,wind_speed_10m,rain,snowfall,weather_code&temperature_unit=celsius&wind_speed_unit=kmh`;

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'Open-Meteo API error' });
    }

    const data = (await response.json()) as
      | { current: { temperature_2m: number; wind_speed_10m: number; rain: number; snowfall: number } }[]
      | { current: { temperature_2m: number; wind_speed_10m: number; rain: number; snowfall: number } };

    const results = Array.isArray(data) ? data : [data];
    const alerts: {
      lat: number;
      lon: number;
      city: string;
      country: string;
      type: string;
      severity: string;
      value: number;
      unit: string;
      description: string;
    }[] = [];

    for (let i = 0; i < results.length && i < MONITOR_POINTS.length; i++) {
      const point = MONITOR_POINTS[i];
      const current = results[i].current;
      if (!current) continue;

      const temp = current.temperature_2m;
      const wind = current.wind_speed_10m;
      const rain = current.rain;
      const snow = current.snowfall;

      if (temp > 40)
        alerts.push({
          ...point,
          type: 'extreme_heat',
          severity: temp > 45 ? 'extreme' : 'severe',
          value: temp,
          unit: '°C',
          description: `Extreme heat: ${temp}°C`,
        });
      if (temp < -20)
        alerts.push({
          ...point,
          type: 'extreme_cold',
          severity: temp < -35 ? 'extreme' : 'severe',
          value: temp,
          unit: '°C',
          description: `Extreme cold: ${temp}°C`,
        });
      if (rain > 10)
        alerts.push({
          ...point,
          type: 'heavy_rain',
          severity: rain > 30 ? 'extreme' : rain > 20 ? 'severe' : 'moderate',
          value: rain,
          unit: 'mm/hr',
          description: `Heavy rain: ${rain}mm/hr`,
        });
      if (snow > 5)
        alerts.push({
          ...point,
          type: 'heavy_snow',
          severity: snow > 15 ? 'extreme' : snow > 10 ? 'severe' : 'moderate',
          value: snow,
          unit: 'cm/hr',
          description: `Heavy snowfall: ${snow}cm/hr`,
        });
      if (wind > 80)
        alerts.push({
          ...point,
          type: 'high_wind',
          severity: wind > 120 ? 'extreme' : wind > 100 ? 'severe' : 'moderate',
          value: wind,
          unit: 'km/h',
          description: `High winds: ${wind}km/h`,
        });
    }

    return res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800').json({ alerts, count: alerts.length });
  } catch (err) {
    console.error('Weather alerts API error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'Weather alerts service error' });
  }
}
