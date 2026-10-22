import { fetchWithRetry } from '../utils/fetch.ts';

export interface Aircraft {
  icao: string;
  callsign: string;
  country: string;
  lon: number;
  lat: number;
  altitude: number;
  velocity: number;
  heading: number;
  verticalRate: number;
}

export async function fetchAircraft(): Promise<Aircraft[]> {
  const res = await fetchWithRetry('/api/flights');
  if (!res.ok) throw new Error('Failed to fetch flight data');

  const data = (await res.json()) as { aircraft: Aircraft[] };
  return data.aircraft;
}
