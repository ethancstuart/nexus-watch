import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import resolveCalls, { FX_STALE_ALERT_AFTER_DAYS, FX_STALE_ALERT_KEY, fxQuoteIsFreshFor } from './resolve-calls.js';
import sourceFxRates from './source-fx-rates.js';
import { fxDepreciationPct, UNRESOLVABLE_GRACE_DAYS } from '../_lib/calls.js';
import {
  checkDateFor,
  ledgerTruthVerdict,
  OVERDUE_KEY,
  PAST_GRACE_DAYS,
  SILENT_KEY,
  type LedgerTruthReading,
} from '../_lib/ledger-truth.js';

/**
 * AN FX CALL IS NEVER SCORED ON A QUOTE THAT IS NOT FRESH FOR ITS RESOLUTION DAY.
 *
 * On Sat 21 Nov 2026 every currency (65 of 65) repeated its 20 Nov value, and
 * all 65 changed again on 22 Nov. The 66 FX calls whose window closed on
 * 21 Nov were scored at 09:45 that morning with no quote fresher than 20 Nov.
 * The harm is one-sided: the resolver takes the PEAK over the window, so a
 * missing or repeated last day can only turn a would-be HIT into a MISS. At
 * the next fresh quote, AR (id 6047, MISS at 114 bp against 1.64%) reads
 * +1.98%. Whether the collector missed or the provider did not refresh is not
 * known, so both shapes are pinned here:
 *
 *   A. no fx_rates row dated the resolution day (the newest is the day before);
 *   B. the provider's own update time is the day before, and the collector
 *      used to store it under today's date anyway.
 *
 * A held call never waits forever: at the existing grace it is settled
 * unresolvable, never scored (section 6).
 * Held calls go to the back of the due page, so a backlog cannot starve the
 * calls that can be resolved (section 7).
 *
 * The AR fixture is SYNTHETIC: a reference and a window built to reproduce
 * the two figures the independent check derived (114 bp stale, +1.98% fresh,
 * threshold 1.64%). It is not the production row.
 *
 * All stubbed: no network, no database, no alert delivery. The SQL stub applies
 * the `status = 'pending'` predicates only when the statement carries them, so
 * the never-rewrite rule is tested through the SQL text, not assumed.
 */

interface CallRow {
  id: number;
  kind: string;
  country_code: string;
  made_on: string;
  resolves_on: string;
  horizon_days: number;
  threshold: number;
  threshold_pct: number | null;
  reference_value: number | null;
  resolver_params: null;
  status: string;
  evidence_count: number | null;
  resolved_at: string | null;
  void_reason: string | null;
}

interface FxRow {
  currency_code: string;
  country_code: string;
  date: string;
  rate: number;
}

