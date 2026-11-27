import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { snapshotSql, fakeRes, SNAPSHOT, ALL_CALLS, type SnapCall } from './_lib/snapshot-sql-fixture.js';
import { baseRate, meanStatedBaseRate, type ScoredCall } from './_lib/calls.js';
import { BASE_RATE_NOTE, landedRatesDetail } from './_lib/ledger-words.js';

/**
 * THE OBSERVED HIT RATE IS NOT CALLED A BASE RATE.
 *
 * `scoring.base_rate` in /api/calls/ledger, and the figure under "calls that
 * landed" on /ledger, is `baseRate()`: the share of scored calls that hit. The
 * page printed it as "stated base rate 30%" while the base rates those calls
 * stated averaged 26% (REVIEW-FRONTDOOR, re-review advisory). Now the page
 * calls it the observed hit rate and prints the mean stated base rate beside
 * it, and the JSON keeps its key, says what it holds and carries the mean.
 *
 * Every expected figure below is computed here from the book's rows, not read
 * from the code under test. The database is ledger-snapshots/2026-11-22.json
 * (api/_lib/snapshot-sql-fixture.ts); the 26 Nov snapshot is checked directly.
 */

vi.mock('@neondatabase/serverless', () => ({ neon: () => snapshotSql }));

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const pct = (v: number) => `${Math.round(v * 100)}%`;

/** Scored claim calls: hits and misses, the seismicity harness left out. */
const scoredClaims = (rows: SnapCall[]) =>
  rows.filter((c) => c.kind !== 'seismicity_window' && (c.status === 'hit' || c.status === 'miss'));

/** Both figures from the rows, by hand. */
function byHand(rows: SnapCall[]) {
  const s = scoredClaims(rows);
  return {
    n: s.length,
    observed: s.filter((c) => c.status === 'hit').length / s.length,
    meanStated: s.reduce((a, c) => a + (c.base_rate as number), 0) / s.length,
  };
}

const asCalls = (rows: SnapCall[]): ScoredCall[] =>
  rows.map((c) => ({
    probability: c.probability,
    outcome: c.status === 'hit' ? 1 : 0,
    baseRate: c.base_rate ?? undefined,
  }));

async function ledgerPage(): Promise<string> {
  process.env.DATABASE_URL = 'postgres://stub';
  const { default: handler } = await import('./ledger.js');
  const res = fakeRes();
  await handler({ method: 'GET', query: {} } as never, res as never);
  expect(res.state.status).toBe(200);
  return res.state.body;
}

interface LedgerJson {
  counts: { resolved: number; hits: number };
  scoring: Record<string, unknown> & { base_rate: number | null };
}
async function ledgerJson(): Promise<LedgerJson> {
  process.env.DATABASE_URL = 'postgres://stub';
  const { default: handler } = await import('./calls/ledger.js');
  const res = fakeRes();
  await handler({ method: 'GET', query: {} } as never, res as never);
  expect(res.state.status).toBe(200);
  return JSON.parse(JSON.stringify(res.state.json)) as LedgerJson;
}

/** The detail line of the "calls that landed" tile on the server page. */
const heroDetail = (html: string) =>
  html.match(/<div class="l">calls that landed<\/div><div class="d">(.*?)<\/div>/)?.[1] ?? null;

/** Adds scored calls to the book for the length of `fn`. */
async function withExtraResolvedCalls<T>(calls: SnapCall[], fn: () => Promise<T>): Promise<T> {
  SNAPSHOT.resolved.push(...calls);
  ALL_CALLS.push(...calls);
  try {
    return await fn();
  } finally {
    for (const c of calls) {
      SNAPSHOT.resolved.splice(SNAPSHOT.resolved.indexOf(c), 1);
      ALL_CALLS.splice(ALL_CALLS.indexOf(c), 1);
    }
  }
}
/** Currency calls stated at a 60% base rate, all hits: both figures must move. */
const extraHits = (n: number): SnapCall[] =>
  Array.from({ length: n }, (_, i) => ({
    id: String(970000 + i),
    kind: 'fx_devaluation',
    country_code: 'ZZ',
    claim: 'ZZZ depreciates 1.00% or more against USD at any point within 14 days, from 1.0.',
    probability: 0.6,
    base_rate: 0.6,
    made_on: '2026-11-09',
    resolves_on: '2026-11-23',
    status: 'hit',
    evidence_count: 1,
    resolved_at: '2026-11-23T09:45:00Z',
    correction: null,
  }));

describe('the two figures, as functions', () => {
  it('baseRate() is the observed hit rate; meanStatedBaseRate() is the mean of the stated base rates', () => {
    const calls: ScoredCall[] = [
      { probability: 0.2, outcome: 1, baseRate: 0.1 },
      { probability: 0.2, outcome: 0, baseRate: 0.2 },
      { probability: 0.2, outcome: 0, baseRate: 0.3 },
      { probability: 0.2, outcome: 0, baseRate: 0.2 },
    ];
    expect(baseRate(calls)).toBe(0.25);
    expect(meanStatedBaseRate(calls)).toBeCloseTo(0.2, 12);
  });

  it('no mean over only some of the calls: one missing base rate, or none at all, is NaN', () => {
    expect(meanStatedBaseRate([])).toBeNaN();
    expect(
      meanStatedBaseRate([
        { probability: 0.2, outcome: 1, baseRate: 0.1 },
        { probability: 0.2, outcome: 0 },
      ]),
    ).toBeNaN();
    expect(meanStatedBaseRate([{ probability: 0.2, outcome: 1, baseRate: Number.NaN }])).toBeNaN();
  });

  it('the label names the observed figure a hit rate, and only the mean a base rate', () => {
    expect(landedRatesDetail(0.3116, 0.2564)).toBe('observed hit rate 31% · mean stated base rate 26%');
    expect(landedRatesDetail(0.3116, null)).toBe('observed hit rate 31%');
    expect(landedRatesDetail(0.3116, undefined)).toBe('observed hit rate 31%');
    expect(landedRatesDetail(0.3116, Number.NaN)).toBe('observed hit rate 31%');
    expect(landedRatesDetail(null, 0.2564)).toBeUndefined();
    expect(landedRatesDetail('0.31', '0.26')).toBeUndefined();
  });
});

