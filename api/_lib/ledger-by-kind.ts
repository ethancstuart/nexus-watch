/**
 * Per-kind ledger figures, assembled so the COUNTS and the SCORES cannot be
 * confused for each other.
 *
 * WHY THIS IS ITS OWN MODULE. Until 2026-08-30 `api/calls/ledger.ts` built
 * `by_kind` by iterating the paged `open` and `resolved` arrays. The deployed
 * API therefore published `censorship_event.open: 3` against 312 real pending
 * censorship calls — six days before 39 of them resolved — `fx_devaluation`
 * at 197 against 523, and no `seismicity_window` entry at all, because none of
 * its 14 rows reached the first page. The per-kind numbers summed to exactly
 * 200: the page size.
 *
 * The file already carried the lesson thirty lines below the defect
 * ("COUNTS COME FROM COUNT(*), NEVER FROM THE PAGE"). It had been applied to
 * `counts` and not to `by_kind`, which is the ordinary way a fix half-lands.
 *
 * The distinction this module enforces:
 *
 *   COUNTS come from a GROUP BY over the whole table. A tally needs no row
 *   detail, so there is never a reason to derive one from a page.
 *
 *   SCORES come from fetched rows, because a Brier score needs each row's
 *   probability and base rate rather than a tally. The caller is expected to
 *   pass EVERY scored row, not a display page — `api/calls/ledger.ts` runs a
 *   dedicated unlimited query for exactly this.
 *
 * This module cannot verify that from the inside, so it does not take the
 * caller's word for it: `scoring_complete` is computed by comparing the rows
 * it was given against the count it was told, and **a score computed on an
 * incomplete set is withheld rather than published with a caveat**. That is
 * the same posture as `publishableSkill` — this ledger withholds numbers it
 * cannot stand behind instead of footnoting them, because a footnote does not
 * survive being quoted.
 */
import {
  brierScore,
  baseRate,
  independentUnits,
  resolutionBatches,
  publishableSkill,
  MIN_INDEPENDENT_UNITS,
  MIN_RESOLUTION_BATCHES,
  type ScoredCall,
} from './calls.js';

/** One row of the per-kind GROUP BY over `calls`. Counts, no row detail. */
export interface KindCountRow {
  kind: string;
  open: number;
  resolved: number;
  hits: number;
  unscored: number;
}

/** A fetched, scored call — carries what a Brier score needs. */
export interface ScoredRow {
  kind: string;
  countryCode: string;
  probability: number;
  baseRate?: number;
  outcome: 0 | 1;
  resolvedOn: string;
  /**
   * The outcome the EVIDENCE records, where it differs from the one that was
   * published. Set only for a call carrying a row in `call_corrections`;
   * undefined means published and evidence agree.
   *
   * This never replaces `outcome`. The published verdict is what the register
   * said and it is not rewritten — the two live side by side so the second
   * reading can be computed without touching the first.
   */
  correctedOutcome?: 0 | 1;
}

/**
 * The same kind, scored again on corrected evidence.
 *
 * WHY THIS IS A SEPARATE OBJECT AND NOT A REPLACEMENT. 54 calls were published
 * MISS that the evidence records as HIT — the collector stored one hour of each
 * day instead of the whole day, and the resolver scored a call's final day
 * before any evidence for it existed. Both are fixed forward. Neither verdict
 * is rewritten, because a register that edits settled calls is not a register.
 * So the headline stays as published and this sits beside it.
 *
 * THE BRIER IS EXACT AND THE SKILL IS NOT, and they are treated differently
 * for that reason. A Brier score needs only the stated probability and the
 * outcome, both of which are known exactly. A SKILL score is measured against
 * each unit's own long-run base rate — and those base rates were themselves
 * estimated from the same hourly-bucket evidence that produced the wrong
 * verdicts. Recomputing them requires `scripts/backfill-ooni-daily.ts --write`,
 * which has never been run and is the owner's call.
 *
 * Publishing a skill number against a benchmark known to be mis-estimated
 * would be exactly the kind of figure this module already refuses elsewhere,
 * so it is withheld with its reason attached rather than printed with a
 * footnote. A footnote does not survive being quoted.
 */
