import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Global monitor points for Open-Meteo weather alerts.
//
// Expanded 2026-04-11 (Track E.2.1) per the E.1 global-coverage audit
// in docs/GLOBAL-COVERAGE-BASELINE.md. Biggest pre-E.2 gaps: Oceania
// (3 of 14 countries), Latin America outside the top 4, Sub-Saharan
// Africa outside the conflict belt, Caribbean, Central Asia. This list
// now covers ~78 points across all six continents with rough parity
// vs. population centers + strategic sub-regions. Pacific Island
// states are included with the understanding that some will have
// thin upstream data — the goal is coverage completeness, not
// uniform data density.
const MONITOR_POINTS = [
  // North America
  { lat: 40.7, lon: -74.0, city: 'New York', country: 'US' },
  { lat: 34.1, lon: -118.2, city: 'Los Angeles', country: 'US' },
  { lat: 41.9, lon: -87.6, city: 'Chicago', country: 'US' },
  { lat: 29.8, lon: -95.4, city: 'Houston', country: 'US' },
  { lat: 25.8, lon: -80.2, city: 'Miami', country: 'US' },
  { lat: 43.7, lon: -79.4, city: 'Toronto', country: 'CA' },
  { lat: 19.4, lon: -99.1, city: 'Mexico City', country: 'MX' },
  // Central America + Caribbean (added E.2.1)
  { lat: 14.6, lon: -90.5, city: 'Guatemala City', country: 'GT' },
  { lat: 9.9, lon: -84.1, city: 'San José', country: 'CR' },
  { lat: 8.9, lon: -79.5, city: 'Panama City', country: 'PA' },
  { lat: 18.0, lon: -76.8, city: 'Kingston', country: 'JM' },
  { lat: 23.1, lon: -82.4, city: 'Havana', country: 'CU' },
  { lat: 18.5, lon: -69.9, city: 'Santo Domingo', country: 'DO' },
  { lat: 18.5, lon: -72.3, city: 'Port-au-Prince', country: 'HT' },
  // Europe
  { lat: 51.5, lon: -0.1, city: 'London', country: 'GB' },
  { lat: 48.9, lon: 2.3, city: 'Paris', country: 'FR' },
  { lat: 52.5, lon: 13.4, city: 'Berlin', country: 'DE' },
  { lat: 55.8, lon: 37.6, city: 'Moscow', country: 'RU' },
  { lat: 41.9, lon: 12.5, city: 'Rome', country: 'IT' },
  { lat: 40.4, lon: -3.7, city: 'Madrid', country: 'ES' },
  { lat: 41.0, lon: 29.0, city: 'Istanbul', country: 'TR' },
  { lat: 50.1, lon: 14.4, city: 'Prague', country: 'CZ' },
  { lat: 59.3, lon: 18.1, city: 'Stockholm', country: 'SE' },
  { lat: 37.9, lon: 23.7, city: 'Athens', country: 'GR' },
  { lat: 50.4, lon: 30.5, city: 'Kyiv', country: 'UA' },
  // Middle East
  { lat: 25.3, lon: 55.3, city: 'Dubai', country: 'AE' },
  { lat: 32.1, lon: 34.8, city: 'Tel Aviv', country: 'IL' },
  { lat: 24.7, lon: 46.7, city: 'Riyadh', country: 'SA' },
  { lat: 35.7, lon: 51.4, city: 'Tehran', country: 'IR' },
  { lat: 33.3, lon: 44.4, city: 'Baghdad', country: 'IQ' },
  { lat: 30.0, lon: 31.2, city: 'Cairo', country: 'EG' },
  // Asia
  { lat: 35.7, lon: 139.7, city: 'Tokyo', country: 'JP' },
  { lat: 31.2, lon: 121.5, city: 'Shanghai', country: 'CN' },
  { lat: 39.9, lon: 116.4, city: 'Beijing', country: 'CN' },
  { lat: 37.6, lon: 127.0, city: 'Seoul', country: 'KR' },
  { lat: 28.6, lon: 77.2, city: 'New Delhi', country: 'IN' },
  { lat: 19.1, lon: 72.9, city: 'Mumbai', country: 'IN' },
  { lat: 1.3, lon: 103.8, city: 'Singapore', country: 'SG' },
  { lat: 13.8, lon: 100.5, city: 'Bangkok', country: 'TH' },
  { lat: 14.6, lon: 121.0, city: 'Manila', country: 'PH' },
  { lat: -6.2, lon: 106.8, city: 'Jakarta', country: 'ID' },
  { lat: 22.3, lon: 114.2, city: 'Hong Kong', country: 'HK' },
  { lat: 25.0, lon: 121.5, city: 'Taipei', country: 'TW' },
  // Central Asia + South Asia (added E.2.1)
  { lat: 43.2, lon: 76.9, city: 'Almaty', country: 'KZ' },
  { lat: 47.9, lon: 106.9, city: 'Ulaanbaatar', country: 'MN' },
  { lat: 24.9, lon: 67.0, city: 'Karachi', country: 'PK' },
  { lat: -8.6, lon: 125.6, city: 'Dili', country: 'TL' },
  // Africa
  { lat: 6.5, lon: 3.4, city: 'Lagos', country: 'NG' },
  { lat: -1.3, lon: 36.8, city: 'Nairobi', country: 'KE' },
  { lat: -33.9, lon: 18.4, city: 'Cape Town', country: 'ZA' },
  { lat: -26.2, lon: 28.0, city: 'Johannesburg', country: 'ZA' },
  { lat: 9.0, lon: 38.7, city: 'Addis Ababa', country: 'ET' },
  { lat: 33.6, lon: -7.6, city: 'Casablanca', country: 'MA' },
  // Sub-Saharan Africa expansion (added E.2.1 — fills the E.1 gap
  // outside the conflict belt)
  { lat: -8.8, lon: 13.2, city: 'Luanda', country: 'AO' },
  { lat: 14.7, lon: -17.4, city: 'Dakar', country: 'SN' },
  { lat: -6.8, lon: 39.3, city: 'Dar es Salaam', country: 'TZ' },
  { lat: -18.9, lon: 47.5, city: 'Antananarivo', country: 'MG' },
  { lat: 0.3, lon: 32.6, city: 'Kampala', country: 'UG' },
  { lat: -17.8, lon: 31.1, city: 'Harare', country: 'ZW' },
  { lat: 5.3, lon: -4.0, city: 'Abidjan', country: 'CI' },
  { lat: 5.6, lon: -0.2, city: 'Accra', country: 'GH' },
  // South America
  { lat: -23.5, lon: -46.6, city: 'São Paulo', country: 'BR' },
  { lat: -34.6, lon: -58.4, city: 'Buenos Aires', country: 'AR' },
  { lat: 4.6, lon: -74.1, city: 'Bogotá', country: 'CO' },
  { lat: -12.0, lon: -77.0, city: 'Lima', country: 'PE' },
  // South America expansion (added E.2.1)
  { lat: -33.5, lon: -70.7, city: 'Santiago', country: 'CL' },
  { lat: 10.5, lon: -66.9, city: 'Caracas', country: 'VE' },
  { lat: -0.2, lon: -78.5, city: 'Quito', country: 'EC' },
  { lat: -16.5, lon: -68.1, city: 'La Paz', country: 'BO' },
  { lat: -34.9, lon: -56.2, city: 'Montevideo', country: 'UY' },
  { lat: 6.8, lon: -58.2, city: 'Georgetown', country: 'GY' },
  // Oceania (was just Sydney/Melbourne/Auckland — biggest E.1 gap)
  { lat: -33.9, lon: 151.2, city: 'Sydney', country: 'AU' },
  { lat: -37.8, lon: 145.0, city: 'Melbourne', country: 'AU' },
  { lat: -36.9, lon: 174.8, city: 'Auckland', country: 'NZ' },
  // Oceania expansion (added E.2.1)
  { lat: -41.3, lon: 174.8, city: 'Wellington', country: 'NZ' },
  { lat: -18.1, lon: 178.4, city: 'Suva', country: 'FJ' },
  { lat: -9.5, lon: 147.2, city: 'Port Moresby', country: 'PG' },
  { lat: -9.4, lon: 160.0, city: 'Honiara', country: 'SB' },
  { lat: -17.7, lon: 168.3, city: 'Port Vila', country: 'VU' },
  { lat: -13.8, lon: -171.8, city: 'Apia', country: 'WS' },
  { lat: -21.1, lon: -175.2, city: 'Nukuʻalofa', country: 'TO' },
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
