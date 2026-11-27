import { describe, it, expect, vi, afterEach } from 'vitest';
import { snapshotSql, fakeRes, SNAPSHOT } from './_lib/snapshot-sql-fixture.js';
import { murphyDecomposition, type ScoredCall } from './_lib/calls.js';

/**
 * THE POOLED TABLE LEAVES OUT A KIND WHOSE OUTCOMES ARE UNDER CORRECTION, AND
 * SAYS SO BESIDE IT.
 *
 * `scoring.calibration` in /api/calls/ledger (and so in every daily snapshot)
 * pooled censorship calls on their published outcomes, 54 of which the
 * evidence contradicts. Lead decision on REVIEW-FRONTDOOR finding 8: while a
 * kind's corrected skill is withheld (it carries an outcome-changing
 * correction), the table is computed without it, and one plain sentence beside
 * it says so. The table's forecast count must match: everything scored except
 * the kinds left out. Both states are tested on the 22 Nov 2026 book; the
 * second by taking every correction off it for the length of a test.
 */

vi.mock('@neondatabase/serverless', () => ({ neon: () => snapshotSql }));

const NOTE = 'Censorship forecasts are left out of this table while their outcomes are under correction.';

interface Bin {
  from: number;
  count: number;
  meanPredicted: number;
  observed: number;
}
interface Json {
  counts: { resolved: number };
  scoring: {
    calibration: Bin[];
    calibration_note: string | null;
    murphy: { reliability: number; resolution: number; uncertainty: number } | null;
  };
  by_kind: Record<string, { resolved: number; corrected: unknown }>;
}

async function ledgerJson(): Promise<Json> {
  process.env.DATABASE_URL = 'postgres://stub';
  const { default: handler } = await import('./calls/ledger.js');
  const res = fakeRes();
  await handler({ method: 'GET', query: {} } as never, res as never);
  expect(res.state.status).toBe(200);
  return JSON.parse(JSON.stringify(res.state.json)) as Json;
}

const scored = (kinds: string[]) =>
  SNAPSHOT.resolved.filter((c) => kinds.includes(c.kind) && (c.status === 'hit' || c.status === 'miss'));
const asCalls = (rows: typeof SNAPSHOT.resolved): ScoredCall[] =>
  rows.map((c) => ({
    probability: c.probability,
    outcome: c.status === 'hit' ? 1 : 0,
    baseRate: c.base_rate ?? undefined,
  }));
const total = (bins: Bin[]) => bins.reduce((a, b) => a + b.count, 0);

/** Takes every correction off the book for the length of `fn`. */
async function withoutCorrections<T>(fn: () => Promise<T>): Promise<T> {
  const saved = SNAPSHOT.resolved.map((c) => c.correction);
  for (const c of SNAPSHOT.resolved) c.correction = null;
  try {
    return await fn();
  } finally {
    SNAPSHOT.resolved.forEach((c, i) => (c.correction = saved[i]));
  }
}

afterEach(() => {
  expect(SNAPSHOT.resolved.filter((c) => c.correction).length).toBe(54);
});

describe('while censorship outcomes are under correction (the 22 Nov 2026 book)', () => {
  it('the censorship skill is withheld on corrected evidence: the condition this follows', async () => {
    const j = await ledgerJson();
    expect(j.by_kind.censorship_event.corrected).not.toBeNull();
    expect(j.by_kind.fx_devaluation.corrected).toBeNull();
  });

  it('the table holds no censorship call, and its count is everything scored but censorship', async () => {
    const j = await ledgerJson();
    const fx = scored(['fx_devaluation']);
    expect(total(j.scoring.calibration)).toBe(fx.length);
    expect(total(j.scoring.calibration)).toBe(j.counts.resolved - j.by_kind.censorship_event.resolved);
    for (const b of j.scoring.calibration) {
      const inBand = fx.filter((c) => Math.min(9, Math.floor(c.probability * 10)) === Math.round(b.from * 10));
      expect(b.count).toBe(inBand.length);
      expect(b.observed).toBeCloseTo(inBand.filter((c) => c.status === 'hit').length / inBand.length, 12);
    }
  });

  it('says so beside the table, in one plain sentence', async () => {
    expect((await ledgerJson()).scoring.calibration_note).toBe(NOTE);
  });

  it('the decomposition beside the table describes the same calls', async () => {
    const j = await ledgerJson();
    const m = murphyDecomposition(asCalls(scored(['fx_devaluation'])));
    expect(j.scoring.murphy?.reliability).toBeCloseTo(m.reliability, 12);
    expect(j.scoring.murphy?.resolution).toBeCloseTo(m.resolution, 12);
    expect(j.scoring.murphy?.uncertainty).toBeCloseTo(m.uncertainty, 12);
  });
});

describe('with no outcome under correction', () => {
  it('the table pools every scored claim again, and no sentence is shown', async () => {
    await withoutCorrections(async () => {
      const j = await ledgerJson();
      expect(j.by_kind.censorship_event.corrected).toBeNull();
      expect(j.scoring.calibration_note).toBeNull();
      expect(total(j.scoring.calibration)).toBe(j.counts.resolved);
      expect(total(j.scoring.calibration)).toBe(scored(['fx_devaluation', 'censorship_event']).length);
      const m = murphyDecomposition(asCalls(scored(['fx_devaluation', 'censorship_event'])));
      expect(j.scoring.murphy?.reliability).toBeCloseTo(m.reliability, 12);
    });
  });
});
