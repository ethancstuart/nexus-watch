import { describe, it, expect } from 'vitest';
import { CORRECTION_NOTES, CORRECTIONS_PAGE_INTRO } from './corrections-data.js';
import { APPROVED_NOTE_DATES, INTRODUCTION_APPROVED } from './corrections-approvals.js';
import { approvedIntro, approvedNotes } from './corrections.js';
import { formatCorrectionDate, isIsoDate } from './correction-words.js';

/**
 * The correction notes are data, and this is their integrity check.
 *
 * THE TEST-SIDE PIN. Publication is decided at runtime by the gate, which
 * needs two keys in source: the entry's status (corrections-data.ts) and its
 * date in APPROVED_NOTE_DATES (corrections-approvals.ts); a disagreement shows
 * nothing anywhere. APPROVED_DATES and INTRO_APPROVED below are a further
 * check that runs only where the tests run: they must match both keys, so a
 * half-done or mistyped approval fails here as well as being withheld by the
 * gate. The full approval and withdrawal steps are in corrections-approvals.ts.
 */
const APPROVED_DATES: string[] = [];
const INTRO_APPROVED = false;

/**
 * The 57 model-written editions of 8 Sep to 6 Nov 2026, copied from the public
 * archive capture of 16 Nov (the lead's evidence/E2-archive-editions.tsv, rows
 * marked "model"). The 12 mechanical editions (10–12 Sep, 7–15 Nov) are not in
 * it and must never carry a note from this set.
 */
// prettier-ignore
const MODEL_EDITIONS = [
  '2026-09-08', '2026-09-09', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18',
  '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
  '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04',
  '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12',
  '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20',
  '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28',
  '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04', '2026-11-05',
  '2026-11-06',
];

/** Wrong only in wording: covered by the page, no note (CORRECTIONS-RECONCILIATION). */
// prettier-ignore
const WORDING_ONLY = [
  '2026-09-18', '2026-09-24', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-10-20', '2026-11-06',
];

describe('correction notes: integrity', () => {
  it('holds 49 entries with unique dates (the 21 and 22 Nov notes are added later)', () => {
    expect(MODEL_EDITIONS).toHaveLength(57);
    expect(CORRECTION_NOTES).toHaveLength(49);
    expect(new Set(CORRECTION_NOTES.map((n) => n.date)).size).toBe(49);
  });

  it('notes every model-written edition except the 8 wording-only ones, and nothing else', () => {
    const noted = CORRECTION_NOTES.map((n) => n.date);
    for (const d of noted) expect(MODEL_EDITIONS, d).toContain(d);
    expect([...noted, ...WORDING_ONLY].sort()).toEqual([...MODEL_EDITIONS].sort());
  });

  it('classifies 42 editions with a false claim and 7 misleading only', () => {
    const misleading = CORRECTION_NOTES.filter((n) => n.classification === 'misleading').length;
    const withFalse = CORRECTION_NOTES.filter((n) => n.classification !== 'misleading').length;
    expect([withFalse, misleading]).toEqual([42, 7]);
    for (const n of CORRECTION_NOTES)
      expect(['false', 'false-and-misleading', 'misleading']).toContain(n.classification);
  });

  it('each text is the note after its opening sentence, for its own edition', () => {
    for (const n of CORRECTION_NOTES) {
      expect(isIsoDate(n.date), n.date).toBe(true);
      // Starts at its own edition's date, so a note cannot sit beside the wrong brief.
      expect(n.text.startsWith(`On ${formatCorrectionDate(n.date)} `), n.date).toBe(true);
      expect(n.text.endsWith('Original text unchanged. Source: OONI daily totals.'), n.date).toBe(true);
      // The opening sentence is rendered by code; a hand-typed one or a drafting marker must not ride along.
      expect(n.text, n.date).not.toMatch(/Correction added|This edition contained|\[|\]|\*\*|publication date/);
      expect(n.text, n.date).toBe(n.text.trim());
    }
  });

  it('approval is exactly what the owner pinned (today: nothing)', () => {
    expect(
      CORRECTION_NOTES.filter((n) => n.status === 'approved')
        .map((n) => n.date)
        .sort(),
    ).toEqual([...APPROVED_DATES].sort());
    for (const n of CORRECTION_NOTES) expect(['draft', 'approved']).toContain(n.status);
    expect(CORRECTIONS_PAGE_INTRO.status === 'approved').toBe(INTRO_APPROVED);
  });

  it('every approved note carries a real correctedOn, on or after its edition and not in the future', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const n of CORRECTION_NOTES) {
      if (n.status !== 'approved') {
        // A draft carries no go-live date yet: correctedOn is set when it is approved.
        expect(n.correctedOn, n.date).toBeUndefined();
        continue;
      }
      expect(isIsoDate(n.correctedOn), n.date).toBe(true);
      expect(n.correctedOn >= n.date, n.date).toBe(true);
      expect(n.correctedOn >= '2026-11-22', n.date).toBe(true);
      expect(n.correctedOn <= today, n.date).toBe(true);
    }
    // Every approved entry passes the gate: none is silently dropped as malformed.
    expect(
      approvedNotes()
        .map((n) => n.date)
        .sort(),
    ).toEqual([...APPROVED_DATES].sort());
  });

  it('the page introduction carries no unresolved owner choice', () => {
    expect(CORRECTIONS_PAGE_INTRO.title.trim()).not.toBe('');
    expect(CORRECTIONS_PAGE_INTRO.paragraphs.length).toBeGreaterThan(0);
    for (const p of [CORRECTIONS_PAGE_INTRO.title, ...CORRECTIONS_PAGE_INTRO.paragraphs]) {
      expect(p).not.toMatch(/\[|\]|\*\*|OWNER/);
    }
    expect(approvedIntro() !== null).toBe(INTRO_APPROVED);
  });

  // The drafted introduction says "Each of the 49 carries a dated note beside
  // its original text". Published with fewer notes live, that sentence is
  // false. The gate therefore withholds the introduction until every note is
  // approved; this states the same rule where the tests run.
  it('the introduction is approved only once every note is', () => {
    if (INTRO_APPROVED) expect(APPROVED_DATES).toHaveLength(CORRECTION_NOTES.length);
  });

  it('the runtime keys in source agree with the test pin', () => {
    expect([...APPROVED_NOTE_DATES].sort()).toEqual([...APPROVED_DATES].sort());
    expect(new Set(APPROVED_NOTE_DATES).size).toBe(APPROVED_NOTE_DATES.length);
    const noted = new Set(CORRECTION_NOTES.map((n) => n.date));
    for (const d of APPROVED_NOTE_DATES) expect(noted.has(d), `${d} names no note`).toBe(true);
    expect(INTRODUCTION_APPROVED).toBe(INTRO_APPROVED);
  });
});