export interface CorrectedReading {
  /** Exact: stated probability against the outcome the evidence records. */
  brier: number | null;
  /** Hits under corrected evidence. */
  hits: number;
  /** How many of this kind's scored rows carry a correction. */
  corrections_applied: number;
  /** Withheld until base rates are rebuilt on corrected evidence. */
  skill_vs_base_rate: number | null;
  /** Why the skill number above is absent. Null when it is present. */
  skill_withheld_because: string | null;
}

export interface KindFigures {
  open: number;
  resolved: number;
  hits: number;
  unscored: number;
  brier: number | null;
  skill_vs_base_rate: number | null;
  units: number;
  batches: number;
  scored_rows_used: number;
  scoring_complete: boolean;
  /**
   * The second reading, on corrected evidence. Null when no call of this kind
   * carries a correction — which is the ordinary case and must not render as
   * a zeroed-out object that looks like a measurement.
   */
  corrected: CorrectedReading | null;
  /** Calibration by probability band, FOR THIS KIND ONLY. Never pooled. */
  bands: BandRecord[];
  /** One entry per resolution date. A scoreboard for a morning, not a parameter. */
  batches_detail: BatchRecord[];
  /** Fires when the hit rate and the skill point in opposite directions. */
  counter_reading: CounterReading | null;
  /** Why a skill figure is absent, in the reader's words. Null when present. */
  skill_withheld_because: string | null;
}

/**
 * One probability band's record, for ONE kind.
 *
 * `scoring.note` on this endpoint already forbids pooling across kinds, and
 * the pooled array currently rendered on the landing page is the reason it has
 * to: FX runs cold in the 0.1-0.2 band (0.169 predicted against 0.220
 * observed, 540 rows) while censorship runs blazing hot in the same band
 * (0.108 against 0.007, 145 rows). Averaged, they cancel into a flattering
 * 0.156/0.175 that describes neither. That is a self-graded accuracy figure
 * one level of indirection down.
 *
 * `units` prints beside `n` always. Thirty-seven rows over eight units is not
 * thirty-seven observations and the reader is entitled to see the difference.
 */
export interface BandRecord {
  from: number;
  to: number;
  n: number;
  units: number;
  batches: number;
  /** Mean stated probability in the band. Null when the band is withheld. */
  predicted: number | null;
  /** Realised frequency. Null when the band is withheld. */
  observed: number | null;
  /** Null when the band prints. Otherwise the reason, for display. */
  withheld_because: string | null;
}

/** One morning's settlement. A scoreboard, explicitly not an estimate. */
export interface BatchRecord {
  resolves_on: string;
  n: number;
  hits: number;
  hit_rate: number;
  units: number;
}

/**
 * THE CONTRADICTION THAT PRINTS ITSELF.
 *
 * Wherever a cohort's realised hit rate and its skill against climatology
 * point in opposite directions, the disagreement is surfaced in place rather
 * than letting either number stand alone.
 *
 * This is the exact guard that would have caught /api/accuracy/stats
 * publishing "90.3% accuracy" against -17% real skill — firing automatically
 * instead of waiting four months for somebody to run the comparison by hand.
 */
export interface CounterReading {
  hit_rate: number;
  mean_base_rate: number;
  skill: number;
  /** A sentence the surface can print verbatim. */
  reading: string;
}

const num = (v: number) => (Number.isFinite(v) ? v : null);

