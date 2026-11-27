/**
 * The read-out of docs/preregistration/2026-12-fx-skill.md, recomputed from a
 * ledger snapshot. It reads one file: no network, no database.
 *
 * SELF-CONTAINED ON PURPOSE. The document pins the read-out to this file as it
 * stands in the first commit on `main` that contains the document, so every
 * definition the read-out uses is written here and the file imports nothing
 * but Node built-ins. A later change to api/_lib/calls.ts, or to this file,
 * cannot reach the read-out except through a dated amendment. Run the pinned
 * copy from the repository root:
 *
 *   C=$(git log --first-parent --diff-filter=A --format=%H origin/main -- docs/preregistration/2026-12-fx-skill.md)
 *   git show "${C}:scripts/fx-cohort-skill.ts" > /tmp/fx-readout.ts
 *   npx tsx /tmp/fx-readout.ts ledger-snapshots/2027-03-01.json --cohorts 5   # interim
 *   npx tsx /tmp/fx-readout.ts ledger-snapshots/2027-06-21.json               # final
 *
 * It also reads every earlier dated snapshot beside the one given and reports
 * the in-scope calls whose status differs from their first terminal one: the
 * daily snapshots are the record's tamper evidence, and the count should be 0.
 *
 * fx-cohort-skill.test.ts checks that these definitions agree with
 * api/_lib/calls.ts (scored statuses, the 3-date gate, the grace period, the
 * skill arithmetic) for as long as the two live side by side.
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PREREG_START = '2026-12-01';
/** Last call day of the last cohort. A read-out ending here is the final one. */
export const PREREG_END = '2027-05-31';
export const PREREG_COHORTS = 13;
export const COHORT_DAYS = 14;
/** An FX call's window (api/cron/record-calls.ts). */
export const FX_HORIZON_DAYS = 14;
/** Days after resolves_on before a held call is settled UNRESOLVABLE (UNRESOLVABLE_GRACE_DAYS). */
export const GRACE_DAYS = 7;
/** The verdicts that carry an outcome (SCORED_STATUSES). */
export const SCORED: ReadonlySet<string> = new Set(['hit', 'miss']);
/** A cohort needs this many distinct resolves_on dates for an S_k (MIN_RESOLUTION_BATCHES). */
export const MIN_RESOLUTION_DATES = 3;
/** The pre-stated sensitivity analysis leaves out every call with these country codes. Fixed. */
export const SENSITIVITY_EXCLUDED: readonly string[] = ['VE', 'ZW', 'LK', 'ET'];

/** t(0.975, df) for df = 1..30: the two-sided 95% Student t quantile. */
const T975 = [
  12.7062, 4.3027, 3.1824, 2.7764, 2.5706, 2.4469, 2.3646, 2.306, 2.2622, 2.2281, 2.201, 2.1788, 2.1604, 2.1448, 2.1314,
  2.1199, 2.1098, 2.1009, 2.093, 2.086, 2.0796, 2.0739, 2.0687, 2.0639, 2.0595, 2.0555, 2.0518, 2.0484, 2.0452, 2.0423,
];

export interface SnapshotRow {
  id?: string;
  kind: string;
  country_code: string;
  probability: number;
  base_rate: number | null;
  made_on: string;
  resolves_on: string;
  status: string;
  correction?: { corrected_status?: string | null } | null;
}

