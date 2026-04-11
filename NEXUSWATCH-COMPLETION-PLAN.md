# NexusWatch Completion Plan — v5 FINAL

**Date:** April 11, 2026
**Author:** Claude (Chief of Staff) + Ethan (CEO)
**Status:** v5 FINAL — 8-track program covering revenue, product UI overhaul, social autonomy, data autonomy, global coverage, onboarding, retention, GTM automation. Ready to execute on Ethan's go signal.
**Mandate:** Transform NexusWatch from *"80% built, 5% shipped"* into a **fully autonomous geopolitical intelligence platform**: voice + visual pivot that widens audience, reliable revenue, product-wide design system, autonomous social engagement across 3 platforms, self-healing data pipelines, balanced global coverage across 6 continents, and automated GTM.

---

## What v5 adds (vs v4)

v4 merged the Apr 10 build plan + Apr 10 board review + Apr 11 CEO visual locks. v5 incorporates Ethan's 6 high-level tracks:

1. **Newsletter + design** — unchanged from v4 (already comprehensive)
2. **Overall product design** — NEW — full product UI pass, unified design system
3. **Newsletter + social autonomy** — expanded — X + LinkedIn + Reddit with autonomous replies/DMs under guardrails
4. **Data accuracy autonomy + feedback loop** — NEW — self-healing data pipelines with AI-proposed fixes
5. **Global data coverage** — NEW — balanced continent quotas (Africa 54, Asia 48, Europe 44, N. America 23, S. America 12, Oceania 14)
6. **Marketing + GTM automation** — expanded — content engine, automated warm outreach pipeline, landing A/B, paid-channel creative templates

---

## Locked decisions register (consolidated)

### Apr 10 Build Plan (33 decisions — all active)
Voice (40% analyst / 60% smart friend) · "We" pronoun · Section structure (Good Morning → Top → US Impact → Energy → Markets → 48h Outlook → Map of Day → Tool of Week Fri) · Sunday Week-in-Review · Hybrid personalization ("Your Watchlist") · Referral program (3/10/25 milestones) · Map of Day auto-screenshot · Brief archive (both standalone + map panel) · Full beehiiv migration · All X thresholds active · Buffer for X posting · Landing platform-first + persistent newsletter bar

### Apr 11 CEO Visual + Structural Locks
1. **Pricing:** $29 Analyst / $99 Pro / $19 founding-100 lifetime. Reconcile `CLAUDE.md`.
2. **Email aesthetic:** Light Intel Dossier — ivory `#FAF8F3`, graphite `#12161C`, Tiempos + Inter + JetBrains Mono, oxblood `#9A1B1B` accent, real news photos only.
3. **Ship order:** Redesign-first. P0 privacy fix → full redesign → 7-client test → ship.
4. **Launch order:** Wk1 PH + Reddit · Wk2 essay · Wk3 Show HN (tech angle) · Wk4 warm swaps.
5. **Email rendering ownership:** We own the HTML. beehiiv handles delivery + referrals only.
6. **Voice/visual split:** Analyst visuals + smart-friend voice. Stratfor-meets-Rundown.

### Apr 11 Track Scope Locks (today)
7. **Product UI overhaul:** Full product UI pass. Unified design system. Redesign intel map, HUD, command center, panels, cinema mode, terminal, topbar, alert bar. Extend Light Intel Dossier DNA into product where sensible; keep dark terminal where it earns its keep.
8. **Social autonomy:** 24/7 autonomous drafting engine across X + LinkedIn + Reddit (including replies + DMs) with **permanent human-in-the-loop approval**. Ethan reviews every action via batch approval queue. Agent drafts continuously, Ethan approves in batches — the engine runs 24/7 without Ethan, but nothing sends without his eyes. (see Track C.)
9. **Data autonomy:** Self-heal + AI-propose fixes. Health check cron every 15 min, fallback sources, Claude agent PR draft on persistent failures, `/#/admin/data-health` dashboard.
10. **Global coverage:** Full continental balance — 195 countries + OCTs. Continent quotas: Africa 54, Asia 48, Europe 44, N. America 23, S. America 12, Oceania 14. No continent under 80% core-layer coverage.

### Feedback / working style locks
- Projects run independently — no cross-project trade-offs (`feedback_projects_independent.md`)
- Commit + push all completed work
- Typecheck / lint / test / build BEFORE push (95%+ confidence)
- No cold outreach — content-first, warm only
- CEO makes all final decisions, Claude presents options
- Parallel agents for research, reviews, content generation
- Product-first / agent-first — Meridian/NexusWatch are the protagonists, not Ethan

---

## North star + activation + retention + growth

