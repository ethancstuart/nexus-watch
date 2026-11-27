import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GRACE_DAYS,
  MIN_RESOLUTION_DATES,
  PREREG_COHORTS,
  PREREG_START,
  SCORED,
  SENSITIVITY_EXCLUDED,
  cohortSkill,
  cohortSkills,
  decision,
  isFinalReadout,
  statusChanges,
  statusChangesFromFiles,
  tInterval,
  type Snapshot,
  type SnapshotRow,
} from './fx-cohort-skill.js';
import {
  MIN_RESOLUTION_BATCHES,
  SCORED_STATUSES,
  UNRESOLVABLE_GRACE_DAYS,
  publishableSkill,
} from '../api/_lib/calls.js';

/**
 * The FX pre-registration's read-out must be reproducible from a committed
 * snapshot, by a script whose definitions cannot drift with the live code:
 * the document pins this file as it stands when the document merges, so it
 * imports nothing but Node built-ins, and these tests hold its definitions
 * equal to api/_lib/calls.ts for as long as both exist. Fixtures are
 * synthetic except the first case.
 */
const ROOT = process.cwd();
const SCRIPT = join(ROOT, 'scripts', 'fx-cohort-skill.ts');
const TSX = join(ROOT, 'node_modules', '.bin', 'tsx');

const row = (over: Partial<SnapshotRow>): SnapshotRow => ({
  kind: 'fx_devaluation',
  country_code: 'TR',
  probability: 0.3,
  base_rate: 0.25,
  made_on: '2026-12-01',
  resolves_on: '2026-12-15',
  status: 'miss',
  correction: null,
  ...over,
});
/** Three scored calls on three distinct resolves_on dates: enough for an S_k. */
const three = (over: Partial<SnapshotRow> = {}) =>
  [0, 1, 2].map((j) => row({ resolves_on: `2026-12-1${5 + j}`, status: j === 0 ? 'hit' : 'miss', ...over }));