const h = vi.hoisted(() => {
  const state = {
    today: '',
    calls: [] as CallRow[],
    fx: [] as FxRow[],
    statements: [] as Array<{ text: string; values: unknown[] }>,
  };

  const norm = (strings: TemplateStringsArray) => strings.join('?').replace(/\s+/g, ' ').trim();

  function query(strings: TemplateStringsArray, values: unknown[]): unknown[] {
    const text = norm(strings);
    state.statements.push({ text, values });
    const onlyPending = text.includes("status = 'pending'");

    if (text.startsWith('SELECT id, kind, country_code') && text.includes('FROM calls')) {
      const limit = Number(values[values.length - 1]);
      // The held-last key is applied ONLY when the statement carries it, as the
      // pending predicates are: remove it from the SQL and the page test fails.
      const heldLast =
        /ORDER BY \(kind = 'fx_devaluation' AND resolves_on > CURRENT_DATE - \?::int AND NOT EXISTS \(SELECT 1 FROM fx_rates f WHERE f\.country_code = calls\.country_code AND f\.date = calls\.resolves_on\)\) ASC, resolves_on ASC/.test(
          text,
        );
      const graceStart = new Date(`${state.today}T00:00:00Z`);
      graceStart.setUTCDate(graceStart.getUTCDate() - Number(values[0]));
      const floor = graceStart.toISOString().slice(0, 10);
      const held = (c: CallRow) =>
        heldLast &&
        c.kind === 'fx_devaluation' &&
        c.resolves_on > floor &&
        !state.fx.some((f) => f.country_code === c.country_code && f.date === c.resolves_on)
          ? 1
          : 0;
      return state.calls
        .filter((c) => (!onlyPending || c.status === 'pending') && c.resolves_on <= state.today)
        .sort((a, b) => held(a) - held(b) || a.resolves_on.localeCompare(b.resolves_on))
        .slice(0, limit)
        .map((c) => ({
          id: c.id,
          kind: c.kind,
          country_code: c.country_code,
          made_on: c.made_on,
          resolves_on: c.resolves_on,
          horizon_days: c.horizon_days,
          threshold: c.threshold,
          threshold_pct: c.threshold_pct,
          reference_value: c.reference_value,
          resolver_params: c.resolver_params,
        }));
    }
    if (text.startsWith('SELECT COUNT(*)::int AS n FROM calls')) {
      return [
        {
          n: state.calls.filter((c) => (!onlyPending || c.status === 'pending') && c.resolves_on <= state.today).length,
        },
      ];
    }
    if (text.includes('FROM fx_rates') && text.includes('MAX(rate_vs_usd)')) {
      const [country, from, to] = values as [string, string, string];
      const rows = state.fx.filter((r) => r.country_code === country && r.date >= from && r.date <= to);
      if (rows.length === 0) return [{ peak: null, newest: null }];
      return [
        {
          peak: Math.max(...rows.map((r) => r.rate)),
          newest: rows.map((r) => r.date).sort()[rows.length - 1],
        },
      ];
    }
    if (text.startsWith('SELECT rate_vs_usd FROM fx_rates')) return [];
    if (text.startsWith('INSERT INTO fx_rates')) {
      const [currency, country, date, rate] = values as [string, string, string, number];
      state.fx = state.fx.filter((r) => !(r.currency_code === currency && r.date === date));
      state.fx.push({ currency_code: currency, country_code: country, date, rate });
      return [];
    }
    if (text.startsWith('UPDATE calls')) {
      const settle = text.startsWith("UPDATE calls SET status = 'unresolvable'");
      const id = Number(values[values.length - 1]);
      const row = state.calls.find((c) => c.id === id);
      if (row && (!onlyPending || row.status === 'pending')) {
        if (settle) {
          row.status = 'unresolvable';
          row.void_reason = String(values[0]);
        } else {
          row.status = String(values[0]);
          row.evidence_count = Number(values[1]);
        }
        row.resolved_at = `${state.today}T09:45:00.000Z`;
      }
      return [];
    }
    throw new Error(`unexpected SQL in test: ${text.slice(0, 120)}`);
  }

  const raiseAlert = vi.fn(async (_a: { key?: string; title: string; body: string; severity?: string }) => ({
    delivered: true,
    channel: 'email',
    detail: 'stubbed',
  }));
  const clearAlert = vi.fn(async (_key: string) => ({
    delivered: false,
    channel: 'suppressed',
    detail: 'nothing_to_clear',
  }));
  return { state, query, raiseAlert, clearAlert };
});

vi.mock('@neondatabase/serverless', () => ({
  neon:
    () =>
    (strings: TemplateStringsArray, ...values: unknown[]) =>
      Promise.resolve(h.query(strings, values)),
}));
vi.mock('../_lib/alert.js', () => ({ raiseAlert: h.raiseAlert, clearAlert: h.clearAlert }));

// ---------------------------------------------------------------------------

const SECRET = 'synthetic-test-secret-not-real';

interface Res {
  statusCode: number;
  body: Record<string, unknown> | undefined;
  status: (n: number) => Res;
  json: (b: unknown) => Res;
}
const mkRes = (): Res => {
  const r = { statusCode: 0, body: undefined } as Res;
  r.status = (n) => {
    r.statusCode = n;
    return r;
  };
  r.json = (b) => {
    r.body = b as Res['body'];
    if (r.statusCode === 0) r.statusCode = 200;
    return r;
  };
  return r;
};

