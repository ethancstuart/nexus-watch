/**
 * THE SECOND KEY for publishing a call note or a page note. Read only by the
 * gate, api/_lib/call-notes.ts.
 *
 * An entry in call-notes-data.ts reaches a reader only when BOTH keys say so:
 * its status there is 'approved' with a real issuedOn, AND its id is listed
 * here. The gate checks both on every request, so this holds on every
 * deployment, including a preview, whether or not any test ran. If the two
 * keys disagree, the gate shows that entry nowhere.
 *
 * TO APPROVE an entry, in one commit:
 *   1. call-notes-data.ts: `status: 'draft'` -> `status: 'approved'`, and add
 *      `issuedOn: 'YYYY-MM-DD'` (the go-live date readers see);
 *   2. here: add its id to APPROVED_NOTE_IDS;
 *   3. call-notes-data.test.ts: add the same id to APPROVED_IDS (the test-side
 *      pin, a further check wherever the tests run).
 * TO WITHDRAW one, undo all three: status back to 'draft', delete its issuedOn
 * line, and remove its id from both lists.
 *
 * NEVER PUSH A BRANCH CARRYING A TRIAL APPROVAL. Vercel builds a public
 * preview for every pushed branch, against the production database, and a
 * preview build runs no tests. An approval on any pushed branch is published
 * on that preview's URL.
 */

/** Ids of the entries in call-notes-data.ts that the owner has approved. */
export const APPROVED_NOTE_IDS: readonly string[] = [
  'fx-2026-11-21-resolved-miss',
  'fx-2026-11-21-resolved-miss-az',
  'fx-2026-11-21-resolved-hit',
  'fx-2026-11-21-made',
  'fx-zw-zwl-label',
  'ledger-fx-2026-11-21',
  'ledger-fx-threshold-line',
  'methodology-fx-threshold',
];
