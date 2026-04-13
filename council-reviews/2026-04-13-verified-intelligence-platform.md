# Council Review: NexusWatch "Verified Intelligence Platform" Master Build Plan

**Date:** 2026-04-13
**Subject:** Full build plan review — 12 phases, 4 tiers, 10-week timeline
**Convened by:** Chairman request
**Panel:** Full board + quant panel (10 members)
**Plan file:** `/Users/ethanstuart/.claude/plans/prancy-sleeping-clover.md`

---

## Phase 1: Domain Reviews

---

### 1. Priya Raghavan — VP Data Engineering & Governance (CDO)

**Domain Assessment**

*Strengths:*
- The evidence chain architecture (Phase 1A) is exactly right. Decomposing CII to source data with provenance metadata is the kind of data lineage work that separates real intelligence platforms from dashboards. The `CIIEvidence` interface is well-structured.
- Reusing `dataProvenance.ts` SOURCE_REGISTRY and `computeFreshness()` shows awareness of existing data contracts. Good.
- The confidence rules (HIGH/MEDIUM/LOW based on source count, freshness, data points) are explicit and auditable. This is the governance layer competitors don't have.
- The "What we don't cover" section in the Country Detail Panel is a governance feature masquerading as UX. Brilliant. Disclosing gaps is how you build trust AND protect yourself legally.

*Weaknesses:*
- **No data retention policy.** The prediction ledger records every daily brief and AI prediction indefinitely. How long do you keep this? What's the storage growth model? At 86 countries x 6 components x daily snapshots, this grows fast. Define a retention SLA.
- **No data quality SLA for upstream sources.** ACLED, USGS, GDELT all have different update cadences, outage patterns, and data quality characteristics. The plan mentions freshness but never defines: "If ACLED is down for 48h, what happens to CII scores? Do they degrade gracefully or silently stale?" This needs an explicit degradation matrix.
- **Verification Engine cross-reference logic is underspecified.** "ACLED + GDELT + Polymarket agree" — agree on WHAT exactly? Event location? Event type? Severity? Two sources can both report "conflict in Sudan" and mean completely different events. The matching logic (entity resolution across heterogeneous sources) is the hardest part of this entire plan and gets one paragraph.
- **No PII inventory for the portfolio exposure feature.** Phase 7 has users inputting their portfolio holdings. That's financial PII. What's the storage policy? Is it encrypted at rest? Can users delete it? GDPR/CCPA implications are non-trivial.
- **API key management for v2 API is unaddressed.** How are API keys generated, rotated, rate-limited, and revoked? This is a security-critical system for B2B customers.

*Specific Recommendations:*
1. Add a data degradation matrix before Phase 1 ships: for each of the 6 CII components, document what happens when each upstream source goes offline (fallback, staleness threshold, confidence downgrade).
2. Define entity resolution rules for the verification engine BEFORE building it. Start with simple geo + time window matching and iterate. Don't ship "CONFIRMED" badges based on naive string matching.
3. Add a `data_retention_policy` table or config. Prediction ledger entries older than 2 years get archived or aggregated. Daily layer snapshots older than 90 days get downsampled.
4. Phase 7 portfolio data must be encrypted at rest in Neon, with explicit user-initiated deletion capability. Add this as a P0 requirement.
5. API key management: use Unkey or build a simple key table with scopes, rate limits, and rotation. Don't launch the API without this.

*Risk Flags:*
- **CRITICAL:** The verification engine's entity resolution problem is vastly underestimated. Shipping "CONFIRMED" badges with naive matching will destroy the trust positioning if a badge is wrong. One false "CONFIRMED" on a sensitive geopolitical event and the credibility is gone.
- **HIGH:** Portfolio holdings data without encryption + deletion = compliance exposure.
- **MEDIUM:** No monitoring/alerting on upstream source health. You'll discover ACLED is down when a user complains, not when it happens.

*Cross-domain:*
- Connects to Dr. Vasquez's concern about confidence scoring calibration — the governance framework needs to feed the statistical validation.
- Connects to Kai's API design concerns — the v2 API needs proper key management infra, not bolted on later.

---

### 2. Dr. Elena Vasquez — Data Scientist

**Domain Assessment**

*Strengths:*
- The confidence scoring framework (HIGH/MEDIUM/LOW) is a strong starting point. Most products don't even attempt this.
- The prediction ledger is genuinely novel in this market. Recording predictions and tracking accuracy over time is exactly the scientific approach. If executed well, this becomes the most defensible asset in the entire platform.
- Explicit gap disclosure ("No ACLED data for 72h — using baseline") is statistically honest. This is how you build credibility with serious analysts.

*Weaknesses:*
- **The confidence scoring is ordinal, not calibrated.** HIGH/MEDIUM/LOW tells users about data availability, not about predictive accuracy. A CII score of 72 with "HIGH confidence" should mean something testable — e.g., "the true CII is between 65-79 with 90% probability." The current system conflates data completeness with predictive confidence. These are related but different.
- **No calibration methodology for the prediction ledger.** You're recording CII scores and AI predictions. But how do you measure "accuracy"? What counts as a correct prediction? CII is a composite index — what's the ground truth? If you say "Sudan CII will rise," and it rises by 0.3 points, were you right? You need a scoring rubric BEFORE recording begins, not after 30 days of data.
- **Scenario simulation has no uncertainty quantification.** "If Iran closes Hormuz, SA market exposure increases by X" — what's the confidence interval on X? The plan describes point estimates for scenario impacts. A real analyst would want ranges. "CII delta: +8 to +22 depending on duration and response" is more honest and more useful than "CII delta: +15."
- **The cascade model (Phase 6) has no empirical validation.** CASCADE_RULES defining "country A conflict -> country B refugee burden at X% of A's CII delta" — where does X come from? Is it calibrated against historical cascades? Or is it an assumption dressed as a model?
- **The competitive scorecard (Phase 11) marks NexusWatch as having every capability and competitors as having none.** This is not analysis — this is marketing. A serious competitive assessment would identify where competitors are actually better (World Monitor: 160 countries, lower price, more integrations).

*Specific Recommendations:*
1. Replace ordinal confidence (HIGH/MEDIUM/LOW) with a numeric confidence interval on CII scores. Start with bootstrapped intervals based on source agreement: if 3 sources give CII components that produce scores of 68, 72, 76, report "72 +/- 4." This is more honest and more useful.
2. Define a prediction scoring rubric NOW, before recording begins. Use Brier scores for binary predictions (will CII cross 60?) and MAPE for point predictions (what will CII be in 7 days?). Pre-register the evaluation criteria.
3. Scenario simulations must output ranges, not point estimates. Use historical precedent variance to calibrate: "In the 3 historical Strait of Hormuz incidents, oil price impact ranged from 8% to 22%. Median: 15%."
4. The cascade model needs at least back-of-envelope empirical validation. Take 5 historical cascades (Syria->Turkey refugee burden, Sudan->Chad, Ukraine->EU energy), compute the actual CII-equivalent impact, and calibrate your CASCADE_RULES against reality. If you can't do this, label the cascade visualization as "illustrative model" not "intelligence."
5. Fix the competitive scorecard to be honest. Mark where competitors lead (coverage, price, integrations) and where NexusWatch leads (trust layer, verification, transparency).

