import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import handler, {
  FX_ALERT_KEYS,
  FX_COLLECTOR_ALERT_KEY,
  FX_QUOTE_MAX_AGE_HOURS,
  FX_UPDATE_EARLY_MARGIN_MINUTES,
  providerUpdatedAt,
  updateIsForDay,
} from './source-fx-rates.js';
import { ALERT_REMINDER_HOURS, isNotificationDue } from '../_lib/alert.js';

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
 *    stored day's, the shape a fresh update time cannot reveal;
 *  - one alert key per problem, so the alert path's 6-hour dedupe of one
 *    problem never hides a different one the same day.
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
const K = FX_ALERT_KEYS;
const raisedOn = (key: string) => h.raiseAlert.mock.calls.map(([a]) => a).filter((a) => a.key === key);
const clearedOn = (key: string) => h.clearAlert.mock.calls.filter(([k]) => k === key);
/** The stored-nothing key, which every alert used before each problem had its own. */
const raised = () => raisedOn(FX_COLLECTOR_ALERT_KEY);
const cleared = () => clearedOn(FX_COLLECTOR_ALERT_KEY);
const allRaised = () => h.raiseAlert.mock.calls.map(([a]) => a);
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
    // A stale update is its own problem, on its own key.
    expect(allRaised()).toHaveLength(1);
    expect(raisedOn(K.stale)).toHaveLength(1);
    expect(raisedOn(K.stale)[0].severity).toBe('warning');
    expect(raisedOn(K.stale)[0].title).toBe(
      "[source-fx-rates] no FX rates stored for 2026-11-21: the provider's update is over 20 h old",
    );
    expect(raisedOn(K.stale)[0].body).toContain('29.0 h ago (limit 20 h)');
    expect(raisedOn(K.stale)[0].body).toContain('unresolvable');
    expect(h.clearAlert).not.toHaveBeenCalled();
  });

  it('an update stamped just before midnight is accepted, stored as the next day’s row, and NOT warned about', async () => {
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T23:58:00Z')) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(inserts()).toHaveLength(3);
    expect(inserts().every((s) => s.values[2] === '2026-11-21')).toBe(true);
    // 23:58 is after the 23:00 cut: read as today's update, published early.
    expect(allRaised()).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
    expect(clearedOn(K.late)).toHaveLength(1);
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
    expect(allRaised()).toHaveLength(1);
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
    expect(allRaised()).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
    expect(cleared()[0][1]).toContain('stored in full');
    // Every problem checked for and not seen is stood down. With no previous day stored, repeats cannot be
    // checked, so that key is left as it was.
    expect(h.clearAlert.mock.calls.map(([k]) => k).sort()).toEqual(
      [K.storedNothing, K.stale, K.incomplete, K.late].sort(),
    );
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
    await collectAt('2026-11-22T05:00:00Z');
    expect(new Set(allRaised().map((a) => a.key))).toEqual(new Set(['collector:source-fx-rates']));
    expect(raised()).toHaveLength(2);
    // The same for a continuing stale update, on its own key.
    h.raiseAlert.mockClear();
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    await collectAt('2026-11-22T05:00:00Z');
    await collectAt('2026-11-22T06:00:00Z');
    expect(new Set(allRaised().map((a) => a.key))).toEqual(new Set(['collector:source-fx-rates:stale']));
    expect(allRaised()).toHaveLength(2);
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
    expect(allRaised()).toHaveLength(1);
    expect(raisedOn(K.late)).toHaveLength(1);
    expect(raisedOn(K.late)[0].title).toBe(
      '[source-fx-rates] FX rates for 2026-11-21 stored with a warning: late update',
    );
    expect(raisedOn(K.late)[0].body).toContain(
      'the update stored as 2026-11-21 was published 2026-11-20T12:00:00.000Z',
    );
    expect(raisedOn(K.late)[0].body).toContain('probably the previous day');
    // The late key is not stood down on such a run, and no all-clear says "stored in full".
    expect(clearedOn(K.late)).toHaveLength(0);
    for (const [, note] of h.clearAlert.mock.calls) expect(note).not.toContain('stored in full');
    // Rates were stored, so "stored nothing" is over; its note says the warning is raised separately.
    expect(cleared()).toHaveLength(1);
    expect(cleared()[0][1]).toContain('Rates for 2026-11-21 were stored, with warnings raised separately.');
  });

  it('the edges: 22:59:59 the day before is warned; 23:00:00 is not', async () => {
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T22:59:59Z')) };
    await collectAt('2026-11-21T05:00:00Z');
    expect(raisedOn(K.late)).toHaveLength(1);
    expect(clearedOn(K.late)).toHaveLength(0);
    h.raiseAlert.mockClear();
    h.clearAlert.mockClear();
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T23:00:00Z')) };
    await collectAt('2026-11-21T05:00:00Z');
    expect(allRaised()).toHaveLength(0);
    expect(clearedOn(K.late)).toHaveLength(1);
  });

  it('a normal 00:02 update is not warned about', async () => {
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    await collectAt('2026-11-21T05:00:00Z');
    expect(allRaised()).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
    expect(clearedOn(K.late)).toHaveLength(1);
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
    expect(allRaised()).toHaveLength(1);
    const [repeat] = raisedOn(K.repeat);
    expect(repeat.title).toBe('[source-fx-rates] FX rates for 2026-11-21 stored with a warning: repeated values');
    expect(repeat.body).toContain('all 3 rates stored equal those stored for 2026-11-20');
    // Neutral: the 21 Nov shape itself is UNKNOWN, so the alert must not claim it.
    expect(repeat.body).toContain('the same repeated-values pattern that 21 Nov showed');
    expect(repeat.body).not.toContain('as on 21 Nov');
    expect(repeat.body).toContain('will be scored');
    expect(clearedOn(K.repeat)).toHaveLength(0);
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
    expect(allRaised()).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
    expect(clearedOn(K.repeat)).toHaveLength(1);
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
    expect(allRaised()).toHaveLength(1);
    expect(raisedOn(K.incomplete)).toHaveLength(1);
    expect(raisedOn(K.incomplete)[0].title).toBe(
      '[source-fx-rates] FX rates for 2026-11-21 stored with a warning: currencies not stored',
    );
    expect(raisedOn(K.incomplete)[0].body).toContain('missing today: TRY');
    expect(clearedOn(K.incomplete)).toHaveLength(0);
    for (const [, note] of h.clearAlert.mock.calls) expect(note).not.toContain('stored in full');
  });

  it('a currency that fails to store keeps the alert up', async () => {
    h.failInsert = new Set(['TRY']);
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(res.body?.ingested).toBe(2);
    expect(allRaised()).toHaveLength(1);
    expect(raisedOn(K.incomplete)[0].body).toContain('1 currency(ies) failed to store');
  });

  it('a failed previous-day read skips the diagnostics and stores as normal', async () => {
    h.prevThrows = true;
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) };
    const res = await collectAt('2026-11-21T05:00:00Z');
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ ingested: 3, errors: [] });
    expect(allRaised()).toHaveLength(0);
    // Repeats and missing currencies were not checked, so neither key is stood down.
    expect(clearedOn(K.repeat)).toHaveLength(0);
    expect(clearedOn(K.incomplete)).toHaveLength(0);
    expect(cleared()).toHaveLength(1);
    // Stored, but not checked for missing currencies, so the note does not say "in full".
    expect(cleared()[0][1]).toContain('Rates for 2026-11-21 were stored. A day that stored nothing');
    expect(clearedOn(K.late)).toHaveLength(1);
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

