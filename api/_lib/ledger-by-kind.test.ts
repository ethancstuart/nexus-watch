import { describe, it, expect } from 'vitest';
import { assembleByKind, describeCorrections, type KindCountRow, type ScoredRow } from './ledger-by-kind.js';

/**
 * REGRESSION FOR A DEFECT THAT WAS LIVE ON THE PUBLIC API.
 *
 * Measured on https://nexuswatch.dev/api/calls/ledger, 2026-08-30:
 *
 *   by_kind.censorship_event.open = 3     (312 pending in the table)
 *   by_kind.fx_devaluation.open   = 197   (523 pending in the table)
 *   by_kind.seismicity_window            ABSENT (14 pending in the table)
 *   sum of by_kind.*.open         = 200   — exactly the page size
 *
 * Six days before 39 of those censorship calls resolved, the API told a reader
 * there were three. The open page is ordered by DIVERGENCE, so the truncation
 * was not even a random sample — it was the most divergent rows, the worst
 * possible bias for a number read as the book.
 */
describe('by_kind counts come from the table, never from the page', () => {
  // The real shape on 2026-08-30.
  const counts: KindCountRow[] = [
    { kind: 'censorship_event', open: 312, resolved: 0, hits: 0, unscored: 0 },
    { kind: 'fx_devaluation', open: 523, resolved: 0, hits: 0, unscored: 0 },
    { kind: 'seismicity_window', open: 14, resolved: 0, hits: 0, unscored: 0 },
  ];

  it('reports the whole book even when NO rows were fetched', () => {
    // The page contributed nothing. The counts must be unaffected — this is
    // the exact condition under which the old code reported 3.
    const out = assembleByKind(counts, []);
    expect(out.censorship_event.open).toBe(312);
    expect(out.fx_devaluation.open).toBe(523);
  });

  it('includes a kind whose rows never reached a page', () => {
    // seismicity_window vanished from the response entirely because the
    // previous implementation seeded the map from the fetched rows.
    const out = assembleByKind(counts, []);
    expect(Object.keys(out).sort()).toEqual(['censorship_event', 'fx_devaluation', 'seismicity_window']);
    expect(out.seismicity_window.open).toBe(14);
  });

  it('does not sum to the page size', () => {
    const out = assembleByKind(counts, []);
    const sum = Object.values(out).reduce((a, v) => a + v.open, 0);
    expect(sum).toBe(849);
    expect(sum).not.toBe(200);
  });

  it('scores from the fetched rows, and says when they were truncated', () => {
    const withResolved: KindCountRow[] = [{ kind: 'censorship_event', open: 0, resolved: 31, hits: 10, unscored: 8 }];
    // Only 4 of the 31 scored rows were fetched.
    const rows: ScoredRow[] = Array.from({ length: 4 }, (_, i) => ({
      kind: 'censorship_event',
      countryCode: ['TR', 'RU', 'IR', 'IN'][i],
      probability: 0.84,
      baseRate: 0.9,
      outcome: 1 as const,
      resolvedOn: '2026-09-05',
    }));
    const out = assembleByKind(withResolved, rows);

    // The COUNT is the table's.
    expect(out.censorship_event.resolved).toBe(31);
    expect(out.censorship_event.hits).toBe(10);
    expect(out.censorship_event.unscored).toBe(8);
    // The SCORE is the page's, and the response admits the difference rather
    // than printing a Brier beside a count that does not share its denominator.
    expect(out.censorship_event.scored_rows_used).toBe(4);
    expect(out.censorship_event.scoring_complete).toBe(false);
    // ...and the score is WITHHELD, not published with a caveat. A Brier on 4
    // of 31 rows sits on the same line as a whole-table count of 31 and will
    // be read as describing it.
    expect(out.censorship_event.brier).toBeNull();
    expect(out.censorship_event.skill_vs_base_rate).toBeNull();
  });

  it('reports scoring_complete when the page held every scored row', () => {
    const c: KindCountRow[] = [{ kind: 'fx_devaluation', open: 0, resolved: 2, hits: 1, unscored: 0 }];
    const rows: ScoredRow[] = [
      {
        kind: 'fx_devaluation',
        countryCode: 'TR',
        probability: 0.6,
        baseRate: 0.5,
        outcome: 1,
        resolvedOn: '2026-09-06',
      },
      {
        kind: 'fx_devaluation',
        countryCode: 'AR',
        probability: 0.4,
        baseRate: 0.5,
        outcome: 0,
        resolvedOn: '2026-09-07',
      },
    ];
    const out = assembleByKind(c, rows);
    expect(out.fx_devaluation.scored_rows_used).toBe(2);
    expect(out.fx_devaluation.scoring_complete).toBe(true);
  });

  it('withholds skill below the batch threshold, whatever the counts say', () => {
    // One batch. The count says 31 resolved; the skill must still be null.
    const c: KindCountRow[] = [{ kind: 'censorship_event', open: 0, resolved: 31, hits: 10, unscored: 0 }];
    const rows: ScoredRow[] = Array.from({ length: 31 }, (_, i) => ({
      kind: 'censorship_event',
      countryCode: `C${i}`,
      probability: 0.16,
      baseRate: 0.1,
      outcome: (i < 10 ? 1 : 0) as 0 | 1,
      resolvedOn: '2026-09-05',
    }));
    const out = assembleByKind(c, rows);
    expect(out.censorship_event.batches).toBe(1);
    expect(out.censorship_event.skill_vs_base_rate).toBeNull();
    expect(out.censorship_event.brier).not.toBeNull();
  });
});

