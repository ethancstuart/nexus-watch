/**
 * THE RATE LINE UNDER "CALLS THAT LANDED" ON /ledger, server and SPA alike, and
 * the note that says what `scoring.base_rate` in /api/calls/ledger holds.
 *
 * `scoring.base_rate` is `baseRate()` (api/_lib/calls.ts): the share of scored
 * calls that hit. That is the OBSERVED HIT RATE. Both /ledger renderers printed
 * it as "stated base rate 30%" while the base rates those same calls stated
 * averaged 26% (lanes12/REVIEW-FRONTDOOR.md, re-review advisory, 27 Nov 2026).
 * The JSON key keeps its name, because the daily snapshots and any outside
 * reader depend on it; `base_rate_note` says what it holds, and
 * `mean_stated_base_rate` carries the figure the old label named.
 *
 * One function for both renderers, so they cannot word it differently. It
 * imports nothing: the SPA bundles it (scripts/check-client-safe-imports.ts).
 */

const pct = (v: number) => `${Math.round(v * 100)}%`;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** `scoring.base_rate_note` in /api/calls/ledger. */
export const BASE_RATE_NOTE =
  'The observed hit rate, despite the field’s name: the share of scored calls (hits and misses) that hit, over ' +
  'every scored call outside the seismicity calibration harness, including any kind left out of calibration. ' +
  'It is not a base rate any call stated; mean_stated_base_rate is the mean of the base rates those same calls ' +
  'stated.';

/**
 * "observed hit rate 31% · mean stated base rate 26%", or the hit rate alone
 * when no mean is supplied (an older server, or a call without a base rate).
 * With no observed rate, no line. Neither figure is ever called anything else.
 */
export function landedRatesDetail(observedHitRate: unknown, meanStatedBaseRate: unknown): string | undefined {
  if (!finite(observedHitRate)) return undefined;
  const observed = `observed hit rate ${pct(observedHitRate)}`;
  return finite(meanStatedBaseRate) ? `${observed} · mean stated base rate ${pct(meanStatedBaseRate)}` : observed;
}