type Handler = (req: never, res: never) => Promise<unknown>;
async function runAt(handler: Handler, isoInstant: string): Promise<Res> {
  vi.setSystemTime(new Date(isoInstant));
  h.state.today = isoInstant.slice(0, 10);
  const res = mkRes();
  await (handler as (a: unknown, b: unknown) => Promise<unknown>)(
    { method: 'GET', headers: { authorization: `Bearer ${SECRET}` }, query: {} },
    res,
  );
  return res;
}
const resolveAt = (iso: string) => runAt(resolveCalls as Handler, iso);
const collectAt = (iso: string) => runAt(sourceFxRates as Handler, iso);

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
let provider: ReturnType<typeof providerBody> = providerBody(null);
const fetchSpy = vi.fn(async (url: string) => {
  if (url.startsWith('https://open.er-api.com/')) {
    return { ok: true, status: 200, json: async () => provider } as unknown as Response;
  }
  throw new Error(`network is stubbed in this test: ${url}`);
});

// --- the AR-shaped fixture -------------------------------------------------
const AR_REF = 1545.36;
const AR_PCT = 1.64;
/** Window 7–20 Nov; peak 1562.98, i.e. +1.14% = 114 bp, under 1.64%. */
const AR_THROUGH_20: FxRow[] = [
  ['2026-11-07', 1545.36],
  ['2026-11-08', 1545.36],
  ['2026-11-09', 1545.36],
  ['2026-11-10', 1549.1],
  ['2026-11-11', 1552.4],
  ['2026-11-12', 1550.8],
  ['2026-11-13', 1556.2],
  ['2026-11-14', 1558.9],
  ['2026-11-15', 1558.9],
  ['2026-11-16', 1558.9],
  ['2026-11-17', 1560.05],
  ['2026-11-18', 1561.7],
  ['2026-11-19', 1562.98],
  ['2026-11-20', 1562.98],
].map(([date, rate]) => ({ currency_code: 'ARS', country_code: 'AR', date: date as string, rate: rate as number }));
/** The business-day fixing that the source published only on Sun 22 Nov: +1.98%. */
const AR_FRESH_21: FxRow = { currency_code: 'ARS', country_code: 'AR', date: '2026-11-21', rate: 1575.96 };
const AR_22: FxRow = { currency_code: 'ARS', country_code: 'AR', date: '2026-11-22', rate: 1575.9572 };

const arCall = (over: Partial<CallRow> = {}): CallRow => ({
  id: 9047,
  kind: 'fx_devaluation',
  country_code: 'AR',
  made_on: '2026-11-07',
  resolves_on: '2026-11-21',
  horizon_days: 14,
  threshold: 1,
  threshold_pct: AR_PCT,
  reference_value: AR_REF,
  resolver_params: null,
  status: 'pending',
  evidence_count: null,
  resolved_at: null,
  void_reason: null,
  ...over,
});

const updates = () => h.state.statements.filter((s) => s.text.startsWith('UPDATE calls'));
const fxAlertRaises = () => h.raiseAlert.mock.calls.filter(([a]) => a.key === 'resolver:fx-stale-quote');
const fxAlertClears = () => h.clearAlert.mock.calls.filter(([k]) => k === 'resolver:fx-stale-quote');

let saved: { secret?: string; db?: string; fetch: typeof fetch };
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  saved = { secret: process.env.CRON_SECRET, db: process.env.DATABASE_URL, fetch: globalThis.fetch };
  process.env.CRON_SECRET = SECRET;
  process.env.DATABASE_URL = 'postgres://stub.invalid/never-connected';
  globalThis.fetch = fetchSpy as unknown as typeof fetch;
  h.state.calls = [];
  h.state.fx = [];
  h.state.statements = [];
  h.raiseAlert.mockReset();
  h.raiseAlert.mockImplementation(async () => ({ delivered: true, channel: 'email', detail: 'stubbed' }));
  h.clearAlert.mockClear();
  fetchSpy.mockClear();
  provider = providerBody(null);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
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

// ---------------------------------------------------------------------------