*Risk Flags:*
- **CRITICAL:** If the prediction ledger shows NexusWatch is NOT accurate (which is the likely early result — CII is a new, uncalibrated index), this becomes a trust LIABILITY, not an asset. You need a strategy for "our accuracy is 61% in month 1" that doesn't destroy credibility. Frame it as "learning in public" with improvement trajectory.
- **HIGH:** Scenario simulation without uncertainty ranges will be compared to real outcomes. When the point estimate is wrong (it will be), users will call the feature unreliable. Ranges protect you.
- **MEDIUM:** CASCADE_RULES without empirical calibration makes the cascade visualization a pretty animation, not intelligence. Serious users will test it against their own knowledge and find gaps immediately.

*Cross-domain:*
- Connects to Priya's verification engine concerns — statistical entity resolution is a prerequisite for meaningful CONFIRMED/CONTESTED badges.
- Connects to Marcus's revenue concerns — the prediction ledger is the ultimate trust builder OR trust destroyer. It needs to be executed with statistical rigor, not shipped as a checkbox feature.

---

### 3. Tara Kim — Chief Product Officer

**Domain Assessment**

*Strengths:*
- The tier structure (Trust Foundation -> Intelligence -> Revenue -> Moat) is excellent product sequencing. Building trust before monetizing trust is the right order.
- The persona mapping is the most thorough I've seen for this product. 40+ personas across 4 tiers with specific feature-persona mappings. This shows real thinking about who pays and why.
- The Country Detail Panel (Phase 1B) is the right first feature. "Click a number, see why it's that number" is the most natural user interaction for building trust.
- Portfolio geopolitical exposure (Phase 7) as the Pro-tier hook is smart. "$99 to know your portfolio's geopolitical risk" is a concrete value proposition.

*Weaknesses:*
- **The plan is 10 weeks and 12 phases for one person.** This is not a plan — this is a fantasy. Even with Claude Code assistance, a solo developer shipping: confidence scoring, verification engine, prediction ledger, AI analyst with 8 tools, scenario simulation, cascade visualization, portfolio exposure, time-travel scrubber, crisis playbooks, a public API, competitive monitoring, AND composite alerts in 10 weeks? No. This needs ruthless prioritization.
- **No FTUE described.** A new user arrives at NexusWatch. What do they see? How do they get to their first "wow" moment? The plan describes 12 backend systems but never walks through the first 60 seconds. What IS the first-time user experience?
- **The free tier is undefined.** "Newsletter + Limited Map" — how limited? Which features are gated? The persona table says free users get hooked by CII rankings and the globe. Do they see confidence badges? Verification shields? If not, free users never experience the trust layer — the core differentiator.
- **Scenario simulation UX is vague.** "Terminal command or dedicated panel" — which? A terminal command `scenario [description]` requires users to know the command exists and know how to phrase queries. This is a power-user interaction for what the plan calls "THE MOONSHOT." The moonshot feature needs the most accessible UX, not the most obscure.
- **No retention mechanism described.** What brings a user back on day 2? Day 7? Day 30? The daily brief is implied but never explicitly connected to the product. Is the brief a standalone email or does it drive users into the platform?

*Specific Recommendations:*
1. **Cut the plan to 4 phases for the first 10 weeks.** Phase 1 (Evidence chain + confidence), Phase 2 (Verification engine), Phase 4A (AI analyst with citations), and Phase 7 (Portfolio exposure, Pro gate). Everything else is Phase 2 of the roadmap. Ship less, ship better.
2. Design the FTUE explicitly: Landing page -> "Pick 3 countries you care about" -> Globe loads with those 3 highlighted -> CII scores shown with confidence badges -> "Want to go deeper? Click any country." -> Country detail panel. First wow moment in < 30 seconds.
3. Define the free/paid gate with precision. Free: daily brief email + globe with CII scores + confidence badges (trust layer visible to all). Paid ($29): country detail panel, AI analyst, alerts, deep-dives. Pro ($99): portfolio exposure, scenario sim, API.
4. Scenario simulation gets a dedicated panel with suggested scenarios (the pre-built library) as clickable cards. Power users can type custom scenarios. Don't hide the moonshot behind a terminal command.
5. The daily brief email must include a "Read more in NexusWatch" CTA for 2+ stories. This is the primary retention and reactivation loop. Spec it explicitly.

*Risk Flags:*
- **CRITICAL:** 12 phases / 10 weeks / 1 person = nothing ships well. The biggest risk is shipping 12 mediocre features instead of 4 excellent ones. The April 10 board review said "STOP building new features." This plan adds 12 more.
- **HIGH:** Without a defined FTUE, new users from the Product Hunt launch will arrive, see a complex globe, not understand what they're looking at, and leave. You get one chance at a first impression.
- **MEDIUM:** The free tier not showcasing the trust layer means the core differentiator is invisible to the largest audience segment.

*Cross-domain:*
- Strongly aligned with Marcus's "scope discipline" lens. This plan is scope explosion dressed in a tier structure.
- Aligned with Riley's concern — without retention mechanics, acquisition spending is wasted.
- Conflicts with Kai on timeline — even with perfect architecture, 12 phases in 10 weeks is unrealistic for one developer.

---

### 4. Kai Nakamura — VP Software Engineering

**Domain Assessment**

*Strengths:*
- Evidence chain returning from `computeCountryCII()` is the right architectural call. Making CII computation self-documenting at the service layer means every consumer (UI, API, AI analyst) gets provenance for free.
- Reusing existing `dataProvenance.ts` and `geoIntelligence.ts` convergence detection instead of rebuilding shows good engineering judgment.
- The TypeScript interface for `CIIEvidence` is clean and well-typed. The `gaps: string[]` field for explicit data gaps is an elegant design.
- Streaming terminal for AI analyst (Phase 4B) with tool-call indicators is the right UX pattern for 2026. Users should see the AI thinking.