export function assembleByKind(counts: KindCountRow[], scoredRows: ScoredRow[]): Record<string, KindFigures> {
  const out: Record<string, KindFigures> = {};

  // Seeded from the COUNTS, so every kind in the table appears whether or not
  // its rows reached a page. Seeding from the fetched rows is what made
  // seismicity_window vanish from the response entirely.
  for (const r of counts) {
    out[r.kind] = {
      open: r.open,
      resolved: r.resolved,
      hits: r.hits,
      unscored: r.unscored,
      brier: null,
      skill_vs_base_rate: null,
      units: 0,
      batches: 0,
      scored_rows_used: 0,
      scoring_complete: true,
      corrected: null,
      bands: [],
      batches_detail: [],
      counter_reading: null,
      skill_withheld_because: null,
    };
  }

  // AN ORPHAN SCORED ROW IS AN INCONSISTENCY, NOT A ROUNDING ERROR.
  //
  // Both inputs are reads of the same table in the same request, so a scored
  // row whose kind is missing from the counts cannot happen — which is exactly
  // why it must not be handled by silently dropping the row. An independent
  // review caught the original: scoring iterated `Object.keys(out)`, seeded
  // only from `counts`, so any such row vanished without a trace.
  //
  // It becomes reachable the moment a caller passes a FILTERED count set — for
  // instance counts excluding calibration kinds beside unfiltered scored rows,
  // which is a plausible next change to this endpoint. At that point the
  // published Brier scores would quietly be computed on fewer rows than the
  // counts beside them claim, and nothing would say so.
  //
  // So it throws. The caller wraps this in a try/catch that returns 500, and
  // the SSR /ledger page does not go through here — so the cost of the loud
  // version is a JSON endpoint that fails visibly, against a silent version
  // that publishes a number nobody can stand behind.
  const known = new Set(Object.keys(out));
  const orphans = [...new Set(scoredRows.map((r) => r.kind))].filter((k) => !known.has(k));
  if (orphans.length > 0) {
    throw new Error(
      `assembleByKind: scored rows for kind(s) absent from the counts: ${orphans.join(', ')}. ` +
        'The two inputs disagree about the same table — refusing to publish per-kind figures ' +
        'that would silently exclude them.',
    );
  }

  for (const kind of Object.keys(out)) {
    const rows = scoredRows.filter((r) => r.kind === kind);
    const calls: ScoredCall[] = rows.map((r) => ({
      probability: r.probability,
      outcome: r.outcome,
      baseRate: r.baseRate,
    }));
    out[kind].units = independentUnits(rows.map((r) => r.countryCode));
    out[kind].batches = resolutionBatches(rows.map((r) => r.resolvedOn));
    out[kind].scored_rows_used = rows.length;
    out[kind].scoring_complete = rows.length >= out[kind].resolved;

    // WITHHOLD ON AN INCOMPLETE SET. A Brier over a truncated page is a real
    // number about a subset, and it will be read as a number about the book —
    // it sits on the same line as a whole-table count. An independent review
    // was right that labelling that is weaker than refusing it.
    //
    // Today the caller passes the whole set, so this branch does not fire.
    // That is the reason to write it rather than the reason to skip it: the
    // condition that would make it fire is someone repointing this at a paged
    // query, which is precisely how the defect this module exists to fix was
    // introduced in the first place.
    if (!out[kind].scoring_complete) continue;

    out[kind].brier = calls.length > 0 ? num(brierScore(calls)) : null;
    // Withheld until the kind has resolved across enough independent batches
    // AND enough independent units. Both axes, because one currency observed
    // on sixteen consecutive overlapping windows satisfies the first and is
    // still a single observation.
    out[kind].skill_vs_base_rate = num(publishableSkill({ calls, batches: out[kind].batches, units: out[kind].units }));
    out[kind].skill_withheld_because =
      out[kind].skill_vs_base_rate === null ? withheldReason(kind, out[kind].units, out[kind].batches) : null;

    out[kind].bands = bandRecords(rows);
    out[kind].batches_detail = batchRecords(rows);
    out[kind].counter_reading = counterReading(rows, out[kind].skill_vs_base_rate);

    // THE SECOND READING. Same rows, same stated probabilities, outcomes taken
    // from the evidence where a correction exists. Computed under the same
    // `scoring_complete` gate as the first — a corrected Brier over a partial
    // set would be as misleading as a published one, and more so for sitting
    // next to a number that is whole.
    const correctedCount = rows.filter((r) => r.correctedOutcome !== undefined).length;
    if (correctedCount > 0) {
      const correctedCalls: ScoredCall[] = rows.map((r) => ({
        probability: r.probability,
        outcome: r.correctedOutcome ?? r.outcome,
        baseRate: r.baseRate,
      }));
      out[kind].corrected = {
        brier: calls.length > 0 ? num(brierScore(correctedCalls)) : null,
        hits: correctedCalls.reduce((acc, c) => acc + c.outcome, 0),
        corrections_applied: correctedCount,
        // Deliberately not computed. See CorrectedReading: the reference these
        // would be scored against is each unit's base rate, and those were
        // estimated from the same evidence the corrections repair.
        skill_vs_base_rate: null,
        skill_withheld_because:
          'base rates are estimated from the same evidence these corrections repair; ' +
          'a skill number against that benchmark would not mean what it appears to',
      };
    }
  }

  return out;
}

