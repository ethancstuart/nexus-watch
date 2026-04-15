/**
 * kvCache.ts — thin typed wrapper around Upstash KV for read-through caching.
 *
 * Use this for expensive read paths where the underlying data changes on a
 * predictable clock (daily CII snapshots, hourly factor computation, etc.).
 *
 *   const data = await kvCached('cii:all:latest', 300, async () => {
 *     return runExpensiveQuery();
 *   });
 *
 * Design:
 *   - Silently bypasses the cache when KV env is missing (so dev works fine).
 *   - JSON-encodes values. Max Upstash KV item is 1 MB; the caller is
 *     responsible for not caching anything bigger.
 *   - TTL is in seconds; Upstash supports EX per SET.
 *   - Cache *stampede* protection via a soft-refresh pattern: if the value
 *     is present but older than `softTtl`, we still return it but kick off
 *     a background refresh. This is opt-in via `{ softTtl }`.
 */

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

interface CacheOptions {
  /** Soft TTL (seconds). Serve cached value but refresh in background if older. */
  softTtl?: number;
  /** Skip the read attempt (force refresh). Still writes the new value. */
  forceRefresh?: boolean;
}

async function kvGetRaw(key: string): Promise<string | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: string | null };
    return data.result;
  } catch {
    return null;
  }
}

async function kvSetRawEx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const url = `${KV_URL}/set/${encodeURIComponent(key)}?EX=${ttlSeconds}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: value,
    });
    return res.ok;
  } catch {
    return false;
  }
}

interface Envelope<T> {
  at: number;
  ttl: number;
  value: T;
}

/**
 * Read-through cache: if key present and fresh, return its value.
 * Otherwise run `compute()`, cache the result for `ttlSeconds`, and return it.
 */
export async function kvCached<T>(
  key: string,
  ttlSeconds: number,
  compute: () => Promise<T>,
  opts?: CacheOptions,
): Promise<T> {
  if (!KV_URL || !KV_TOKEN) {
    // No KV configured — short-circuit to compute. Still valid dev path.
    return compute();
  }
  const forceRefresh = opts?.forceRefresh === true;

  if (!forceRefresh) {
    const raw = await kvGetRaw(key);
    if (raw) {
      try {
        const env = JSON.parse(raw) as Envelope<T>;
        const ageSec = (Date.now() - env.at) / 1000;

        if (opts?.softTtl !== undefined && ageSec > opts.softTtl && ageSec <= env.ttl) {
          // Stale but not yet expired — fire-and-forget refresh, return stale.
          void (async () => {
            try {
              const fresh = await compute();
              await kvSetRawEx(key, JSON.stringify({ at: Date.now(), ttl: env.ttl, value: fresh }), env.ttl);
            } catch {
              /* swallow — best-effort background refresh */
            }
          })();
          return env.value;
        }

        if (ageSec <= env.ttl) return env.value;
        // Past TTL — fall through to recompute.
      } catch {
        // Corrupt cache — recompute.
      }
    }
  }

  const fresh = await compute();
  const envelope: Envelope<T> = { at: Date.now(), ttl: ttlSeconds, value: fresh };
  // Write is best-effort — if it fails, next call recomputes. Don't await
  // failures synchronously since the user already has their fresh value.
  void kvSetRawEx(key, JSON.stringify(envelope), ttlSeconds);
  return fresh;
}

/**
 * Invalidate a cache key. Best-effort — returns false on KV errors.
 */
export async function kvInvalidate(key: string): Promise<boolean> {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const res = await fetch(`${KV_URL}/del/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
