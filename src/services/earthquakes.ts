import type { EarthquakeFeature } from '../types/index.ts';
import { fetchWithRetry } from '../utils/fetch.ts';

const API_BASE = import.meta.env.DEV ? '' : '';

export async function fetchEarthquakes(
  timeframe: 'hour' | 'day' | 'week' | 'month' = 'day',
  minMagnitude = 2.5,
): Promise<EarthquakeFeature[]> {
  const params = new URLSearchParams({
    timeframe,
    minmagnitude: String(minMagnitude),
    limit: '300',
  });

  const res = await fetchWithRetry(`${API_BASE}/api/earthquakes?${params}`);
  if (!res.ok) throw new Error('Failed to fetch earthquake data');

  const data = (await res.json()) as { earthquakes: EarthquakeFeature[] };
  return data.earthquakes;
}
