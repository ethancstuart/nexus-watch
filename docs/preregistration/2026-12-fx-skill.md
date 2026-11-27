# Pre-registration: the FX forecast against its stored base rate, calls made from 1 Dec 2026

- **Written:** 27 Nov 2026 (UTC).
- **Timestamp:** the commit that adds this file, and the time GitHub shows it reaching `main` (the pull request's merge). Nothing above "Amendments" is edited after that. Amendments are appended, dated, each in its own commit.
- **Status:** no result yet. This document claims no skill.

## 1. Question

Does the FX forecast have a lower Brier score than the stored base rate? That is, does weighting recent behaviour improve on the long-run rate? It is not a test of currency forecasting in general.

- **Forecast** `p`: the call's `probability` as stored when it was made: 0.2 × the currency's recent exceedance rate + 0.8 × its long-run rate (`RECENCY_WEIGHT.fx_devaluation = 0.2` and `blendRates` in `api/_lib/calls.ts`; `api/cron/record-calls.ts`).
- **Benchmark** `b`: the call's `base_rate` as stored when it was made, which is the long-run rate alone.
- **Outcome** `y`: 1 if the published verdict is HIT, 0 if MISS (`api/cron/resolve-calls.ts`).

## 2. Calls in scope

Every call of kind `fx_devaluation` with `made_on` from 2026-12-01 to 2027-05-31 inclusive (UTC dates as stored), each counted once. If this file reaches `main` on or after 1 Dec 2026 (UTC), every cohort that starts on or before that day is left out, and each read-out says how many.

## 3. Cohorts

Cohort k (k = 1 to 13) holds the calls made on the 14 days starting 2026-12-01 + 14 × (k − 1) days. No call day is in two cohorts. A cohort is settled 21 days after its last call day: the 14-day window, then the 7 days after which an unscored call becomes UNRESOLVABLE (`UNRESOLVABLE_GRACE_DAYS`).

| k | Call days | Settled by |
|---|---|---|
| 1 | 1–14 Dec 2026 | 4 Jan 2027 |
| 2 | 15–28 Dec 2026 | 18 Jan 2027 |
| 3 | 29 Dec 2026 – 11 Jan 2027 | 1 Feb 2027 |
| 4 | 12–25 Jan 2027 | 15 Feb 2027 |
| 5 | 26 Jan – 8 Feb 2027 | 1 Mar 2027 |
| 6 | 9–22 Feb 2027 | 15 Mar 2027 |
| 7 | 23 Feb – 8 Mar 2027 | 29 Mar 2027 |
| 8 | 9–22 Mar 2027 | 12 Apr 2027 |
| 9 | 23 Mar – 5 Apr 2027 | 26 Apr 2027 |
| 10 | 6–19 Apr 2027 | 10 May 2027 |
| 11 | 20 Apr – 3 May 2027 | 24 May 2027 |
| 12 | 4–17 May 2027 | 7 Jun 2027 |
| 13 | 18–31 May 2027 | 21 Jun 2027 |

## 4. Metric

For cohort k, over its scored calls (§5), in points:

    S_k = 100 × (1 − Σ (p − y)² / Σ (b − y)²)

This is the ledger's own skill score (`brierSkillScore` in `api/_lib/calls.ts`), on one cohort at a time. A cohort has no S_k if it has no scored call, if its scored calls have fewer than 3 distinct `resolves_on` dates, if every scored call has p = b, or if Σ (b − y)² = 0. The estimate is the unweighted mean S̄ of the K cohort values. With s their sample standard deviation, the 95% interval is S̄ ± t(0.975, K − 1) × s / √K, where t(0.975, 4) = 2.776 and t(0.975, 12) = 2.179. The bounds are compared with 0 unrounded.

## 5. Exclusions, fixed now

Only calls whose published verdict is HIT or MISS, and that have a stored base rate, enter the sums. Every other call in scope is counted by reason in each read-out:

- **UNRESOLVABLE.** This includes the stale-rate guard: an FX call is scored only on a quote dated its resolution day. Without one it is held, and after 7 days it is settled UNRESOLVABLE and never scored (`fxQuoteIsFreshFor` in `api/cron/resolve-calls.ts`). The guard fires on a missing quote, not on the outcome, and it holds would-be hits and would-be misses alike.
- **VOID:** a criterion we withdrew.
- **Pending** in the read-out snapshot.
- **No stored base rate.**

Three further rules:
- **Notes.** Dated notes on calls, such as the 21 Nov 2026 currency notes, change no verdict. Calls that carry one are scored as published.
- **Corrections.** The main test uses the published verdict. A correction from HIT to MISS or from MISS to HIT gives a second line, the interval on corrected outcomes, which decides nothing. Any other correction in scope is counted by type and changes nothing.
- **Manual actions.** No call in scope is voided, and no exchange rate in a call's window is stored by hand, unless the action is logged in this repository, with its date and reason, under Amendments, committed before the affected calls resolve, and applied to every call the named defect or day affects, whatever its outcome. The read-out reports every such action.

No call, currency or day is left out for any other reason.

## 6. Sensitivity analysis (stated now; it decides nothing)

The same computation without every call whose `country_code` is VE (Venezuela), ZW (Zimbabwe, quoted by our source as ZWL), LK (Sri Lanka) or ET (Ethiopia), whatever currency it quotes. Why these four: a currency's threshold is set from its whole stored history. When a currency has become calmer than that history, the forecast sits below the base rate, and each miss scores in the forecast's favour. Up to the 26 Nov 2026 snapshot, these four were priced below their base rate on every one of their 324 resolved calls, and 1 of those calls hit. The list is fixed here and is not re-selected from new data. The sensitivity figure is reported beside the main figure at both read-outs and cannot change the decision.

## 7. Read-outs

| Read-out | Date | Cohorts | Snapshot |
|---|---|---|---|
| Interim | 1 Mar 2027 | 1–5 | `ledger-snapshots/2027-03-01.json` |
| Final | 21 Jun 2027 | 1–13 | `ledger-snapshots/2027-06-21.json` |

The read-out is computed by `scripts/fx-cohort-skill.ts` as it stands in the first commit on `main` that contains this file. It imports no other repository code. A later change to it, or to the ledger code it mirrors, applies only through an amendment. From the root of a full (not shallow) clone with `origin/main` fetched:

    C=$(git log --first-parent --diff-filter=A --format=%H origin/main -- docs/preregistration/2026-12-fx-skill.md)
    git show "${C}:scripts/fx-cohort-skill.ts" > /tmp/fx-readout.ts
    npx tsx /tmp/fx-readout.ts ledger-snapshots/2027-03-01.json --cohorts 5   # interim
    npx tsx /tmp/fx-readout.ts ledger-snapshots/2027-06-21.json               # final

A read-out is the final one if its snapshot is dated 21 Jun 2027 or later, however many cohorts it reads (§10). If cohorts are left out (§2), `--start` gives the first day of the first cohort kept and `--cohorts` the number kept (for example `--start 2026-12-15 --cohorts 12` for the final). If a snapshot file is missing, the next dated one is used, and the read-out says so. If any call in the cohorts being read out is pending in the dated snapshot, the first later snapshot in which none of them is pending is used. If each of the next 14 dated snapshots still has one, the one dated 14 days later is used and its pending calls are excluded by reason (§5). The read-out says which snapshot it used. Each read-out publishes, for the main test and the sensitivity analysis: every S_k with its call and hit counts; K, S̄, s and the interval; the excluded calls by reason; the corrections; and the snapshot's name, `generated_at` and sha256. It also reports the number of in-scope calls whose status differs from their status in the first daily snapshot where they were terminal. That number should be 0.

## 8. What it can detect

The spread comes from `ledger-snapshots/2026-11-26.json`. Its five complete fortnights of calls, made 23 Aug–31 Oct 2026, scored +1.3, −11.3, +0.4, −2.7 and −1.3 points, an SD of 5.0 points. If the new cohorts vary as much:

| Read-out | K | Half-width of the 95% interval | True effect detected 80% of the time |
|---|---|---|---|
| Interim, 1 Mar 2027 | 5 | ±6.3 points | about ±8.5 points |
| Final, 21 Jun 2027 | 13 | ±3.0 points | about ±4.3 points |

An observed mean beyond the half-width excludes 0. A true effect of exactly that size would be detected only about half the time (by simulation, with cohort skills varying normally). The SD rests on five values, and one of them is a bad fortnight (calls made 6–19 Sep 2026, of which 56% hit). Cutting the same days into fortnights from other start days gives SDs from 4.0 to 5.5 points. So these widths are rough, and each read-out reports the width it actually gets.

## 9. Planned answers and the decision rule

**Interim, 1 Mar 2027.** The planned answer is "no skill detected at ±X points", where X is the half-width obtained (about 6). If the interval excludes 0, the answer is "the interval excludes 0; the final read-out decides". The interim changes nothing: FX calls continue unchanged.

**Final, 21 Jun 2027,** on the main test only:
- **Upper bound below 0:** stop issuing FX calls, and say that the forecast did worse than its stored base rate.
- **Lower bound above 0:** say that the forecast beat its stored base rate, with the interval and, in the same sentence, the sensitivity interval (§6). This is the only case in which skill is claimed, and any skill claim states the sensitivity interval in the same sentence.
- **Otherwise:** report "no skill detected at ±X points", where X is the half-width obtained.

## 10. What would change this plan

Nothing, short of a documented fix to code that records, resolves or scores FX calls. Such a fix is logged under Amendments with its date and its commit, and is treated as follows:
- A fix never changes a verdict already published. Calls resolved before it keep their published verdict in the main test, and any verdict the fix would change appears only through the corrections line (§5).
- Calls still pending when the fix deploys are resolved by the fixed code.
- A fix to how calls are recorded is handled by the first contingency below.
- An amendment committed after a read-out's snapshot date does not apply to that read-out. No amendment can change the question, the cohorts, the metric, the exclusions, the read-out dates or the decision rule.

Contingencies, fixed now:
- **The forecast stays as it is through 31 May 2027:** the 0.2 weight, and the threshold and rate rules in `api/cron/record-calls.ts`. A change that alters the probability or base rate of new calls is logged as an amendment before it deploys. Its first affected day is the first `made_on` on which the changed code recorded a call. The cohort containing that day, and every later one, are left out.
- **A cohort counts if §4 gives it an S_k,** whatever the number of its call days. So if FX calls stop before 31 May 2027, the read-outs use the cohorts that have one.
- **Whatever K is,** the read-outs happen on the §7 dates and §9 applies as written. With fewer than 2 cohorts, the answer is "no skill detected; too few cohorts to measure".

## 11. Limits

- **Overlapping windows.** Cohorts share no call day, but they do share outcome days: a call made on a cohort's last day and one made on the next cohort's first day cover 13 of the same days. On the record to 15 Nov 2026, daily hit rates were uncorrelated beyond about 10 days. So neighbouring cohorts are only mildly dependent, but the interval may be a little too narrow.
- **Missing mid-window quotes.** A quote missing in the middle of the window is not guarded (`api/cron/resolve-calls.ts`). Because the verdict is the peak, such a gap can only turn a hit into a miss, which favours whichever of p and b is lower. That is the forecast's side on calm currencies.
- **The benchmark and the rates.** The benchmark is the ledger's own long-run rate, not a market forecast. Verdicts read our stored daily reference rates; for managed currencies these are official rates, which can differ from market rates.

## Amendments

None.