*Weaknesses:*
- **Performance at scale is hand-waved.** "CII computation for 86 countries with evidence chains < 100ms" — this is a target, not a plan. Each country needs to fetch from multiple source registries, compute 6 components, aggregate evidence, compute confidence, and return. For 86 countries in parallel, what's the actual data access pattern? Are you hitting Neon 86 times? Caching? Pre-computing?
- **No caching strategy for evidence chains.** CII evidence chains are expensive to compute but change at most once per cron cycle. They should be pre-computed during the daily cron and cached, not computed on every page load. The plan doesn't mention this.
- **The API v2 namespace has no versioning strategy.** What happens when the CII model changes and the evidence chain format evolves? Do v2 clients break? You need a forward-compatibility strategy before launching a public API that B2B customers build integrations against.
- **Scenario simulation engine architecture is undefined.** "Claude with tool definitions" is the AI analyst approach, which is fine for Phase 4. But the scenario engine (Phase 5) implies a deterministic cascade model PLUS an AI synthesis layer. The plan mixes these without separating concerns. The cascade model should be a pure service; the AI should consume its output.
- **No error boundary strategy for the cascade/scenario overlay.** These are complex visual layers on top of the map. If the cascade engine returns bad data or the scenario engine times out, what does the user see? A broken map is worse than no map.

*Specific Recommendations:*
1. Pre-compute CII evidence chains in the daily cron job. Store them in a `cii_evidence` table or KV cache. The UI reads from cache, never computes on demand. Cache invalidation happens on cron completion.
2. Separate the scenario engine into two layers: (a) `cascadeModel.ts` — deterministic, rule-based propagation with defined inputs/outputs, (b) `scenarioSynthesis.ts` — AI layer that consumes cascade model output and generates the narrative brief. Keep them independently testable.
3. API v2 needs: (a) response envelope with a `version` field, (b) deprecation policy documented at launch, (c) breaking changes = v3, not v2 modifications. Ship the API docs alongside the API.
4. Implement error boundaries for every overlay layer. If cascade data fails, show the base map + "Cascade data unavailable" notice. Never let a feature failure cascade into a platform failure.
5. The performance target should be: pre-computed CII + evidence cache read < 10ms per country. API response for `/cii/all` < 200ms. These are achievable with pre-computation.

*Risk Flags:*
- **HIGH:** API v2 without versioning strategy + B2B customers = future breaking changes that damage trust and revenue. Design for evolution from day 1.
- **HIGH:** No caching strategy means the 86-country evidence chain computation will be slow on page load. The first user experience will be a loading spinner, not intelligence.
- **MEDIUM:** Scenario engine mixing deterministic cascade logic with AI synthesis in one service will be untestable and unreliable. Separate concerns.

*Cross-domain:*
- Agrees with Tara on scope — 12 phases is too many. Recommends shipping the infrastructure (evidence chain, pre-computation, caching) first, then layering features.
- Connects to Priya's data degradation concerns — caching pre-computed CII means stale data is served from cache, which is fine IF the cache has TTL and the UI shows freshness.
- Connects to Dr. Vasquez — the pre-computation layer is where confidence intervals should be calculated, not at request time.

---

### 5. Marcus Obi — Founder/CEO Advisor

**Domain Assessment**

*Strengths:*
- The pitch at the bottom of the plan is strong. "Every number traced to its source, every AI claim cited, every prediction tracked against reality" — this is a clear, differentiated value proposition.
- $29/$99 pricing with a trust-layer justification is sound. You're not competing on price with World Monitor ($4.99); you're competing on value with Stratfor ($149). The pricing is right IF the product delivers.
- Portfolio exposure as the $99 hook is the correct revenue strategy. A hedge fund analyst who maps their portfolio's geopolitical risk for $99/mo is getting 1000x ROI. This is the "no-brainer" upsell.
- The B2B API at $299+/mo is the real scalability play. Once CII data is programmatically accessible, you have a data business, not just a product business.

*Weaknesses:*
- **This plan has the exact same disease the April 10 board flagged: building before shipping.** 10 weeks. 12 phases. Zero revenue today. The last board review said "STOP building new features" and "the newsletter IS the revenue path." This plan ignores both directives and proposes building 10 new systems before collecting a single dollar.
- **No revenue milestone in the plan.** There is no point in 10 weeks where the plan says "now we have paying users." The build sequence goes straight from Week 1 to Week 10 without a single checkpoint that says "pause, launch, measure demand, then continue."
- **The $19 founding-100 tier is not in this plan.** It was locked on April 11. This plan doesn't reference it. Where does the founding tier launch in the build sequence? It should be Week 1-2, not Week 10.
- **No CAC estimate.** 40+ personas mapped, $29/$99 pricing, but no estimate of what it costs to acquire one paying user. The 4-week launch plan (Product Hunt, Reddit, Show HN, newsletter swaps) is free distribution, which is good — but what's the expected conversion rate? If 1,000 people visit and 2% convert, you have 20 users at $29 = $580 MRR. Is that good enough?
- **The Quant Engine bridge (Phase 7) is a 2-body problem.** Portfolio exposure requires the quant engine for institutional users. But the quant engine is a separate project with separate timelines. Don't create dependencies between projects.

*Specific Recommendations:*
1. **Insert a revenue gate at Week 3.** After the trust foundation ships (evidence chains, confidence badges, country detail panel), LAUNCH. Put up the paywall. Start collecting $29/mo. Everything after Week 3 is funded by proving demand.
2. **The founding-100 tier launches at the same time.** $19/mo lifetime for the first 100. Create urgency. This was locked on April 11 — execute it.
3. Kill the "10-week build then launch" mentality. Reframe as: "3-week build, launch, then build in public with paying users." Features after Week 3 are driven by what paying users ask for, not by what looks good in a plan.
4. Set a revenue target: 50 paid users ($1,450 MRR) within 60 days of launch. If you miss it, the Phase 2/3 features may be solving problems nobody has.
5. Portfolio exposure (Phase 7) stands alone. Don't reference the quant engine. Users input holdings manually. The quant engine integration is a future nice-to-have, not a dependency.

*Risk Flags:*
- **CRITICAL:** This is the same pattern the board flagged 3 days ago. Building a Palantir clone instead of shipping a newsletter. The plan is sophisticated, the architecture is good, and NONE of it matters if there are zero paying users at Week 10.
- **HIGH:** No revenue gate means Ethan spends 10 weeks of finite founder energy building features that may not match market demand. This is the definition of "scope creep dressed in a business plan."
- **HIGH:** The founding-100 urgency lever has a shelf life. Every week without launching is a week where competitor awareness grows and the "first" positioning erodes.

*Cross-domain:*
- Directly aligned with Tara — cut to 4 phases, ship at Week 3.
- Conflicts with Kai's desire for clean architecture on all 12 phases — Marcus says ship the minimum that works, measure demand, then invest in architecture for features people actually want.
- Connects to Riley — without a revenue milestone, GTM planning is theoretical.

---

### 6. Riley Matsuda — VP Growth & GTM

**Domain Assessment**