describe('verified on the 26 Nov 2026 snapshot', () => {
  const snap = JSON.parse(readFileSync(join(ROOT, 'ledger-snapshots/2026-11-26.json'), 'utf8')) as {
    scoring: { base_rate: number };
    counts: { resolved: number; hits: number };
    resolved: SnapCall[];
  };
  const rows = scoredClaims(snap.resolved);
  const f = byHand(snap.resolved);

  it('the published scoring.base_rate is the observed hit rate of the scored calls, 1,744 of 5,627', () => {
    expect([f.n, rows.filter((c) => c.status === 'hit').length]).toEqual([snap.counts.resolved, snap.counts.hits]);
    expect([f.n, snap.counts.hits]).toEqual([5627, 1744]);
    expect(snap.scoring.base_rate).toBeCloseTo(f.observed, 12);
    expect(baseRate(asCalls(rows))).toBeCloseTo(snap.scoring.base_rate, 12);
  });

  it('the stated base rates of the same calls average 25.6%, not 31%', () => {
    expect(rows.every((c) => typeof c.base_rate === 'number')).toBe(true);
    expect(meanStatedBaseRate(asCalls(rows))).toBeCloseTo(f.meanStated, 12);
    expect(f.meanStated).toBeCloseTo(0.2564, 4);
    expect(f.observed).toBeCloseTo(0.3099, 4);
  });

  it('and the line those calls would print', () => {
    expect(landedRatesDetail(baseRate(asCalls(rows)), meanStatedBaseRate(asCalls(rows)))).toBe(
      'observed hit rate 31% · mean stated base rate 26%',
    );
  });
});

describe('/ledger (server-rendered), on the 22 Nov 2026 book', () => {
  it('labels the landed share an observed hit rate, with the mean stated base rate beside it', async () => {
    const f = byHand(SNAPSHOT.resolved);
    expect(heroDetail(await ledgerPage())).toBe(
      `observed hit rate ${pct(f.observed)} · mean stated base rate ${pct(f.meanStated)}`,
    );
    expect([pct(f.observed), pct(f.meanStated)]).toEqual(['30%', '26%']);
  });

  it('never prints a percentage as a base rate unless it is the mean stated one', async () => {
    const html = await ledgerPage();
    expect(html).not.toMatch(/(?<!mean )stated base rate/);
    for (const m of html.matchAll(/base rate (\d+)%/g)) {
      expect(html.slice(Math.max(0, (m.index ?? 0) - 'mean stated '.length), m.index)).toBe('mean stated ');
    }
  });

  it('both figures are computed per request: a different book, different figures', async () => {
    await withExtraResolvedCalls(extraHits(3000), async () => {
      const f = byHand(SNAPSHOT.resolved);
      expect([pct(f.observed), pct(f.meanStated)]).toEqual(['55%', '38%']);
      expect(heroDetail(await ledgerPage())).toBe(
        `observed hit rate ${pct(f.observed)} · mean stated base rate ${pct(f.meanStated)}`,
      );
    });
  });
});

describe('/api/calls/ledger keeps scoring.base_rate and says what it is', () => {
  it('the key keeps its name and its value: the observed hit rate', async () => {
    const j = await ledgerJson();
    const f = byHand(SNAPSHOT.resolved);
    expect(j.scoring.base_rate).toBeCloseTo(f.observed, 12);
    expect(j.scoring.base_rate).toBeCloseTo(j.counts.hits / j.counts.resolved, 12);
  });

  it('base_rate_note says it is the observed hit rate, and not a stated base rate', async () => {
    const j = await ledgerJson();
    expect(j.scoring.base_rate_note).toBe(BASE_RATE_NOTE);
    expect(BASE_RATE_NOTE).toBe(
      'The observed hit rate, despite the field’s name: the share of scored calls (hits and misses) that hit, over ' +
        'every scored call outside the seismicity calibration harness, including any kind left out of calibration. ' +
        'It is not a base rate any call stated; mean_stated_base_rate is the mean of the base rates those same ' +
        'calls stated.',
    );
  });

  it('mean_stated_base_rate is the mean of the stated base rates over the same calls', async () => {
    const j = await ledgerJson();
    expect(j.scoring.mean_stated_base_rate).toBeCloseTo(byHand(SNAPSHOT.resolved).meanStated, 12);
    await withExtraResolvedCalls(extraHits(3000), async () => {
      const k = await ledgerJson();
      const f = byHand(SNAPSHOT.resolved);
      expect(k.scoring.base_rate).toBeCloseTo(f.observed, 12);
      expect(k.scoring.mean_stated_base_rate).toBeCloseTo(f.meanStated, 12);
    });
  });

  it('the fields sit together, after base_rate, in a fixed order', async () => {
    const keys = Object.keys((await ledgerJson()).scoring);
    expect(keys.slice(keys.indexOf('base_rate'), keys.indexOf('base_rate') + 3)).toEqual([
      'base_rate',
      'base_rate_note',
      'mean_stated_base_rate',
    ]);
  });
});
