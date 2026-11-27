import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FINAL_READOUT_DATE,
  GRACE_DAYS,
  MIN_RESOLUTION_DATES,
  PREREG_COHORTS,
  PREREG_END,
  PREREG_START,
  SENSITIVITY_EXCLUDED,
  cohortCalendar,
} from './fx-cohort-skill.js';
import { PREREGISTRATION_URL } from '../src/pages/methodology.ts';

/**
 * The pre-registration and the script that reads it out must describe the same
 * test, and /methodology must link to a file that exists. Every expected value
 * here is derived from the script's own constants, never retyped.
 */
const DOC = 'docs/preregistration/2026-12-fx-skill.md';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (iso: string) => `${Number(iso.slice(8))} ${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

describe('the FX pre-registration document', () => {
  const doc = readFileSync(join(process.cwd(), DOC), 'utf8');
  const cal = cohortCalendar(PREREG_START, PREREG_COHORTS);

  it('states the scope and every cohort row the script computes', () => {
    expect(cal[PREREG_COHORTS - 1].last).toBe(PREREG_END);
    expect(doc).toContain(`from ${PREREG_START} to ${PREREG_END} inclusive`);
    for (const c of cal) {
      const line = doc.split('\n').find((l) => l.startsWith(`| ${c.cohort} | `));
      expect(line, `row ${c.cohort}`).toBeDefined();
      expect(line).toContain(fmt(c.last));
      expect(line?.endsWith(`| ${fmt(c.settledBy)} |`)).toBe(true);
    }
  });

  it('names the read-out snapshots on the settled dates of cohorts 5 and 13', () => {
    expect(cal[4].settledBy).toBe('2027-03-01');
    expect(cal[12].settledBy).toBe('2027-06-21');
    expect(doc).toContain(
      `| Interim | ${fmt(cal[4].settledBy)} | 1–5 | \`ledger-snapshots/${cal[4].settledBy}.json\` |`,
    );
    expect(doc).toContain(
      `| Final | ${fmt(cal[12].settledBy)} | 1–13 | \`ledger-snapshots/${cal[12].settledBy}.json\` |`,
    );
    expect(doc).toContain(`ledger-snapshots/${cal[4].settledBy}.json --cohorts 5`);
  });

  it('pins the read-out to this script and states its gate, grace and sensitivity set', () => {
    expect(doc).toContain(`--diff-filter=A --format=%H origin/main -- ${DOC}`);
    expect(doc).toContain('git show "${C}:scripts/fx-cohort-skill.ts"');
    expect(doc).toContain(`fewer than ${MIN_RESOLUTION_DATES} distinct \`resolves_on\` dates`);
    expect(doc).toContain(`after ${GRACE_DAYS} days it is settled UNRESOLVABLE`);
    for (const cc of SENSITIVITY_EXCLUDED) expect(doc).toContain(`${cc} (`);
  });

  it('states the review rules the script implements or the read-out must follow', () => {
    // S2 as tightened by RR2: only the cohorts being read out, and a named fallback after 14 days.
    expect(doc).toContain('If any call in the cohorts being read out is pending in the dated snapshot');
    expect(doc).toContain('the one dated 14 days later is used and its pending calls are excluded by reason (§5)');
    // RR1: the final read-out is decided by the snapshot's date, as the script does.
    expect(doc).toContain(`dated ${fmt(FINAL_READOUT_DATE)} or later, however many cohorts it reads (§10)`);
    // RR4: manual actions have a deadline and a scope.
    expect(doc).toContain('committed before the affected calls resolve, and applied to every call the named defect');
    // RR6: the pinned command needs the history.
    expect(doc).toContain('full (not shallow) clone with `origin/main` fetched');
    // S4: the script reports status changes against earlier snapshots, and the sha256.
    expect(doc).toContain(
      'whose status differs from their status in the first daily snapshot where they were terminal',
    );
    expect(doc).toContain("the snapshot's name, `generated_at` and sha256");
    // N7: no skill claim without the sensitivity interval beside it.
    expect(doc).toContain('any skill claim states the sensitivity interval in the same sentence');
    // N6: the unguarded mid-window gap is disclosed.
    expect(doc).toContain('A quote missing in the middle of the window is not guarded');
  });

  it('is the file /methodology links to', () => {
    expect(PREREGISTRATION_URL).toBe(`https://github.com/ethancstuart/nexus-watch/blob/main/${DOC}`);
    expect(existsSync(join(process.cwd(), DOC))).toBe(true);
  });
});