*Strengths:*
- The persona mapping is exceptional GTM material. 40+ personas with specific hooks, paths to paid, and feature affinity is a targeting goldmine. Most products launch with "we serve everyone." This plan knows exactly who it serves.
- Scenario simulation as a marketing hook is brilliant. "What happens if Iran closes the Strait of Hormuz?" is clickbait that DELIVERS. This is content marketing that converts because the product IS the content.
- The trust-layer positioning ("the only platform that tells you what we DON'T know") is a differentiated narrative. It's anti-marketing marketing, which resonates with the skeptical intelligence community.
- The competitive scorecard with clear capability gaps is good for sales collateral and positioning.

*Weaknesses:*
- **No funnel defined.** 40 personas, but no funnel. What's the acquisition path? Landing page -> email signup -> free newsletter -> "upgrade for deep-dives" -> paid? Or landing page -> free map access -> "this country detail requires Analyst tier" -> paid? The conversion mechanics are absent.
- **No email nurture sequence.** The daily brief is the retention engine. But what about the activation funnel? Day 0: welcome email with "here's what NexusWatch does." Day 3: "Here's your first personalized briefing." Day 7: "You've been reading for a week — here's what Analyst tier unlocks." This is table-stakes for $29/mo conversion and it's not in the plan.
- **The free-to-paid gate is undefined.** Which features are free? Which require $29? Which require $99? Without a clear gate, you either give away too much (no conversion pressure) or gate too aggressively (no trust-building). The April 11 decisions lock $29/$99 pricing but don't define the gate boundary.
- **The 4-week launch sequence (from April 11 decisions) isn't integrated into this build plan.** Product Hunt Week 1, deep-dive essay Week 2, Show HN Week 3, newsletter swaps Week 4. But the build plan has Week 1-3 as "Trust Foundation" with no launch activity. When does the launch start? After Week 10? That's too late.
- **No referral or viral loop.** The daily brief is sharable, but there's no referral incentive. "Forward to a friend" is passive. A referral program ("give 3 friends free Analyst for a month, get Pro free for a month") would create compounding growth. The plan doesn't mention it.

*Specific Recommendations:*
1. Define the free/paid gate in a single table. Free: daily brief, globe with CII scores, confidence badges. $29: country detail panel, AI analyst, deep-dives, alerts. $99: portfolio exposure, scenario sim, crisis playbooks, API. This is the conversion architecture.
2. Build a 7-day email nurture sequence for new signups: Day 0 (welcome + how to read the map), Day 1 (first brief with "here's what we know and don't know"), Day 3 (deep-dive on their watchlist countries), Day 7 (upsell: "you've seen X alerts this week — Analyst tier gets you Y").
3. Launch must happen at Week 3, not Week 10. The build plan should produce a launchable product by Week 3. The 4-week launch sequence starts Week 4.
4. Add a referral mechanism to the daily brief. "Share this brief and earn a free month of Analyst." Beehiiv has referral tooling built in — use it.
5. Create one "hero scenario" for launch: "What happens if China blockades Taiwan?" Run it through the scenario engine, publish the output as a long-form piece, and use it as the Product Hunt launch asset. The scenario IS the marketing.

*Risk Flags:*
- **HIGH:** No funnel = no conversion. 40 personas mean nothing without a path from awareness to payment.
- **HIGH:** The 4-week launch sequence is disconnected from the build timeline. If the trust layer takes 3 weeks and the launch starts Week 4, that's fine. If the trust layer takes 10 weeks, the launch is 2.5 months away and competitor lead grows.
- **MEDIUM:** No referral loop means linear growth only. Newsletter growth without referrals is 5-10% monthly organic. With referrals, it's 20-40%.

*Cross-domain:*
- Strongly aligned with Marcus and Tara — launch at Week 3, not Week 10.
- Connects to Ava — the free tier UX IS the funnel top. If free users don't experience the trust layer, they don't convert.
- Connects to Priya — the email nurture sequence needs proper CAN-SPAM compliance and unsubscribe mechanics from day 1.

---

### 7. Dr. Nadia Volkov — Macro Economist (Quant Panel)

**Domain Assessment**

*Strengths:*
- The market exposure component in CII is the right inclusion. Geopolitical events ARE market events. A platform that connects instability to financial impact is speaking the language of the users who pay $99/mo.
- Portfolio geopolitical exposure (Phase 7) has legitimate macro utility. Mapping portfolio holdings to country CII + chokepoint dependency is a macro risk overlay that institutional desks actually need. Most geopolitical products stop at "this country is unstable." Connecting that to "and here's how it hits your portfolio" is the value bridge.
- Chokepoint status (Hormuz, Suez, Bab el-Mandeb) as a core layer is correct. These are the three points where geopolitics becomes commodity prices. Monitoring all three with CII impact is real macro intelligence.

*Weaknesses:*
- **The market exposure component is undefined.** CII has 6 components: conflict, disasters, sentiment, infrastructure, governance, marketExposure. The first 5 have clear data sources (ACLED, USGS, GDELT, etc.). What feeds marketExposure? Which market data? At what frequency? Is it real-time equity index data? Commodity prices? FX? Sovereign CDS spreads? This component is the most valuable for paying users and the least specified.
- **Scenario simulation doesn't model second-order macro effects.** "If Iran closes Hormuz, oil spikes." Yes. But: oil spike -> inflation expectations rise -> central banks tighten or hold -> risk assets sell off -> emerging market currencies weaken -> EM CII rises from capital outflows. The plan models first-order geographic cascades (Sudan -> Chad refugees) but not macro-financial cascades (oil shock -> global tightening -> EM crisis).
- **No macro regime conditioning.** CII scores presumably change character in different macro regimes. In a tightening regime, geopolitical shocks cascade faster because there's no liquidity buffer. In a loosening regime, shocks are absorbed. The CII doesn't account for the global macro environment.
- **The "CII-weighted risk score for the portfolio" (Phase 7) lacks a methodology.** Is it linear (portfolio weight x country CII)? That's naive — it doesn't account for correlation across countries or between geopolitical risk and market risk. A portfolio with 50% Taiwan exposure and 50% Japan exposure isn't simply the weighted average of their CIIs — a Taiwan crisis directly impacts Japan.

