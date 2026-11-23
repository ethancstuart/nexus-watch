import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import {
  UNRESOLVABLE_GRACE_DAYS,
  coverageRequirement,
  daysSinceResolution,
  fxDepreciationPct,
  missHoldReason,
  resolveOutcome,
} from '../_lib/calls.js';
import { usgsCountUrl, type RegionBox } from '../_lib/seismicity.js';
import { raiseAlert, clearAlert } from '../_lib/alert.js';
import { requireCron } from '../_cron-utils.js';

/**
 * Rows one run takes. Published beside `taken` so a reader who sees
 * `taken === page_size` knows they are looking at a page, not a total; the
 * total is `due`, counted without a bound.
 */
const DUE_PAGE_SIZE = 500;

/**
 * EVIDENCE UNITS ARE PER KIND, and the column is an INTEGER — a fact this
 * file learned on 2026-09-06, the first FX resolution day, when it wrote the
 * measured move (e.g. "1.12") into evidence_count and threw
 * `invalid input syntax for type integer` on SIXTY-THREE of sixty-six calls.
 * The three that "resolved" were the ones whose move happened to round to a
 * whole number. Every failure was caught by the per-call isolation, counted
 * in `errored`, reported in a response body nobody reads, and the run said
 * ok:true. Resolution day two, and the machine was broken in a way that
 * looked exactly like working.
 *
 *   censorship_event  → days with a confirmed block   (integer, natural)
 *   fx_devaluation    → peak depreciation in BASIS POINTS (integer, exact:
 *                       1.12% → 112; no float ever meets the column)
 *   seismicity_window → qualifying USGS events        (integer, natural)
 *
 * Display code renders each kind in its own units (api/call.ts).
 */
export function fxEvidenceBasisPoints(movedPct: number): number {
  return Math.round(movedPct * 100);
}

/**
 * AN FX CALL IS SCORED ONLY ON A QUOTE DATED ITS RESOLUTION DAY.
 *
 * On Sat 21 Nov 2026 every currency (65 of 65) repeated its 20 Nov value, and
 * this job scored the 66 calls due that day at 09:45 with no quote fresher
 * than 20 Nov. The harm is one-sided, as on the censorship leg: the verdict
 * is the PEAK over the window, so a missing last day can only turn a
 * would-be hit into a miss. AR 6047 was published MISS at 114 bp against
 * 1.64%; at the next fresh quote it read +1.98%.
 *
 * So the window's newest stored quote must be dated on or after resolves_on.
 * The window, the threshold and the reference are unchanged. A call without
 * that quote stays pending and is retried on the next run. source-fx-rates
 * stores a provider update as today's row only if it is under
 * FX_QUOTE_MAX_AGE_HOURS old. So a row dated resolves_on holds the provider's
 * daily update collected that morning: published about 00:02 UTC, and for a
 * currency fixed on business days, its latest fixing. The reference rate
 * follows the same convention. Two things it does not prove: that the values
 * changed (an update can repeat the previous day's; the collector warns), and
 * that every earlier day of the window has a row (a gap mid-window is scored
 * as before).
 *
 * A call held for want of that quote never waits forever. After
 * UNRESOLVABLE_GRACE_DAYS it is settled as unresolvable, never scored, by the
 * same statement and the same grace as a coverage-held censorship call, so
 * ledger-truth's past-grace check holds for it too. And the due page puts held
 * FX calls last (see the query), so a backlog of them cannot crowd out calls
 * that can be resolved. (An FX call with no frozen reference or threshold is a
 * different, older path: it is left pending, as before this change.)
 */
export function fxQuoteIsFreshFor(newestQuoteDate: string | null, resolvesOn: string): boolean {
  return newestQuoteDate !== null && newestQuoteDate >= resolvesOn;
}

/**
 * How many days an FX call may wait past its resolution date for that quote
 * before a person is told. source-fx-rates only ever stores the current day,
 * so a call still waiting the day after it was due will not resolve unless
 * someone stores that quote; otherwise it is settled unresolvable at grace.
 */
export const FX_STALE_ALERT_AFTER_DAYS = 1;