- **North star:** weekly brief opens per active user
- **Activation:** email verified + brief opened within 48h + interests saved
- **Retention (W1):** ≥40% brief-open rate
- **Retention (W4):** ≥25% brief-open rate
- **Revenue proof:** 3 paying customers from cold traffic
- **Quality proof:** email NPS ≥30 from 5 beta testers
- **Growth proof:** ≥1 referral conversion + ≥1 organic social signup in first 30 days
- **Data quality proof:** all 30 layers green on `data_health` dashboard for 7 consecutive days
- **Global coverage proof:** every continent ≥80% core-layer coverage

---

## Phase 0 — Pre-flight (30-45 min)

- [ ] Upgrade Vercel CLI: `npm i -g vercel@latest`
- [ ] Reconcile `CLAUDE.md` pricing to $29/$99/$19 founding
- [ ] Confirm Vercel env vars: Stripe price IDs + founding stock + beehiiv + Buffer + LinkedIn + Reddit API keys (Track C needs)
- [ ] Notion Weekly Execution Brief is stale — flag, get current-week priorities
- [ ] Decide: do we track v5 work in 8 separate Notion pages or one unified project page?

---

## TRACK A — Revenue + Delivery + Newsletter (core flow)

**Goal:** Working payments, reliable delivery, full Light Intel Dossier email with voice pivot + Watchlist personalization + Map of Day.

This is v4 Phase 1 largely intact. Abbreviated here for brevity — full details in repo history.

### A.1 — P0 Privacy Fix (first, always)
- Resend `to:[]` → `/emails/batch` per-recipient, chunk 100, pace 10/sec
- Freeze sends until verified

### A.2 — Stripe: 3 paid tiers + bugfixes
- Create Analyst $29, Pro $99, Founding $19 lifetime (stock 100)
- Fix tier mapping (`checkout.ts`), reverse-index customer ID (`webhook.ts`), structured error logging
- Atomic KV decrement on founding stock at session creation

### A.3 — Landing: platform-hero + newsletter bar + working checkout
- Persistent newsletter bar at top of landing
- Wire all 3 tier buttons to real Stripe checkout
- "Join Founding" CTA shown only when stock remains
- Brief preview section with rotating daily excerpt

### A.4 — Delivery observability
- `brief_delivery_log` Postgres table
- Throw on beehiiv non-200, log full response
- Exponential backoff with jitter
- `/api/admin/brief/retry/:runId` + `/api/admin/brief/last-run` (KV server-side admin allowlist)

### A.5 — Brief content rewrite: voice + 9-section structure
- Sonnet prompt rewrite: 40/60 analyst/smart-friend, "We" pronoun
- 9 sections per Apr 10 Decision 5, Sunday Week-in-Review variant
- Tool of the Week (Fri only)
- Output markdown, HTML happens in A.6

### A.6 — Email template: Light Intel Dossier HTML
- `src/styles/email-tokens.ts` as design token source of truth
- Rebuild `wrapEmailTemplate()` with all 9 modules
- Tiempos + Inter + Mono, oxblood accent
- Real news photos only, no AI images
- Plain-text multipart fallback
- Forward-to-colleague primitive → `/brief/:date` permalink

### A.7 — Map of the Day auto-screenshot
- `api/brief-screenshot.ts` — Mapbox Static Images API or MapLibre SSR
- CII overlay, top markers, brand
- Doubles as `og:image` for shareable brief URLs

### A.8 — beehiiv full migration
- Pre-rendered HTML pushed to beehiiv as post body
- Auto-publish, custom domain `brief.nexuswatch.dev`
- Welcome email: smart-friend + onboarding hybrid
- **Referral program:** 3 refs → weekend bonus · 10 refs → Pro free (via KV webhook) · 25 refs → watchlist unlock
- Resend = transactional only

### A.9 — "Your Watchlist" personalization
- Per-user section from interests (KV + Postgres)
- Top 3 events × interests in 24h + CII movers in their regions + 1-line context
- Per-user send via beehiiv single-send API
- Benchmark against beehiiv rate limits; fallback to segments if throttled

### A.10 — Content archive: standalone + in-map
- `/#/briefs` list + `/#/brief/:date` reader (Light Intel Dossier styling)
- OG image = Map of the Day
- Collapsible brief panel in `/#/intel` view
- SEO meta + sitemap

### A.11 — 7-client test matrix
Gmail web/iOS · Apple Mail mac light+dark + iOS · Outlook web/Windows · beehiiv preview

### A.12 — E2E smoke test
Visitor → signup → interests → tier select → checkout → pay → next-morning brief arrives with Watchlist → renders in 7 clients → CTA + referral link work

**Track A Exit:** All 12 steps green + `$1` test subscription end-to-end succeeds.

---

## TRACK B — Product UI Overhaul (NEW)