describe('an orphan scored row is refused, never silently dropped', () => {
  const counts: KindCountRow[] = [{ kind: 'censorship_event', open: 0, resolved: 1, hits: 1, unscored: 0 }];

  it('throws when a scored row names a kind the counts do not carry', () => {
    // Reachable the moment a caller passes a FILTERED count set beside
    // unfiltered scored rows — e.g. counts excluding calibration kinds. The
    // old code iterated Object.keys(seeded-from-counts), so those rows
    // vanished and the published Brier was quietly computed on fewer rows
    // than the count beside it claimed.
    const rows: ScoredRow[] = [
      {
        kind: 'censorship_event',
        countryCode: 'TR',
        probability: 0.8,
        baseRate: 0.9,
        outcome: 1,
        resolvedOn: '2026-09-05',
      },
      {
        kind: 'seismicity_window',
        countryCode: 'JP',
        probability: 0.5,
        baseRate: 0.5,
        outcome: 1,
        resolvedOn: '2026-09-07',
      },
    ];
    expect(() => assembleByKind(counts, rows)).toThrow(/seismicity_window/);
    expect(() => assembleByKind(counts, rows)).toThrow(/absent from the counts/);
  });

  it('does not throw when every scored kind is present', () => {
    const rows: ScoredRow[] = [
      {
        kind: 'censorship_event',
        countryCode: 'TR',
        probability: 0.8,
        baseRate: 0.9,
        outcome: 1,
        resolvedOn: '2026-09-05',
      },
    ];
    expect(() => assembleByKind(counts, rows)).not.toThrow();
  });

  it('does not throw for a counted kind with no scored rows', () => {
    // The common case on 5 September: kinds exist and nothing has resolved.
    const c: KindCountRow[] = [
      { kind: 'censorship_event', open: 312, resolved: 0, hits: 0, unscored: 0 },
      { kind: 'seismicity_window', open: 14, resolved: 0, hits: 0, unscored: 0 },
    ];
    expect(() => assembleByKind(c, [])).not.toThrow();
  });
});

/**
 * THE SECOND READING — published beside the first, never replacing it.
 *
 * 54 resolved censorship calls were published MISS that the evidence records
 * as HIT: the collector stored one hour of each day rather than the whole day,
 * and the resolver scored a call's final day before any evidence for it
 * existed. Both defects are fixed forward. Neither verdict is rewritten.
 *
 * Every assertion below is planted BOTH WAYS — the corrected figures must be
 * absent when nothing is corrected, and present and different when something
 * is. A test that only proves the happy path proves that the code runs, not
 * that it measures.
 */
