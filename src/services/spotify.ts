import { fetchWithRetry } from '../utils/fetch.ts';
import type { SpotifyData } from '../types/index.ts';

export async function fetchSpotifyData(): Promise<SpotifyData> {
  const res = await fetchWithRetry('/api/spotify/now-playing');
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data as SpotifyData;
}

export async function disconnectSpotify(): Promise<void> {
  await fetch('/api/spotify/disconnect', { method: 'POST' });
}
