import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { cachedFetch, invalidateCache, _cacheSizeForTests } from './cachedFetch.ts';

describe('cachedFetch', () => {
  beforeEach(() => {
    invalidateCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('caches successful responses by URL', async () => {
    let calls = 0;
    const mockFetch = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ value: calls }), { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const a = await cachedFetch<{ value: number }>('/api/foo');
    const b = await cachedFetch<{ value: number }>('/api/foo');
    expect(a.value).toBe(1);
    expect(b.value).toBe(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('coalesces concurrent requests to the same URL', async () => {
    let resolveFetch: (r: Response) => void = () => undefined;
    const mockFetch = vi.fn(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = r;
        }),
    );
    vi.stubGlobal('fetch', mockFetch);

    const p1 = cachedFetch<{ a: number }>('/api/coalesce');
    const p2 = cachedFetch<{ a: number }>('/api/coalesce');
    resolveFetch(new Response(JSON.stringify({ a: 7 }), { status: 200 }));
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.a).toBe(7);
    expect(r2.a).toBe(7);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('throws on non-2xx and does not cache the failure', async () => {
    const mockFetch = vi.fn(async () => new Response('oops', { status: 500 }));
    vi.stubGlobal('fetch', mockFetch);

    await expect(cachedFetch('/api/oops')).rejects.toThrow(/HTTP 500/);
    expect(_cacheSizeForTests()).toBe(0);
  });

  it('respects custom TTL', async () => {
    let calls = 0;
    const mockFetch = vi.fn(async () => {
      calls++;
      return new Response(JSON.stringify({ value: calls }), { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    const a = await cachedFetch<{ value: number }>('/api/ttl', { ttlMs: 0 });
    // ttl=0 means immediately stale; second call refetches.
    const b = await cachedFetch<{ value: number }>('/api/ttl', { ttlMs: 0 });
    expect(a.value).toBe(1);
    expect(b.value).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
