import { correctedOutcomeOf, isScored } from './calls.js';

/**
 * The correction a call stands under, by the ledger's own rule. One reader for
 * the call page (api/call.ts) and its share card (api/og.ts), so the two cannot
 * disagree about whether a verdict was corrected.
 *
 * THE LEDGER'S RULE, REUSED RATHER THAN RESTATED.
 *   - One reading per call: the LATEST call_corrections row, as the ledger
 *     reads it (`DISTINCT ON (call_id) … ORDER BY call_id, issued_on DESC` in
 *     api/ledger.ts and api/calls/ledger.ts). An earlier row that changed the
 *     verdict, followed by a later one that agrees with it, is no correction.
 *   - It counts only where correctedOutcomeOf (api/_lib/calls.ts) says it
 *     changes the published verdict. A corrected status that is not scored
 *     (unresolvable, void) changes nothing.
 *   - Only for a scored call: the ledger applies corrections to the scored
 *     cohort and reports the rest separately (corrections_outside_scored_cohort).
 *
 * Rows must arrive NEWEST FIRST: `ORDER BY issued_on DESC, id DESC`. The `id`
 * tie-break is this module's; the ledger's DISTINCT ON leaves a same-day tie
 * to Postgres. No call has two rows today (ledger-snapshots/2026-11-22.json:
 * 54 corrected calls, one row each).
 */
export function standingCorrection<T extends { corrected_status: string }>(
  published: string,
  rowsNewestFirst: readonly T[],
): T | null {
  const latest = rowsNewestFirst[0];
  if (!latest || !isScored(published)) return null;
  return correctedOutcomeOf(published, latest.corrected_status) === undefined ? null : latest;
}
