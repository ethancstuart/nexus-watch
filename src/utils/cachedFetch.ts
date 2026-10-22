/**
 * Cached fetch — module-scoped per-key cache with TTL.
 *
 * Used by the country detail panel to avoid re-firing the same trade /
 * energy / news / reliefweb requests when the user clicks between
 * countries. Survives until page reload.
 *
 * 2026-05-02 P1.2.
 */

interface Entry<T> {
  ts: number;
  data: T;
}

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const DEFAULT_TTL_MS = 5 * 60 * 1000;

export async function cachedFetch<T>(url: string, opts?: { ttlMs?: number }): Promise<T> {
  const ttl = opts?.ttlMs ?? DEFAULT_TTL_MS;
  const cached = store.get(url);
  if (cached && Date.now() - cached.ts < ttl) {
    return cached.data as T;
  }
  // Coalesce duplicate concurrent requests for the same URL.
  const pending = inflight.get(url);
  if (pending) return pending as Promise<T>;
  const p = (async () => {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as T;
      store.set(url, { ts: Date.now(), data });
      return data;
    } finally {
      inflight.delete(url);
    }
  })();
  inflight.set(url, p);
  return p;
}

/** For tests + hot-paths that need to invalidate manually. */
export function invalidateCache(url?: string): void {
  if (url) store.delete(url);
  else store.clear();
}

export function _cacheSizeForTests(): number {
  return store.size;
}
