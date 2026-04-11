# NexusWatch Follow-ups & Future Work

Running log of items discovered during v5 execution that are **not blocking current phase** but need to be tracked. Format: one bullet per item with severity, origin track, and a pointer to the plan section or file that covers the eventual fix.

Severity key:
- **BUG** — something is wrong and needs fixing
- **GAP** — missing capability vs plan intent
- **CLEANUP** — tech debt, duplication, or stale doc
- **FUTURE** — deferred feature explicitly out of current scope

---

## From Track A.6 (Light Intel Dossier email template — shipped `c09762d`)

- **FUTURE (A.6.1)** — `/api/brief/preview?date=YYYY-MM-DD` endpoint that renders `renderDossierEmail({...})` for a given historical brief so designers can iterate visually without triggering a real cron. Should reuse `logDelivery` free. Low risk, small scope, next logical commit after A.6.
- **FUTURE (A.6.2)** — 7-client cross-client test matrix execution: Gmail web, Gmail iOS, Apple Mail mac (light + dark), Apple Mail iOS, Outlook web, Outlook Windows, beehiiv preview. This is a MANUAL pass — ship the preview endpoint first, generate test sends to each client, screenshot, fix rendering issues until all 7 match. Litmus or an equivalent test service would automate this.
- **FUTURE (A.6.3)** — Per-story hero images. Top Stories currently render with card shells and serif headlines but no imagery. The Apr 11 design direction calls for real news photos per story (no AI-generated images — credibility bomb on geopolitical content). Needs a source-article image fetcher + attribution line + branded gradient fallback.
- **FUTURE (A.6.4)** — CII Movers dedicated module. A table of top climbers/fallers with sparklines disabled (Outlook kills them) styled with the dossier tokens. Currently the Sonnet "Top Stories" section mentions CII context inline but there's no dedicated module.
- **FUTURE (A.6.5)** — Map of the Day static image embed. Depends on Track A.7 (`api/brief-screenshot.ts`) landing. The dossier template already has a Map of the Day text section; A.7 fills it with a generated image.
- **FUTURE (A.9)** — Per-recipient Watchlist section. Requires Track F onboarding to land first (interests picker → stored interests → per-user brief variant). The Sonnet prompt already declares Watchlist out-of-scope, so Sonnet will never generate it; the template appends it per user at send time.
- **CLEANUP** — The legacy `wrapEmailTemplate` function was deleted in A.6. `markdownToHtml` and `buildFallbackHtml` are still used by the site archive path (`daily_briefs.summary` column) and were intentionally NOT touched. If/when the site archive gets its own design pass (Track B, site surfaces), those two should also move to the tokens-based system or be documented as "intentionally dark terminal for the product surface."

## From Track A.4 (Delivery observability — shipped `cfef0ea`)

- **FUTURE** — Retry endpoint `POST /api/admin/brief/retry/:runId` was scoped in v5 plan Track A.4 but deferred from the first commit. The work it implies: (a) persist enough of the original brief payload (HTML, markdown, markets, CII data) to `brief_delivery_log.metadata` so a retry doesn't need to re-run the full Sonnet generation, (b) build a re-send handler that loads the failed channel rows for a `runId` and re-attempts only those, (c) the retry itself must be idempotent against the channels that already succeeded. Natural home after A.5/A.6 land, because those will stabilize the brief content format.
- **FUTURE** — `brief_delivery_log` could gain a `stripe_webhook_failures` sibling table absorbing webhook processing errors from `api/stripe/webhook.ts`. Today those errors are only in Vercel function logs. Low priority until Stripe volume demands a structured audit trail.
- **CLEANUP** — `resolveAdmin` was extracted to `api/admin/_auth.ts` during A.4 and `api/admin/data-health.ts` refactored to import from it. Any future admin endpoint should import from `_auth.ts` — don't re-implement session lookup + allowlist checking. The `_` prefix marks the file as Vercel-private (not routed).

## From Track A.1 (P0 privacy fix — shipped `cb755ba`)

- **FUTURE** — Migrate daily-brief Resend batch loop to Vercel Workflow (WDK) when subscriber count exceeds ~30K. Current sync implementation fits inside the 300s function limit through that threshold. Inline comment at `api/cron/daily-brief.ts:694-699` documents the trigger + migration path. Track D.1 self-heal is the monitoring signal.

## From Track C.0 (Voice Model — merged `d1cb848`)

