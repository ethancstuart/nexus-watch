import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assembleByKind, type KindCountRow, type ScoredRow } from './ledger-by-kind.js';
import { SCORED_STATUSES } from './calls.js';

/**
 * THE BINS ARE CHECKED AGAINST A RECOMPUTATION, NOT AGAINST THEMSELVES.
 *
 * The per-band record is the differentiating figure of this product, so it is
 * verified the way this repo verifies anything load-bearing: against a
 * COMMITTED snapshot of the real book, recomputed here by a second,
 * deliberately naive implementation that shares no code with the one under
 * test. If both agree on 1,302 real rows, the aggregation is right.
 *
 * The snapshot is `ledger-snapshots/2026-09-20.json` — a real day of the real
 * register, committed, so this test does not depend on a live database and
 * cannot silently start measuring a different book tomorrow.
 */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SNAPSHOT = JSON.parse(readFileSync(join(ROOT, 'ledger-snapshots/2026-09-20.json'), 'utf8')) as {
  resolved: Array<{
    kind: string;
    country_code: string;
    probability: number;
    base_rate: number | null;
    resolves_on: string;
    resolved_at?: string | null;
    status: string;
  }>;
};

const scoredRows: ScoredRow[] = SNAPSHOT.resolved
  .filter((r) => SCORED_STATUSES.has(r.status))
  .map((r) => ({
    kind: r.kind,
    countryCode: r.country_code,
    probability: r.probability,
    baseRate: r.base_rate ?? undefined,
    outcome: (r.status === 'hit' ? 1 : 0) as 0 | 1,
    resolvedOn: (r.resolved_at ?? r.resolves_on ?? '').slice(0, 10),
  }));

const counts: KindCountRow[] = [...new Set(scoredRows.map((r) => r.kind))].map((kind) => {
  const rows = scoredRows.filter((r) => r.kind === kind);
  return { kind, open: 0, resolved: rows.length, hits: rows.filter((r) => r.outcome === 1).length, unscored: 0 };
});

const out = assembleByKind(counts, scoredRows);

/** A second, naive implementation. Shares no code with the one under test. */
function naiveBands(kind: string) {
  const rows = scoredRows.filter((r) => r.kind === kind);
  const edges = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
  const bins = [];
  for (let i = 0; i < edges.length - 1; i++) {
    const last = i === edges.length - 2;
    const inBand = rows.filter(
      (r) => r.probability >= edges[i] && (last ? r.probability <= edges[i + 1] : r.probability < edges[i + 1]),
    );
    if (!inBand.length) continue;
    bins.push({
      from: edges[i],
      to: edges[i + 1],
      n: inBand.length,
      units: new Set(inBand.map((r) => r.countryCode)).size,
      batches: new Set(inBand.map((r) => r.resolvedOn)).size,
      sumP: inBand.reduce((a, r) => a + r.probability, 0),
      hits: inBand.reduce((a, r) => a + r.outcome, 0),
    });
  }
  return bins;
}

describe('per-kind calibration bands, against the committed 2026-09-20 snapshot', () => {
  it('reads a real book', () => {
    expect(SNAPSHOT.resolved.length).toBeGreaterThan(1000);
    expect(scoredRows.length).toBeGreaterThan(1000);
    expect(Object.keys(out).sort()).toEqual(['censorship_event', 'fx_devaluation', 'seismicity_window']);
  });

  it.each(['fx_devaluation', 'censorship_event', 'seismicity_window'])(
    '%s bands match an independent recomputation exactly',
    (kind) => {
      const naive = naiveBands(kind);
      const got = out[kind].bands;
      expect(got.map((b) => [b.from, b.to, b.n, b.units, b.batches])).toEqual(
        naive.map((b) => [b.from, b.to, b.n, b.units, b.batches]),
      );
      for (let i = 0; i < naive.length; i++) {
        if (got[i].predicted === null) continue; // withheld bands publish no figures
        expect(got[i].predicted).toBeCloseTo(naive[i].sumP / naive[i].n, 12);
        expect(got[i].observed).toBeCloseTo(naive[i].hits / naive[i].n, 12);
      }
    },
  );

  it('NEVER pools across kinds — the whole reason bands are per-kind', () => {
    // FX runs cold in 0.1-0.2 and censorship runs blazing hot in the same
    // band. Pooled they cancel into a flattering figure describing neither.
    const fx = out.fx_devaluation.bands.find((b) => b.from === 0.1);
    const cen = out.censorship_event.bands.find((b) => b.from === 0.1);
    expect(fx).toBeDefined();
    expect(cen).toBeDefined();
    // Cold: observed ABOVE predicted. Hot: observed far BELOW predicted.
    expect(fx!.observed!).toBeGreaterThan(fx!.predicted!);
    expect(cen!.observed!).toBeLessThan(cen!.predicted!);
    // And they are genuinely different books, not a rounding difference.
    expect(Math.abs(fx!.observed! - cen!.observed!)).toBeGreaterThan(0.1);
  });

  it('withholds a band that lacks independent units, and says why', () => {
    const thin = Object.values(out)
      .flatMap((k) => k.bands)
      .filter((b) => b.units < 3);
    for (const b of thin) {
      expect(b.predicted).toBeNull();
      expect(b.observed).toBeNull();
      expect(b.withheld_because).toMatch(/independent unit/);
    }
  });

  it('withholds the seismicity control entirely, claiming no edge', () => {
    expect(out.seismicity_window.skill_vs_base_rate).toBeNull();
    expect(out.seismicity_window.skill_withheld_because).toMatch(/NO EDGE CLAIMED|batch|unit/);
  });

  it('batch records cover every resolution date exactly once, in order', () => {
    for (const kind of Object.keys(out)) {
      const dates = out[kind].batches_detail.map((b) => b.resolves_on);
      expect(new Set(dates).size).toBe(dates.length);
      expect([...dates].sort()).toEqual(dates);
      const total = out[kind].batches_detail.reduce((a, b) => a + b.n, 0);
      expect(total).toBe(scoredRows.filter((r) => r.kind === kind).length);
    }
  });

  it('the FX batch hit rate traces the U the design rests on', () => {
    // 43.9% on the first settlement, a trough near 6%, climbing back above
    // 50%. Sixty-five currencies moved together by the dollar against one
    // threshold rule — the reason a BATCH is the honest unit, not a country.
    const b = out.fx_devaluation.batches_detail;
    expect(b.length).toBeGreaterThanOrEqual(14);
    const rates = b.map((x) => x.hit_rate);
    const trough = Math.min(...rates);
    expect(rates[0]).toBeGreaterThan(0.35);
    expect(trough).toBeLessThan(0.1);
    expect(rates[rates.length - 1]).toBeGreaterThan(trough);
    // Every batch is one morning of many units, never one country.
    for (const x of b) expect(x.units).toBeGreaterThan(1);
  });
});
