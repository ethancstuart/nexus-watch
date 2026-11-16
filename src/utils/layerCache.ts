// Cache last-good layer data in localStorage so layers never show empty
// When an API fails, the layer shows stale data instead of nothing

const CACHE_PREFIX = 'nw:layer-cache:';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes max staleness

export function cacheLayerData(layerId: string, data: unknown): void {
  try {
    const entry = { data, timestamp: Date.now() };
    localStorage.setItem(CACHE_PREFIX + layerId, JSON.stringify(entry));
  } catch {
    // localStorage full or unavailable — skip
  }
}

export function getCachedLayerData<T>(layerId: string): T | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + layerId);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { data: T; timestamp: number };
    // Don't use data older than MAX_AGE
    if (Date.now() - entry.timestamp > MAX_AGE_MS) return null;
    return entry.data;
  } catch {
    return null;
  }
}
