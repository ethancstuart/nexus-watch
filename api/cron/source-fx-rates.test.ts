import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler, { FX_COLLECTOR_ALERT_KEY, providerQuoteDate } from './source-fx-rates.js';

/**
 * A ROW DATED TODAY HOLDS TODAY'S QUOTE.
 *
 * The collector dates every row by its own clock. Before this guard, a
 * provider response last updated yesterday was stored under today's date, and
 * nothing downstream could tell it from a fresh one. On Sat 21 Nov 2026 every
 * currency (65 of 65) repeated its 20 Nov value; whether the provider or the
 * collector was at fault is not known. This file pins the provider half, and
 * that a run which stores nothing says so on the existing alert path instead
 * of answering 200 with the reason in a body nobody reads.
 *
 * All stubbed: no network, no database, no alert delivery.
 */

const h = vi.hoisted(() => ({
  statements: [] as Array<{ text: string; values: unknown[] }>,
  raiseAlert: vi.fn(async (_a: { key?: string; title: string; body: string; severity?: string }) => ({
    delivered: true,
    channel: 'email',
    detail: 'stubbed',
  })),
  clearAlert: vi.fn(async (_key: string) => ({ delivered: false, channel: 'suppressed', detail: 'nothing_to_clear' })),
}));
vi.mock('../_lib/alert.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/alert.js')>()),
  raiseAlert: h.raiseAlert,
  clearAlert: h.clearAlert,
}));
vi.mock('@neondatabase/serverless', () => ({
  neon:
    () =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      h.statements.push({ text: strings.join('?').replace(/\s+/g, ' ').trim(), values });
      return Promise.resolve([]);
    },
}));

const SECRET = 'synthetic-test-secret-not-real';

/** The open.er-api shape, as cached on 22 Nov (lanes7/fx-notes/fxref), cut to three currencies. */
const providerBody = (updatedAt: Date | null) => ({
  result: 'success',
  ...(updatedAt
    ? {
        time_last_update_unix: Math.floor(updatedAt.getTime() / 1000),
        time_last_update_utc: updatedAt.toUTCString(),
      }
    : {}),
  base_code: 'USD',
  rates: { USD: 1, ARS: 1575.9572, TRY: 42.402, AED: 3.6725 },
});

let reply: { ok: boolean; status: number; body: unknown } = { ok: true, status: 200, body: providerBody(null) };
const fetchSpy = vi.fn(async (url: string) => {
  if (!url.startsWith('https://open.er-api.com/')) throw new Error(`network is stubbed in this test: ${url}`);
  return { ok: reply.ok, status: reply.status, json: async () => reply.body } as unknown as Response;
});

async function collectAt(isoInstant: string) {
  vi.setSystemTime(new Date(isoInstant));
  const res = {
    statusCode: 200,
    body: undefined as { ingested: number; errors: string[] } | undefined,
    status(n: number) {
      res.statusCode = n;
      return res;
    },
    json(b: unknown) {
      res.body = b as typeof res.body;
      return res;
    },
  };
  await (handler as unknown as (a: unknown, b: unknown) => Promise<unknown>)(
    { method: 'GET', headers: { authorization: `Bearer ${SECRET}` }, query: {} },
    res,
  );
  return res;
}
const inserts = () => h.statements.filter((s) => s.text.startsWith('INSERT INTO fx_rates'));
const raised = () => h.raiseAlert.mock.calls.map(([a]) => a).filter((a) => a.key === FX_COLLECTOR_ALERT_KEY);
const cleared = () => h.clearAlert.mock.calls.filter(([k]) => k === FX_COLLECTOR_ALERT_KEY);

let saved: { secret?: string; db?: string; fetch: typeof fetch };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  saved = { secret: process.env.CRON_SECRET, db: process.env.DATABASE_URL, fetch: globalThis.fetch };
  process.env.CRON_SECRET = SECRET;
  process.env.DATABASE_URL = 'postgres://stub.invalid/never-connected';
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  h.statements = [];
  fetchSpy.mockClear();
  h.raiseAlert.mockReset();
  h.raiseAlert.mockImplementation(async () => ({ delivered: true, channel: 'email', detail: 'stubbed' }));
  h.clearAlert.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  if (saved.secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = saved.secret;
  if (saved.db === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = saved.db;
  globalThis.fetch = saved.fetch;
  vi.restoreAllMocks();
});

