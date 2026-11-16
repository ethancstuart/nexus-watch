import type { FireHotspot } from '../types/index.ts';
import { fetchWithRetry } from '../utils/fetch.ts';

export async function fetchFireHotspots(): Promise<FireHotspot[]> {
  const res = await fetchWithRetry('/api/fires?days=1');
  if (!res.ok) throw new Error('Failed to fetch fire data');

  const data = (await res.json()) as { hotspots: FireHotspot[] };
  return data.hotspots;
}
