// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

/**
 * /data AND /data/* ARE NEVER SERVED CACHE-FIRST BY THE SERVICE WORKER.
 *
 * public/sw.js serves same-origin requests that are neither /api/ nor a
 * navigation cache-first, with no expiry: a browser that once fetched
 * /data/calls.csv that way would be handed that copy forever, while the file
 * is rebuilt every day. And it stores every navigation's response as
 * /index.html, so opening the CSV would make it the site's offline page.
 * /data and /data/* now take the API branch: network-first, the cached copy
 * only when the network fails.
 *
 * The real public/sw.js runs here in a VM, with the cache and the network
 * stubbed. A static asset is checked too, so the test proves the branch is
 * chosen by path, not that everything became network-first.
 */

const SW = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'sw.js'), 'utf8');
const ORIGIN = 'https://nexuswatch.dev';
type Mode = 'cors' | 'navigate' | 'no-cors';

/** The worker, with a cache that already holds a stale copy of everything, and a network that is up or down. */
function loadWorker({ online }: { online: boolean }) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const network: string[] = [];
  const puts: Array<{ cache: string; key: unknown }> = [];
  const caches = {
    open: async (name: string) => ({
      put: async (key: unknown) => {
        puts.push({ cache: name, key });
      },
      addAll: async () => {},
    }),
    match: async () => new Response('stale', { status: 200 }),
    keys: async () => [],
    delete: async () => true,
  };
  const fetch = async (req: { url: string }) => {
    network.push(req.url);
    if (!online) throw new TypeError('offline');
    return new Response('fresh', { status: 200 });
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      handlers[type] = fn;
    },
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };
  runInNewContext(SW, { self, caches, fetch, URL, Response, Headers, Date, console, parseInt, JSON, String });

  return async function request(path: string, mode: Mode, origin: string = ORIGIN) {
    let responded: Promise<Response> | undefined;
    handlers.fetch?.({
      request: { url: `${origin}${path}`, mode },
      respondWith: (p: Promise<Response>) => {
        responded = p;
      },
    });
    const intercepted = responded !== undefined;
    const body = await (await responded)?.text();
    // Let the cache writes the worker does not await settle.
    await new Promise((r) => setTimeout(r, 0));
    return { intercepted, body, network, puts };
  };
}

describe('the service worker never serves /data cache-first', () => {
  for (const path of ['/data/calls.csv', '/data/calls.json', '/data']) {
    it(`${path}, fetched by a page: from the network, though a copy is cached`, async () => {
      const { body, network } = await loadWorker({ online: true })(path, 'cors');
      expect(network).toEqual([`${ORIGIN}${path}`]);
      expect(body).toBe('fresh');
    });

    it(`${path}, opened in the tab: from the network, stored in the API cache, never as /index.html`, async () => {
      const { body, network, puts } = await loadWorker({ online: true })(path, 'navigate');
      expect(network).toEqual([`${ORIGIN}${path}`]);
      expect(body).toBe('fresh');
      expect(puts.map((p) => p.key)).not.toContain('/index.html');
      expect(puts.map((p) => p.cache)).toEqual(['nexuswatch-api-v3']);
    });

    it(`${path}: the cached copy only when the network fails`, async () => {
      const { body, network } = await loadWorker({ online: false })(path, 'cors');
      expect(network).toHaveLength(1);
      expect(body).toBe('stale');
    });
  }

  it('a static asset is still cache-first: the branch is chosen by path', async () => {
    const { body, network } = await loadWorker({ online: true })('/assets/index-abc.js', 'no-cors');
    expect(network).toEqual([]);
    expect(body).toBe('stale');
  });

  it("another site's /data/ path is never intercepted (review F5)", async () => {
    for (const mode of ['cors', 'navigate', 'no-cors'] as const) {
      const { intercepted, network, puts } = await loadWorker({ online: true })(
        '/data/x.json',
        mode,
        'https://example.org',
      );
      expect(intercepted, mode).toBe(false);
      expect(network).toEqual([]);
      expect(puts).toEqual([]);
    }
  });

  it('a path that merely begins with "data" is not swept in', async () => {
    const { network } = await loadWorker({ online: true })('/database-notes.txt', 'no-cors');
    expect(network).toEqual([]);
  });
});
