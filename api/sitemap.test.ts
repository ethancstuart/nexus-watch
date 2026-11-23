import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler, {
  buildBriefEntries,
  buildCallEntries,
  isoDate,
  MAX_URLS_PER_FILE,
  sitemapResponse,
} from './sitemap.js';

// The database, for the handler tests below: synthetic rows, and every query
// text kept so the tests can read what was asked for.
let briefRows: Array<{ brief_date: string; generated_at: string | null }> = [];
let callRows: Array<{ id: number; made_on: string; status: string; resolved_at: string | null }> = [];
const queries: string[] = [];
vi.mock('@neondatabase/serverless', () => ({
  neon: () => (strings: TemplateStringsArray) => {
    const q = strings.join('?').replace(/\s+/g, ' ');
    queries.push(q);
    if (q.includes('FROM daily_briefs')) return Promise.resolve(briefRows);
    if (q.includes('FROM calls')) return Promise.resolve(callRows);
    return Promise.resolve([]);
  },
}));

/**
 * THE BRIEF ARCHIVE WAS INVISIBLE TO SEARCH ENGINES FOR MONTHS.
 *
 * Measured on the live sitemap 2026-08-30: 950 URLs, ZERO of them a brief,
 * while 140 briefs existed and /brief/2026-08-27 returned 200.
 *
 * Cause: `@neondatabase/serverless` returns `date` and `timestamptz` columns
 * as JS Date objects. The query selected `generated_at` without `::text`, so
 * `generated_at.slice(0, 10)` threw a TypeError into a soft-fail catch and the
 * whole section silently produced nothing. Had it not thrown, the second bug
 * would have rendered `/brief/Sun Aug 30 2026 00:00:00 GMT-0700 ...`.
 *
 * These tests feed the builder BOTH shapes the driver can produce, so a
 * dropped cast fails here rather than quietly emptying a sitemap for months.
 */
describe('brief sitemap entries survive whatever the driver returns', () => {
  const base = 'https://nexuswatch.dev';

  it('builds clean URLs from text columns (the cast working)', () => {
    const out = buildBriefEntries([{ brief_date: '2026-08-27', generated_at: '2026-08-27T10:00:19.235Z' }], base);
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('<loc>https://nexuswatch.dev/brief/2026-08-27</loc>');
    expect(out[0]).toContain('<lastmod>2026-08-27</lastmod>');
  });

  it('builds clean URLs from Date columns (the cast dropped)', () => {
    // The exact regression: both columns arrive as Dates.
    const out = buildBriefEntries(
      [{ brief_date: new Date(2026, 7, 30), generated_at: new Date(2026, 7, 30, 3, 1, 13) }],
      base,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('<loc>https://nexuswatch.dev/brief/2026-08-30</loc>');
    // Never a stringified Date in a <loc>.
    expect(out[0]).not.toMatch(/GMT|Sun |Mon |Aug /);
  });

  it('never emits a malformed loc', () => {
    const out = buildBriefEntries(
      [
        { brief_date: 'not-a-date', generated_at: null },
        { brief_date: '', generated_at: null },
        { brief_date: '2026-08-27', generated_at: null },
      ],
      base,
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('/brief/2026-08-27');
  });

  it('falls back to the brief date when generated_at is missing', () => {
    const out = buildBriefEntries([{ brief_date: '2026-08-27', generated_at: null }], base);
    expect(out[0]).toContain('<lastmod>2026-08-27</lastmod>');
  });

  it('does not read the UTC date off a local Date', () => {
    // 2026-08-30 late evening local, west of Greenwich, is 2026-08-31 UTC.
    // toISOString().slice(0,10) would advertise tomorrow's brief — the same
    // off-by-one class this project has already shipped once.
    const late = new Date(2026, 7, 30, 23, 30, 0);
    expect(isoDate(late)).toBe('2026-08-30');
  });

  it('produces one entry per brief — the archive is advertised in full', () => {
    const rows = Array.from({ length: 140 }, (_, i) => ({
      brief_date: new Date(2026, 3, 8 + i),
      generated_at: null,
    }));
    expect(buildBriefEntries(rows, base)).toHaveLength(140);
  });
});

/**
 * EVERY CALL PAGE, NOT THE NEWEST 5,000.
 *
 * Measured on the live sitemap 2026-11-16: 5,229 URLs, of which 5,000 calls
 * with IDs 1,608–6,652. The query ended `LIMIT 5000`, so every older call page
 * had dropped out and more dropped out daily (lanes2/GTM.md §1). Briefs were
 * capped the same way at 365. The tests below give the handler a synthetic
 * table and read back every URL it serves, across every file.
 */
const BASE = 'https://nexuswatch.dev';
const STATIC_COUNT = 12;

function synthCalls(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    made_on: '2026-09-01',
    status: i % 3 === 0 ? 'pending' : 'hit',
    resolved_at: i % 3 === 0 ? null : '2026-09-15 10:00:00+00',
  }));
}
function synthBriefs(n: number) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2026, 3, 8 + i));
    const iso = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    return { brief_date: iso, generated_at: null };
  });
}