*Specific Recommendations:*
1. Define the marketExposure component explicitly: use sovereign CDS spreads (available via FRED or paid APIs), equity index performance relative to global benchmark, and FX volatility. These are leading indicators of market stress that complement the other 5 components.
2. For scenario simulation, add a "macro transmission" layer: geopolitical shock -> commodity impact -> inflation impact -> monetary policy response -> financial market impact. This doesn't need to be precise — directional with ranges is sufficient. But it's what macro analysts actually think about.
3. The portfolio exposure methodology should account for correlation: use a simple co-occurrence matrix (when Taiwan CII rises > 10pts, which other countries' CIIs also rise?). This captures cascade risk within the portfolio.
4. Consider adding a "Global Risk Barometer" — a single number that aggregates macro regime (VIX, DXY, yield curve) with geopolitical risk (average CII across monitored countries). This becomes a signature metric and marketing hook.

*Risk Flags:*
- **HIGH:** The marketExposure component being undefined means the most revenue-critical CII component ships without a clear methodology. Hedge fund users will test this immediately.
- **MEDIUM:** Scenario simulation without macro-financial cascades will feel incomplete to the $99/mo users who think in macro terms. They'll run "Hormuz closure" and wonder why the output doesn't mention the dollar or interest rates.

*Cross-domain:*
- Connects to Dr. Vasquez — the portfolio exposure methodology needs statistical rigor, not just weighted averages.
- Connects to Dr. Rennert — institutional users will compare NexusWatch's portfolio risk metrics against their own models. The methodology must be defensible.
- Connects to Marcus — the marketExposure component is what justifies $99/mo to finance users. Get it right.

---

### 8. Dr. Tobias Rennert — Portfolio Manager (Quant Panel)

**Domain Assessment**

*Strengths:*
- The portfolio exposure concept is sound. Mapping holdings to geopolitical risk is a real workflow gap. Most hedge fund PMs do this manually or with expensive consultants. A self-serve tool at $99/mo is compelling pricing.
- "Your portfolio has 23% exposure to countries with CII > 60" is exactly the kind of output a PM wants. Simple, actionable, quantified.
- Scenario impact on portfolio ("If Taiwan CII hits 80, your portfolio loses ~12% estimated") is the killer feature for Pro users. This is decision-support, not just information.

*Weaknesses:*
- **"Your portfolio loses ~12%" — based on what model?** The plan describes the output but not the methodology. How do you map a CII change to a portfolio return impact? Is it a historical regression (when Taiwan CII rose by X, Taiwan-exposed equities fell by Y)? Is it a sensitivity analysis? A factor model? This is the core IP of the Pro tier and it gets one bullet point.
- **No benchmark or backtesting for portfolio exposure.** If you tell a PM their portfolio has "high geopolitical risk," they'll ask: "compared to what?" You need a benchmark portfolio (e.g., MSCI World) with its own geopolitical exposure for comparison. And you need to show that historically, portfolios with high CII exposure underperformed — otherwise the metric is unfalsifiable.
- **Country -> holding mapping is a hard problem.** "TSMC -> Taiwan 85%, Japan 10%" — where does this mapping come from? Revenue geography? Manufacturing location? Supply chain dependency? Different mappings produce different exposure numbers. The plan assumes this mapping exists and is straightforward. It's not.
- **No risk of ruin framework.** The plan talks about "CII-weighted risk score" but doesn't connect it to the sizing framework a real PM uses. A PM doesn't want to know "your Taiwan exposure is 23%." They want to know: "given current Taiwan CII, what's the probability of a > 5% portfolio drawdown from geopolitical causes in the next 90 days?"

*Specific Recommendations:*
1. Define the CII -> portfolio impact model explicitly. Start simple: use historical correlation between CII changes and country equity index returns. "When country X's CII rose by 10+ points in a month, the country ETF declined an average of Y% (N=Z observations, 95% CI: [a, b])." This is testable and transparent.
2. Provide a benchmark: "Your portfolio's geopolitical risk score is 42. The global benchmark (MSCI World) is 31. You are 35% more exposed than the average global portfolio."
3. For country -> holding mapping, use a transparent methodology: start with primary listing country, override with known revenue geographic breakdowns for major companies (the top 500 have this data available). Disclose the methodology on the portfolio page.
4. Frame portfolio exposure as informational, not advisory. "NexusWatch identifies geopolitical exposure but does not provide investment advice." This is both legally necessary and intellectually honest.

*Risk Flags:*
- **HIGH:** Telling a hedge fund PM their portfolio loses "~12%" without a defensible methodology is worse than not having the feature. They will immediately stress-test the number against their own models. If it's wrong, trust is gone.
- **MEDIUM:** Country -> holding mapping at scale requires a data source (FactSet, Bloomberg terminal, or open data). Building this manually for thousands of securities is unsustainable.

*Cross-domain:*
- Directly connected to Dr. Volkov's macro methodology concerns.
- Connected to Dr. Vasquez's calibration requirement — portfolio impact estimates need confidence intervals.
- Connected to Priya's data governance — portfolio holdings are financial PII with storage and access implications.

---

### 9. Ava Chen — Product Design Leader

**Domain Assessment**

*Strengths:*
- The trust layer design philosophy is excellent. Confidence badges, verification shields (green/yellow/gray/orange), and source attribution are visual trust signals that users can learn and internalize. This is a design language for credibility.
- The "DATA CONFIDENCE: 94%" platform health badge in the header is a bold UX choice. It's radical transparency that doubles as a brand statement. When it drops to 87%, users see the platform being honest. That builds more trust than a permanent 100%.
- Crisis Mode (Phase 9) — "map focuses on affected region, irrelevant layers dim" — is the right interaction pattern. Reducing noise during high-signal events is sophisticated UX.
- Time-travel scrubber (Phase 8) is a beautiful interaction concept. Scrubbing through the world's state over time on a globe is the kind of "show, don't tell" UX that makes people share the product.

*Weaknesses:*
- **The Country Detail Panel (Phase 1B) is described as a "slide-out panel on country row click."** A slide-out panel with 6 component bars, source lists, fetch timestamps, top 5 events, AND a "what we don't cover" section is extremely dense. How does this work on mobile? At 375px, a slide-out panel with this much content either scrolls forever or is unreadable. The most important UX component in Tier 1 has no responsive design consideration.
- **The verification shield colors need accessibility validation.** Green/yellow/gray/orange on a dark map background — are these distinguishable for colorblind users (8% of men)? CONFIRMED/CORROBORATED/UNVERIFIED/CONTESTED need secondary indicators (icons, patterns, or labels) beyond color alone.
- **Cascade visualization (Phase 6) with "pulsing arrows" and "radiating rings" risks visual noise.** On a globe with 86 countries, multiple cascade paths active simultaneously would create visual chaos. How many cascades can be shown at once? What's the visual hierarchy when 5 cascade chains overlap?
- **No design system extension planned.** The plan introduces new UI elements (confidence badges, verification shields, cascade arrows, scenario overlays, timeline scrubber, crisis mode) but doesn't mention extending the existing design system. These need to be componentized and documented, or you'll have 6 different badge styles by Phase 8.
- **The scenario overlay UX is undefined.** "Shows a Scenario Mode overlay on the map with affected countries highlighted, cascade arrows, and estimated CII changes" — is this a full-screen takeover? A split view? A transparent overlay? How does the user exit scenario mode? Can they compare scenario vs. reality side-by-side?

*Specific Recommendations:*
1. Design the Country Detail Panel as a full-page on mobile, slide-out on desktop. On mobile, use progressive disclosure: summary (CII + badge + top event) visible immediately, component breakdown behind a "Details" accordion, source list behind a "Sources" accordion.
2. Add secondary indicators to verification shields: CONFIRMED (green shield + checkmark icon), CORROBORATED (yellow shield + two-arrow icon), UNVERIFIED (gray shield + question mark), CONTESTED (orange shield + exclamation). Color + icon + label = accessible to all users.
3. Limit cascade visualization to one active cascade at a time. User selects a country -> sees outgoing cascades. Overlapping cascades = confusion. Use a "cascade explorer" interaction: click country -> see its cascade tree in isolation.
4. Create a design system extension plan: define badge component, shield component, overlay component, and scrubber component BEFORE building individual phases. This front-loads 2 days of design work but saves 2 weeks of inconsistency cleanup.
5. Scenario Mode should be a dedicated "mode" with a clear entry/exit: banner at top ("Scenario Mode: Hormuz Closure"), affected countries highlighted in amber on the map, sidebar showing scenario details + CII deltas. Exit via "Return to Live" button. Never a transparent overlay — too much visual confusion with live data underneath.

*Risk Flags:*
- **HIGH:** The Country Detail Panel is the first trust-layer UX users experience. If it's dense and unreadable on mobile (where 50%+ of users will access it), the trust-layer fails at the UX level even if the data is perfect.
- **MEDIUM:** Cascade visualization without a visual hierarchy limit will look like a plate of spaghetti on the globe. Users will disable it immediately.
- **MEDIUM:** No design system extension = 12 phases of ad-hoc UI components that don't cohere. The product will feel like 12 prototypes stitched together.

*Cross-domain:*
- Connected to Tara's FTUE concern — the Country Detail Panel IS the FTUE for trust. It must be designed for first-time users, not power users.
- Connected to Kai's error boundary concern — design must include error/empty/loading states for every overlay.
- Connected to Riley's funnel concern — the free-tier UX IS the top of the funnel. Design must make the trust layer visible and compelling without payment.

---

### 10. Horizon Fund — VC Investment Board

**Domain Assessment (Investment Memo Format)**

**Thesis:** NexusWatch is positioning as the world's first auditable intelligence platform — a differentiated take on geopolitical monitoring that competes on trust rather than coverage. Pricing at $29/$99 targets prosumer and professional users, with a B2B API at $299+ as the scalability play.

**Market:**
- TAM: Global risk intelligence market is $15B+ (Palantir, Dataminr, Janes, Stratfor). The prosumer/SMB segment NexusWatch targets is ~$500M and growing as geopolitical instability becomes mainstream concern.
- SAM: English-speaking professionals who actively monitor geopolitics and have budget authority: ~200K globally (commodity traders, EM analysts, corporate security, journalists, NGOs).
- SOM (12-month realistic): 500-2,000 paid users at blended $45 ARPU = $22K-$90K ARR. This is a real business but not venture-scale without the API/B2B play.

**Competition:**
- World Monitor: 160 countries, $4.99-$49, shipping fast. Direct threat on coverage and price. NexusWatch's trust layer is the differentiation, but it must ship to matter.
- SitDeck: Feature-rich, some overlap. Less direct threat.
- Dataminr/Palantir: Enterprise. Different market. But they set the mental benchmark for "geopolitical intelligence" quality.
- Risk: A well-funded competitor could build a trust layer in 3-6 months once they see it working. The moat is data quality + prediction track record + brand trust — all of which take time to accumulate.

**Unit Economics (Projected):**
- Revenue per customer: $29-$99/mo ($348-$1,188/yr)
- CAC: ~$0 (organic launch channels) — but this means growth is slow and founder-effort-intensive
- Cost to serve: ~$50-100/mo in API costs (ACLED, GDELT, LLM inference) + $50/mo Neon + hosting. At 100 users, gross margin is healthy. At 10 users, the platform runs at a loss.
- LTV: Unknown. No retention data. No churn baseline. This is the biggest unknown.

**Strengths:**
1. Differentiated positioning — trust/verification is genuinely novel in this market
2. Strong founder-market fit — technical depth, intelligence community understanding, OSINT credibility
3. Multiple revenue vectors — newsletter, platform, API, enterprise
4. The prediction ledger is a compounding moat — the longer it runs, the more valuable the accuracy data becomes

**Weaknesses:**
1. Zero revenue, zero users, zero retention data. Everything is theoretical.
2. Solo founder building a 12-phase product. The plan is ambitious for a 10-person team, let alone one person.
3. The trust positioning requires sustained execution over months/years. One bad prediction prominently displayed, one data quality failure, one stale "CONFIRMED" badge, and the positioning collapses.
4. No distribution engine beyond organic launch channels. Growth is limited by one person's ability to create content and engage communities.
5. The $29 price point vs. World Monitor's $4.99 is a 6x premium. The trust layer must be dramatically, obviously better to justify it. If it's even slightly underwhelming, users will take the cheaper option.

**Verdict: Conditional Interest**

The trust/verification positioning is genuinely differentiated and defensible if executed well. The market is real and growing. The founder has the right instincts. But:

- We need to see 100 paying users before we believe in PMF
- The 10-week / 12-phase plan needs to be cut to 3-4 phases with a launch gate at Week 3
- The prediction ledger is the long-term moat — but it needs statistical rigor from day 1 (per Dr. Vasquez's concerns)
- The B2B API is where this becomes venture-interesting, but that's Phase 10 in a 12-phase plan. Move it up or fund the journey there

**What would make us upgrade to "Fund":**
- 200+ paid users with < 10% monthly churn
- Prediction ledger with 6+ months of tracked accuracy showing improvement
- 3+ B2B API customers (validates the enterprise wedge)
- Clear evidence the trust positioning creates willingness-to-pay premium over competitors

---

## Phase 1.5: Existential Risk Check

### "What would kill NexusWatch's trust positioning?"

| Member | Answer |
|--------|--------|
| **Priya Raghavan** | A false "CONFIRMED" verification badge on a sensitive event (e.g., labeling an airstrike as confirmed when it's not). One screenshot of NexusWatch saying "CONFIRMED" next to something proven false, shared on X, destroys the entire trust thesis. The verification engine's entity resolution is the existential risk. |
| **Dr. Vasquez** | The prediction ledger showing NexusWatch is wrong 60%+ of the time with no explanation. If you promise radical transparency and the transparency reveals incompetence, it's worse than never having the ledger. You need a "learning in public" narrative framework BEFORE the first accuracy report. |
| **Tara Kim** | Launching 12 half-built features instead of 4 polished ones. Users arrive, find scenario simulation that gives nonsensical results, a cascade viz that shows wrong arrows, a portfolio tool that computes wrong exposure. "The verified intelligence platform" feels like a broken prototype. Death by scope. |
| **Kai Nakamura** | A production outage during a real geopolitical crisis. If users come to NexusWatch during a Taiwan escalation and the site is down, they'll never come back. The platform must be reliable when it matters most — which is also when traffic spikes. No load testing or scaling strategy in the plan. |
| **Marcus Obi** | Never launching. The plan is so ambitious that it takes 6 months instead of 10 weeks, and by then World Monitor has copied the trust layer (it's visible, it's copyable) and NexusWatch has zero users and zero data. The moat is execution speed + accuracy track record. Both require launching, not building. |
| **Riley Matsuda** | No distribution. Beautiful product, zero users. The daily brief is the distribution engine, but the plan focuses on the platform, not the brief. If the brief isn't compelling enough to grow organically, the platform never gets its audience. The brief IS the funnel top, and it's a secondary concern in this plan. |
| **Dr. Volkov** | The marketExposure component being obviously wrong. A hedge fund analyst checks their known exposure against NexusWatch and it's 30% off. They tell 5 colleagues. Word spreads in the finance community that "NexusWatch's numbers are garbage." Finance people talk. A lot. |
| **Dr. Rennert** | Telling a PM their portfolio loses "~12% if Taiwan CII hits 80" and then Taiwan CII hits 80 and the actual loss is 3% or 25%. Either direction destroys credibility. If you give quantitative estimates, they must be defensible. |
| **Ava Chen** | The product looking like a hackathon project at launch. If the trust messaging says "premium intelligence" but the UI says "side project," the cognitive dissonance kills conversion. The email redesign decision (Apr 11) was right — first impressions matter more than speed. |
| **Horizon Fund** | A well-funded competitor (Dataminr, or a new startup with $10M seed) shipping a trust layer + 160 countries + lower price within 12 months. The trust positioning is novel but not patentable. The moat is the prediction track record — which requires TIME. Every week without launching is a week of track record not accumulating. |

### "What's the one thing we're wrong about?"

| Member | Answer |
|--------|--------|
| **Priya Raghavan** | We're wrong that users will care about data provenance. Most users want the answer, not the receipt. The evidence chain is the right thing to build — but the audience that values it may be 5% of users, not 50%. |
| **Dr. Vasquez** | We're wrong that CII is a meaningful metric. It's a proprietary composite index with no external validation, no academic peer review, and no track record. We're treating it as ground truth when it's an opinion with math around it. |
| **Tara Kim** | We're wrong that the intelligence community aesthetic (terminal, dark mode, dossier) appeals to the majority of our personas. Commodity traders, corporate security directors, and NGO managers don't want to feel like they're in a spy movie. They want a clean dashboard. |
| **Kai Nakamura** | We're wrong that a solo developer can maintain 6 data sources, 30 map layers, an AI analyst, a scenario engine, a portfolio tool, AND a public API. The maintenance burden of this system will consume all development time within 6 months. |
| **Marcus Obi** | We're wrong that the trust layer justifies a 6x price premium over World Monitor. Users may prefer "good enough data at $5" over "verified data at $29." The intelligence community is a small addressable market. |
| **Riley Matsuda** | We're wrong that Product Hunt + Reddit is the right launch channel. Geopolitical intelligence buyers don't browse Product Hunt. They read specific newsletters, attend specific conferences, and trust specific voices. The warm network matters more than launch platforms. |
| **Dr. Volkov** | We're wrong about the portfolio exposure market. Institutional users already have Bloomberg Terminal, FactSet, and internal risk teams. A $99/mo web tool isn't replacing their existing workflow — at best it's supplementary. The real market is the prosumer who DOESN'T have Bloomberg. |
| **Dr. Rennert** | We're wrong that scenario simulation can be meaningfully automated. Real scenario analysis requires deep domain expertise, classified information, and judgment that can't be reduced to CASCADE_RULES. The automated version will feel like a toy to serious analysts and overconfident to casual users. |
| **Ava Chen** | We're wrong that dark mode is the default for this audience. Intel professionals work in bright offices with fluorescent lighting. They need a light mode that works. The Apr 11 email decision (light intel dossier) was right — extend that thinking to the platform. |
| **Horizon Fund** | We're wrong about the TAM. The number of people willing to pay $29+/mo for geopolitical intelligence is smaller than we think. Stratfor peaked at ~75K subscribers at $149/yr ($12.4/mo). The ceiling may be 10K users at $29/mo = $3.5M ARR. That's a great lifestyle business, not a venture outcome. |

---

## Phase 2: Council Discussion

### Areas of Agreement

**Universal agreement: The plan must be cut dramatically.**
All 10 members agree that 12 phases in 10 weeks for a solo developer is unrealistic. The April 10 board review flagged the same issue ("80% built, 5% shipped"). This plan repeats the pattern. There is near-universal agreement that:
- Tier 1 (Trust Foundation) is the correct priority
- Phase 4A (AI analyst with citations) is the highest-value Tier 2 feature
- Phase 7 (Portfolio exposure) is the correct Pro-tier gate
- A launch/revenue gate must be inserted no later than Week 3-4

**Universal agreement: The trust positioning is correct.**
No member disputes that trust/verification is the right differentiator against World Monitor and others. The disagreement is about execution, not strategy.

**Universal agreement: The prediction ledger is the most important long-term asset.**
If executed with statistical rigor, the accuracy track record becomes an un-copyable moat. But it needs to start recording NOW (even before launch) to build the data asset.

### Areas of Conflict

**Conflict 1: Scope — Ship 4 polished features vs. ship 8 functional features**

*Tara Kim + Marcus Obi (Ship 4):* Cut to Trust Foundation (Phases 1-3) + AI Analyst (4A) + Portfolio Exposure (7). Launch at Week 3-4. Everything else is post-launch.

*Kai Nakamura (Ship 8 with infra-first approach):* Build the underlying infrastructure (pre-computation, caching, API versioning, design system) for ALL features first, then layer features on a solid foundation. Shipping 4 features on bad infrastructure is technical debt that slows everything later.

**Resolution:** Tara and Marcus have the stronger argument. Infrastructure serves the features users pay for. Build infrastructure for 4 features, not 12. Kai's concerns are valid but should be addressed as "build the right infra for the features we're shipping now" rather than "build infra for features we might ship later."

**Conflict 2: Scenario simulation priority — Phase 2 feature vs. Phase 3 feature**

*Riley Matsuda (Move it up):* Scenario simulation is the marketing moonshot. "What happens if China blockades Taiwan?" is the most shareable, most clickable content NexusWatch can produce. It should ship with the launch.

*Dr. Vasquez + Dr. Rennert (Move it down):* Scenario simulation without proper uncertainty quantification and empirical validation will produce overconfident, inaccurate outputs that damage the trust positioning. It's the highest-reward AND highest-risk feature. Ship it after the trust foundation proves the methodology.

**Resolution:** Dr. Vasquez and Dr. Rennert have the stronger argument. Scenario simulation that produces wrong results destroys the trust positioning faster than not having the feature at all. Ship it as a "beta" feature post-launch when you have CII data and cascade rules validated against history.

**Conflict 3: Free tier generosity — Give away the trust layer vs. gate it**

*Riley Matsuda (Give it away):* The trust layer (confidence badges, verification shields) must be visible in the free tier. It's the conversion mechanism. If free users can't see what makes NexusWatch different, they have no reason to pay.

*Marcus Obi (Gate some of it):* Give away confidence badges on the globe, but gate the Country Detail Panel (the deep evidence chain). "See the number AND the confidence — want to know why? That's $29/mo." The free tier shows the differentiation; the paid tier delivers the depth.

**Resolution:** Both are partially right. Marcus's formulation is better: show confidence badges and verification shields for free (differentiation visible), gate the evidence chain and detail panel (depth requires payment). This is the classic freemium: the free product IS the sales pitch for the paid product.

**Conflict 4: Portfolio exposure methodology — Ship simple vs. ship defensible**

*Marcus Obi (Ship simple):* Linear weighted average of country CII by portfolio exposure. It's wrong-ish but directionally useful. Ship it, get users, refine later.

*Dr. Rennert + Dr. Volkov (Ship defensible):* A methodology that serious finance users can poke holes in will damage credibility in exactly the audience that pays $99/mo. Better to launch with fewer features and a sound methodology than more features with a flawed one.

**Resolution:** Dr. Rennert wins. Portfolio exposure is the Pro-tier justification. If Pro users find the methodology naive, they churn in month 1 and tell their colleagues. Ship with correlation-adjusted methodology (even if simple) and transparent documentation of assumptions. "Here's exactly how we compute this and here are the known limitations" is more trustworthy than a black-box number.

### Questions for Chairman

1. **Launch timing:** The council unanimously recommends a launch gate at Week 3-4, not Week 10. Does the Chairman concur? This means the trust foundation (evidence chains, confidence badges, verification engine) ships first, with AI analyst and portfolio exposure following in Weeks 5-8.

2. **Prediction ledger framing:** Dr. Vasquez raises that early accuracy numbers will likely be mediocre. How does the Chairman want to frame this? Options: (a) "Learning in public — here's how we're improving" with a visible improvement trajectory, or (b) delay the public accuracy dashboard until 6 months of data establishes a reasonable baseline.

3. **Scenario simulation timeline:** The council is split. Riley wants it for launch. Vasquez/Rennert want it post-validation. Does the Chairman want scenario simulation as a launch feature (accepting quality risk) or a post-launch feature (accepting marketing opportunity cost)?

4. **Free tier boundary:** Does the Chairman agree with the proposed gate? Free: globe + CII + confidence badges + daily brief. $29: detail panel + AI analyst + alerts + deep-dives. $99: portfolio exposure + scenario sim + crisis playbooks + API.

5. **Maintenance reality check:** Kai flags that maintaining 6 data sources, 30 layers, an AI analyst, AND a public API as a solo developer is unsustainable within 6 months. What's the Chairman's plan for operational sustainability? Accept a narrower scope? Budget for a part-time contractor? Automate more aggressively?

---

## Phase 3: Unified Verdict

### APPROVED WITH CONDITIONS

**Summary:** The "Verified Intelligence Platform" strategy is sound — trust/verification is the correct differentiator, the pricing is defensible, and the persona mapping is exceptional. However, the 10-week / 12-phase build plan must be compressed to a 4-week / 4-phase initial launch, with remaining features sequenced post-launch based on user demand and revenue validation. The April 10 board review warned "80% built, 5% shipped." This plan, if executed as written, would make it "95% built, 5% shipped."

**Key Tradeoffs Weighed:**

| Tradeoff | Decision |
|----------|----------|
| Broad feature set vs. polished launch | Polished launch wins. 4 features that work > 12 features that don't. |
| Architecture-first vs. launch-first | Launch-first wins with a caveat: build pre-computation/caching infra for the 4 launch features only. |
| Scenario sim at launch vs. post-launch | Post-launch. The risk of overconfident wrong outputs outweighs the marketing benefit. |
| Simple portfolio methodology vs. defensible | Defensible. The $99/mo audience will validate the methodology on day 1. |
| Give away trust layer vs. gate it | Hybrid: badges and shields visible for free, evidence chains gated at $29. |

**Conditions for Approval:**

1. **MUST: Cut to 4-phase initial scope.** Phase 1 (Evidence chain + confidence + platform health), Phase 2 (Verification engine), Phase 4A (AI analyst with citations), Phase 7 (Portfolio exposure for Pro tier). Everything else is post-launch.

2. **MUST: Insert revenue gate at Week 3-4.** The founding-100 tier ($19/mo lifetime) launches with the trust foundation. Stripe checkout must be live before any feature beyond Tier 1 ships.

3. **MUST: Define verification engine entity resolution rules.** Before shipping CONFIRMED/CONTESTED badges, define and document the matching logic. Priya's concern about false CONFIRMED badges is existential.

4. **MUST: Pre-register prediction ledger scoring methodology.** Before recording begins, define what "accurate" means, what metrics track it, and how early results will be communicated. Dr. Vasquez's concern is valid — the ledger is a trust builder OR trust destroyer depending on execution.

5. **MUST: Design the FTUE.** Before launch, walk through the first 60 seconds of a new user's experience. If it's not designed, it's not ready to launch.

6. **SHOULD: Define the free/paid gate in a single document.** Free: globe + CII + badges + daily brief. $29: detail panel + AI + alerts. $99: portfolio + scenarios + API.

7. **SHOULD: Build the 7-day email nurture sequence.** The daily brief is the retention engine. The nurture sequence is the conversion engine. Both are needed at launch.

8. **SHOULD: Add referral mechanism to daily brief.** Beehiiv has native referral tools. Set up "share and earn a free month" before launch to create compounding growth.

**What the council does NOT recommend:**
- Do NOT build the full 12-phase plan before launching
- Do NOT ship scenario simulation without empirical validation of cascade rules
- Do NOT launch the B2B API (Phase 10) until you have 50+ paying platform users
- Do NOT price-match World Monitor — the trust layer justifies the premium IF it ships and is excellent

---

*Review conducted per The Council Charter. Honesty over harmony.*
*Full board + quant panel. 10 members. Filed 2026-04-13.*