export interface Snapshot {
  open: SnapshotRow[];
  resolved: SnapshotRow[];
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

/** Cohort k covers made_on from start + 14(k-1) to start + 14k - 1, and is settled 21 days after its last day. */
export function cohortCalendar(start: string, count: number) {
  return Array.from({ length: count }, (_, i) => {
    const first = addDays(start, COHORT_DAYS * i);
    const last = addDays(first, COHORT_DAYS - 1);
    return { cohort: i + 1, first, last, settledBy: addDays(last, FX_HORIZON_DAYS + GRACE_DAYS) };
  });
}

export interface Scored {
  p: number;
  b: number;
  y: 0 | 1;
  resolvesOn: string;
}

/**
 * S_k in points, or NaN when the document's §4 gives no S_k: no scored call,
 * fewer than 3 distinct resolves_on dates, every call at p = b, or Σ(b − y)² = 0.
 */
export function cohortSkill(rows: Scored[]): number {
  if (rows.length === 0) return NaN;
  if (new Set(rows.map((r) => r.resolvesOn)).size < MIN_RESOLUTION_DATES) return NaN;
  if (rows.every((r) => r.p === r.b)) return NaN;
  const ref = rows.reduce((a, r) => a + (r.b - r.y) ** 2, 0);
  if (ref === 0) return NaN;
  return 100 * (1 - rows.reduce((a, r) => a + (r.p - r.y) ** 2, 0) / ref);
}

export interface CohortResult {
  cohort: number;
  first: string;
  last: string;
  scored: number;
  hits: number;
  /** S_k in points; NaN when there is none. */
  skill: number;
}

/**
 * Per-cohort skill over the scored FX calls in scope. Every other call in scope
 * is counted under its reason and never summed. The main test uses the
 * published verdict. `corrected` swaps in a HIT↔MISS correction; any other
 * correction in scope is only counted, by type.
 */
export function cohortSkills(
  snap: Snapshot,
  opts: { start: string; cohorts: number; without?: readonly string[]; corrected?: boolean },
) {
  const cal = cohortCalendar(opts.start, opts.cohorts);
  const end = cal[cal.length - 1].last;
  const without = new Set(opts.without ?? []);
  const excluded: Record<string, number> = {};
  const otherCorrections: Record<string, number> = {};
  const byCohort = cal.map(() => [] as Scored[]);
  let flips = 0;
  // One call is one row: a call listed in both lists counts once, as resolved.
  const rows = new Map<string, SnapshotRow>();
  [...snap.open, ...snap.resolved].forEach((r, i) => rows.set(r.id ?? `row-${i}`, r));
  for (const r of rows.values()) {
    if (r.kind !== 'fx_devaluation' || r.made_on < opts.start || r.made_on > end || without.has(r.country_code))
      continue;
    const to = r.correction?.corrected_status ?? null;
    const flip = to !== null && SCORED.has(r.status) && SCORED.has(to) && to !== r.status;
    if (flip) flips++;
    else if (to !== null) otherCorrections[`${r.status}->${to}`] = (otherCorrections[`${r.status}->${to}`] ?? 0) + 1;
    const noBase = typeof r.base_rate !== 'number' || !Number.isFinite(r.base_rate);
    const why = !SCORED.has(r.status) ? r.status : noBase ? 'no base_rate' : null;
    if (why) {
      excluded[why] = (excluded[why] ?? 0) + 1;
      continue;
    }
    const verdict = opts.corrected && flip ? to : r.status;
    const k = Math.floor((Date.parse(r.made_on) - Date.parse(opts.start)) / 86_400_000 / COHORT_DAYS);
    byCohort[k].push({
      p: r.probability,
      b: r.base_rate as number,
      y: verdict === 'hit' ? 1 : 0,
      resolvesOn: r.resolves_on,
    });
  }
  const cohorts: CohortResult[] = cal.map((c, i) => ({
    cohort: c.cohort,
    first: c.first,
    last: c.last,
    scored: byCohort[i].length,
    hits: byCohort[i].filter((x) => x.y === 1).length,
    skill: cohortSkill(byCohort[i]),
  }));
  return { cohorts, excluded, flips, otherCorrections };
}

/** Mean of the cohort skills that exist, their SD, and the 95% t-interval. */
export function tInterval(values: number[]) {
  const v = values.filter(Number.isFinite);
  const k = v.length;
  if (k < 2 || k - 1 > T975.length) return { k, mean: NaN, sd: NaN, halfWidth: NaN, lower: NaN, upper: NaN };
  const mean = v.reduce((a, b) => a + b, 0) / k;
  const sd = Math.sqrt(v.reduce((a, x) => a + (x - mean) ** 2, 0) / (k - 1));
  const halfWidth = (T975[k - 2] * sd) / Math.sqrt(k);
  return { k, mean, sd, halfWidth, lower: mean - halfWidth, upper: mean + halfWidth };
}

type Interval = { lower: number; upper: number; halfWidth: number };
const range = (iv: Interval) => `${iv.lower.toFixed(2)} to ${iv.upper.toFixed(2)} points`;

/**
 * The document's §9 answer, on unrounded bounds. Only the final read-out
 * (`isFinalReadout`) applies the stop and claim rules; an interim one never
 * does. A claim states the sensitivity interval in the same sentence.
 */
export function decision(iv: Interval, final: boolean, sensitivity: Interval): string {
  if (!Number.isFinite(iv.halfWidth)) return 'no skill detected; too few cohorts to measure';
  const none = `no skill detected at ±${iv.halfWidth.toFixed(1)} points`;
  if (!final) return iv.upper < 0 || iv.lower > 0 ? 'the interval excludes 0; the final read-out decides' : none;
  if (iv.upper < 0) return 'upper bound below 0: stop issuing FX calls';
  if (iv.lower > 0) {
    return (
      `lower bound above 0: the forecast beat its stored base rate, 95% interval ${range(iv)}, ` +
      (Number.isFinite(sensitivity.halfWidth)
        ? `and ${range(sensitivity)} without ${SENSITIVITY_EXCLUDED.join(', ')}`
        : `and no sensitivity interval without ${SENSITIVITY_EXCLUDED.join(', ')} (fewer than 2 cohorts)`)
    );
  }
  return none;
}

const SNAPSHOT_NAME = /^(\d{4}-\d{2}-\d{2})\.json$/;

/** The final read-out's date (§7): the day cohort 13 is settled, 2027-06-21. */
export const FINAL_READOUT_DATE = cohortCalendar(PREREG_START, PREREG_COHORTS)[PREREG_COHORTS - 1].settledBy;

/**
 * Is this the final read-out? Decided by the snapshot's date, so that a test
 * cut short under §10 (fewer cohorts) still gets §9's final rule on 21 Jun
 * 2027. Only a snapshot without a dated name falls back to the cohorts read:
 * final when they end on PREREG_END.
 */
export function isFinalReadout(path: string, start: string, count: number): boolean {
  const dated = basename(path).match(SNAPSHOT_NAME)?.[1];
  if (dated) return dated >= FINAL_READOUT_DATE;
  return start >= PREREG_START && cohortCalendar(start, count)[count - 1].last === PREREG_END;
}

type Scope = { start: string; end: string };
const inScopeOf = (scope: Scope) => (r: SnapshotRow) =>
  r.kind === 'fx_devaluation' && r.made_on >= scope.start && r.made_on <= scope.end && r.id !== undefined;

/**
 * Fold one earlier snapshot into `firstTerminal` (id -> first terminal status).
 * Snapshots are folded oldest first, one at a time, and dropped: the map is
 * all that is kept, so memory is bounded by the calls in scope, not by the
 * number of snapshots read.
 */
export function foldFirstTerminal(firstTerminal: Map<string, string>, h: Snapshot, scope: Scope): void {
  const inScope = inScopeOf(scope);
  for (const r of h.resolved) {
    if (inScope(r) && r.status !== 'pending' && !firstTerminal.has(r.id as string)) {
      firstTerminal.set(r.id as string, r.status);
    }
  }
}

/** The tamper check over snapshot files, read and folded one at a time, oldest first. */
export function statusChangesFromFiles(snap: Snapshot, files: string[], scope: Scope) {
  const firstTerminal = new Map<string, string>();
  for (const f of files) foldFirstTerminal(firstTerminal, JSON.parse(readFileSync(f, 'utf8')) as Snapshot, scope);
  return compareToFirstTerminal(snap, firstTerminal, scope);
}

/**
 * The tamper check: in-scope calls whose status in `snap` differs from their
 * status in the first earlier snapshot where they were terminal (not pending).
 * `history` is every earlier snapshot, oldest first. It should come back empty.
 */
export function statusChanges(snap: Snapshot, history: Snapshot[], scope: Scope) {
  const firstTerminal = new Map<string, string>();
  for (const h of history) foldFirstTerminal(firstTerminal, h, scope);
  return compareToFirstTerminal(snap, firstTerminal, scope);
}

function compareToFirstTerminal(
  snap: Snapshot,
  firstTerminal: Map<string, string>,
  scope: Scope,
): Array<{ id: string; first: string; now: string }> {
  const inScope = inScopeOf(scope);
  const now = new Map<string, string>();
  for (const r of [...snap.open, ...snap.resolved]) if (inScope(r)) now.set(r.id as string, r.status);
  const changed: Array<{ id: string; first: string; now: string }> = [];
  for (const [id, first] of firstTerminal) {
    const status = now.get(id) ?? 'absent';
    if (status !== first) changed.push({ id, first, now: status });
  }
  return changed;
}

/** Earlier daily snapshots beside `path`, dated from `from` up to the day before it, oldest first. */
export function earlierSnapshots(path: string, from: string): string[] {
  const own = basename(path).match(SNAPSHOT_NAME)?.[1];
  if (!own) return [];
  return readdirSync(dirname(path))
    .filter((f) => SNAPSHOT_NAME.test(f) && f.slice(0, 10) >= from && f.slice(0, 10) < own)
    .sort()
    .map((f) => join(dirname(path), f));
}

function main(argv: string[]): void {
  const flag = (name: string) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const path = argv[0];
  if (!path || path.startsWith('--'))
    throw new Error('usage: fx-cohort-skill.ts <snapshot.json> [--start] [--cohorts]');
  const start = flag('--start') ?? PREREG_START;
  const count = Number(flag('--cohorts') ?? PREREG_COHORTS);
  const raw = readFileSync(path);
  const snap = JSON.parse(raw.toString('utf8')) as Snapshot & { generated_at?: string };
  const cal = cohortCalendar(start, count);
  const final = isFinalReadout(path, start, count);
  console.log(
    `${path}: generated ${snap.generated_at ?? 'UNKNOWN'}, sha256 ${createHash('sha256').update(raw).digest('hex')}`,
  );
  console.log(`cohorts from ${start}, ${count} of them; ${final ? 'FINAL' : 'interim'} read-out`);

  const runs: Array<[string, readonly string[]]> = [
    ['main test, all FX calls', []],
    [`sensitivity, without ${SENSITIVITY_EXCLUDED.join(', ')} (decides nothing)`, SENSITIVITY_EXCLUDED],
  ];
  const intervals = runs.map(([label, without]) => {
    const r = cohortSkills(snap, { start, cohorts: count, without });
    const iv = tInterval(r.cohorts.map((c) => c.skill));
    console.log(`\n${label}`);
    for (const c of r.cohorts) {
      console.log(
        `  ${c.cohort} ${c.first}..${c.last}: ${c.scored} scored, ${c.hits} hits, skill ${c.skill.toFixed(2)}`,
      );
    }
    console.log(`  excluded, not summed: ${JSON.stringify(r.excluded)}`);
    console.log(`  corrections: ${r.flips} HIT<->MISS; others by type ${JSON.stringify(r.otherCorrections)}`);
    console.log(
      `  K ${iv.k}, mean ${iv.mean.toFixed(2)}, SD ${iv.sd.toFixed(2)}, ` +
        `95% interval ${iv.lower.toFixed(2)} .. ${iv.upper.toFixed(2)} (±${iv.halfWidth.toFixed(2)})`,
    );
    if (r.flips > 0) {
      const civ = tInterval(
        cohortSkills(snap, { start, cohorts: count, without, corrected: true }).cohorts.map((c) => c.skill),
      );
      console.log(`  on corrected outcomes: ${civ.lower.toFixed(2)} .. ${civ.upper.toFixed(2)} (decides nothing)`);
    }
    return iv;
  });
  const pending = cohortSkills(snap, { start, cohorts: count }).excluded.pending ?? 0;
  console.log(
    `\npending in the cohorts read: ${pending}` +
      (pending > 0
        ? ' (§7: use the first later snapshot with none, or the one dated 14 days later, excluding those pending)'
        : ''),
  );
  console.log(`answer: ${decision(intervals[0], final, intervals[1])}`);

  const files = earlierSnapshots(path, start);
  if (files.length === 0) {
    console.log('status check: NOT RUN, no earlier dated snapshot beside this one');
    return;
  }
  const changed = statusChangesFromFiles(snap, files, { start, end: cal[count - 1].last });
  console.log(
    `status check: ${changed.length} in-scope calls differ from their first terminal status ` +
      `(${files.length} earlier snapshots, ${basename(files[0])} to ${basename(files[files.length - 1])}; should be 0)`,
  );
  for (const c of changed.slice(0, 20)) console.log(`  call ${c.id}: first ${c.first}, now ${c.now}`);
}

// Compared through realpath: /tmp and the macOS temp dirs are symlinks, and Node
// reports the module's resolved path, so a plain comparison would skip main.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2));
}