/**
 * What moved, counted per DIRECTION rather than assumed from the first row.
 *
 * The first version of this line read the published verdict off `corrected[0]`
 * and asserted it of all of them — true today, when every correction is a MISS
 * the evidence records as a HIT, and silently false the first time a single
 * correction runs the other way. An independent review named it. A sentence
 * about a set is derived from the set.
 *
 * `corrected_status` is REQUIRED rather than nullable. A row with no correction
 * is not a correction, and accepting null here would let a caller hand one over
 * and get "records as " rendered into published copy. The caller narrows with a
 * type predicate, so the filter and this signature are checked against each
 * other by the compiler instead of by a comment.
 */
export function describeCorrections(rows: Array<{ status: string; corrected_status: string }>): string {
  const byDirection = new Map<string, number>();
  for (const r of rows) {
    const key = `${r.status.toUpperCase()}|${r.corrected_status.toUpperCase()}`;
    byDirection.set(key, (byDirection.get(key) ?? 0) + 1);
  }
  return [...byDirection]
    .sort((a, b) => b[1] - a[1])
    .map(([key, n]) => {
      const [published, evidence] = key.split('|');
      return `${n} call${n === 1 ? '' : 's'} published ${published} that the evidence records as ${evidence}`;
    })
    .join('; ');
}

/** The deciles a probability can fall in. Fixed, so a band cannot be chosen after the fact. */
const BAND_EDGES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];

/**
 * Why a figure is absent, phrased for a reader rather than a log.
 *
 * A withheld line is not a footnote and is never omitted — it prints in the
 * same face and size the number would have taken. "SKILL WITHHELD — 1
 * independent unit; needs 3" beside a probability is the most honest sentence
 * this product can write.
 */
function withheldReason(kind: string, units: number, batches: number): string {
  if (CALIBRATION_KIND_HINT.test(kind)) return 'NO EDGE CLAIMED — THIS IS THE BASE RATE.';
  if (units < MIN_INDEPENDENT_UNITS) {
    return `${units} independent unit${units === 1 ? '' : 's'}; needs ${MIN_INDEPENDENT_UNITS}.`;
  }
  if (batches < MIN_RESOLUTION_BATCHES) {
    return `${batches} resolution batch${batches === 1 ? '' : 'es'}; needs ${MIN_RESOLUTION_BATCHES}.`;
  }
  return 'every row stated at its own base rate — the result is an identity, not a measurement.';
}

/**
 * A control kind claims no edge by construction, so its absence of skill is
 * not a shortfall to apologise for. Matched by name rather than imported from
 * CALIBRATION_KINDS so this module keeps taking its scope from its inputs.
 */
const CALIBRATION_KIND_HINT = /seismicity|calibration|control/i;

