/**
 * THE SECOND KEY for publishing a correction note. Read only by the gate,
 * api/_lib/corrections.ts.
 *
 * A note reaches a reader only when BOTH keys say so: its entry in
 * corrections-data.ts has `status: 'approved'` with a real `correctedOn`, AND
 * its edition date is listed here. The gate checks both on every request, so
 * this holds on every deployment, including a preview, whether or not any test
 * ran. If the two keys disagree (an approval typed on the wrong entry, or only
 * half done), the gate shows that note nowhere.
 *
 * The page introduction likewise needs INTRODUCTION_APPROVED here, its own
 * `status: 'approved'` with `publishedOn`, and every note approved by both
 * keys; the gate checks all three.
 *
 * TO APPROVE a note, in one commit:
 *   1. corrections-data.ts: `status: 'draft'` -> `status: 'approved'`, and add
 *      `correctedOn: 'YYYY-MM-DD'` (the go-live date readers see);
 *   2. here: add its edition date to APPROVED_NOTE_DATES;
 *   3. corrections-data.test.ts: add the same date to APPROVED_DATES (the
 *      test-side pin, a further check wherever the tests run).
 * TO WITHDRAW one, undo all three: status back to 'draft', delete its
 * correctedOn line, and remove its date from both lists.
 *
 * NEVER PUSH A BRANCH CARRYING A TRIAL APPROVAL. Vercel builds a public
 * preview for every pushed branch, against the production database, and a
 * preview build runs no tests. An approval on any pushed branch is published
 * on that preview's URL.
 */

/** Edition dates (YYYY-MM-DD) whose correction note the owner has approved. */
export const APPROVED_NOTE_DATES: readonly string[] = [
  '2026-08-23',
  '2026-08-24',
  '2026-08-25',
  '2026-08-26',
  '2026-08-27',
  '2026-08-28',
  '2026-08-29',
  '2026-08-30',
  '2026-08-31',
  '2026-09-01',
  '2026-09-02',
  '2026-09-03',
  '2026-09-04',
  '2026-09-05',
  '2026-09-06',
  '2026-09-07',
  '2026-09-08',
  '2026-09-09',
  '2026-09-13',
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
  '2026-09-17',
  '2026-09-19',
  '2026-09-20',
  '2026-09-21',
  '2026-09-22',
  '2026-09-23',
  '2026-09-25',
  '2026-09-27',
  '2026-09-28',
  '2026-09-29',
  '2026-09-30',
  '2026-10-01',
  '2026-10-02',
  '2026-10-04',
  '2026-10-06',
  '2026-10-07',
  '2026-10-08',
  '2026-10-10',
  '2026-10-11',
  '2026-10-12',
  '2026-10-13',
  '2026-10-14',
  '2026-10-15',
  '2026-10-16',
  '2026-10-17',
  '2026-10-18',
  '2026-10-19',
  '2026-10-21',
  '2026-10-22',
  '2026-10-23',
  '2026-10-24',
  '2026-10-25',
  '2026-10-26',
  '2026-10-27',
  '2026-10-28',
  '2026-10-29',
  '2026-10-30',
  '2026-10-31',
  '2026-11-01',
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-21',
  '2026-11-22',
];

/** Whether the owner has approved the /corrections page introduction. */
export const INTRODUCTION_APPROVED: boolean = true;
