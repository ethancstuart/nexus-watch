import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * EVERY SCHEDULED ENDPOINT REFUSES UNLESS THE SECRET IS SET AND PRESENTED.
 *
 * Thirteen handlers carried their own check, and every form of it passed when
 * CRON_SECRET was unset: `if (cronSecret && header !== …)` skips the test when
 * there is no secret, and `token !== process.env.CRON_SECRET` compares
 * undefined to undefined. Production has the secret, so nothing was open — but
 * one deleted variable would have opened deliver-briefs (email to subscribers)
 * and the data writers to anyone.
 *
 * What this pins, for every path in vercel.json's cron manifest:
 *  - no header, secret set     -> 401
 *  - wrong header, secret set  -> 401
 *  - ?token=<secret>, no header -> 401 (the secret in a URL lands in access logs)
 *  - secret unset, no header   -> refused. The old idiom let this through.
 *  - secret unset, `Bearer undefined` / `Bearer ` -> refused
 *  - in every refusal, the database driver and fetch are never touched.
 *
 * All stubbed: no network, no database.
 */

const neonSpy = vi.fn();
const sqlSpy = vi.fn();
vi.mock('@neondatabase/serverless', () => ({
  neon: (...args: unknown[]) => {
    neonSpy(...args);
    // A tagged-template-callable that also has .query, like the real driver.
    const sql = (...a: unknown[]) => {
      sqlSpy(...a);
      return Promise.resolve([]);
    };
    (sql as unknown as { query: unknown }).query = (...a: unknown[]) => {
      sqlSpy(...a);
      return Promise.resolve([]);
    };
    return sql;
  },
}));

type Res = {
  statusCode: number;
  body: { error?: string } | undefined;
  status: (n: number) => Res;
  json: (b: unknown) => Res;
  setHeader: () => Res;
  send: (b?: unknown) => Res;
  end: () => Res;
};
const mkRes = (): Res => {
  const r = {} as Res;
  r.statusCode = 0;
  r.body = undefined;
  r.status = (n) => {
    r.statusCode = n;
    return r;
  };
  r.json = (b) => {
    r.body = b as Res['body'];
    return r;
  };
  r.setHeader = () => r;
  r.send = () => r;
  r.end = () => r;
  return r;
};

// `never` parameters accept every real handler's (VercelRequest, VercelResponse);
// the fake request and response are cast once, at the call.
type Handler = (req: never, res: never) => Promise<unknown>;
const invoke = (h: Handler, req: unknown, res: unknown) =>
  (h as (a: unknown, b: unknown) => Promise<unknown>)(req, res);
const LOADERS: Record<string, () => Promise<{ default: Handler }>> = {
  'cache-warm': () => import('../cache-warm'),
  'cii-snapshot': () => import('../cii-snapshot'),
  'compute-cii': () => import('../compute-cii'),
  'cost-summary': () => import('../cost-summary'),
  'cron-health': () => import('../cron-health'),
  'daily-brief': () => import('../daily-brief'),
  'data-health': () => import('../data-health'),
  'deliver-briefs': () => import('../deliver-briefs'),
  'record-calls': () => import('../record-calls'),
  'resolve-calls': () => import('../resolve-calls'),
  'source-fx-rates': () => import('../source-fx-rates'),
  'source-ofac': () => import('../source-ofac'),
  'source-ooni': () => import('../source-ooni'),
  'source-ucdp': () => import('../source-ucdp'),
  'source-wikipedia-pageviews': () => import('../source-wikipedia-pageviews'),
  'source-worldbank-governance': () => import('../source-worldbank-governance'),
  snapshot: () => import('../snapshot'),
};

// The handlers whose inline check this lane replaced. Their happy path is
// exercised below to show a correct header still gets through.
const MIGRATED = [
  'cache-warm',
  'cii-snapshot',
  'cost-summary',
  'cron-health',
  'deliver-briefs',
  'record-calls',
  'resolve-calls',
  'source-fx-rates',
  'source-ofac',
  'source-ooni',
  'source-ucdp',
  'source-wikipedia-pageviews',
  'source-worldbank-governance',
];

const SYNTHETIC_SECRET = 'synthetic-test-secret-not-real';
const REFUSALS = ['unauthorized', 'Unauthorized', 'cron_secret_not_configured'];