/** Per-band record for ONE kind. Never pooled — see BandRecord. */
function bandRecords(rows: ScoredRow[]): BandRecord[] {
  const out: BandRecord[] = [];
  for (let i = 0; i < BAND_EDGES.length - 1; i++) {
    const from = BAND_EDGES[i];
    const to = BAND_EDGES[i + 1];
    // Upper edge inclusive only in the last band, so 1.0 has a home and no
    // probability is counted twice.
    const inBand = rows.filter(
      (r) => r.probability >= from && (i === BAND_EDGES.length - 2 ? r.probability <= to : r.probability < to),
    );
    if (inBand.length === 0) continue; // an empty band is not a row of zeroes
    const units = independentUnits(inBand.map((r) => r.countryCode));
    const batches = resolutionBatches(inBand.map((r) => r.resolvedOn));
    const publishable = units >= MIN_INDEPENDENT_UNITS && batches >= MIN_RESOLUTION_BATCHES;
    out.push({
      from,
      to,
      n: inBand.length,
      units,
      batches,
      predicted: publishable ? inBand.reduce((a, r) => a + r.probability, 0) / inBand.length : null,
      observed: publishable ? inBand.reduce((a, r) => a + r.outcome, 0) / inBand.length : null,
      withheld_because: publishable ? null : withheldReason('', units, batches),
    });
  }
  return out;
}

/**
 * One entry per resolution date.
 *
 * A batch is a scoreboard for one morning, NOT an estimate of a parameter —
 * everything in it shares a resolver, a date, and whatever the world happened
 * to do that fortnight. FX hit rate by date traces a clean U (43.9% on
 * 2026-09-06, 6.2% at the trough, 55.4% on 09-21) because sixty-five
 * currencies are being moved together by the dollar against one threshold
 * rule. That shape is the single most informative thing in the book and it is
 * invisible in any per-country view.
 */
function batchRecords(rows: ScoredRow[]): BatchRecord[] {
  const byDate = new Map<string, ScoredRow[]>();
  for (const r of rows) {
    if (!r.resolvedOn) continue;
    const list = byDate.get(r.resolvedOn);
    if (list) list.push(r);
    else byDate.set(r.resolvedOn, [r]);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([resolves_on, list]) => {
      const hits = list.reduce((a, r) => a + r.outcome, 0);
      return {
        resolves_on,
        n: list.length,
        hits,
        hit_rate: list.length > 0 ? hits / list.length : 0,
        units: independentUnits(list.map((r) => r.countryCode)),
      };
    });
}

/**
 * The contradiction that prints itself. See CounterReading.
 *
 * Null when the two readings agree, or when either is unavailable — a
 * contradiction cannot be asserted between a number and an absence.
 */
function counterReading(rows: ScoredRow[], skill: number | null): CounterReading | null {
  if (skill === null || rows.length === 0) return null;
  const withBase = rows.filter((r) => r.baseRate !== undefined && Number.isFinite(r.baseRate));
  if (withBase.length === 0) return null;
  const hitRate = baseRate(rows.map((r) => ({ probability: r.probability, outcome: r.outcome })));
  const meanBase = withBase.reduce((a, r) => a + (r.baseRate as number), 0) / withBase.length;
  if (!Number.isFinite(hitRate)) return null;

  const flatteringHitRate = hitRate > meanBase && skill < 0;
  const unflatteringHitRate = hitRate < meanBase && skill > 0;
  if (!flatteringHitRate && !unflatteringHitRate) return null;

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  return {
    hit_rate: hitRate,
    mean_base_rate: meanBase,
    skill,
    reading: flatteringHitRate
      ? `${pct(hitRate)} of these landed against a ${pct(meanBase)} base rate, and the skill against that baseline is still ${(skill * 100).toFixed(1)}%. The hit rate is the easier number and it is the misleading one.`
      : `${pct(hitRate)} of these landed against a ${pct(meanBase)} base rate, yet the skill against that baseline is ${(skill * 100).toFixed(1)}%. A low hit rate on hard calls can still beat the baseline.`,
  };
}
