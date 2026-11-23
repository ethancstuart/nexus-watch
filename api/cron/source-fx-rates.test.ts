import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler, {
  FX_COLLECTOR_ALERT_KEY,
  FX_QUOTE_MAX_AGE_HOURS,
  FX_UPDATE_EARLY_MARGIN_MINUTES,
  providerUpdatedAt,
  updateIsForDay,
} from './source-fx-rates.js';

/**
 * A ROW DATED TODAY HOLDS TODAY'S QUOTE.
 *
 * The collector dates every row by its own clock. Before this guard, a
 * provider response last updated yesterday was stored under today's date, and
 * nothing downstream could tell it from a fresh one. On Sat 21 Nov 2026 every
 * currency (65 of 65) repeated its 20 Nov value; whether the provider or the
 * collector was at fault is not known. This file pins:
 *  - the age bound (not a calendar test: the provider's 00:02 UTC update is
 *    2.5 minutes from midnight);
 *  - that a run which stores nothing says so on the existing alert path
 *    instead of answering 200 with the reason in a body nobody reads;
 *  - the alert-only diagnostics: the provider's update time on every log line,
 *    and a warning (rows still stored) when every rate repeats the previous
 *    stored day's, the shape a fresh update time cannot reveal.
 *
 * All stubbed: no network, no database, no alert delivery.
 */

const h = vi.hoisted(() => ({
  statements: [] as Array<{ text: string; values: unknown[] }>,
  prevRows: [] as Array<{ currency_code: string; rate: number; date: string }>,
  prevThrows: false,
  failInsert: new Set<string>(),
  raiseAlert: vi.fn(async (_a: { key?: string; title: string; body: string; severity?: string }) => ({
    delivered: true,
    channel: 'email',
    detail: 'stubbed',
  })),
  clearAlert: vi.fn(async (_key: string, _note?: string) => ({
    delivered: false,
    channel: 'suppressed',
    detail: 'nothing_to_clear',
  })),
}));
vi.mock('@neondatabase/serverless', () => ({
  neon:
    () =>
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join('?').replace(/\s+/g, ' ').trim();
      h.statements.push({ text, values });
      if (text.includes('WHERE date = (SELECT MAX(date) FROM fx_rates WHERE date < ?)')) {
        return h.prevThrows ? Promise.reject(new Error('stub: read failed')) : Promise.resolve(h.prevRows);
      }
      if (text.startsWith('INSERT INTO fx_rates') && h.failInsert.has(String(values[0]))) {
        return Promise.reject(new Error('stub: insert failed'));
      }
      return Promise.resolve([]);
    },
}));
vi.mock('../_lib/alert.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../_lib/alert.js')>()),
  raiseAlert: h.raiseAlert,
  clearAlert: h.clearAlert,
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
  rates: { USD: 1, ARS: 1575.9572, TRY: 42.402, AED: 3.6725 } as Record<string, number>,
});
const at = (iso: string) => new Date(iso);

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
let logSpy: ReturnType<typeof vi.spyOn>;
const logged = () => logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');

let saved: { secret?: string; db?: string; fetch: typeof fetch };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  saved = { secret: process.env.CRON_SECRET, db: process.env.DATABASE_URL, fetch: globalThis.fetch };
  process.env.CRON_SECRET = SECRET;
  process.env.DATABASE_URL = 'postgres://stub.invalid/never-connected';
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  h.statements = [];
  h.prevRows = [];
  h.prevThrows = false;
  h.failInsert = new Set();
  fetchSpy.mockClear();
  h.raiseAlert.mockReset();
  h.raiseAlert.mockImplementation(async () => ({ delivered: true, channel: 'email', detail: 'stubbed' }));
  h.clearAlert.mockClear();
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
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