**Goal:** Unified design system across the whole product, extending Light Intel Dossier DNA where it adds clarity, keeping the terminal aesthetic where it earns its keep.

### B.1 — Design token unification
- [ ] Create `src/styles/tokens.ts` — single source of truth for color, typography, spacing, motion, elevation
- [ ] Audit existing CSS: `src/styles/panel.css`, `layout.css`, `ai-bar.css`, `space-bar.css`, `pulse-bar.css`, `command-center.css`, etc.
- [ ] Migrate hard-coded values to tokens in one pass
- [ ] Define **two themes:** `dossier` (light, Intel Dossier DNA, default for reading surfaces) and `terminal` (dark, current DNA, default for map + command center)
- [ ] Tokens: `--color-bg-dossier`, `--color-bg-terminal`, `--font-headline`, `--font-body`, `--font-mono`, `--accent-oxblood`, `--accent-terminal-orange`, etc.

### B.2 — Map UI overhaul
- [ ] `src/map/MapView.ts` — layer panel, country panel, control buttons, zoom chrome
- [ ] New **unified panel system** — all floating panels share a card component with consistent header, close, drag, resize
- [ ] Tighter typography hierarchy (JetBrains Mono for labels, Inter for content)
- [ ] Oxblood accent for severity + alert states (bridge Intel Dossier into product)
- [ ] Motion pass: 180-240ms for transitions, respect `prefers-reduced-motion`

### B.3 — Command Center HUD refresh
- [ ] `src/ui/commandHud.ts` — live corners, scanline, LIVE indicator, coordinates
- [ ] Sharpen the terminal aesthetic where it's actually working
- [ ] Fix contrast issues (same root cause as email)
- [ ] Quiet mode for reading surfaces (when brief panel is open)

### B.4 — Intel Bar + Alert Pill system
- [ ] `src/ui/intelBar.ts` — severity-colored pills (oxblood for critical, parchment for warning, graphite for info)
- [ ] Click → fly-to-location animation is already there; polish the landing state
- [ ] Alert badges consistent across intel bar, country panel, brief panel

### B.5 — AI Terminal redesign
- [ ] `src/ui/aiTerminal.ts` — keep the monospace voice but upgrade the prompt prefix, autocomplete, response rendering
- [ ] Syntax-highlight layer names, country names, thresholds in command output
- [ ] Loading states with terminal-style progress indicators

### B.6 — Cinema Mode refresh
- [ ] Full-screen theater takeover with tighter typography
- [ ] AI narration card (already exists — polish visual container)
- [ ] Controls fade to zero after 3s, reappear on mouse movement
- [ ] Export-to-video button (future) — mocked-in placeholder now

### B.7 — Topbar + navigation
- [ ] Collapse the "MORE" dropdown visually
- [ ] Add **theme switcher** (dossier / terminal) as first-class control
- [ ] User menu redesign with new token system

### B.8 — Accessibility pass
- [ ] Contrast audit against WCAG AA on both themes
- [ ] Keyboard navigation verified across new panel system
- [ ] Focus-visible rings in oxblood (dossier) / orange (terminal)
- [ ] Screen reader landmarks verified

**Track B Exit:**
- [ ] Single token file drives all styling
- [ ] `dossier` + `terminal` themes switch cleanly
- [ ] 5 test users describe the product as "cohesive" without prompting
- [ ] Lighthouse accessibility ≥95

---

## TRACK C — Social Drafting Engine (24/7 agent + permanent human-in-loop)

**Goal:** A systematic drafting engine that understands the NexusWatch brand voice and drafts social actions continuously across X + LinkedIn + Reddit (posts + replies + DMs). **Permanent human-in-the-loop** — Ethan reviews every action via batch approval queue. Engine runs 24/7 without Ethan; nothing sends without Ethan's eyes.

**Key architectural shift from v4:** this is a **drafting factory**, not a decision-maker. The agent's job is to have 20+ high-quality drafts ready whenever Ethan opens the queue. Ethan's job is batch approval, not writing.

