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
 * Module-level fallback cache. Catches the case where KV itself is
 * unreachable — instead of falling all the way through to compute()
 * (which can be expensive: Anthropic, Windy, etc.) we serve from
 * in-process memory if we have a recent value.
 *
 * 2026-05-02 C2: Upstash outage was burning Anthropic spend on every
 * request. Module-level cache survives the outage on the same Vercel
 * function instance (lifetime varies with Fluid Compute reuse).
 */
const moduleFallback = new Map<string, Envelope<unknown>>();
const MODULE_FALLBACK_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour cap regardless of TTL

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
              moduleFallback.set(key, { at: Date.now(), ttl: env.ttl, value: fresh });
            } catch {
              /* swallow — best-effort background refresh */
            }
          })();
          moduleFallback.set(key, env as Envelope<unknown>);
          return env.value;
        }

        if (ageSec <= env.ttl) {
          moduleFallback.set(key, env as Envelope<unknown>);
          return env.value;
        }
        // Past TTL — fall through to recompute.
      } catch {
        // Corrupt cache — recompute.
      }
    } else {
      // raw === null could mean: legitimate miss OR KV unreachable.
      // If we have a recent module-fallback entry, serve from it instead
      // of paying upstream cost on every request during a KV outage.
      const fb = moduleFallback.get(key);
      if (fb && Date.now() - fb.at < MODULE_FALLBACK_MAX_AGE_MS) {
        return fb.value as T;
      }
    }
  }

  const fresh = await compute();
  const envelope: Envelope<T> = { at: Date.now(), ttl: ttlSeconds, value: fresh };
  // Write is best-effort — if it fails, next call recomputes. Don't await
  // failures synchronously since the user already has their fresh value.
  void kvSetRawEx(key, JSON.stringify(envelope), ttlSeconds);
  // Also populate the module fallback so we have it on the next call
  // if KV happens to fail right after this write.
  moduleFallback.set(key, envelope as Envelope<unknown>);
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