describe('1. a stale quote leaves the call pending', () => {
  it('no quote dated the resolution day: pending, no UPDATE, counted as waiting', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20];
    const res = await resolveAt('2026-11-21T09:45:00Z');
    expect(res.statusCode).toBe(200);
    expect(h.state.calls[0]).toMatchObject({ status: 'pending', evidence_count: null, resolved_at: null });
    expect(updates()).toHaveLength(0);
    expect(res.body).toMatchObject({ resolved: 0, hits: 0, misses: 0, still_waiting: 1, fx_awaiting_quote: 1 });
  });

  it('a window with no quote at all is held the same way, not silently skipped', async () => {
    h.state.calls = [arCall()];
    const res = await resolveAt('2026-11-21T09:45:00Z');
    expect(h.state.calls[0].status).toBe('pending');
    expect(res.body).toMatchObject({ still_waiting: 1, fx_awaiting_quote: 1 });
  });

  it('is retried on the next run and resolves once the quote for that day is stored', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20];
    await resolveAt('2026-11-21T09:45:00Z');
    expect(h.state.calls[0].status).toBe('pending');
    h.state.fx.push(AR_FRESH_21);
    await resolveAt('2026-11-22T09:45:00Z');
    expect(h.state.calls[0]).toMatchObject({ status: 'hit', evidence_count: 198 });
  });

  it('the freshness rule itself: only a quote dated on or after the resolution day counts', () => {
    expect(fxQuoteIsFreshFor('2026-11-21', '2026-11-21')).toBe(true);
    expect(fxQuoteIsFreshFor('2026-11-20', '2026-11-21')).toBe(false);
    expect(fxQuoteIsFreshFor(null, '2026-11-21')).toBe(false);
  });
});

describe('2. a fresh quote resolves it exactly as today', () => {
  it('HIT: same verdict, same basis-point evidence, same UPDATE statement', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20, AR_FRESH_21];
    const res = await resolveAt('2026-11-21T09:45:00Z');
    expect(h.state.calls[0]).toMatchObject({ status: 'hit', evidence_count: 198 });
    expect(Math.round(fxDepreciationPct(AR_REF, 1575.96) * 100)).toBe(198);
    const u = updates();
    expect(u).toHaveLength(1);
    expect(u[0].text).toBe(
      "UPDATE calls SET status = ?, evidence_count = ?, resolved_at = NOW() WHERE id = ? AND status = 'pending'",
    );
    expect(u[0].values).toEqual(['hit', 198, 9047]);
    expect(res.body).toMatchObject({ resolved: 1, hits: 1, misses: 0, still_waiting: 0, fx_awaiting_quote: 0 });
  });

  it('MISS: a fresh final day below the threshold is still a MISS, with the window peak as evidence', async () => {
    // Fresh 21 Nov quote that does NOT exceed the earlier peak: the peak, not
    // the endpoint, is the evidence — unchanged MAX-over-window semantics.
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20, { ...AR_FRESH_21, rate: 1560.0 }];
    await resolveAt('2026-11-21T09:45:00Z');
    expect(h.state.calls[0]).toMatchObject({ status: 'miss', evidence_count: 114 });
    expect(updates()[0].values).toEqual(['miss', 114, 9047]);
  });

  it('the threshold is the call’s own, untouched: a cent over the bar is a HIT, a cent under is a MISS', async () => {
    const bar = AR_REF * (1 + AR_PCT / 100);
    for (const [rate, status] of [
      [bar + 0.01, 'hit'],
      [bar - 0.01, 'miss'],
    ] as const) {
      h.state.calls = [arCall()];
      h.state.fx = [...AR_THROUGH_20, { ...AR_FRESH_21, rate }];
      await resolveAt('2026-11-21T09:45:00Z');
      expect(h.state.calls[0]).toMatchObject({ status, evidence_count: 164 });
    }
  });
});

describe('3. the 21 Nov shape — a quote dated the previous day — is caught', () => {
  it('resolver: the newest quote is dated 20 Nov for a call resolving 21 Nov → pending, not a MISS', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20];
    await resolveAt('2026-11-21T09:45:00Z');
    // Before the guard this was written MISS at 114 bp.
    expect(h.state.calls[0].status).toBe('pending');
    expect(h.state.calls[0].evidence_count).toBeNull();
  });

  it('resolver: a fresh quote for the NEXT day does not stand in — it is outside the window', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20, AR_22];
    await resolveAt('2026-11-22T09:45:00Z');
    expect(h.state.calls[0].status).toBe('pending');
  });

  it('collector → resolver: the stale provider morning leaves the AR call pending at 09:45', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20];
    provider = providerBody(new Date(Date.UTC(2026, 10, 20, 0, 2, 31)));
    await collectAt('2026-11-21T05:00:00Z');
    await resolveAt('2026-11-21T09:45:00Z');
    expect(h.state.calls[0].status).toBe('pending');
  });

  it('collector → resolver: a fresh provider morning resolves it exactly as before (HIT, 198 bp)', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20];
    provider = providerBody(new Date(Date.UTC(2026, 10, 21, 0, 2, 31)));
    await collectAt('2026-11-21T05:00:00Z');
    await resolveAt('2026-11-21T09:45:00Z');
    expect(h.state.calls[0]).toMatchObject({ status: 'hit', evidence_count: 198 });
  });
});

