/**
 * Ledger truth — the two conditions under which the register's pre-commitment
 * claim has quietly stopped being true, as pure decisions so they can be tested.
 *
 * WHY THIS REPLACES THE PREVIOUS CHECK. cron-health counted every pending call
 * more than a day past its date as "overdue" and paged CRITICAL on the number.
 * Between 2026-09-07 and 09-12 that sent 23 emails, for 5, 11, 17, 23, 30, 36
 * and then 31 "overdue" calls — every one of them a thin-coverage censorship
 * call from ML, SO, TD, CF, SS, SD or NE, held inside the published seven-day
 * grace window exactly as /methodology says it will be. The resolver ran on
 * every one of those days and disposed of 97 to 113 calls. Nothing was stuck.
 * The check's own comment said coverage-held calls "are expected and are
 * reported separately rather than paged on"; the query under it paged on them.
 *
 * And because the alert key embedded the count, each day's new number was a
 * brand-new alarm with its own six-hourly reminders. The held pool changes
 * size every day, so that would never have stopped.
 *
 * THE TWO CONDITIONS THAT ARE WORTH A PAGE:
 *
 *   1. THE RESOLVER WAS SILENT. Calls come due every day (FX issues daily and
 *      is never coverage-held), so a day on which something was due and
 *      NOTHING was disposed of — no hit, no miss, no unresolvable — means
 *      resolve-calls did not run, or ran and wrote nothing. Checked same-day
 *      once the 09:45 UTC run has had time to finish; before that the check
 *      looks at yesterday, so the condition is continuously evaluable and its
 *      alert key stays live across midnight instead of being stood down at
 *      00:00 and re-raised at 10:30.
 *
 *   2. A CALL IS PAST THE GRACE WINDOW. A call still pending more than
 *      UNRESOLVABLE_GRACE_DAYS after its date is one the resolver should
 *      already have settled as unresolvable. A held call never reaches this
 *      state, by construction of the published rule, so this counts only rows
 *      the resolver skipped. Detection lags a genuine skip by one day; the
 *      silent-resolver check above is the fast path.
 *
 * Both keys are STABLE. The count goes in the body, where a changing number
 * belongs, so one ongoing condition is one alarm plus reminders and one
 * all-clear — the rule alert.ts already states for endpoint conditions.
 */
import { UNRESOLVABLE_GRACE_DAYS } from './calls.js';

/**
 * Minute of the UTC day after which the 09:45 resolve-calls run is taken to
 * have finished. Thirty minutes of slack: the run has never taken more than a
 * few minutes, and cron-health ticks on the hour and half hour, so 10:30 is the
 * first tick that judges today.
 */
export const RESOLVER_SETTLED_UTC_MINUTES = 10 * 60 + 15;

/**
 * The resolver settles a call due on day D as unresolvable on D + GRACE, at
 * 09:45. So a call is only overdue when it is STRICTLY more than GRACE days
 * past its date: on D + GRACE before 09:45 it is legitimately still pending.
 */
export const PAST_GRACE_DAYS = UNRESOLVABLE_GRACE_DAYS;

/** The UTC calendar day whose resolutions can be judged at `now`. */
export function checkDateFor(now: Date): string {
  const minutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  if (minutes < RESOLVER_SETTLED_UTC_MINUTES) day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export interface LedgerTruthReading {
  /** The day being judged — from checkDateFor. */
  checkDate: string;
  /** Calls whose resolves_on is checkDate, any status. */
  dueOnCheckDate: number;
  /** Calls whose resolved_at falls on checkDate — hit, miss or unresolvable. */
  disposedOnCheckDate: number;
  /** Pending calls with resolves_on strictly more than PAST_GRACE_DAYS ago. */
  pastGrace: number;
  oldestPastGrace: string | null;
}

export interface LedgerTruthAlert {
  key: string;
  title: string;
  body: string;
  severity: 'critical';
}

export const SILENT_KEY = 'ledger:resolver-silent';
export const OVERDUE_KEY = 'ledger:overdue';

/** Every alert the reading justifies. Empty means the ledger is telling the truth. */
export function ledgerTruthVerdict(r: LedgerTruthReading): LedgerTruthAlert[] {
  const out: LedgerTruthAlert[] = [];
  if (r.dueOnCheckDate > 0 && r.disposedOnCheckDate === 0) {
    out.push({
      key: SILENT_KEY,
      severity: 'critical',
      title: `resolve-calls disposed of nothing on ${r.checkDate}`,
      body:
        `${r.dueOnCheckDate} call(s) were due on ${r.checkDate} and not one was resolved, missed, or settled ` +
        `as unresolvable. resolve-calls runs 09:45 UTC daily; it did not run, or ran and wrote nothing. ` +
        `Check the cron's last invocation in Vercel and /api/cron/resolve-calls output.`,
    });
  }
  if (r.pastGrace > 0) {
    out.push({
      key: OVERDUE_KEY,
      severity: 'critical',
      title: `${r.pastGrace} call(s) still pending past the grace window`,
      body:
        `${r.pastGrace} call(s) are pending more than ${PAST_GRACE_DAYS} days after their resolution date; the ` +
        `oldest was due ${r.oldestPastGrace ?? 'unknown'}. A coverage-held call is settled as unresolvable at ` +
        `exactly ${PAST_GRACE_DAYS} days, so these are rows the resolver is skipping — look for per-call ` +
        `errors in /api/cron/resolve-calls output.`,
    });
  }
  return out;
}
