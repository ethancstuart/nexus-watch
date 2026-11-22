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
export const APPROVED_NOTE_DATES: readonly string[] = [];

/** Whether the owner has approved the /corrections page introduction. */
export const INTRODUCTION_APPROVED: boolean = false;
