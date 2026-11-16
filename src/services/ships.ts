import { fetchWithRetry } from '../utils/fetch.ts';

export interface Vessel {
  mmsi: string;
  name: string;
  type: 'cargo' | 'tanker' | 'passenger' | 'military';
  flag: string;
  lat: number;
  lon: number;
  heading: number;
  speed: number;
}

export async function fetchVessels(): Promise<Vessel[]> {
  const res = await fetchWithRetry('/api/ships');
  if (!res.ok) throw new Error('Failed to fetch ship data');
  const data = (await res.json()) as { vessels: Vessel[] };
  return data.vessels;
}