- **CLEANUP** — Deterministic voice checker is duplicated between `src/voice/deterministic.ts` (canonical, tested) and `api/voice/eval.ts` (inline copy). The api/ TypeScript project has its own `tsconfig.api.json` with `include: ["api"]` and cannot cross-import from src/. Header comments mark both files as kept-in-sync. Upgrade path: TypeScript project references (rejected as overkill for ~120 shared lines, but revisit if the duplication drifts).
- **GAP** — Partisan US politics detection in the deterministic gate is regex-only. Semantic drift catches happen only in the optional Claude semantic-check tier. If `ANTHROPIC_API_KEY` is unset, nuanced partisan content will pass the deterministic gate. Document: drafting engine should require the semantic tier in production.
- **GAP** — Few-shot corpus is English-only. Non-English source replies (Arabic, Russian, Chinese, Japanese, Spanish, Portuguese) are a known gap. Add in a v2 corpus expansion once the engine has 30 days of production feedback.
- **FUTURE** — Voice Model v2: after the first 1000 queue-approved actions, cluster Ethan's edit_deltas and produce a voice drift report. Each cluster proposes new few-shots as a draft PR. See Track C.7.
- **FUTURE** — Brand emoji set is intentionally tight (5 emoji). If the engine feels too sterile in practice after 30 days of production, consider adding 🛰️ (satellites) and 🚢 (shipping) — but requires CEO sign-off since v1 is locked.
- **GAP** — Semantic threshold is 70 (hard fail below 70). Between 70-85 the spec says "hold for human review" but the API currently returns `passed: true`. The drafting engine (Track C.2-C.4) must enforce the 70-85 hold separately — the API just scores, it doesn't route.

## From Track D.1 (Data Health — merged `3689a0b`)

- ~~**GAP** — static-layer probes point at landing pages~~ — Resolved in commit `<pending>`. Investigation revealed the original framing was wrong: upstream landing-page liveness isn't actually a useful signal for static-bundle datasets (the bundle doesn't auto-refresh from upstream, so an upstream outage doesn't affect our served data). The four landing-page probes (`cables`, `nuclear`, `frontlines`, `gps-jamming`) are now aligned to `/api/feed` like the 6 other static-bundle layers. `source.name` still reflects data provenance for admin display; only the probe URL changed.
- **FUTURE** — If we later want finer-grained freshness signals for bundled datasets, the right shape is a manual-refresh audit log: record when each static bundle was last refreshed (commit SHA + timestamp) and score freshness against a per-layer SLA (e.g., cables = 30d). This is a Track D.2+ concern; D.1 only scaffolds liveness detection.
- ~~**BUG (minor)** — `half_open_successes` not persisted~~ — Resolved in commit `<pending>` via `docs/migrations/2026-04-11-data-health-half-open-persistence.sql` + updates to `loadCurrentState`, `ensureSchema`, `ProbedRow`, `probeLayer`, and the upsert. Half-open → closed recovery now survives cron ticks (~15 min instead of ~45 min).
- **FUTURE (Track D.2)** — Automated heal actions beyond circuit-breaker fallback cycling. Currently the cron detects + cycles to a configured fallback. D.2 adds active remediation: clear stale Postgres caches, reissue failing cron invocations, nudge upstream API retries with exponential backoff outside the cron cadence.
- **FUTURE (Track D.3)** — AI-proposed code fixes. When a layer stays `degraded` for >2 hours, spawn a Claude agent that reads the layer's MapDataLayer implementation, diagnoses the issue, and proposes a draft PR. Never auto-commits. Documented in the v5 plan.
- **FUTURE** — Public `/#/status` page exposing a sanitized subset of `data_health_current` for subscribers. Trust-building signal. Blocked on Ethan's call on whether to expose.

## From Track E.1 (Global Coverage Audit — merged `6936273`)

### Code / documentation drift (action items for other tracks)

- ~~**CLEANUP** — `CLAUDE.md` CII count stale~~ — Resolved in commit `<pending>`. The actual situation was different from the E.1 agent's framing. See correction below.
- **CLEANUP (corrected)** — Two CII implementations coexist but neither is "legacy duplication." `src/services/countryIndex.ts` (139 lines, 23 countries, 4-component scoring) is the **live** path, imported by `src/pages/nexuswatch.ts`. `src/services/countryInstabilityIndex.ts` (327 lines, 50 countries, 6-component scoring: Conflict 20% + Disasters 15% + Sentiment 15% + Infrastructure 15% + Governance 15% + Market Exposure 20%) is **unused scaffolding** added Apr 8 with zero imports. The E.1 agent read this backwards. Real cleanup path is the Track E.7 migration: port `nexuswatch.ts` to the new file, expand coverage to 80+ per `docs/GLOBAL-COVERAGE-BASELINE.md` tier plan, then delete the 23-country file. **Do not delete either file in isolation** — the 327-line file is load-bearing scaffolding and the 139-line file is the live production path.
- **BUG** — `src/services/interests.ts` is referenced in `CLAUDE.md` as an existing service but does not exist in the repo. Track F (onboarding) must **create** it, not update it. Flagged before the onboarding agent writes a wrong import.