describe('source-fx-rates: the 21 Nov shape, a provider update dated the previous day', () => {
  it('is not stored under today’s date, and says so on the existing alert path', async () => {
    reply = { ok: true, status: 200, body: providerBody(new Date(Date.UTC(2026, 10, 20, 0, 2, 31))) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(502);
    expect(inserts()).toHaveLength(0);
    expect(raised()).toHaveLength(1);
    expect(raised()[0].severity).toBe('warning');
    expect(raised()[0].title).toContain('no FX rates stored for 2026-11-21');
    expect(raised()[0].body).toContain('last updated 2026-11-20, not 2026-11-21');
    expect(raised()[0].body).toContain('unresolvable');
    expect(cleared()).toHaveLength(0);
    expect(res.body?.ingested).toBe(0);
    expect(res.body?.errors).toHaveLength(1);
    expect(res.body?.errors[0]).toContain('last updated 2026-11-20, not 2026-11-21');
  });

  it('a response with no update time is not stored either, and alerts', async () => {
    reply = { ok: true, status: 200, body: providerBody(null) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(502);
    expect(inserts()).toHaveLength(0);
    expect(res.body?.errors[0]).toContain('no update time');
    expect(raised()).toHaveLength(1);
  });

  it('a fresh update with no rates at all stores nothing — and is no longer silent', async () => {
    reply = { ok: true, status: 200, body: { ...providerBody(new Date(Date.UTC(2026, 10, 21, 0, 2, 31))), rates: {} } };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ingested: 0, errors: [] });
    expect(raised()).toHaveLength(1);
    expect(raised()[0].body).toContain('no rates in the response');
  });

  it('a provider update stamped today is stored exactly as before: same rows, same date, same values', async () => {
    reply = { ok: true, status: 200, body: providerBody(new Date(Date.UTC(2026, 10, 21, 0, 2, 31))) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ingested: 3, errors: [] });
    expect(raised()).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
    const rows = inserts().map((s) => s.values.slice(0, 4));
    expect(rows).toEqual([
      ['ARS', 'AR', '2026-11-21', 1575.9572],
      ['TRY', 'TR', '2026-11-21', 42.402],
      ['AED', 'AE', '2026-11-21', 3.6725],
    ]);
  });

  it('a failed fetch stores nothing, answers 502 and alerts — it used to answer 200 silently', async () => {
    reply = { ok: false, status: 503, body: {} };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(502);
    expect(inserts()).toHaveLength(0);
    expect(res.body?.errors[0]).toContain('open.er-api 503');
    expect(raised()).toHaveLength(1);
    expect(raised()[0].body).toContain('open.er-api 503');
  });

  it('a continuing failure keeps ONE stable key, so the existing dedupe applies', async () => {
    reply = { ok: false, status: 503, body: {} };
    await collectAt('2026-11-21T05:00:00Z');
    reply = { ok: true, status: 200, body: providerBody(new Date(Date.UTC(2026, 10, 21, 0, 2, 31))) };
    await collectAt('2026-11-22T05:00:00Z');
    expect(new Set(raised().map((a) => a.key))).toEqual(new Set(['collector:source-fx-rates']));
    expect(raised()).toHaveLength(2);
  });

  it('an alert that fails to send never stops the collector', async () => {
    h.raiseAlert.mockRejectedValue(new Error('alert channel down'));
    reply = { ok: false, status: 503, body: {} };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(502);
    expect(res.body?.errors[0]).toContain('open.er-api 503');
  });
});

describe('providerQuoteDate', () => {
  it('reads the provider’s own update time, as a UTC day', () => {
    expect(providerQuoteDate({ time_last_update_unix: 1795305752 })).toBe('2026-11-22'); // the cached 22 Nov response
    expect(providerQuoteDate({ time_last_update_unix: Date.UTC(2026, 10, 20, 23, 59, 59) / 1000 })).toBe('2026-11-20');
  });

  it('returns null for anything that is not a usable unix time', () => {
    expect(providerQuoteDate({})).toBeNull();
    expect(providerQuoteDate({ time_last_update_unix: 'Sun, 22 Nov 2026 00:02:32 +0000' })).toBeNull();
    expect(providerQuoteDate({ time_last_update_unix: Number.NaN })).toBeNull();
    expect(providerQuoteDate({ time_last_update_unix: 0 })).toBeNull();
    expect(providerQuoteDate({ time_last_update_unix: 1e20 })).toBeNull();
  });
});