const manifestNames = (
  JSON.parse(readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')) as { crons: { path: string }[] }
).crons.map((c) => c.path.replace('/api/cron/', ''));

let fetchSpy: ReturnType<typeof vi.fn>;
let savedSecret: string | undefined;
let savedDb: string | undefined;
let savedFetch: typeof fetch;

beforeEach(() => {
  neonSpy.mockClear();
  sqlSpy.mockClear();
  savedSecret = process.env.CRON_SECRET;
  savedDb = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  savedFetch = globalThis.fetch;
  fetchSpy = vi.fn(() => Promise.reject(new Error('network is stubbed in this test')));
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
  if (savedDb === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = savedDb;
  globalThis.fetch = savedFetch;
  vi.restoreAllMocks();
});

async function call(name: string, req: { headers: Record<string, string>; query?: Record<string, string> }) {
  const handler = (await LOADERS[name]!()).default;
  const res = mkRes();
  await invoke(handler, { method: 'GET', query: {}, body: undefined, ...req }, res);
  return res;
}

const expectNoWork = () => {
  expect(neonSpy).not.toHaveBeenCalled();
  expect(sqlSpy).not.toHaveBeenCalled();
  expect(fetchSpy).not.toHaveBeenCalled();
};

describe('the manifest and this test agree', () => {
  it('covers every path vercel.json schedules, and nothing else', () => {
    expect(Object.keys(LOADERS).sort()).toEqual([...manifestNames].sort());
  });
});

describe.each(manifestNames)('/api/cron/%s', (name) => {
  it('refuses a request with no Authorization header when the secret is set', async () => {
    process.env.CRON_SECRET = SYNTHETIC_SECRET;
    const res = await call(name, { headers: {} });
    expect(res.statusCode).toBe(401);
    expectNoWork();
  });

  it('refuses a wrong secret', async () => {
    process.env.CRON_SECRET = SYNTHETIC_SECRET;
    const res = await call(name, { headers: { authorization: 'Bearer not-the-secret' } });
    expect(res.statusCode).toBe(401);
    expectNoWork();
  });

  it('refuses the right secret in the query string — it belongs in the header only', async () => {
    process.env.CRON_SECRET = SYNTHETIC_SECRET;
    const res = await call(name, { headers: {}, query: { token: SYNTHETIC_SECRET } });
    expect(res.statusCode).toBe(401);
    expectNoWork();
  });

  it('refuses everything when the secret is UNSET — no header', async () => {
    delete process.env.CRON_SECRET;
    const res = await call(name, { headers: {} });
    expect(res.statusCode).toBe(500);
    expect(res.body?.error).toBe('cron_secret_not_configured');
    expectNoWork();
  });

  it('refuses when the secret is unset, even to a caller who sends "Bearer undefined" or "Bearer "', async () => {
    delete process.env.CRON_SECRET;
    for (const authorization of ['Bearer undefined', 'Bearer ', 'Bearer', '']) {
      const res = await call(name, { headers: { authorization } });
      expect(res.statusCode).toBe(500);
      expectNoWork();
    }
  });

  it('refuses when the secret is set to the empty string', async () => {
    process.env.CRON_SECRET = '';
    const res = await call(name, { headers: { authorization: 'Bearer ' } });
    expect(res.statusCode).toBe(500);
    expectNoWork();
  });
});

describe.each(MIGRATED)('/api/cron/%s with the secret set and the right header', (name) => {
  // Behaviour with a correct header must be unchanged: the guard lets the
  // request into the handler. The handler then runs against stubs with no
  // DATABASE_URL and a failing fetch, so it ends however it ends — what must
  // not happen is an authorization refusal.
  it('is not refused', async () => {
    process.env.CRON_SECRET = SYNTHETIC_SECRET;
    const handler = (await LOADERS[name]!()).default;
    const res = mkRes();
    try {
      await invoke(
        handler,
        { method: 'GET', query: {}, headers: { authorization: `Bearer ${SYNTHETIC_SECRET}` } },
        res,
      );
    } catch {
      // The handler got past auth and failed on a stub. That is entry, not refusal.
    }
    expect(res.statusCode).not.toBe(401);
    expect(REFUSALS).not.toContain(res.body?.error ?? '');
  });
});