describe('4. already-resolved rows are not changed', () => {
  const resolved = (): CallRow[] => [
    // Shaped like 6047: published MISS at 114 bp on 21 Nov, on the stale quote.
    arCall({ id: 6047, status: 'miss', evidence_count: 114, resolved_at: '2026-11-21T09:45:07.000Z' }),
    arCall({
      id: 6045,
      country_code: 'TR',
      status: 'hit',
      evidence_count: 210,
      resolved_at: '2026-11-21T09:45:07.000Z',
    }),
    arCall({ id: 3001, status: 'unresolvable', void_reason: 'old', resolved_at: '2026-10-01T09:45:00.000Z' }),
  ];

  it('a fresh quote that would now make 6047 a HIT does not touch it', async () => {
    const before = resolved();
    h.state.calls = [...resolved(), arCall({ id: 9100, resolves_on: '2026-11-22', made_on: '2026-11-08' })];
    h.state.fx = [...AR_THROUGH_20, AR_FRESH_21, AR_22];
    await resolveAt('2026-11-22T09:45:00Z');
    expect(h.state.calls.slice(0, 3)).toEqual(before);
    expect(h.state.calls[3].status).toBe('hit'); // the pending one did resolve
    for (const u of updates()) {
      expect(u.text).toContain("AND status = 'pending'");
      expect(u.values).not.toContain(6047);
      expect(u.values).not.toContain(6045);
      expect(u.values).not.toContain(3001);
    }
  });

  it('a stale run does not touch them either, and selects only pending rows', async () => {
    const before = resolved();
    h.state.calls = [...resolved(), arCall({ id: 9101 })];
    h.state.fx = [...AR_THROUGH_20];
    await resolveAt('2026-11-21T09:45:00Z');
    await resolveAt('2026-11-22T09:45:00Z');
    expect(h.state.calls.slice(0, 3)).toEqual(before);
    const due = h.state.statements.filter((s) => s.text.startsWith('SELECT id, kind, country_code'));
    expect(due.length).toBe(2);
    for (const s of due) expect(s.text).toContain("WHERE status = 'pending'");
    expect(updates()).toHaveLength(0);
  });
});