async function get(query: Record<string, unknown> = {}) {
  const state = { status: 0, body: '', headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => {
      state.headers[k] = v;
      return res;
    },
    status: (s: number) => {
      state.status = s;
      return res;
    },
    send: (b: string) => {
      state.body = b;
      return res;
    },
  };
  await handler({ method: 'GET', query } as never, res as never);
  return state;
}

const locs = (xml: string) => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map((m) => m[1] as string);

describe('the sitemap lists every page it claims to', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://stub';
    queries.length = 0;
  });

  it('asks the database for every call and every brief, with no LIMIT', async () => {
    callRows = synthCalls(3);
    briefRows = synthBriefs(2);
    await get();
    const calls = queries.find((q) => q.includes('FROM calls'));
    const briefs = queries.find((q) => q.includes('FROM daily_briefs'));
    expect(calls).toBeDefined();
    expect(briefs).toBeDefined();
    expect(calls).not.toMatch(/LIMIT/i);
    expect(briefs).not.toMatch(/LIMIT/i);
  });

  it("today's size (6,652 calls, 217 briefs) is one file with every call, the oldest included", async () => {
    callRows = synthCalls(6652);
    briefRows = synthBriefs(217);
    const { status, body, headers } = await get();
    expect(status).toBe(200);
    expect(headers['Content-Type']).toBe('application/xml; charset=utf-8');
    expect(body).toContain('<urlset ');
    const all = locs(body);
    expect(all).toHaveLength(STATIC_COUNT + 217 + 6652);
    expect(new Set(all).size).toBe(all.length);
    expect(all).toContain(`${BASE}/call/1`);
    expect(all).toContain(`${BASE}/call/1607`);
    expect(all).toContain(`${BASE}/call/6652`);
    expect(all.filter((l) => l.startsWith(`${BASE}/brief/`))).toHaveLength(217);
  });

  it('past one file, /sitemap.xml is an index and its files hold every URL once', async () => {
    callRows = synthCalls(45_000);
    briefRows = synthBriefs(400);
    const total = STATIC_COUNT + 400 + 45_000;
    const index = await get();
    expect(index.status).toBe(200);
    expect(index.body).toContain('<sitemapindex ');
    expect(index.body).not.toContain('<urlset');
    const files = locs(index.body);
    expect(files).toHaveLength(Math.ceil(total / MAX_URLS_PER_FILE));
    // On the root path, so each file may list any URL on the site.
    files.forEach((f, i) => expect(f).toBe(`${BASE}/sitemap-${i + 1}.xml`));

    const seen: string[] = [];
    for (const f of files) {
      // Reached the way a crawler reaches it: through vercel.json's rewrite.
      const r = rewrite(new URL(f).pathname);
      expect(r?.destination, f).toBe('/api/sitemap');
      const one = await get(r?.query);
      expect(one.status).toBe(200);
      expect(one.body).toContain('<urlset ');
      const urls = locs(one.body);
      expect(urls.length).toBeGreaterThan(0);
      expect(urls.length).toBeLessThanOrEqual(MAX_URLS_PER_FILE);
      seen.push(...urls);
    }
    expect(seen).toHaveLength(total);
    expect(new Set(seen).size).toBe(total);
    expect(seen).toContain(`${BASE}/call/1`);
    expect(seen).toContain(`${BASE}/call/45000`);
  });

  it('a page that does not exist is a 404, never another file', async () => {
    callRows = synthCalls(10);
    briefRows = synthBriefs(1);
    for (const page of ['0', '2', '-1', '01', 'abc', '', '1.5', ['1', '2']]) {
      const r = await get({ page });
      expect(r.status, `page=${JSON.stringify(page)}`).toBe(404);
      expect(r.body).toBe('not_found');
      // Never cached: a transient short list must not pin a missing file at the edge.
      expect(r.headers['Cache-Control']).toBe('no-store');
    }
    // page=1 of a one-file sitemap is the whole file.
    const one = await get({ page: '1' });
    expect(one.status).toBe(200);
    expect(one.headers['Cache-Control']).toBe('public, max-age=3600, s-maxage=3600');
    expect(locs(one.body)).toHaveLength(STATIC_COUNT + 1 + 10);
  });
});