/** Stable key on the existing alert path: one notice, reminders, one all-clear. */
export const FX_STALE_ALERT_KEY = 'resolver:fx-stale-quote';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Resolve matured calls (daily, 09:45 UTC — after record, before the brief).
 *
 * Every call names its resolver and its threshold at creation. This job does
 * one thing: count the qualifying EXTERNAL events inside the window the call
 * declared, and write hit or miss. It never reads a NexusWatch score, never
 * consults the stated probability, and never adjusts a threshold — those are
 * the three ways a track record quietly becomes a closed loop.
 *
 * The window is [made_on, resolves_on], both fixed before the outcome existed.
 *
 * Idempotent by predicate: only `status = 'pending'` rows past `resolves_on`
 * are touched, so re-running does nothing to already-resolved calls. A resolved
 * call is never rewritten — that is the point of a ledger.
 */

interface DueCall {
  id: number;
  kind: string;
  country_code: string;
  made_on: string;
  resolves_on: string;
  /** Frozen at issue. The coverage requirement is derived from it, not hardcoded. */
  horizon_days: number;
  threshold: number;
  threshold_pct: number | null;
  reference_value: number | null;
  resolver_params: { box?: RegionBox; mag?: number } | null;
}

// calls-write: SETTLES calls. Every UPDATE carries `AND status = 'pending'`, so a
// resolved call cannot be reached from here — that clause IS the never-rewrite rule.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireCron(req, res)) return;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  try {
    // HELD FX CALLS GO LAST. An FX call inside its grace window with no quote
    // dated its resolution day can only be held again, so it is ordered after
    // every row this run can act on: resolvable calls, other kinds, and FX
    // calls past grace (which this run settles). Every other row keeps its
    // oldest-first order. Without this, a backlog of held FX calls, about 66
    // per lost day, would fill the 500-row page oldest-first and starve the
    // calls that can be resolved. The test is the one fxQuoteIsFreshFor
    // applies, written in SQL.
    const due = (await sql`
      SELECT id, kind, country_code, made_on::text AS made_on, resolves_on::text AS resolves_on,
             horizon_days, threshold, threshold_pct::float AS threshold_pct,
             reference_value::float AS reference_value, resolver_params
      FROM calls
      WHERE status = 'pending' AND resolves_on <= CURRENT_DATE
      ORDER BY
        (kind = 'fx_devaluation'
          AND resolves_on > CURRENT_DATE - ${UNRESOLVABLE_GRACE_DAYS}::int
          AND NOT EXISTS (SELECT 1 FROM fx_rates f
                          WHERE f.country_code = calls.country_code AND f.date = calls.resolves_on)) ASC,
        resolves_on ASC
      LIMIT ${DUE_PAGE_SIZE}
    `) as unknown as DueCall[];

    // THE PAGE IS BOUNDED; THE COUNT MUST NOT BE. `due` in the response was
    // `due.length`, so on a day 520 calls were due it would have read 500 —
    // the whole day's work, apparently — while twenty rows silently waited for
    // tomorrow. A published count equal to a page size is the defect this
    // repo has legislated against more than once, and cron-health's alarm
    // body tells the operator to read this very response. Today's cohort is
    // about a hundred rows; a resolver that is down for five days reaches
    // the bound.
    const dueTotalRows = (await sql`
      SELECT COUNT(*)::int AS n FROM calls WHERE status = 'pending' AND resolves_on <= CURRENT_DATE
    `) as unknown as Array<{ n: number }>;
    const dueTotal = dueTotalRows[0]?.n ?? due.length;
    const truncated = dueTotal > due.length;
    // A truncated run is a condition, not a log line: the rows left behind are
    // a day closer to grace, and a resolver that is behind stays behind until
    // someone is told. Stable key; the counts live in the body. Cleared on the
    // first run that takes everything due.
    try {
      if (truncated) {
        await raiseAlert({
          key: 'resolver:truncated',
          severity: 'warning',
          title: '[resolve-calls] more calls due than one run takes',
          body:
            `${dueTotal} calls are due and this run took ${due.length}; the rest wait for the next run. ` +
            'If this repeats, the register is falling behind its grace window.',
        });
      } else {
        await clearAlert('resolver:truncated');
      }
    } catch (alertErr) {
      console.error('[resolve-calls] truncation alert failed (non-fatal):', alertErr);
    }

    // The UTC calendar day this run belongs to, computed once so every call

    // in the batch is judged against the same boundary.

    const todayUtc = new Date().toISOString().slice(0, 10);

    let hits = 0;
    let misses = 0;
    let unresolvable = 0;
    // Thin coverage, but inside the grace window — still pending, not settled.
    let stillWaiting = 0;
    let errored = 0;
    // FX calls held for want of a quote dated their resolution day.
    const fxHeld: Array<{ country: string; resolvesOn: string; overdueBy: number }> = [];

    for (const call of due) {
      try {
        // Per-call isolation: one malformed upstream body used to throw out of
        // the loop and abort the whole batch after earlier rows had already
        // been written. A bad row now costs its own call, not the run.
        let count = 0;
        let outcome: 0 | 1;

        if (call.kind === 'fx_devaluation') {
          // Did the currency touch the declared depreciation at ANY point inside
          // the window? The peak matters, not the endpoint — a currency that
          // falls 8% and recovers by day 14 still had the devaluation the call
          // was about. Both the threshold and the reference rate were fixed at
          // creation, so nothing here can move the bar.
          const peak = (await sql`
          SELECT MAX(rate_vs_usd)::float AS peak, MAX(date)::text AS newest
          FROM fx_rates
          WHERE country_code = ${call.country_code}
            AND date >= ${call.made_on}::date
            AND date <= ${call.resolves_on}::date
        `) as unknown as Array<{ peak: number | null; newest: string | null }>;

          const ref = call.reference_value;
          const pct = call.threshold_pct;
          if (ref === null || pct === null) {
            // Unresolvable through no fault of the call — leave it pending
            // rather than record a miss we cannot justify.
            continue;
          }
          // No quote dated the last day of the window: wait, never score.
          // See fxQuoteIsFreshFor.
          const newest = peak[0]?.newest ?? null;
          if (!fxQuoteIsFreshFor(newest, call.resolves_on) || peak[0]?.peak == null) {
            const why =
              `no fresh quote: no exchange rate dated ${call.resolves_on}, the last day of the window, ` +
              `was stored (newest in window: ${newest ?? 'none'})`;
            const overdueBy = daysSinceResolution(call.resolves_on);
            if (overdueBy < UNRESOLVABLE_GRACE_DAYS) {
              console.warn(`[resolve-calls] call ${call.id} (${call.country_code}) held — ${why}; not scored`);
              fxHeld.push({ country: call.country_code, resolvesOn: call.resolves_on, overdueBy });
              stillWaiting++;
              continue;
            }
            // GRACE PASSED: settled exactly as a coverage-held censorship call
            // is below: same status, same statement, same predicate, same
            // fallback. Never a hit or a miss.
            console.warn(`[resolve-calls] call ${call.id} (${call.country_code}) unresolvable — ${why}`);
            try {
              await sql`
              UPDATE calls
              SET status = 'unresolvable', void_reason = ${why}, resolved_at = NOW()
              WHERE id = ${call.id} AND status = 'pending'
            `;
              unresolvable++;
            } catch (e) {
              console.error(
                `[resolve-calls] could not mark call ${call.id} unresolvable (migration not applied?) — ` +
                  `left pending, still NOT scored: ${e instanceof Error ? e.message : String(e)}`,
              );
              stillWaiting++;
            }
            continue;
          }
          const moved = fxDepreciationPct(ref, peak[0].peak);
          outcome = moved >= pct ? 1 : 0;
          count = fxEvidenceBasisPoints(moved);
        } else if (call.kind === 'seismicity_window') {
          // Calibration harness: did USGS record a qualifying event inside the
          // frozen box and window? The box and magnitude come from
          // resolver_params, stored at issue — never from the current region
          // table, which may have been re-tuned since.
          const params = call.resolver_params;
          if (!params?.box || typeof params.mag !== 'number') {
            console.error(`[resolve-calls] call ${call.id} seismicity without frozen params — left pending`);
            continue;
          }
          // THE WINDOW MUST BE OVER BEFORE IT CAN BE SCORED. This job runs at
          // 09:45 UTC on the day a call's window closes, and the USGS query
          // asks for events up to `${resolves_on}T23:59:59` — fourteen hours
          // that have not happened yet. Like the censorship leg below, the
          // omission is one-sided: a not-yet-occurred event can only turn a
          // would-be hit into a miss. So the call waits, which costs a day and
          // nothing else, and the existing grace path handles it from there.
          if (call.resolves_on >= todayUtc) {
            stillWaiting++;
            continue;
          }
          const url = usgsCountUrl(params.box, params.mag, call.made_on, call.resolves_on);
          const r = await fetch(url, { signal: AbortSignal.timeout(30000) });
          if (!r.ok) {
            console.error(`[resolve-calls] USGS ${r.status} for call ${call.id} — left pending for retry`);
            continue;
          }
          const d = (await r.json()) as { count?: unknown };
          if (typeof d.count !== 'number' || !Number.isFinite(d.count)) {
            console.error(`[resolve-calls] USGS returned no numeric count for call ${call.id} — left pending`);
            // Left PENDING, so it is awaiting evidence — not settled. Counting
            // it as unresolvable made the completion log call a pending row
            // "settled", which a reader would act on.
            stillWaiting++;
            continue;
          }
          count = d.count;
          outcome = resolveOutcome(count, call.threshold);
        } else if (call.kind === 'censorship_event') {
          // The only question asked of the outside world: did OONI confirm a block
          // in this country inside the declared window?
          //
          // COVERAGE FIRST — absence of evidence is not evidence of absence.
          // This query used to count blocking rows and score zero as a MISS,
          // which meant a country OONI simply had not measured resolved as
          // "we said it would be censored and it wasn't". Verified 2026-08-28:
          // 39 countries carried pending calls while only 37 had any OONI rows
          // in the last fortnight, so real misses would have been manufactured
          // out of a collector gap on the very first resolution day. A call is
          // only resolvable if the resolver actually observed the country.
          // AND THE GATE IS A DENSITY, NOT A BOOLEAN. It used to test `=== 0`,
          // so a SINGLE measurement row anywhere in a fourteen-day window
          // certified the country as observed, and a call with no block seen
          // was then written as an irreversible public MISS.
          //
          // Measured against the live 2026-09-05 cohort on 2026-08-28: SD and
          // SS each had exactly ONE covered day and would have resolved MISS.
          // Sudan and South Sudan are among the most shutdown-affected
          // countries on earth; publishing "no censorship event" for them off
          // one probe-day is wrong on the facts.
          //
          // Day count alone is not enough either: Cuba had 15 of 15 days
          // covered on 479 measurements against Russia's 95,531, a 200x spread.
          // So both dimensions, and BOTH DERIVED FROM THE WINDOW, so a future
          // kind with a different horizon is in scope by construction rather
          // than by someone remembering to add it to a list.
          //
          // The structural finding underneath, which belongs on /methodology:
          // the thin countries are CF, ML, TD, SS, NE, SD — Sahel and Horn
          // conflict states. OONI's coverage is ANTI-CORRELATED with the thing
          // it measures, because volunteers are thinnest where running a
          // measurement tool is most dangerous. The countries we most want to
          // be right about are the ones we have least evidence for.

          // EVIDENCE FIRST, AND THE ASYMMETRY IS THE WHOLE POINT.
          //
          // An independent review caught the previous ordering: the coverage
          // gate ran before the evidence query, so a sparse country that DID
          // record a confirmed block was withheld instead of scored as a hit.
          // That is wrong, because the two directions are not epistemically
          // symmetric:
          //
          //   a confirmed block OBSERVED is positive evidence. The event
          //   happened. Thin coverage does not weaken it — we saw it.
          //
          //   NO block observed is only evidence of ABSENCE if we looked hard
          //   enough. That is the case the coverage gate exists for, and the
          //   only case it may govern.
          //
          // So a hit resolves on the evidence alone, and the density gate
          // applies solely to the would-be miss.
          const evidence = (await sql`
          SELECT COUNT(DISTINCT measurement_date)::int AS n
          FROM ooni_measurements
          WHERE country_code = ${call.country_code}
            AND confirmed_blocked > 0
            AND measurement_date >= ${call.made_on}::date
            AND measurement_date <= ${call.resolves_on}::date
        `) as unknown as Array<{ n: number }>;

          const blockedDays = evidence[0]?.n ?? 0;
          const wouldBeHit = resolveOutcome(blockedDays, call.threshold) === 1;

          // Coverage is queried ONLY here, inside the would-be-miss branch.
          // It cannot gate a hit even by failing, and we do not pay for a query
          // whose result the hit path ignores.
          if (wouldBeHit) {
            count = blockedDays;
            outcome = 1;
          } else {
            const coverage = (await sql`
          SELECT COUNT(DISTINCT measurement_date)::int AS covered_days,
                 COALESCE(SUM(total_measurements), 0)::int AS measurements,
                 COUNT(*) FILTER (WHERE measurement_date = ${call.resolves_on}::date)::int AS final_day_rows
          FROM ooni_measurements
          WHERE country_code = ${call.country_code}
            AND measurement_date >= ${call.made_on}::date
            AND measurement_date <= ${call.resolves_on}::date
        `) as unknown as Array<{ covered_days: number; measurements: number; final_day_rows: number }>;

            const coveredDays = coverage[0]?.covered_days ?? 0;
            const observed = coverage[0]?.measurements ?? 0;
            const req = coverageRequirement(call.horizon_days);

            // THE LAST DAY OF THE WINDOW IS PART OF THE WINDOW.
            //
            // This job runs at 09:45 UTC on the day a call's window closes,
            // and OONI's rows for day D are not stored until D+1 00:00 UTC —
            // measured, not assumed. So the final day of every censorship
            // call was scored before any evidence for it existed: 261 of the
            // first 262 resolved calls were settled with no row at all for
            // their own resolves_on.
            //
            // The harm is ONE-SIDED, which is what makes it serious rather
            // than merely noisy. A hit resolves on evidence alone (above), so
            // a missing day can never manufacture a hit — only a miss. Nine
            // published misses (ids 997, 999, 1006, 1103, 1110, 1136, 1207,
            // 1214, 1240) have a confirmed block on their own final day,
            // every one of them stored AFTER the verdict was written.
            //
            // Derived, not clocked: we do not subtract a day or wait a fixed
            // number of hours, because the lag is a property of the upstream
            // and it changes. The rule is that a would-be MISS may not be
            // published while the resolver has never seen the last day it is
            // scoring. It waits under the SAME grace window as a coverage
            // hold, and becomes unresolvable by the same path if the evidence
            // never comes. The hit path is untouched.
            const finalDaySeen = (coverage[0]?.final_day_rows ?? 0) > 0;
            const hold = missHoldReason({ finalDaySeen, coveredDays, measurements: observed }, req);

            if (hold !== null) {
              const why =
                hold === 'final-day-unseen'
                  ? `no resolver evidence yet for the window's final day ${call.resolves_on} ` +
                    `(coverage ${coveredDays}/${req.minDays} days, ${observed}/${req.minMeasurements} measurements)`
                  : `resolver coverage ${coveredDays}/${req.minDays} days, ` +
                    `${observed}/${req.minMeasurements} measurements in [${call.made_on}, ${call.resolves_on}]`;
              // warn, not error: an unresolvable settlement is the published
              // rule doing its job, not a fault. Logged at error level it filled
              // Vercel's error dashboard with ~280 "errors" in the week of
              // 2026-09-07 and buried the two real ones.
              console.warn(`[resolve-calls] call ${call.id} (${call.country_code}) unresolvable — ${why}`);

              // GRACE FIRST. Marking terminally on the resolution day removes the
              // call from the retry set forever, because this job only ever
              // selects status='pending'. OONI's ingest lags ~24h and
              // source-ooni.ts backfills a three-day window on every run (since
              // 2026-09-12; it fetched one day before that), so late evidence
              // is real and the grace window is what lets it count.
              const overdueBy = daysSinceResolution(call.resolves_on);
              if (overdueBy < UNRESOLVABLE_GRACE_DAYS) {
                stillWaiting++;
                continue;
              }

              // DEPLOY-ORDER SAFE. `unresolvable` needs the CHECK constraint from
              // docs/migrations/2026-08-28-calls-unresolvable-status.sql, applied
              // by hand, while pushing to main deploys. If the write is rejected
              // we fall back to leaving it pending — still not scored as a miss,
              // which is the property that matters. A missing migration must
              // never become a false public verdict.
              try {
                await sql`
                UPDATE calls
                SET status = 'unresolvable', void_reason = ${why}, resolved_at = NOW()
                WHERE id = ${call.id} AND status = 'pending'
              `;
                unresolvable++;
              } catch (e) {
                console.error(
                  `[resolve-calls] could not mark call ${call.id} unresolvable (migration not applied?) — ` +
                    `left pending, still NOT scored: ${e instanceof Error ? e.message : String(e)}`,
                );
                stillWaiting++;
              }
              continue;
            }
            count = blockedDays;
            outcome = 0;
          }
        } else {
          // An unknown kind must NEVER fall into another kind's resolver — that
          // is how a wrong criterion resolves a call silently. Before this
          // branch existed, any third kind would have been scored against OONI.
          console.error(`[resolve-calls] call ${call.id} has unknown kind '${call.kind}' — left pending`);
          continue;
        }
        const status = outcome === 1 ? 'hit' : 'miss';

        await sql`
        UPDATE calls
        SET status = ${status}, evidence_count = ${count}, resolved_at = NOW()
        WHERE id = ${call.id} AND status = 'pending'
      `;

        if (outcome === 1) hits++;
        else misses++;
      } catch (callErr) {
        errored++;
        console.error(
          `[resolve-calls] call ${call.id} (${call.kind}) threw — left pending:`,
          callErr instanceof Error ? callErr.message : callErr,
        );
      }
    }

    // FX calls still waiting for their quote past FX_STALE_ALERT_AFTER_DAYS.
    // Same path and shape as the truncation alert above: a stable key, raised
    // while the condition holds and cleared on the first run without it. Fails
    // open — the alert must never break resolution.
    const fxOverdue = fxHeld.filter((c) => c.overdueBy >= FX_STALE_ALERT_AFTER_DAYS);
    try {
      if (fxOverdue.length > 0) {
        const oldest = fxOverdue.map((c) => c.resolvesOn).sort()[0];
        const countries = [...new Set(fxOverdue.map((c) => c.country))].sort();
        const named =
          countries.slice(0, 20).join(', ') + (countries.length > 20 ? ` and ${countries.length - 20} more` : '');
        await raiseAlert({
          key: FX_STALE_ALERT_KEY,
          severity: 'warning',
          title: `[resolve-calls] ${fxOverdue.length} FX call(s) held: no quote dated their resolution day`,
          body:
            `${fxOverdue.length} FX call(s) are still pending at least ${FX_STALE_ALERT_AFTER_DAYS} day(s) after ` +
            `their resolution date, because fx_rates holds no quote dated that day for their currency. The oldest ` +
            `was due ${oldest}. Countries: ${named}. They are not scored. source-fx-rates stores only the current ` +
            'day, so they resolve only if a quote dated the resolution day is stored; otherwise each is settled ' +
            `as unresolvable (never scored) ${UNRESOLVABLE_GRACE_DAYS} days after its date.`,
        });
      } else if (!truncated) {
        // Not while truncated: held calls sort last, so some may not be in
        // this page and an empty fxHeld would not mean none are held.
        await clearAlert(
          FX_STALE_ALERT_KEY,
          'No FX call is now held past a day. Each was resolved on a stored quote or settled as unresolvable ' +
            '(never scored) at grace; /ledger shows which.',
        );
      }
    } catch (alertErr) {
      console.error('[resolve-calls] fx stale-quote alert failed (non-fatal):', alertErr);
    }

    console.log(
      `[resolve-calls] due ${due.length} — ${hits} hit, ${misses} miss, ` +
        `${unresolvable} unresolvable (settled, never scored), ` +
        `${stillWaiting} awaiting late evidence (still pending; ${fxHeld.length} of them FX awaiting a quote), ` +
        `${errored} errored`,
    );
    if (errored > 0) {
      // A resolver error is a resolution that silently didn't happen, on the
      // one job whose whole point is happening unattended. 63 of these hid in
      // a response body on 2026-09-06; now they wake a human. Fails open —
      // the alert path must never break resolution itself.
      try {
        await raiseAlert({
          title: `[resolve-calls] ${errored} call(s) threw and were left pending`,
          severity: 'critical',
          key: 'resolve-calls-errored',
          body:
            `due=${dueTotal} taken=${due.length} resolved=${hits + misses} unresolvable=${unresolvable} ` +
            `still_waiting=${stillWaiting} errored=${errored}. Per-call errors are in the ` +
            'function logs. Rows stay pending, so a rerun after the fix resolves them.',
        });
      } catch (alertErr) {
        console.error('[resolve-calls] alert failed (non-fatal):', alertErr);
      }
    }

    return res.status(200).json({
      ok: true,
      /** Rows that were due — unbounded, never a page size. */
      due: dueTotal,
      /** Rows this run took — bounded by `page_size`. When short, `truncated` says so and an alarm is raised. */
      taken: due.length,
      page_size: DUE_PAGE_SIZE,
      truncated,
      resolved: hits + misses,
      hits,
      misses,
      /** Settled: past the grace window with too little evidence. Never scored. */
      unresolvable,
      /** Still pending: matured but inside the grace window, or awaiting retry. */
      still_waiting: stillWaiting,
      /** Of still_waiting: FX calls with no quote dated their resolution day. */
      fx_awaiting_quote: fxHeld.length,
      errored,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[resolve-calls] failed:', msg);
    return res.status(500).json({ error: 'resolve_failed', message: msg });
  }
}