describe('5. the alert path fires after the set period', () => {
  it('the contract: an existing-channel alert, keyed and stable, after one day', () => {
    expect(FX_STALE_ALERT_KEY).toBe('resolver:fx-stale-quote');
    expect(FX_STALE_ALERT_AFTER_DAYS).toBe(1);
  });

  it('day 0 holds quietly; day 1 still stale raises; a stored quote resolves and stands it down', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20];

    await resolveAt('2026-11-21T09:45:00Z'); // day 0
    expect(fxAlertRaises()).toHaveLength(0);
    expect(fxAlertClears()).toHaveLength(1);

    h.state.fx.push(AR_22); // the provider is back, but 21 Nov was never stored
    await resolveAt('2026-11-22T09:45:00Z'); // day 1
    expect(h.state.calls[0].status).toBe('pending');
    expect(fxAlertRaises()).toHaveLength(1);
    const a = fxAlertRaises()[0][0];
    expect(a.severity).toBe('warning');
    expect(a.title).toContain('1 FX call');
    expect(a.body).toContain('2026-11-21');
    expect(a.body).toContain('AR');
    expect(a.body).toContain('not scored');

    h.state.fx.push(AR_FRESH_21);
    h.raiseAlert.mockClear();
    h.clearAlert.mockClear();
    await resolveAt('2026-11-23T09:45:00Z');
    expect(h.state.calls[0]).toMatchObject({ status: 'hit', evidence_count: 198 });
    expect(fxAlertRaises()).toHaveLength(0);
    expect(fxAlertClears()).toHaveLength(1);
  });

  it('counts only calls past the period, and names the oldest', async () => {
    h.state.calls = [
      arCall({ id: 1, resolves_on: '2026-11-20', made_on: '2026-11-06' }),
      arCall({ id: 2, resolves_on: '2026-11-21' }),
      arCall({ id: 3, country_code: 'TR', resolves_on: '2026-11-22', made_on: '2026-11-08' }),
    ];
    await resolveAt('2026-11-22T09:45:00Z');
    expect(fxAlertRaises()).toHaveLength(1);
    const a = fxAlertRaises()[0][0];
    expect(a.title).toContain('2 FX call');
    expect(a.body).toContain('2026-11-20');
    expect(a.body).not.toMatch(/\bTR\b/);
  });

  it('an alert that fails to send never breaks resolution', async () => {
    h.raiseAlert.mockRejectedValue(new Error('alert channel down'));
    h.state.calls = [arCall(), arCall({ id: 9200, resolves_on: '2026-11-22', made_on: '2026-11-08' })];
    h.state.fx = [...AR_THROUGH_20, AR_22];
    const res = await resolveAt('2026-11-22T09:45:00Z');
    expect(res.statusCode).toBe(200);
    expect(h.state.calls[0].status).toBe('pending');
    expect(h.state.calls[1].status).toBe('hit');
  });

  it('the existing ledger-truth backstops still see it: same day when nothing is disposed, and past grace', () => {
    // The 21 Nov shape on day 0: every FX call due that day is held.
    expect(
      ledgerTruthVerdict({
        checkDate: '2026-11-21',
        dueOnCheckDate: 66,
        dueDisposedOnCheckDate: 0,
        pastGrace: 0,
        oldestPastGrace: null,
      }).map((a) => a.key),
    ).toEqual([SILENT_KEY]);
    // A held call that never gets its quote is still pending past the grace window.
    expect(
      ledgerTruthVerdict({
        checkDate: `2026-11-${21 + PAST_GRACE_DAYS + 1}`,
        dueOnCheckDate: 66,
        dueDisposedOnCheckDate: 66,
        pastGrace: 1,
        oldestPastGrace: '2026-11-21',
      }).map((a) => a.key),
    ).toEqual([OVERDUE_KEY]);
  });
});

/**
 * What cron-health reads (cron-health.ts:93–101), computed from the stubbed
 * book at `isoInstant` with the same predicates.
 */