/**
 * THE FILES ARE PATHS, NOT QUERY STRINGS (review S1). Whether Vercel passes a
 * query string through the /sitemap.xml rewrite was never verified. A path
 * parameter is the mechanism /call/:id and /brief/:date already rely on. This
 * applies vercel.json's rewrites with a matcher for the two shapes it uses
 * (literal paths, and `:name(regex)` parameters): it checks the config and the
 * index agree, not Vercel's own matcher.
 */
const VERCEL = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'vercel.json'), 'utf8')) as {
  rewrites: Array<{ source: string; destination: string }>;
};

function rewrite(path: string): { destination: string; query: Record<string, string> } | null {
  for (const r of VERCEL.rewrites) {
    const names: string[] = [];
    const pattern = r.source
      .replace(/\./g, '\\.')
      .replace(/:([A-Za-z]+)\(((?:[^()]|\([^()]*\))+)\)/g, (_m, name: string, re: string) => {
        names.push(name);
        return `(${re})`;
      });
    const m = new RegExp(`^${pattern}$`).exec(path);
    if (!m) continue;
    let dest = r.destination;
    names.forEach((n, i) => {
      dest = dest.replace(`:${n}`, m[i + 1] as string);
    });
    const u = new URL(dest, BASE);
    return { destination: u.pathname, query: Object.fromEntries(u.searchParams) };
  }
  return null;
}

describe('vercel.json serves every sitemap file the index names', () => {
  it('/sitemap.xml is still the sitemap, with no page', () => {
    expect(rewrite('/sitemap.xml')).toEqual({ destination: '/api/sitemap', query: {} });
  });

  it('/sitemap-N.xml is page N; anything else is not a sitemap file', () => {
    expect(rewrite('/sitemap-1.xml')).toEqual({ destination: '/api/sitemap', query: { page: '1' } });
    expect(rewrite('/sitemap-12.xml')).toEqual({ destination: '/api/sitemap', query: { page: '12' } });
    for (const p of ['/sitemap-x.xml', '/sitemap-.xml', '/sitemap-1.xmlx', '/sitemap-1Xxml']) {
      expect(rewrite(p), p).toBeNull();
    }
  });
});

describe('sitemapResponse', () => {
  const entries = (n: number) => Array.from({ length: n }, (_, i) => `<url><loc>${BASE}/call/${i + 1}</loc></url>`);

  it('the per-file cap is inside the protocol limit of 50,000', () => {
    expect(MAX_URLS_PER_FILE).toBeLessThanOrEqual(50_000);
  });

  it('exactly one full file is still one urlset; one more URL makes an index of two', () => {
    expect(sitemapResponse(entries(5), BASE, undefined, 5).body).toContain('<urlset ');
    const two = sitemapResponse(entries(6), BASE, undefined, 5).body;
    expect(two).toContain('<sitemapindex ');
    expect(locs(two)).toEqual([`${BASE}/sitemap-1.xml`, `${BASE}/sitemap-2.xml`]);
    expect(locs(sitemapResponse(entries(6), BASE, '2', 5).body)).toEqual([`${BASE}/call/6`]);
  });

  it('every call row becomes a URL', () => {
    expect(buildCallEntries(synthCalls(7000), BASE)).toHaveLength(7000);
  });
});