describe('source-fx-rates: freshness by the update’s age, not its calendar date', () => {
  it('the bound is 20 h: under the 24 h cadence, above the 19 h 15 min since yesterday’s 09:45 resolver run', () => {
    expect(FX_QUOTE_MAX_AGE_HOURS).toBe(20);
    expect(FX_QUOTE_MAX_AGE_HOURS).toBeLessThan(24);
    expect(FX_QUOTE_MAX_AGE_HOURS).toBeGreaterThanOrEqual(19.25);
  });

  it('yesterday’s 00:02 update, collected the next morning at 05:00, is refused (about 29 h old)', async () => {
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T00:02:31Z')) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(502);
    expect(inserts()).toHaveLength(0);
    expect(res.body?.ingested).toBe(0);
    expect(res.body?.errors).toHaveLength(1);
    expect(res.body?.errors[0]).toContain('last updated 2026-11-20T00:02:31.000Z, 29.0 h ago (limit 20 h)');
    expect(raised()).toHaveLength(1);
    expect(raised()[0].severity).toBe('warning');
    expect(raised()[0].title).toContain('no FX rates stored for 2026-11-21');
    expect(raised()[0].body).toContain('unresolvable');
    expect(cleared()).toHaveLength(0);
  });

  it('an update stamped just before midnight is accepted, stored as the next day’s row, and NOT warned about', async () => {
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T23:58:00Z')) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(inserts()).toHaveLength(3);
    expect(inserts().every((s) => s.values[2] === '2026-11-21')).toBe(true);
    // 23:58 is after the 23:00 cut: read as today's update, published early.
    expect(raised()).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
  });

  it('the edge: exactly 20 h old is accepted; one second more is refused', async () => {
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    expect((await collectAt('2026-11-21T20:02:31Z')).statusCode).toBe(200);
    h.statements = [];
    const late = await collectAt('2026-11-21T20:02:32Z');
    expect(late.statusCode).toBe(502);
    expect(inserts()).toHaveLength(0);
  });

  it('a response with no update time is not stored, and alerts', async () => {
    reply = { ok: true, status: 200, body: providerBody(null) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(502);
    expect(inserts()).toHaveLength(0);
    expect(res.body?.errors[0]).toContain('no update time');
    expect(raised()).toHaveLength(1);
  });

  it('a fresh update with no rates at all stores nothing, and is no longer silent', async () => {
    reply = { ok: true, status: 200, body: { ...providerBody(at('2026-11-21T00:02:31Z')), rates: {} } };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ ingested: 0, errors: [] });
    expect(raised()).toHaveLength(1);
    expect(raised()[0].body).toContain('no rates in the response');
  });

  it('a fresh update is stored exactly as before, and stands the alert down with a note', async () => {
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ingested: 3, errors: [] });
    expect(inserts().map((s) => s.values.slice(0, 4))).toEqual([
      ['ARS', 'AR', '2026-11-21', 1575.9572],
      ['TRY', 'TR', '2026-11-21', 42.402],
      ['AED', 'AE', '2026-11-21', 3.6725],
    ]);
    expect(raised()).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
    expect(cleared()[0][1]).toContain('stored in full');
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
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
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

describe('source-fx-rates: an update published before 23:00 the day before is stored, and warned about', () => {
  it('the cut is 60 minutes before today’s UTC midnight: 23:00 the day before', () => {
    expect(FX_UPDATE_EARLY_MARGIN_MINUTES).toBe(60);
    expect(updateIsForDay(at('2026-11-20T23:00:00Z'), '2026-11-21')).toBe(true);
    expect(updateIsForDay(at('2026-11-20T22:59:59Z'), '2026-11-21')).toBe(false);
    expect(updateIsForDay(at('2026-11-21T00:02:31Z'), '2026-11-21')).toBe(true);
  });

  it('the reviewer’s case: a 20 Nov 12:00 update, collected 21 Nov 05:00, is stored as 21 Nov — and warned', async () => {
    // Under 20 h old (17 h), so the age rule admits it; nothing newer exists.
    // Its values differ from the last stored day, so the repeat check is silent.
    h.prevRows = [
      { currency_code: 'ARS', rate: 1540.0, date: '2026-11-19' },
      { currency_code: 'TRY', rate: 42.1, date: '2026-11-19' },
      { currency_code: 'AED', rate: 3.6725, date: '2026-11-19' },
    ];
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T12:00:00Z')) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ingested: 3, errors: [] }); // stored: measurement unchanged
    expect(inserts().every((s) => s.values[2] === '2026-11-21')).toBe(true);
    expect(raised()).toHaveLength(1);
    expect(raised()[0].title).toContain('stored with 1 warning');
    expect(raised()[0].body).toContain('the update stored as 2026-11-21 was published 2026-11-20T12:00:00.000Z');
    expect(raised()[0].body).toContain('probably the previous day');
    // The all-clear, and its "stored in full", must not be sent on such a run.
    expect(cleared()).toHaveLength(0);
  });

  it('the edges: 22:59:59 the day before is warned; 23:00:00 is not', async () => {
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T22:59:59Z')) };
    await collectAt('2026-11-21T05:00:00Z');
    expect(raised()).toHaveLength(1);
    expect(cleared()).toHaveLength(0);
    h.raiseAlert.mockClear();
    h.clearAlert.mockClear();
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T23:00:00Z')) };
    await collectAt('2026-11-21T05:00:00Z');
    expect(raised()).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
  });

  it('a normal 00:02 update is not warned about', async () => {
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    await collectAt('2026-11-21T05:00:00Z');
    expect(raised()).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
  });
});

describe('source-fx-rates: diagnostics that store as before and only alert', () => {
  it('logs the provider’s update time on every run: fresh, stale and failed', async () => {
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    await collectAt('2026-11-21T05:00:00Z');
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T00:02:31Z')) };
    await collectAt('2026-11-21T05:00:00Z');
    reply = { ok: false, status: 503, body: {} };
    await collectAt('2026-11-21T05:00:00Z');
    const lines = logSpy.mock.calls.map((c: unknown[]) => String(c[0]));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('provider update 2026-11-21T00:02:31.000Z (5.0 h old)');
    expect(lines[1]).toContain('provider update 2026-11-20T00:02:31.000Z (29.0 h old)');
    expect(lines[2]).toContain('provider update none');
  });

  it('the 21 Nov shape under a fresh stamp: every rate equals the previous day’s → stored anyway, alerted', async () => {
    h.prevRows = [
      { currency_code: 'ARS', rate: 1575.9572, date: '2026-11-20' },
      { currency_code: 'TRY', rate: 42.402, date: '2026-11-20' },
      { currency_code: 'AED', rate: 3.6725, date: '2026-11-20' },
    ];
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ingested: 3, errors: [] }); // measurement unchanged
    expect(inserts()).toHaveLength(3);
    expect(raised()).toHaveLength(1);
    expect(raised()[0].title).toContain('stored with 1 warning');
    expect(raised()[0].body).toContain('all 3 rates stored equal those stored for 2026-11-20');
    expect(raised()[0].body).toContain('will be scored');
    expect(cleared()).toHaveLength(0);
    expect(logged()).toContain('same as 2026-11-20: 3/3');
  });

  it('an ordinary day — pegs unchanged, floating rates moved — does not alert', async () => {
    h.prevRows = [
      { currency_code: 'ARS', rate: 1570.1, date: '2026-11-20' },
      { currency_code: 'TRY', rate: 42.39, date: '2026-11-20' },
      { currency_code: 'AED', rate: 3.6725, date: '2026-11-20' }, // the peg never moves
    ];
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    await collectAt('2026-11-21T05:00:00Z');
    expect(raised()).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
    expect(logged()).toContain('same as 2026-11-20: 1/3');
  });

  it('a currency stored yesterday but missing today keeps the alert up (rows still stored)', async () => {
    h.prevRows = [
      { currency_code: 'ARS', rate: 1570.1, date: '2026-11-20' },
      { currency_code: 'TRY', rate: 42.39, date: '2026-11-20' },
      { currency_code: 'AED', rate: 3.6725, date: '2026-11-20' },
    ];
    const body = providerBody(at('2026-11-21T00:02:31Z'));
    delete body.rates.TRY;
    reply = { ok: true, status: 200, body };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(inserts()).toHaveLength(2);
    expect(raised()).toHaveLength(1);
    expect(raised()[0].body).toContain('missing today: TRY');
    expect(cleared()).toHaveLength(0);
  });

  it('a currency that fails to store keeps the alert up', async () => {
    h.failInsert = new Set(['TRY']);
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(res.body?.ingested).toBe(2);
    expect(raised()).toHaveLength(1);
    expect(raised()[0].body).toContain('1 currency(ies) failed to store');
  });

  it('a failed previous-day read skips the diagnostics and stores as normal', async () => {
    h.prevThrows = true;
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ingested: 3, errors: [] });
    expect(raised()).toHaveLength(0);
  });
});

describe('providerUpdatedAt', () => {
  it('reads the provider’s own update time', () => {
    expect(providerUpdatedAt({ time_last_update_unix: 1795305752 })?.toISOString()).toBe('2026-11-22T00:02:32.000Z');
  });

  it('returns null for anything that is not a usable unix time', () => {
    expect(providerUpdatedAt({})).toBeNull();
    expect(providerUpdatedAt({ time_last_update_unix: 'Sun, 22 Nov 2026 00:02:32 +0000' })).toBeNull();
    expect(providerUpdatedAt({ time_last_update_unix: Number.NaN })).toBeNull();
    expect(providerUpdatedAt({ time_last_update_unix: 0 })).toBeNull();
    expect(providerUpdatedAt({ time_last_update_unix: 1e20 })).toBeNull();
  });
});