function ledgerReadingAt(isoInstant: string): LedgerTruthReading {
  const checkDate = checkDateFor(new Date(isoInstant));
  const today = isoInstant.slice(0, 10);
  const cutoff = new Date(`${today}T00:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - PAST_GRACE_DAYS);
  const floor = cutoff.toISOString().slice(0, 10);
  const due = h.state.calls.filter((c) => c.resolves_on === checkDate);
  const past = h.state.calls.filter((c) => c.status === 'pending' && c.resolves_on < floor);
  return {
    checkDate,
    dueOnCheckDate: due.length,
    dueDisposedOnCheckDate: due.filter((c) => c.status !== 'pending').length,
    pastGrace: past.length,
    oldestPastGrace: past.map((c) => c.resolves_on).sort()[0] ?? null,
  };
}

const dayAt = (n: number) => {
  const d = new Date(Date.UTC(2026, 10, 21 + n, 9, 45));
  return d.toISOString();
};

describe('6. a held call never waits forever: settled unresolvable at the existing grace', () => {
  it('the grace is the existing one, unchanged', () => {
    expect(UNRESOLVABLE_GRACE_DAYS).toBe(7);
    expect(PAST_GRACE_DAYS).toBe(UNRESOLVABLE_GRACE_DAYS);
  });

  it('pending through day 6; on day 7 settled unresolvable with the reason — never a hit or a miss', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20];
    for (let d = 0; d < UNRESOLVABLE_GRACE_DAYS; d++) {
      await resolveAt(dayAt(d));
      expect(h.state.calls[0].status).toBe('pending');
    }
    const res = await resolveAt(dayAt(UNRESOLVABLE_GRACE_DAYS)); // 2026-11-28
    const c = h.state.calls[0];
    expect(c.status).toBe('unresolvable');
    expect(c.evidence_count).toBeNull();
    expect(c.void_reason).toContain('no fresh quote');
    expect(c.void_reason).toContain('2026-11-21');
    expect(c.void_reason).toContain('newest in window: 2026-11-20');
    expect(res.body).toMatchObject({ resolved: 0, hits: 0, misses: 0, unresolvable: 1, fx_awaiting_quote: 0 });
    const settle = updates();
    expect(settle).toHaveLength(1);
    expect(settle[0].text).toBe(
      "UPDATE calls SET status = 'unresolvable', void_reason = ?, resolved_at = NOW() WHERE id = ? AND status = 'pending'",
    );
    // Settled, so the day-1 warning stands down.
    expect(fxAlertClears().length).toBeGreaterThan(0);
  });

  it('a quote stored on day 6 still resolves it on the evidence', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20];
    await resolveAt(dayAt(5));
    h.state.fx.push(AR_FRESH_21);
    await resolveAt(dayAt(6));
    expect(h.state.calls[0]).toMatchObject({ status: 'hit', evidence_count: 198 });
  });

  it('ledger-truth’s past-grace check stays true: nothing held is ever overdue while the resolver runs', async () => {
    h.state.calls = [arCall()];
    h.state.fx = [...AR_THROUGH_20];
    for (let d = 0; d <= UNRESOLVABLE_GRACE_DAYS + 1; d++) {
      await resolveAt(dayAt(d));
      // cron-health's 10:30 tick on the same day
      const v = ledgerTruthVerdict(ledgerReadingAt(dayAt(d).replace('09:45', '10:30')));
      expect(v.map((a) => a.key)).not.toContain(OVERDUE_KEY);
    }
    expect(h.state.calls[0].status).toBe('unresolvable');
  });

  it('…and if the resolver stops running, the past-grace check still catches the held call', () => {
    h.state.calls = [arCall()];
    const v = ledgerTruthVerdict(ledgerReadingAt(dayAt(PAST_GRACE_DAYS + 1).replace('09:45', '10:30')));
    expect(v.map((a) => a.key)).toContain(OVERDUE_KEY);
  });
});

describe('7. held calls cannot starve the 500-row page', () => {
  it('600 held FX calls ahead in date order do not block 3 resolvable calls, or 2 due for settlement', async () => {
    const held: CallRow[] = Array.from({ length: 600 }, (_, i) =>
      arCall({
        id: 10_000 + i,
        country_code: 'VE',
        made_on: `2026-11-0${1 + (i % 6)}`,
        resolves_on: `2026-11-${15 + (i % 6)}`, // 15–20 Nov: inside grace on 21 Nov
      }),
    );
    const pastGrace = [
      arCall({ id: 9001, country_code: 'VE', made_on: '2026-10-31', resolves_on: '2026-11-14' }),
      arCall({ id: 9002, country_code: 'VE', made_on: '2026-10-31', resolves_on: '2026-11-14' }),
    ];
    const resolvable = [arCall({ id: 1 }), arCall({ id: 2, threshold_pct: 1.5 }), arCall({ id: 3, threshold_pct: 5 })];
    h.state.calls = [...held, ...pastGrace, ...resolvable];
    h.state.fx = [...AR_THROUGH_20, AR_FRESH_21]; // no VE quotes at all

    const res = await resolveAt('2026-11-21T09:45:00Z');

    expect(res.body).toMatchObject({ due: 605, taken: 500, truncated: true });
    // Every resolvable call was taken and scored exactly as before.
    expect(h.state.calls.filter((c) => c.id <= 3).map((c) => c.status)).toEqual(['hit', 'hit', 'miss']);
    // Past-grace calls were reached and settled, never scored.
    expect(h.state.calls.filter((c) => c.id >= 9001 && c.id <= 9002).map((c) => c.status)).toEqual([
      'unresolvable',
      'unresolvable',
    ]);
    // The held ones fill only what is left, and stay pending.
    expect(res.body?.fx_awaiting_quote).toBe(495);
    expect(h.state.calls.filter((c) => c.id >= 10_000).every((c) => c.status === 'pending')).toBe(true);
    // The truncation alarm still fires: the backlog is visible, not hidden.
    expect(h.raiseAlert.mock.calls.some(([a]) => a.key === 'resolver:truncated')).toBe(true);
  });
});
