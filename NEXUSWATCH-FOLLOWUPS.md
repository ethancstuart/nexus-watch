# NexusWatch Follow-ups & Future Work

Running log of items discovered during v5 execution that are **not blocking current phase** but need to be tracked. Format: one bullet per item with severity, origin track, and a pointer to the plan section or file that covers the eventual fix.

Severity key:
- **BUG** — something is wrong and needs fixing
- **GAP** — missing capability vs plan intent
- **CLEANUP** — tech debt, duplication, or stale doc
- **FUTURE** — deferred feature explicitly out of current scope

---

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

- **GAP** — Some static-layer probes point at landing-page URLs (telegeography.com, iaea.org, gpsjam.org) rather than structured endpoints. `inferFromBody` treats non-JSON as null record count (neutral pass) so these still score green when reachable, but refinement to real structured endpoints would tighten the signal. Track items per layer in `src/config/data-sources.ts`.
- **CLEANUP** — Several static layers share `/api/feed` as a generic "is the site up" probe. Sensible default but a follow-up pass could wire each to a more targeted upstream.
- **BUG (minor)** — `half_open_successes` is not persisted in `data_health_current`. The current implementation re-derives it within a single cron run, so half-open → closed recovery takes ~3 consecutive cron runs (~45 minutes) rather than tracking across interruptions. Fix: add a `half_open_successes INTEGER NOT NULL DEFAULT 0` column in a follow-up migration + update the upsert logic in `api/cron/data-health.ts`. Documented inline in `loadCurrentState`.
- **FUTURE (Track D.2)** — Automated heal actions beyond circuit-breaker fallback cycling. Currently the cron detects + cycles to a configured fallback. D.2 adds active remediation: clear stale Postgres caches, reissue failing cron invocations, nudge upstream API retries with exponential backoff outside the cron cadence.
- **FUTURE (Track D.3)** — AI-proposed code fixes. When a layer stays `degraded` for >2 hours, spawn a Claude agent that reads the layer's MapDataLayer implementation, diagnoses the issue, and proposes a draft PR. Never auto-commits. Documented in the v5 plan.
- **FUTURE** — Public `/#/status` page exposing a sanitized subset of `data_health_current` for subscribers. Trust-building signal. Blocked on Ethan's call on whether to expose.

## From Track E.1 (Global Coverage Audit — merged `6936273`)

### Code / documentation drift (action items for other tracks)

- **CLEANUP** — `CLAUDE.md` says the Country Intelligence Index covers 23 nations. Actual `src/services/countryInstabilityIndex.ts` covers **50**. Update the CLAUDE.md section on Intelligence Systems to reflect the real number before it bites another agent.
- **BUG** — `src/services/interests.ts` is referenced in `CLAUDE.md` as an existing service but does not exist in the repo. Track F (onboarding) must **create** it, not update it. Flagged before the onboarding agent writes a wrong import.
- **CLEANUP** — Two CII services coexist: `src/services/countryIndex.ts` (legacy, 23 countries) and `src/services/countryInstabilityIndex.ts` (current, 50 countries). One should be removed once we confirm nothing still imports the legacy file. Run: `grep -r "countryIndex" src/` before deletion.

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