/**
 * ONE KEY PER PROBLEM. The alert path sends a key's first alert and then
 * stays quiet on that key for ALERT_REMINDER_HOURS (6 h). When every problem
 * shared one key, a re-run after a 05:00 failure that stored a late or
 * repeated update claimed the same key and was suppressed for the rest of the
 * day (lanes8 REVIEW-8-FX, final check 4b). Here the dedupe is modelled as
 * alert.ts applies it, per key, with its own isNotificationDue.
 */
describe('source-fx-rates: each problem has its own alert key, so one never hides another', () => {
  const REPEATED = [
    { currency_code: 'ARS', rate: 1575.9572, date: '2026-11-20' },
    { currency_code: 'TRY', rate: 42.402, date: '2026-11-20' },
    { currency_code: 'AED', rate: 3.6725, date: '2026-11-20' },
  ];
  const MOVED = [
    { currency_code: 'ARS', rate: 1540.0, date: '2026-11-20' },
    { currency_code: 'TRY', rate: 42.1, date: '2026-11-20' },
    { currency_code: 'AED', rate: 3.6725, date: '2026-11-20' },
  ];
  /** The alert path's per-key dedupe and all-clear: what a person is actually sent. */
  function deliveredAlerts() {
    const lastSent = new Map<string, Date>();
    const sent: Array<{ key: string; title: string }> = [];
    h.raiseAlert.mockImplementation(async (a) => {
      const key = a.key as string;
      if (!isNotificationDue(lastSent.get(key) ?? null, new Date())) {
        return { delivered: false, channel: 'suppressed', detail: 'deduped' };
      }
      lastSent.set(key, new Date());
      sent.push({ key, title: a.title });
      return { delivered: true, channel: 'email', detail: 'stubbed' };
    });
    h.clearAlert.mockImplementation(async (key: string) => {
      const had = lastSent.delete(key);
      if (had) sent.push({ key, title: 'RESOLVED' });
      return had
        ? { delivered: true, channel: 'email', detail: 'stubbed' }
        : { delivered: false, channel: 'suppressed', detail: 'nothing_to_clear' };
    });
    return sent;
  }
  const failing = () => (reply = { ok: false, status: 503, body: {} });
  const fresh = () => (reply = { ok: true, status: 200, body: providerBody(at('2026-11-21T00:02:31Z')) });
  const late = () => (reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T12:00:00Z')) });
  const stale = () => (reply = { ok: true, status: 200, body: providerBody(at('2026-11-20T00:02:31Z')) });

  it('five keys, all under the collector’s own, the stored-nothing key unchanged', () => {
    expect(FX_COLLECTOR_ALERT_KEY).toBe('collector:source-fx-rates');
    expect(K).toEqual({
      storedNothing: 'collector:source-fx-rates',
      stale: 'collector:source-fx-rates:stale',
      late: 'collector:source-fx-rates:late',
      repeat: 'collector:source-fx-rates:repeat',
      incomplete: 'collector:source-fx-rates:incomplete',
    });
    expect(ALERT_REMINDER_HOURS).toBe(6);
  });

  it('nothing stored at 05:00, then a late update stored at 07:00: the late warning is sent', async () => {
    const sent = deliveredAlerts();
    h.prevRows = MOVED;
    failing();
    await collectAt('2026-11-21T05:00:00Z');
    late();
    await collectAt('2026-11-21T07:00:00Z');
    expect(sent).toEqual([
      { key: K.storedNothing, title: '[source-fx-rates] no FX rates stored for 2026-11-21' },
      { key: K.storedNothing, title: 'RESOLVED' },
      { key: K.late, title: '[source-fx-rates] FX rates for 2026-11-21 stored with a warning: late update' },
    ]);
  });

  it('nothing stored at 05:00, then repeated values stored at 07:00: the repeat warning is sent', async () => {
    const sent = deliveredAlerts();
    h.prevRows = REPEATED;
    failing();
    await collectAt('2026-11-21T05:00:00Z');
    fresh();
    await collectAt('2026-11-21T07:00:00Z');
    expect(sent.map((s) => s.key)).toEqual([K.storedNothing, K.storedNothing, K.repeat]);
  });

  it('a stale update at 05:00, then a failed fetch at 07:00: both are sent', async () => {
    const sent = deliveredAlerts();
    stale();
    await collectAt('2026-11-21T05:00:00Z');
    failing();
    await collectAt('2026-11-21T07:00:00Z');
    expect(sent.map((s) => s.key)).toEqual([K.stale, K.storedNothing]);
  });

  it('a late update at 05:00, then repeated values at 07:00: the repeat warning is sent', async () => {
    const sent = deliveredAlerts();
    h.prevRows = MOVED;
    late();
    await collectAt('2026-11-21T05:00:00Z');
    h.prevRows = REPEATED;
    fresh();
    await collectAt('2026-11-21T07:00:00Z');
    expect(sent.map((s) => s.key)).toEqual([K.late, K.late, K.repeat]);
    expect(sent[1].title).toBe('RESOLVED');
  });

  it('nothing stored at 05:00, then some currencies missing at 07:00: that warning is sent', async () => {
    const sent = deliveredAlerts();
    h.prevRows = MOVED;
    failing();
    await collectAt('2026-11-21T05:00:00Z');
    const body = providerBody(at('2026-11-21T00:02:31Z'));
    delete body.rates.TRY;
    reply = { ok: true, status: 200, body };
    await collectAt('2026-11-21T07:00:00Z');
    expect(sent.map((s) => s.key)).toEqual([K.storedNothing, K.storedNothing, K.incomplete]);
  });

  it('the same problem again within 6 hours is still one notice, and a reminder after 6', async () => {
    const sent = deliveredAlerts();
    failing();
    await collectAt('2026-11-21T05:00:00Z');
    await collectAt('2026-11-21T07:00:00Z');
    expect(sent.map((s) => s.key)).toEqual([K.storedNothing]);
    await collectAt('2026-11-21T11:00:00Z');
    expect(sent.map((s) => s.key)).toEqual([K.storedNothing, K.storedNothing]);
    expect(raised()).toHaveLength(3);
  });

  it('a run that stored nothing neither raises nor stands down the warnings it could not check', async () => {
    failing();
    await collectAt('2026-11-21T05:00:00Z');
    expect(allRaised().map((a) => a.key)).toEqual([K.storedNothing]);
    expect(h.clearAlert).not.toHaveBeenCalled();
  });

  it('each warning is stood down by the next run that checks for it and does not see it', async () => {
    const sent = deliveredAlerts();
    h.prevRows = REPEATED;
    late();
    await collectAt('2026-11-21T05:00:00Z');
    expect(sent.map((s) => s.key)).toEqual([K.late, K.repeat]);
    h.prevRows = MOVED;
    reply = { ok: true, status: 200, body: providerBody(at('2026-11-22T00:02:32Z')) };
    await collectAt('2026-11-22T05:00:00Z');
    expect(sent.slice(2)).toEqual([
      { key: K.late, title: 'RESOLVED' },
      { key: K.repeat, title: 'RESOLVED' },
    ]);
    const notes = new Map(h.clearAlert.mock.calls.map(([k, n]) => [k, n]));
    expect(notes.get(K.late)).toContain("The update stored for 2026-11-22 reads as that day's own");
    expect(notes.get(K.repeat)).toContain(
      'Rates stored for 2026-11-22 are not all equal to those stored for 2026-11-20',
    );
    expect(notes.get(K.storedNothing)).toContain('Rates for 2026-11-22 were stored in full.');
  });
});