### Data quality caveats

- **GAP** — GDELT has a systematic English-language bias. Sentiment coverage for CN / RU / JP / BR / AR / Korean / non-English Southeast Asia is underweight. This is a source limitation, not a bug. Mitigation options: add language-balanced sources (e.g., regional news APIs) or weight-adjust per language in the sentiment algorithm. Documented in `docs/GLOBAL-COVERAGE-BASELINE.md` section 8.
- **GAP** — Prediction markets (Polymarket, Kalshi) structurally cannot cover Oceania or Africa — those questions don't exist on the platforms. Documented as source limitation. Not fixable via this data source; would need a different predictions feed.
- **GAP** — Feature-flag Pacific micro-states in CII before adding them. Naively adding them with thin backing data would create noise and hurt credibility. Wait until real fill-source data is wired (PacIOOS, NZ GeoNet, etc.) before exposing these countries in CII scoring.

### Track E.2 work queue (35 items)

Track E.2 = gap-fill execution. The full queue lives at `docs/GLOBAL-COVERAGE-GAPS.md` with 35 structured entries (21 S-effort, 14 M-effort). Top 5 quick wins:

1. **Extend Open-Meteo coord list** in `api/weather-alerts.ts` + `api/air-quality.ts` — adds ~25 coords across Oceania, S. America, Sub-Saharan Africa. Literal 30-min work. (S)
2. **Wire CDEMA RSS** for Caribbean Disaster Emergency Management — covers 19 Caribbean states, no auth. (S)
3. **Wire PacIOOS + NOAA PTWC + NZ GeoNet** — unlocks Oceania seismic/tsunami coverage. (S-M)
4. **Wire Africa CDC Outbreak Tracker** — breaks WHO DON's latency for Sub-Saharan Africa disease coverage. (M)
5. **Wire SERNAGEOMIN (Chile) + INPE TerraBrasilis (Brazil) + CENAPRED (Mexico)** — regional Latin America hazard depth. (S-M)

### CII expansion plan (Track E.7)

Current real count: 50. Target: 80+. Plan proposes **91 entries** across three tiers:
- **Tier 1 (42 countries)** — full-depth feeds, top 40 by population + strategic importance
- **Tier 2 (28 countries)** — core feeds only, mid-tier
- **Tier 3 (15 countries)** — events-only, long tail
- **+6 Oceania specials** behind a feature flag until real data backs each

Full list in `docs/GLOBAL-COVERAGE-BASELINE.md` section 5.

## From v5 plan infrastructure

- **FUTURE (Track A.4)** — `brief_delivery_log` Postgres table for channel-level delivery observability. Scoped in Track A.4; has overlap with Track D.1 admin patterns. A.4 can reuse the admin allowlist pattern from `api/admin/data-health.ts`.
- **FUTURE (Track B)** — Product UI overhaul is held until Track A.6 `email-tokens.ts` lands. Track B creates `src/styles/tokens.ts` as the root design-token source; `email-tokens.ts` will derive from or import the shared tokens to avoid drift between product UI and email.
- **FUTURE (Track F)** — Onboarding will need to create `src/services/interests.ts` from scratch (see CLAUDE.md bug above). Interests shape feeds Track A.9 "Your Watchlist" personalization, so Track F must land before Track A.9 real-data testing.
- **FUTURE (Track C.2+)** — Social drafting engine (X, LinkedIn, Reddit) depends on C.0 voice model + C.1 guardrail infrastructure. C.0 is shipped; C.1 is the next social track to start. Platform-specific agents (C.2 X, C.3 LinkedIn, C.4 Reddit) depend on C.1.
- **FUTURE (Track G)** — Day 3 + Day 7 re-engagement emails depend on Track A.8 beehiiv migration + F.3 analytics events. Cron-driven, not queue-driven, per v5 plan.
- **FUTURE (Track H)** — Marketing + GTM tracks (Product Hunt, essay, Show HN, warm swaps, landing A/B, paid creative templates) depend on Track A + Track B hero surfaces. Week 1 PH launch requires Track A exit + at least landing redesign.

---

## How to use this file

- When you ship something that discovers a new issue or deferred item, **add a bullet here** in the right section with severity + pointer to where the fix will live.
- When you complete a follow-up, **strike through the bullet** with a commit SHA.
- When planning a new track or sprint, **read this file first** to pick up loose threads from prior tracks.
- This file is **not** the v5 plan — that lives in `NEXUSWATCH-COMPLETION-PLAN.md`. This file is the running log of work the plan doesn't yet cover.
