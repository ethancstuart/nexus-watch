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
 * The 196 model-written editions of 8 Apr to 22 Nov 2026, copied from the
 * lead's archive lists:
 *   - lanes7/presep-notes/archive-pre-sep.tsv, rows MODEL and MODEL-SUMMARY:
 *     137 editions, 8 Apr to 7 Sep;
 *   - evidence/E2-archive-editions.tsv, the public archive capture of 16 Nov,
 *     rows marked "model": 57 editions, 8 Sep to 6 Nov;
 *   - evidence/2026-11-22/SUMMARY.md: 21 and 22 Nov.
 * Not in it, and never to carry a note from this set: the 11 "pending" stubs of
 * 17–27 Jul (no edition text) and the mechanical editions of 10–12 Sep and
 * 7–20 Nov.
 */
// prettier-ignore
const MODEL_EDITIONS = [
  '2026-04-08', '2026-04-09', '2026-04-10', '2026-04-11', '2026-04-17', '2026-04-18', '2026-04-19', '2026-04-20',
  '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24', '2026-04-25', '2026-04-26', '2026-04-27', '2026-04-28',
  '2026-04-29', '2026-04-30', '2026-05-01', '2026-05-02', '2026-05-03', '2026-05-04', '2026-05-05', '2026-05-06',
  '2026-05-07', '2026-05-08', '2026-05-09', '2026-05-10', '2026-05-11', '2026-05-12', '2026-05-13', '2026-05-14',
  '2026-05-15', '2026-05-16', '2026-05-17', '2026-05-18', '2026-05-19', '2026-05-20', '2026-05-21', '2026-05-22',
  '2026-05-23', '2026-05-24', '2026-05-25', '2026-05-26', '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30',
  '2026-05-31', '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05', '2026-06-06', '2026-06-07',
  '2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12', '2026-06-13', '2026-06-14', '2026-06-15',
  '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21', '2026-06-22', '2026-06-23',
  '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27', '2026-06-28', '2026-06-29', '2026-06-30', '2026-07-01',
  '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08', '2026-07-09',
  '2026-07-10', '2026-07-11', '2026-07-12', '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-28',
  '2026-07-29', '2026-07-30', '2026-07-31', '2026-08-01', '2026-08-02', '2026-08-03', '2026-08-04', '2026-08-05',
  '2026-08-06', '2026-08-07', '2026-08-08', '2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13',
  '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21',
  '2026-08-22', '2026-08-23', '2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29',
  '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06',
  '2026-09-07', '2026-09-08', '2026-09-09', '2026-09-13', '2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17',
  '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25',
  '2026-09-26', '2026-09-27', '2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03',
  '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11',
  '2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19',
  '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27',
  '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04',
  '2026-11-05', '2026-11-06', '2026-11-21', '2026-11-22',
];

/**
 * The first edition with a censorship claim. The 121 model-written editions
 * before it make none, so they carry no note (lanes7/AUDIT-PRE-SEP.md §2).
 */
const FIRST_CLAIM = '2026-08-23';

/** Wrong only in wording: covered by the page, no note (CORRECTIONS-RECONCILIATION). */
// prettier-ignore
const WORDING_ONLY = [
  '2026-09-18', '2026-09-24', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-10-20', '2026-11-06',
];

describe('correction notes: integrity', () => {
  it('holds 67 entries with unique dates, in date order', () => {
    expect(MODEL_EDITIONS).toHaveLength(196);
    expect(new Set(MODEL_EDITIONS).size).toBe(196);
    expect(CORRECTION_NOTES).toHaveLength(67);
    const dates = CORRECTION_NOTES.map((n) => n.date);
    expect(new Set(dates).size).toBe(67);
    expect(dates).toEqual([...dates].sort());
  });

  it('notes every model-written edition from 23 Aug except the 8 wording-only ones, and nothing else', () => {
    const noted = CORRECTION_NOTES.map((n) => n.date);
    for (const d of noted) expect(MODEL_EDITIONS, d).toContain(d);
    const withClaims = MODEL_EDITIONS.filter((d) => d >= FIRST_CLAIM);
    expect(withClaims).toHaveLength(75);
    expect(MODEL_EDITIONS.filter((d) => d < FIRST_CLAIM)).toHaveLength(121);
    expect([...noted, ...WORDING_ONLY].sort()).toEqual([...withClaims].sort());
  });

  it('classifies 60 editions with a false claim and 7 misleading only', () => {
    const misleading = CORRECTION_NOTES.filter((n) => n.classification === 'misleading').length;
    const withFalse = CORRECTION_NOTES.filter((n) => n.classification !== 'misleading').length;
    expect([withFalse, misleading]).toEqual([60, 7]);
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