describe('fx-cohort-skill', () => {
  it('reproduces the five historical fortnights from the committed 22 Nov snapshot', () => {
    // The document's §8 cites the 26 Nov snapshot (origin/main 15ebfe1). Its five
    // fortnights are identical to these; that file is not in this commit's tree.
    const snap = JSON.parse(readFileSync(join(ROOT, 'ledger-snapshots/2026-11-22.json'), 'utf8')) as Snapshot;
    const r = cohortSkills(snap, { start: '2026-08-23', cohorts: 5 });
    expect(r.cohorts.map((c) => Number(c.skill.toFixed(2)))).toEqual([1.29, -11.33, 0.36, -2.7, -1.32]);
    expect(r.cohorts.map((c) => c.scored)).toEqual([911, 910, 934, 940, 938]);
    const iv = tInterval(r.cohorts.map((c) => c.skill));
    expect([iv.sd, iv.lower, iv.upper].map((x) => Number(x.toFixed(2)))).toEqual([5.04, -9.0, 3.52]);
  });

  it('assigns cohorts by made_on, 14 days from 1 Dec 2026, and nothing outside them', () => {
    const days = ['2026-11-30', '2026-12-14', '2026-12-15', '2027-05-31', '2027-06-01'];
    const rows = days.flatMap((d) => three({ made_on: d }));
    const r = cohortSkills({ open: [], resolved: rows }, { start: PREREG_START, cohorts: PREREG_COHORTS });
    const scored = r.cohorts.map((c) => c.scored);
    expect(scored[0]).toBe(3); // 14 Dec is the last day of cohort 1
    expect(scored[1]).toBe(3); // 15 Dec is the first day of cohort 2
    expect(scored[12]).toBe(3); // 31 May 2027 is the last day of cohort 13
    expect(scored.reduce((a, b) => a + b, 0)).toBe(9); // 30 Nov and 1 Jun are out of scope
  });

  it('counts, and never sums, every call the document excludes; a call listed twice counts once', () => {
    const scoredRows = three().map((r, i) => ({ ...r, id: `s${i}` }));
    const snap: Snapshot = {
      open: [row({ id: 'p', status: 'pending' }), { ...scoredRows[0], status: 'pending' }],
      resolved: [
        ...scoredRows,
        row({ status: 'unresolvable', probability: 0.99 }),
        row({ status: 'void', probability: 0.99 }),
        row({ base_rate: null }),
        row({ kind: 'censorship_event' }),
      ],
    };
    const r = cohortSkills(snap, { start: PREREG_START, cohorts: 1 });
    expect(r.excluded).toEqual({ pending: 1, unresolvable: 1, void: 1, 'no base_rate': 1 });
    expect(r.cohorts[0].scored).toBe(3);
    const alone = cohortSkills({ open: [], resolved: scoredRows }, { start: PREREG_START, cohorts: 1 });
    expect(r.cohorts[0].skill).toBe(alone.cohorts[0].skill);
  });

  it('the sensitivity analysis drops exactly country codes VE, ZW, LK and ET', () => {
    expect([...SENSITIVITY_EXCLUDED]).toEqual(['VE', 'ZW', 'LK', 'ET']);
    const rows = ['VE', 'ZW', 'LK', 'ET', 'AR', 'NG'].flatMap((cc) => three({ country_code: cc }));
    const r = cohortSkills(
      { open: [], resolved: rows },
      { start: PREREG_START, cohorts: 1, without: SENSITIVITY_EXCLUDED },
    );
    expect(r.cohorts[0].scored).toBe(6);
  });

  it('uses published verdicts; a HIT<->MISS correction only on the corrected line; others only counted', () => {
    const rows = [
      ...three().map((r, i) => (i === 1 ? { ...r, correction: { corrected_status: 'hit' } } : r)),
      row({ status: 'unresolvable', correction: { corrected_status: 'hit' } }),
      row({ status: 'miss', resolves_on: '2026-12-18', correction: { corrected_status: 'void' } }),
    ];
    const snap = { open: [], resolved: rows };
    const published = cohortSkills(snap, { start: PREREG_START, cohorts: 1 });
    const corrected = cohortSkills(snap, { start: PREREG_START, cohorts: 1, corrected: true });
    expect(published.flips).toBe(1);
    expect(published.otherCorrections).toEqual({ 'unresolvable->hit': 1, 'miss->void': 1 });
    expect(published.cohorts[0]).toMatchObject({ scored: 4, hits: 1 });
    expect(corrected.cohorts[0]).toMatchObject({ scored: 4, hits: 2 });
  });

  it('gives no S_k below 3 distinct resolves_on dates, or when every call is at p = b', () => {
    const r = (resolvesOn: string, p = 0.3) => ({ p, b: 0.25, y: 0 as const, resolvesOn });
    expect(cohortSkill([])).toBeNaN();
    expect(cohortSkill([r('2026-12-15'), r('2026-12-15'), r('2026-12-16')])).toBeNaN();
    expect(cohortSkill([r('2026-12-15', 0.25), r('2026-12-16', 0.25), r('2026-12-17', 0.25)])).toBeNaN();
    expect(cohortSkill([r('2026-12-15'), r('2026-12-16'), r('2026-12-17')])).toBeCloseTo(-44, 9);
  });

  it('its definitions agree with api/_lib/calls.ts', () => {
    expect([...SCORED].sort()).toEqual([...SCORED_STATUSES].sort());
    expect(MIN_RESOLUTION_DATES).toBe(MIN_RESOLUTION_BATCHES);
    expect(GRACE_DAYS).toBe(UNRESOLVABLE_GRACE_DAYS);
    // Same arithmetic and gate as publishableSkill, with batches = distinct resolves_on.
    let seed = 20261201;
    const rand = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
    for (let n = 0; n < 300; n++) {
      const rows = Array.from({ length: 1 + Math.floor(rand() * 12) }, () => {
        const b = Math.round(rand() * 8 + 1) / 10;
        return {
          p: rand() < 0.3 ? b : Math.round(rand() * 98 + 1) / 100,
          b,
          y: (rand() < 0.3 ? 1 : 0) as 0 | 1,
          resolvesOn: `2026-12-1${Math.floor(rand() * 5)}`,
        };
      });
      const gated = publishableSkill({
        calls: rows.map((x) => ({ probability: x.p, outcome: x.y, baseRate: x.b })),
        batches: new Set(rows.map((x) => x.resolvesOn)).size,
      });
      const mine = cohortSkill(rows);
      if (Number.isNaN(gated)) expect(mine).toBeNaN();
      else expect(mine).toBeCloseTo(gated * 100, 9);
    }
  });

  it('the interim never applies the stop or claim rule; the final read-out does', () => {
    const sens = { lower: -0.5, upper: 4.25, halfWidth: 2.375 };
    const below = { lower: -5, upper: -0.004, halfWidth: 2.5 };
    const above = { lower: 0.1, upper: 5, halfWidth: 2.45 };
    const across = { lower: -2, upper: 2, halfWidth: 2 };
    expect(decision(below, false, sens)).toBe('the interval excludes 0; the final read-out decides');
    expect(decision(above, false, sens)).toBe('the interval excludes 0; the final read-out decides');
    expect(decision(across, false, sens)).toBe('no skill detected at ±2.0 points');
    expect(decision(below, true, sens)).toBe('upper bound below 0: stop issuing FX calls');
    expect(decision(across, true, sens)).toBe('no skill detected at ±2.0 points');
    for (const final of [false, true]) {
      expect(decision(tInterval([1]), final, sens)).toBe('no skill detected; too few cohorts to measure');
    }
    expect(tInterval([1, NaN, 3]).k).toBe(2);
    expect(tInterval([1, 2, 3, 4, 5]).halfWidth).toBeCloseTo((2.7764 * Math.sqrt(2.5)) / Math.sqrt(5), 6);
  });

  it('a skill claim states the sensitivity interval in the same sentence', () => {
    const claim = decision({ lower: 0.1, upper: 5, halfWidth: 2.45 }, true, {
      lower: -0.5,
      upper: 4.25,
      halfWidth: 2.375,
    });
    expect(claim).toBe(
      'lower bound above 0: the forecast beat its stored base rate, 95% interval 0.10 to 5.00 points, ' +
        'and -0.50 to 4.25 points without VE, ZW, LK, ET',
    );
    const lone = decision({ lower: 0.1, upper: 5, halfWidth: 2.45 }, true, tInterval([1]));
    expect(lone).toContain('and no sensitivity interval without VE, ZW, LK, ET (fewer than 2 cohorts)');
    expect(lone).not.toMatch(/NaN/);
  });

  it('the final read-out is decided by the snapshot date, so a test cut short still gets the final rule', () => {
    // §10 can end the test early (--cohorts 9); §9 still applies on 21 Jun 2027.
    expect(isFinalReadout('ledger-snapshots/2027-06-21.json', PREREG_START, 9)).toBe(true);
    expect(isFinalReadout('ledger-snapshots/2027-07-05.json', PREREG_START, 13)).toBe(true);
    expect(isFinalReadout('ledger-snapshots/2027-06-20.json', PREREG_START, 13)).toBe(false);
    expect(isFinalReadout('ledger-snapshots/2027-03-01.json', PREREG_START, 5)).toBe(false);
    // A late merge reads 12 cohorts from 15 Dec; still final on the date.
    expect(isFinalReadout('ledger-snapshots/2027-06-21.json', '2026-12-15', 12)).toBe(true);
    // Only an undated file falls back to the cohorts read.
    expect(isFinalReadout('/tmp/x.json', PREREG_START, 13)).toBe(true);
    expect(isFinalReadout('/tmp/x.json', PREREG_START, 5)).toBe(false);
  });

  it('pending counts only calls in the cohorts being read out (§7)', () => {
    const snap: Snapshot = {
      open: [
        row({ id: 'in5', made_on: '2027-02-08', status: 'pending' }), // last day of cohort 5
        row({ id: 'in6', made_on: '2027-02-09', status: 'pending' }), // first day of cohort 6
      ],
      resolved: three(),
    };
    expect(cohortSkills(snap, { start: PREREG_START, cohorts: 5 }).excluded).toEqual({ pending: 1 });
    expect(cohortSkills(snap, { start: PREREG_START, cohorts: 4 }).excluded).toEqual({});
  });

  it('counts in-scope calls whose status moved since their first terminal snapshot', () => {
    const scope = { start: PREREG_START, end: '2027-05-31' };
    const a = row({ id: 'a', status: 'hit' });
    const b = row({ id: 'b', status: 'miss' });
    const c = row({ id: 'c', status: 'pending' });
    const out = row({ id: 'o', status: 'hit', made_on: '2026-11-30' });
    const day1: Snapshot = { open: [c], resolved: [a, b, out] };
    const day2: Snapshot = {
      open: [],
      resolved: [{ ...a, status: 'miss' }, b, { ...c, status: 'unresolvable' }, { ...out, status: 'miss' }],
    };
    expect(statusChanges(day2, [day1], scope)).toEqual([{ id: 'a', first: 'hit', now: 'miss' }]);
    expect(statusChanges(day1, [day1], scope)).toEqual([]);
    // A call that disappears is a change too.
    expect(statusChanges({ open: [], resolved: [a] }, [day1], scope)).toEqual([
      { id: 'b', first: 'miss', now: 'absent' },
    ]);
  });

  it('streams earlier snapshots one at a time with the same result as holding them all', () => {
    // Fixtures: three dated files, one flip and one call settled late.
    const scope = { start: PREREG_START, end: '2027-05-31' };
    const a = row({ id: 'a', status: 'hit' });
    const b = row({ id: 'b', status: 'pending' });
    const days: Snapshot[] = [
      { open: [b], resolved: [a] },
      { open: [], resolved: [a, { ...b, status: 'miss' }] },
      {
        open: [],
        resolved: [
          { ...a, status: 'miss' },
          { ...b, status: 'miss' },
        ],
      },
    ];
    const dir = mkdtempSync(join(tmpdir(), 'fx-stream-'));
    try {
      const files = days.map((d, i) => {
        const f = join(dir, `2027-01-0${i + 1}.json`);
        writeFileSync(f, JSON.stringify(d));
        return f;
      });
      const now = days[2];
      expect(statusChangesFromFiles(now, files, scope)).toEqual(statusChanges(now, days, scope));
      expect(statusChangesFromFiles(now, files.slice(0, 2), scope)).toEqual([{ id: 'a', first: 'hit', now: 'miss' }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    // Real data: the ten committed snapshots before 22 Nov, both ways, over the five historical fortnights.
    const SNAPS = join(ROOT, 'ledger-snapshots');
    const files = readdirSync(SNAPS)
      .filter((f) => /^2026-11-(1[2-9]|2[01])\.json$/.test(f))
      .sort()
      .map((f) => join(SNAPS, f));
    expect(files).toHaveLength(10);
    const real = { start: '2026-08-23', end: '2026-10-31' };
    const snap = JSON.parse(readFileSync(join(SNAPS, '2026-11-22.json'), 'utf8')) as Snapshot;
    const held = files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as Snapshot);
    expect(statusChangesFromFiles(snap, files, real)).toEqual(statusChanges(snap, held, real));
    expect(statusChangesFromFiles(snap, files, real)).toEqual([]);
  });

  it('is self-contained: a copy run outside the repo reads out interim and final, and checks earlier snapshots', () => {
    const imports = [...readFileSync(SCRIPT, 'utf8').matchAll(/^import .* from '([^']+)';$/gm)].map((m) => m[1]);
    expect(imports.length).toBeGreaterThan(0);
    expect(imports.every((s) => s.startsWith('node:'))).toBe(true);

    // Five cohorts, each far worse than its base rate, so the interval excludes 0.
    let n = 0;
    const resolved = [0, 1, 2, 3, 4].flatMap((k) => {
      const madeOn = new Date(Date.parse('2026-12-01T00:00:00Z') + 14 * k * 86_400_000).toISOString().slice(0, 10);
      return [
        ...three({ made_on: madeOn, probability: 0.9, base_rate: 0.2, status: 'miss' }),
        row({ made_on: madeOn, probability: 0.5 + k / 20 }),
      ].map((r) => ({ ...r, id: String(n++) }));
    });
    const dir = mkdtempSync(join(tmpdir(), 'fx-readout-'));
    try {
      writeFileSync(join(dir, 'fx-readout.ts'), readFileSync(SCRIPT));
      // An earlier snapshot has call 0 as a HIT; both read-out snapshots have it as a MISS. The interim
      // one also holds a pending call from cohort 6, which the 5-cohort read-out must not count.
      const later = row({ id: 'later', made_on: '2027-02-20', status: 'pending' });
      writeFileSync(
        join(dir, '2027-02-28.json'),
        JSON.stringify({ open: [], resolved: [{ ...resolved[0], status: 'hit' }] }),
      );
      writeFileSync(join(dir, '2027-03-01.json'), JSON.stringify({ open: [later], resolved }));
      writeFileSync(join(dir, '2027-06-21.json'), JSON.stringify({ open: [], resolved }));
      writeFileSync(join(dir, 'undated.json'), JSON.stringify({ open: [], resolved }));
      const run = (file: string, ...args: string[]) => {
        const r = spawnSync(TSX, [join(dir, 'fx-readout.ts'), join(dir, file), ...args], {
          cwd: dir,
          encoding: 'utf8',
        });
        expect(r.status, r.stderr).toBe(0);
        return r.stdout;
      };
      const interim = run('2027-03-01.json', '--cohorts', '5');
      expect(interim).toContain('interim read-out');
      expect(interim).toContain('pending in the cohorts read: 0\n');
      expect(interim).toContain('status check: 1 in-scope calls differ');
      expect(interim).toContain('answer: the interval excludes 0; the final read-out decides');
      expect(interim).not.toMatch(/stop issuing/);
      const final = run('2027-06-21.json');
      expect(final).toContain('FINAL read-out');
      expect(final).toContain('answer: upper bound below 0: stop issuing FX calls');
      expect(final).toMatch(/generated UNKNOWN, sha256 [0-9a-f]{64}/);
      expect(final).toContain('status check: 1 in-scope calls differ from their first terminal status');
      expect(final).toContain('call 0: first hit, now miss');
      // RR1: a test cut short under §10 is still read out as final on 21 Jun 2027.
      const cut = run('2027-06-21.json', '--cohorts', '9');
      expect(cut).toContain('FINAL read-out');
      expect(cut).toContain('answer: upper bound below 0: stop issuing FX calls');
      expect(run('undated.json')).toContain('status check: NOT RUN');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
