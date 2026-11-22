import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * EVERY LINK IN THE CII FEED OPENS A PAGE THAT EXISTS.
 *
 * Until 22 Nov 2026 the channel and all 86 daily items linked to `/#/intel`
 * and `/#/intel?country=XX`, the retired map. No `/intel` route is registered
 * and the live URL answered 404 (lanes2/GTM.md §1). The route table is read
 * from src/main.ts, as scripts/check-route-rewrites.ts reads it, so a link to
 * a route that is later removed fails here too. Synthetic rows only.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROUTES = [...readFileSync(join(ROOT, 'src/main.ts'), 'utf8').matchAll(/\.on\('(\/[^']*)'/g)].map(
  (m) => m[1] as string,
);

let rows: unknown[] = [];
vi.mock('@neondatabase/serverless', () => ({ neon: () => async () => rows }));

async function feed(): Promise<string> {
  const { default: handler } = await import('./cii.js');
  let body = '';
  const res = {
    setHeader: () => res,
    status: () => res,
    json: () => res,
    send: (b: string) => {
      body = b;
      return res;
    },
  };
  await handler({ method: 'GET' } as never, res as never);
  return body;
}

function links(xml: string): string[] {
  return [...xml.matchAll(/<link>([^<]*)<\/link>/g)].map((m) => m[1] as string);
}

function expectServed(url: string) {
  const u = new URL(url);
  expect(u.origin).toBe('https://nexuswatch.dev');
  expect(u.hash, `${url} carries a hash route`).toBe('');
  expect(u.pathname === '/' || ROUTES.includes(u.pathname), `${url} is not a route src/main.ts serves`).toBe(true);
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  rows = [
    { country_code: 'UA', score: 61, latest_date: '2026-11-21', prev_score: 58, prev_date: '2026-11-20', delta: 3 },
    { country_code: 'ZZ', score: 20, latest_date: '2026-11-21', prev_score: 23, prev_date: '2026-11-20', delta: -3 },
  ];
});

describe('the CII feed links only to pages that exist', () => {
  it('the route table was read', () => {
    expect(ROUTES).toContain('/methodology');
    expect(ROUTES).not.toContain('/intel');
  });

  it('the channel and every item link to a served route, never /intel', async () => {
    const xml = await feed();
    const found = links(xml);
    // One channel link, one image link, one per item.
    expect(found).toHaveLength(2 + rows.length);
    expect(xml).not.toContain('/intel');
    for (const l of found) expectServed(l);
  });

  it('items link to the page that lists the live scores', async () => {
    const xml = await feed();
    const items = [...xml.matchAll(/<item>[\s\S]*?<\/item>/g)].map((m) => m[0]);
    expect(items).toHaveLength(2);
    for (const item of items) expect(item).toContain('<link>https://nexuswatch.dev/methodology</link>');
  });

  it('the empty feed links to a served route too', async () => {
    delete process.env.DATABASE_URL;
    const xml = await feed();
    expect(xml).not.toContain('/intel');
    const found = links(xml);
    expect(found).toHaveLength(1);
    for (const l of found) expectServed(l);
  });
});