describe('corrected reading', () => {
  const counts: KindCountRow[] = [{ kind: 'censorship_event', open: 0, resolved: 4, hits: 1, unscored: 0 }];

  /** Four calls, all stated at 0.25, three published MISS and one HIT. */
  const base: ScoredRow[] = [
    {
      kind: 'censorship_event',
      countryCode: 'EG',
      probability: 0.25,
      baseRate: 0.3,
      outcome: 0,
      resolvedOn: '2026-08-22',
    },
    {
      kind: 'censorship_event',
      countryCode: 'CU',
      probability: 0.25,
      baseRate: 0.3,
      outcome: 0,
      resolvedOn: '2026-08-23',
    },
    {
      kind: 'censorship_event',
      countryCode: 'VN',
      probability: 0.25,
      baseRate: 0.3,
      outcome: 0,
      resolvedOn: '2026-08-24',
    },
    {
      kind: 'censorship_event',
      countryCode: 'KE',
      probability: 0.25,
      baseRate: 0.3,
      outcome: 1,
      resolvedOn: '2026-08-25',
    },
  ];

  it('is ABSENT when no call carries a correction', () => {
    // The ordinary case. It must be null, not a zeroed object that reads as a
    // measurement of "no change".
    const out = assembleByKind(counts, base);
    expect(out.censorship_event.corrected).toBeNull();
  });

  it('is PRESENT and moves the Brier when calls are corrected', () => {
    // Two of the three published misses were hits.
    const rows = base.map((r, i) => (i < 2 ? { ...r, correctedOutcome: 1 as const } : r));
    const out = assembleByKind(counts, rows);
    const c = out.censorship_event.corrected;
    expect(c).not.toBeNull();
    expect(c!.corrections_applied).toBe(2);

    // Published: 1 hit in 4. Corrected: 3 hits in 4.
    expect(out.censorship_event.hits).toBe(1);
    expect(c!.hits).toBe(3);

    // Published Brier at p=0.25: three misses (0.0625 each) + one hit (0.5625)
    // = 0.75 / 4 = 0.1875. Corrected: one miss (0.0625) + three hits (0.5625
    // each) = 1.75 / 4 = 0.4375. Computed by hand so the test is a check and
    // not an echo of the implementation.
    expect(out.censorship_event.brier).toBeCloseTo(0.1875, 10);
    expect(c!.brier).toBeCloseTo(0.4375, 10);
    expect(c!.brier).not.toBeCloseTo(out.censorship_event.brier!, 10);
  });

  it('WITHHOLDS the corrected skill, with the reason attached', () => {
    // Skill is measured against each unit's base rate, and those base rates
    // were estimated from the evidence these corrections repair. A number
    // against a benchmark known to be mis-estimated is withheld, not
    // footnoted.
    const rows = base.map((r, i) => (i < 2 ? { ...r, correctedOutcome: 1 as const } : r));
    const c = assembleByKind(counts, rows).censorship_event.corrected!;
    expect(c.skill_vs_base_rate).toBeNull();
    expect(c.skill_withheld_because).toMatch(/base rates/i);
  });

  it('does not count a correction that agrees with what was published', () => {
    // `correctedOutcome` is only ever set when it DIFFERS — a no-op row would
    // inflate a number readers quote. Proved by planting the agreeing case as
    // undefined, which is what the endpoint's mapper produces for it.
    const rows = base.map((r) => ({ ...r, correctedOutcome: undefined }));
    expect(assembleByKind(counts, rows).censorship_event.corrected).toBeNull();
  });

  it('is withheld entirely when the scored set is incomplete', () => {
    // Same posture as the first reading: a corrected Brier over a partial set
    // is worse than none, because it would sit beside a whole-table count.
    const short: KindCountRow[] = [{ kind: 'censorship_event', open: 0, resolved: 900, hits: 1, unscored: 0 }];
    const rows = base.map((r, i) => (i < 2 ? { ...r, correctedOutcome: 1 as const } : r));
    const out = assembleByKind(short, rows);
    expect(out.censorship_event.scoring_complete).toBe(false);
    expect(out.censorship_event.brier).toBeNull();
    expect(out.censorship_event.corrected).toBeNull();
  });

  it('leaves the PUBLISHED figures untouched in every case', () => {
    // The whole point. Whatever the corrections say, the first reading is what
    // the register published and it does not move.
    const clean = assembleByKind(counts, base).censorship_event;
    const rows = base.map((r, i) => (i < 2 ? { ...r, correctedOutcome: 1 as const } : r));
    const withCorrections = assembleByKind(counts, rows).censorship_event;
    expect(withCorrections.brier).toBeCloseTo(clean.brier!, 12);
    expect(withCorrections.hits).toBe(clean.hits);
    expect(withCorrections.resolved).toBe(clean.resolved);
    expect(withCorrections.skill_vs_base_rate).toBe(clean.skill_vs_base_rate);
  });
});

describe('describeCorrections', () => {
  it('names the direction, not just the count', () => {
    const rows = [
      { status: 'miss', corrected_status: 'hit' },
      { status: 'miss', corrected_status: 'hit' },
    ];
    expect(describeCorrections(rows)).toBe('2 calls published MISS that the evidence records as HIT');
  });

  it('does NOT assert the first row of a mixed set of them all', () => {
    // The defect this replaced: the sentence read the published verdict off
    // corrected[0] and asserted it of every correction. True while all 54 run
    // one way, and silently false the first time one runs the other.
    const rows = [
      { status: 'miss', corrected_status: 'hit' },
      { status: 'miss', corrected_status: 'hit' },
      { status: 'hit', corrected_status: 'miss' },
    ];
    const out = describeCorrections(rows);
    expect(out).toContain('2 calls published MISS that the evidence records as HIT');
    expect(out).toContain('1 call published HIT that the evidence records as MISS');
    // Largest group first, so the sentence leads with what mostly happened.
    expect(out.indexOf('MISS that')).toBeLessThan(out.indexOf('HIT that'));
  });

  it('singularises one call', () => {
    expect(describeCorrections([{ status: 'miss', corrected_status: 'hit' }])).toBe(
      '1 call published MISS that the evidence records as HIT',
    );
  });
});