### C.0 — NexusWatch Voice Model (the core asset, build FIRST)
- [ ] **Voice spec doc:** `docs/voice/nexuswatch-voice.md` — single source of truth covering:
  - The 40/60 analyst/smart-friend ratio with 10 annotated example paragraphs
  - "We" as pronoun, never "I" or first-person (per `feedback_not_the_face.md`)
  - Approved topics (geopolitics, intel, data, energy, shipping, conflict, tech building)
  - Forbidden topics (partisan US politics beyond editorial stance, legal/medical/financial advice, personal attacks, conspiracy, election results, public figures' private lives)
  - Editorial stance (pro-US, pro-Israel per `feedback_nexuswatch_stance.md`, tech/space as content vertical)
  - Tone register per platform (X = punchy, LinkedIn = professional, Reddit = long-context citation-heavy)
  - Brand emoji set (sparingly): ☕ 🌍 🗺️ 📍 🔭 — never others
- [ ] **Few-shot example corpus:** 50+ annotated examples of good vs bad drafts covering:
  - 10× good X replies / 10× bad X replies
  - 10× good LinkedIn posts / 10× bad LinkedIn posts
  - 5× good Reddit comments / 5× bad Reddit comments
  - 10× good DMs / 10× bad DMs (especially outreach responses)
- [ ] **Voice eval harness:** `api/voice/eval.ts` — run 20 test prompts through the drafting agent, score against rubric (voice adherence, topic compliance, stance alignment, rate-limit respect). Run on every prompt change.
- [ ] **System prompt template:** pulled at runtime from the voice spec + few-shots + rubric. Cache-friendly structure for cost control.
- [ ] **Voice versioning:** `voice-spec-v1.md`, `voice-spec-v2.md` — changes to the voice model are tracked in git and gate-reviewed by Ethan before activation.

### C.1 — Guardrails infrastructure (build with C.0)
- [ ] **Kill switch:** `SOCIAL_AUTONOMY_ENABLED` env var. False = all drafting halts instantly.
- [ ] **Approval queue = permanent mode.** No "auto mode" exists. Every drafted action enters the queue. Queue lives in Postgres `social_queue` table + `/#/admin/social-queue` UI + Notion mirror for mobile approval.
- [ ] **Topic + stance enforcement** inherits from the Voice Model (C.0). Any draft that fails voice eval auto-holds with `reason`.
- [ ] **Rate limits (drafting — the engine can draft more than it'll send):**
  - X: drafting up to 100/day, queue ≤30 approved-sends/day, ≤5 DMs/day, min 10 min between replies on a single thread
  - LinkedIn: drafting up to 30/day, queue ≤5 posts/week, ≤20 replies/day
  - Reddit: drafting up to 20/week, queue ≤3 posts/week, ≤10 comments/day
- [ ] **Audit log:** `social_actions` Postgres table — `id, platform, action_type, draft_content, final_content, approved_by, approved_at, status, voice_score, rationale, rate_limit_bucket, created_at, sent_at, retracted_at`
- [ ] **Delete + apologize workflow:** Ethan flags a sent message → agent retracts via platform API → drafts a correction (sent only after Ethan approves the correction too) → logs to audit table
- [ ] **Sensitive-match double-check:** regex denylist + LLM classifier run on every draft BEFORE it enters the queue. Any match → the draft is marked `held-sensitive`, not shown in the normal queue, requires an explicit override click.

### C.2 — X platform (already partially wired)
- [ ] Daily brief X thread (already planned in v4) — 5 tweets at 5:15 AM ET via Buffer
- [ ] Alert tweets (already wired) — verify all thresholds active, rate-limit enforced
- [ ] **Reply agent:** cron every 15 min, fetches mentions via X API, drafts replies, enqueues for approval
- [ ] **DM agent:** cron every 30 min, fetches inbox, drafts responses, enqueues
- [ ] **Engagement agent:** cron every 60 min, searches for relevant intel/geopolitics conversations, drafts comments (weekly cap)

### C.3 — LinkedIn platform (new)
- [ ] LinkedIn API OAuth + token management (stored in KV)
- [ ] **Daily post:** repurposed from the daily brief — different angle, more accessible, professional network framing
- [ ] **Reply agent:** mirrors X reply agent, stricter tone (LinkedIn is not Twitter)
- [ ] **No DMs on LinkedIn** — too high-risk for reputation, keep manual

### C.4 — Reddit platform (new)
- [ ] Reddit API OAuth (per-subreddit rules compliance)
- [ ] **Weekly drop:** one subreddit per week (r/geopolitics, r/CredibleDefense, r/neoliberal, r/worldnews — rotate)
- [ ] Mod outreach required before posting — Ethan handles the relationship, agent handles the drafts
- [ ] **Comment agent:** replies to comments on our own posts only (not trawling other threads)
- [ ] Reddit-specific format: long-form context, no marketing speak, zero emoji, cite sources

### C.5 — Approval queue UI (the interface Ethan lives in)
- [ ] `/#/admin/social-queue` — list of pending actions, grouped by platform
- [ ] Columns: platform, type, source (e.g., "@username mentioned us"), draft preview, rationale, voice_score, approve / edit-then-approve / reject / hold
- [ ] **Keyboard shortcuts:** J/K navigate, A approve, E edit, R reject, H hold. Designed for 20-second batch passes.
- [ ] **Bulk approve** for high-confidence batches (e.g., voice_score ≥95 across 10 drafts)
- [ ] **Notion mirror:** every drafted action also lands in a Notion "Social Queue" page for mobile approval on the go
- [ ] **Twice-daily digest email** (8 AM + 6 PM ET): summary of queue state, pending count by platform, voice_score distribution, any `held-sensitive` items
- [ ] **Edit flow:** Ethan can edit a draft inline, save the edit as a new few-shot example for the voice model (feedback loop into C.0)

### C.6 — Content repurposing engine
- [ ] Daily brief → X thread + LinkedIn post + (weekly) Reddit post automatically
- [ ] Tool of the Week → standalone X thread + LinkedIn post (Friday)
- [ ] Sunday Week-in-Review → LinkedIn long-form + X thread
- [ ] Essay (Wk 2 launch) → LinkedIn post + X thread + Reddit r/geopolitics (with mod blessing)

### C.7 — Feedback loop (edit-to-training)
- [ ] Every edit Ethan makes in the approval queue is captured as `edit_delta` in `social_actions`
- [ ] Weekly cron: cluster the edit_deltas by category (tone / topic / length / stance / factual) and produce a "voice drift report" to Notion
- [ ] Proposed new few-shots are added to `docs/voice/` as draft PRs — Ethan reviews and merges into the voice spec
- [ ] **Voice versions progress over time:** v1 (launch), v2 (after first 1000 approvals), etc. The drafting engine improves because Ethan's taste is the reward signal.

**Track C Exit:**
- [ ] Voice Model shipped: spec doc + 50+ few-shots + eval harness passing
- [ ] Guardrails red-team verified (inject denylist content, verify hold; inject voice-drifted content, verify score fails)
- [ ] Approval queue live with 7 days of drafts reviewed by Ethan
- [ ] Zero unsanctioned sends (permanent invariant)
- [ ] Audit log replayable end-to-end
- [ ] Kill switch verified
- [ ] Feedback loop: at least one edit_delta cluster surfaced as a voice spec update

---

## TRACK D — Data Accuracy Autonomy (Self-Healing Pipelines)

**Goal:** All 30 data layers self-monitor, retry, fall back to alternate sources, and invoke a Claude agent to propose code fixes when broken. `/#/admin/data-health` dashboard shows real-time state.

### D.1 — Health check cron
- [ ] New cron at `*/15 * * * *` (every 15 min)
- [ ] For each of 30 layers: probe the underlying API, measure freshness, count records, checksum
- [ ] Compute a `layer_health` score 0-100: `fresh × count × checksum_stable × api_latency`
- [ ] Persist to `data_health` table: `layer, status, score, last_success, last_failure, error, created_at`

### D.2 — Self-heal logic
- [ ] On failure: retry with exponential backoff (3 attempts, jittered)
- [ ] If primary source fails N times: switch to configured fallback source (e.g., GDELT → newsapi → manual RSS)
- [ ] Circuit breaker: layer marked `degraded` after 5 failures in 30 min, recovers on 3 successes
- [ ] Fallback mapping lives in `src/config/data-sources.ts`:
  ```
  { earthquake: { primary: 'usgs', fallback: ['emsc', 'ga.gov.au'] }, ... }
  ```

### D.3 — AI-proposed fixes (Claude agent)
- [ ] If a layer stays `degraded` for >2 hours, spawn a Claude agent with context: layer name, error history, relevant source files
- [ ] Agent reads the layer's MapDataLayer implementation, diagnoses the issue (API schema change? rate limit? DNS?), proposes a patch
- [ ] Output: a draft PR with the fix + a summary + a `data-health` notion comment
- [ ] **Never auto-commit** — Ethan reviews the PR manually
- [ ] Alerting: Slack/email ping on `degraded → proposed_fix` transition

### D.4 — `/#/admin/data-health` dashboard
- [ ] Grid view: 30 layers, each with color-coded status (green/amber/red)
- [ ] Click a layer → history chart + error log + last-success timestamp + fallback source used
- [ ] "Force retry" button (admin only)
- [ ] "View proposed fix" link to the draft PR

### D.5 — Public transparency page (optional but strong signal)
- [ ] `/#/status` — public-facing version of the health dashboard
- [ ] Subscribers see real-time data quality commitment
- [ ] Builds trust with intel audience that values data provenance

**Track D Exit:**
- [ ] Health check cron running, `data_health` table populated
- [ ] Self-heal verified: kill an API temporarily, watch fallback activate
- [ ] Claude agent successfully proposes a fix on a simulated schema break
- [ ] `/#/admin/data-health` dashboard live for Ethan
- [ ] 7 consecutive days of ≥90% green on all 30 layers

---

## TRACK E — Global Data Coverage (Balanced 6-Continent)

**Goal:** Every continent ≥80% core-layer coverage. Continent quotas: Africa 54, Asia 48, Europe 44, N. America 23, S. America 12, Oceania 14 = **195 countries + OCTs**.

### E.1 — Coverage audit
- [ ] For each of the 30 layers, count records by continent
- [ ] Compute continent coverage = (countries with any data / countries on continent)
- [ ] Identify gaps: which continents are under-represented on which layers?
- [ ] Publish baseline to `/#/admin/data-health` and `docs/GLOBAL-COVERAGE-BASELINE.md`

### E.2 — Gap-fill: APIs already in home-base catalog
- [ ] Consult `~/Projects/home-base/apis/catalog.md` for APIs we already know about
- [ ] Priority gap layers:
  - **Africa:** ACLED already covers; add AFRILABS disaster feed, GHSL (EU) for infrastructure, WorldPop for population-weighted signals
  - **Asia-Pacific:** USGS + EMSC for quakes (already), JMA for Japan, CWB for Taiwan, add PhiVolcs for Philippines
  - **Oceania:** GeoScience Australia (already fallback for quakes), PacIOOS for Pacific oceans, JOGMEC for energy
  - **Latin America:** USGS + SERNAGEOMIN Chile, INGEOMINAS Colombia, CENAPRED Mexico
  - **Middle East/MENA:** expand ACLED windows, add Syria civil society trackers, SANA (with caveats)

### E.3 — New layer: Global Population Centers
- [ ] `src/map/layers/populationLayer.ts` — WorldPop or GHSL
- [ ] Weighted by population for any CII correlation (prevents bias toward geographically large but sparsely populated countries)

### E.4 — New layer: Global Disease Surveillance expansion
- [ ] WHO Global Health Observatory (already wired) — verify coverage completeness
- [ ] Add ProMED-mail RSS for emerging outbreak reports
- [ ] Add Africa CDC, PAHO, ECDC regional feeds

### E.5 — New layer: Global Climate + Hazard
- [ ] Open-Meteo (already) — verify city list balances continents
- [ ] GDACS (already) — verify alert coverage
- [ ] Add: NOAA NHC for Atlantic/Pacific hurricanes, JMA for W. Pacific typhoons

### E.6 — New layer: Global Infrastructure
- [ ] Nuclear facilities (already, 22 sites) — expand to IAEA global list
- [ ] Ports (already, 18 strategic) — expand to top 100 global container ports
- [ ] Chokepoints (already, 6) — verify coverage

### E.7 — Continent quotas in CII
- [ ] `src/services/countryIndex.ts` — expand from 23 nations to 80+
- [ ] Re-tier by continent + population so that top 40 get full-depth, mid-tier gets core, long tail gets events-only
- [ ] Re-tune weights per continent where appropriate (e.g., maritime heavy for Oceania)

### E.8 — Watchlist personalization global-ready
- [ ] Interests picker in onboarding must include ALL 6 continents as regions, not just the current 5 (was: Middle East, East Asia, Europe, Americas, Global)
- [ ] Add: Africa, Oceania as explicit options

**Track E Exit:**
- [ ] Every continent ≥80% on core layers (conflict, disasters, disease, markets-adjacent, sentiment)
- [ ] CII expanded to 80+ countries
- [ ] Population-weighted CII prevents large-but-empty bias
- [ ] Onboarding surfaces all 6 continents
- [ ] Baseline doc committed

---

## TRACK F — Onboarding + Feedback + Analytics

Unchanged from v4, consolidated here.

### F.1 — 3-step onboarding
- Interests picker (includes all 6 continents per Track E.8)
- Email + frequency
- Confirmation + first threat spotlight as delayed post-onboarding overlay

### F.2 — Feedback
- User menu button → modal (category + body + screenshot)
- `POST /api/feedback` with rate limit + honeypot + session cookie
- Async Notion push (fire-and-forget)
- `mailto:hello@nexuswatch.dev` fallback

### F.3 — Analytics events
`signup · onboarding_complete · interests_saved · brief_opened · brief_clicked · checkout_initiated · checkout_completed · alert_fired · feedback_submitted · referral_completed · social_engagement_approved · data_health_alert`

### F.4 — No custom admin dashboard
Use Stripe + Vercel Analytics + direct Postgres queries + the track-specific admin routes we're building (`/#/admin/brief`, `/#/admin/data-health`, `/#/admin/social-queue`).

---

## TRACK G — Retention

Unchanged from v4.

- Day 1 welcome (smart-friend tone)
- Day 3 "Here's what you missed" — top 3 × interests
- Day 7 "Your week in intelligence" — personalized digest
- Cron-driven via `user_email_schedule`
- **No** churn save, Day 30 upsell, weekly deep-dive (beyond Sunday Week-in-Review)

---

## TRACK H — Marketing + GTM Automation (expanded)

**Goal:** 4-week compounding launch + automation layer that keeps acquisition running without Ethan's daily input.

### H.1 — Content engine (SEO top-of-funnel)
- [ ] `/#/briefs` and `/#/brief/:date` archive (Track A.10) — SEO-indexed permanent top-of-funnel
- [ ] Every brief has: unique OG image, structured data, canonical URL, sitemap entry
- [ ] Google Search Console + Bing Webmaster Tools setup
- [ ] Monthly automated SEO report (Claude agent reads Search Console data, writes a summary to Notion)

### H.2 — Soft launch (private)
- [ ] Ethan + 5 testers for 3 days
- [ ] Email NPS ≥30 gate
- [ ] Fix every P0/P1 surfaced

### H.3 — Week 1: Product Hunt + Reddit (mod-blessed)
- [ ] Product Hunt launch — scheduled via PH API
- [ ] r/geopolitics + r/CredibleDefense posts (mod outreach first, human-sent, not autonomous)
- [ ] Offer: free Analyst tier to commenters during launch window

### H.4 — Week 2: Long-form theater essay
- [ ] One deep-dive essay (1500-2500 words) on `/brief/essay/:slug`
- [ ] SEO-indexed, shareable, bylined "— The NexusWatch Team"
- [ ] Repurposed via Track C to LinkedIn + X

### H.5 — Week 3: Show HN (technical angle)
- [ ] Title workshop: "How I built a 30-layer geopolitical intel platform"
- [ ] Link to case study + archive, not hard-sell landing
- [ ] Pre-scheduled for Tuesday 9 AM ET (best HN slot)

### H.6 — Week 4: Warm newsletter swaps
- [ ] Build a **warm outreach pipeline**: agent identifies 20 intel/geopolitics newsletters with ≥1K subscribers, drafts warm pitches, queues for Ethan approval
- [ ] Ethan sends — agent handles the follow-up sequence after reply
- [ ] **No cold outreach** per `feedback_no_cold_outreach.md`

### H.7 — Landing page A/B variants
- [ ] Variant A: current platform-first hero
- [ ] Variant B: email-first hero (brief preview above the fold)
- [ ] 50/50 split, measure signup conversion over 2 weeks
- [ ] Winner locked in

### H.8 — Paid-channel creative templates (ready, not necessarily used)
- [ ] OG-style image templates for Twitter ads, LinkedIn sponsored posts, Google Display
- [ ] Copy variants (3 hooks × 3 body × 2 CTAs = 18 combinations)
- [ ] Tracked via UTM → Vercel Analytics
- [ ] **Do not spend** until organic retention proves out

### H.9 — Brand mentions monitoring
- [ ] Agent (Track C.2/C.3) watches for mentions across platforms
- [ ] Surfaces unhandled mentions to `/#/admin/social-queue`
- [ ] Enables engagement without manual watching

**Track H Exit:**
- [ ] 3 paying customers from cold traffic
- [ ] W1 retention ≥40% on 10+ free signups
- [ ] Email NPS ≥30
- [ ] ≥1 referral conversion
- [ ] Content engine indexed
- [ ] Warm outreach pipeline live with 20 newsletters queued
- [ ] Landing A/B winner locked

---

## Success criteria (end of v5)

### Revenue + delivery
- [ ] P0 privacy fix verified (no `to:[]` arrays)
- [ ] 3 paid tiers checkout: $29 / $99 / $19 founding
- [ ] `$1` test subscription end-to-end succeeds
- [ ] Daily brief delivers via beehiiv + Resend transactional
- [ ] Light Intel Dossier renders in 7 clients

### Audience + product
- [ ] 40/60 analyst/smart-friend voice shipping
- [ ] 9-section structure + Sunday Week-in-Review live
- [ ] Map of Day auto-generating
- [ ] "Your Watchlist" personalization working
- [ ] Brief archive `/#/briefs` + map panel indexed
- [ ] Onboarding captures interests (all 6 continents) + feeds Watchlist

### Product UI
- [ ] Unified token system (`src/styles/tokens.ts`)
- [ ] `dossier` + `terminal` themes switch cleanly
- [ ] 5 test users describe product as "cohesive"
- [ ] Lighthouse accessibility ≥95

### Social autonomy
- [ ] Guardrails red-team verified
- [ ] 30-day approval queue running with ≥95% approval rate
- [ ] Zero unsanctioned autonomous sends
- [ ] Daily X thread + LinkedIn post + weekly Reddit post pipeline live
- [ ] Kill switch verified

### Data autonomy
- [ ] 30 layers self-monitoring via `data_health`
- [ ] Self-heal verified under simulated outage
- [ ] Claude agent PR-draft mechanism working
- [ ] 7 consecutive days ≥90% green
- [ ] `/#/admin/data-health` live

### Global coverage
- [ ] Every continent ≥80% core-layer coverage
- [ ] CII expanded to 80+ countries
- [ ] Population-weighted
- [ ] Baseline doc committed

### Retention + GTM
- [ ] Day 3 + Day 7 re-engagement live
- [ ] Content engine indexed by Google
- [ ] Warm outreach pipeline live (20 newsletters queued)
- [ ] Landing A/B variants running

### Business
- [ ] **3 paying customers from cold traffic**
- [ ] **W1 retention ≥40%** on 10+ free signups
- [ ] **Email NPS ≥30** from 5 testers
- [ ] **≥1 referral conversion**
- [ ] **≥1 organic social signup**

---

## Critical path + parallelization

Tracks can run in parallel where independent:

```
Phase 0 (pre-flight)
   │
   ├─ Track A (revenue + delivery + newsletter) ─── blocks Track H
   │
   ├─ Track B (product UI overhaul) ── parallel ── independent
   │
   ├─ Track C (social autonomy) ────── parallel ── depends on A.8 (beehiiv) for content repurposing
   │
   ├─ Track D (data autonomy) ──────── parallel ── independent
   │
   ├─ Track E (global coverage) ────── parallel ── feeds Track F (onboarding continents)
   │
   ├─ Track F (onboarding + feedback) ─ depends on A.2 (tiers), E.8 (continents)
   │
   ├─ Track G (retention) ──────────── depends on A.8 (beehiiv) + F.3 (events)
   │
   └─ Track H (marketing + GTM) ─────── depends on A + Track B (hero surfaces)
```

**Recommended execution order:**
1. Phase 0 pre-flight (sequential gate)
2. A.1 P0 privacy fix (always first)
3. **Parallel kickoff:** A.2-A.8 + B.1 + D.1-D.2 + E.1 + C.1 (all guardrails)
4. Converge at **A.12 smoke test** + **B token migration** + **D dashboard live**
5. A.9-A.11 (Watchlist + archive + test matrix)
6. F onboarding (now has continent list from E.8)
7. G retention
8. C.2-C.6 social (now has daily brief from A)
9. E.2-E.8 global fill (parallel with C social)
10. H soft launch → 4-week GTM

---

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| P0 privacy leak ships to real subscribers | GDPR/CAN-SPAM incident | A.1 first, freeze sends until fixed |
| Bad draft slips past Ethan's review in the queue | Reputation incident (recoverable) | Voice Model eval gate + sensitive-pattern held queue + delete+apologize workflow + audit log. Permanent human-in-loop means the blast radius is always one message, never a runaway |
| Data self-heal masks a real broken feed | Users see stale data | Public `/#/status` page, 7-day green-streak gate, human-in-loop on agent-proposed fixes |
| Continent quotas force low-quality data into core layers | CII credibility drop | Per-continent weights in CII; population-weighted; long-tail = events-only not full-depth |
| Token migration breaks existing styling | Temporary visual regression | One-pass migration behind a feature flag; canary on `/#/intel` first |
| beehiiv rate limits kill "Your Watchlist" per-user sends | Delivery delays | Benchmark A.9 early; fallback to segments; cap personalization to top 500 subscribers |
| Reddit API posts trigger mod ban | Loses community trust | Mod outreach first, human-sent, not autonomous |
| Global data APIs hit rate limits or cost spikes | Pipeline breaks | Circuit breakers + fallback sources + cost alerts |
| 8 tracks × parallel execution → context fragmentation | Claude context waste | One track-owner agent per track, daily sync summary to Notion |

---

## Out of scope (explicit stop list)

Entity graph polish beyond current state · Crisis replay v2 · Investigation workspaces feature expansion · Multi-view enhancements · Predictive API expansion · CII backtesting · AI-generated hero images · Custom `/#/admin` beyond track-specific admin routes · `vercel.ts` migration · Vercel Queues · Churn save · Day 30 upsell · Weekly deep-dive cadence beyond Sunday · Mobile/desktop apps · White-label · Local-first AI · Paid advertising spend (templates only, not spend) · Autonomous git commits (agent-proposed PRs only)

---

## Session protocol reminders
- Weekly Execution Brief in Notion is stale — flag, get current-week priorities
- Every revenue blocker logged as P0/P1 in Notion Bugs & Issues (11 already logged this session)
- End of session: append Feature Roadmap note
- Commit + push all completed work per `feedback_commit_push.md`
- Typecheck / lint / test / build BEFORE push per `feedback_build_before_push.md`
- One track-owner agent per concurrent track to avoid context fragmentation
- Daily track-sync summary to Notion Feature Roadmap
