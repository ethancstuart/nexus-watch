# NexusWatch Marketing Automation — Comprehensive Plan

**Status:** v1 plan — drafted 2026-04-13. Implementation pass 1 ships alongside this doc.
**Default mode:** SHADOW (engine generates and logs, does not post) for the first 7 days.
**Owner of the kill switch:** Chairman (Ethan).

---

## Executive Summary

This is the design and build plan for the NexusWatch agentic marketing automation module — Agent-to-X, Agent-to-Substack, Agent-to-Medium, Agent-to-LinkedIn, Agent-to-Threads, Agent-to-Bluesky, Agent-to-beehiiv. After initial human approval of voice and shadow-mode samples, the system runs autonomously, drafts and publishes per platform on a defined cadence, learns from per-post engagement weekly, and exposes a single admin surface at `/#/admin/marketing` with a global PAUSE-ALL kill switch and per-platform toggles.

It is built on top of the existing Track C foundation (`social_queue`, `social_actions`, `voice/eval`) — extending it from a single-platform (X via Buffer, human-approved) flow to a multi-platform autonomous flow with shadow mode by default.

The 12-month target is 100-200 paid customers and 5-10K free newsletter subscribers. The 24-month target is 500 Analyst + 150 Pro = $352K ARR. The marketing automation module is the **distribution lever** that makes those targets reachable on a solo-operator schedule. It is not the conversion lever — the newsletter, pricing page, and onboarding flow are the conversion levers, and they are out of scope here.

---

## Specialist Input

### Riley Matsuda — VP Growth & GTM
> "Funnels, not features. The newsletter is your funnel. Every social post is one job: get a qualified reader to the newsletter signup. Not the paid tier. The newsletter."

- Soft CTAs to newsletter, never to paid tier, on X/LinkedIn/Bluesky/Threads/Medium.
- Substack and beehiiv (the newsletter platforms themselves) are the only places paid-tier CTAs live.
- Track impression → newsletter-signup as the top-line growth metric. Everything else is noise until that conversion rate exceeds 0.4%.

### Tara Kim — CPO
> "The product is the protagonist. Every post should be a use case for NexusWatch. If you can write the post without referencing a NexusWatch layer, you shouldn't write it."

- Every Signal-pillar post must name the layer or system that generated the insight.
- Every Pattern-pillar post must include a link or screenshot to the relevant view in the product.
- Don't post about geopolitics in general — post about geopolitics through the NexusWatch lens.

### Ava Chen — Product Design Leader
> "The admin surface is where the chairman builds trust with the system. It needs to feel like a cockpit, not a dashboard."

- Single screen, no tabs, no navigation depth.
- The PAUSE-ALL button is always visible, top-right, single click.
- Per-post engagement metrics inline in the queue view, no drill-down required for the top-30.
- Voice context editor is a textarea + dropdown — drop in an example, label it loved/hated/neutral, save. That's it.

### Jordan Reeves — VP Strategic Communications
> "If a single post on a single account carries the whole brand, then 200 posts/month carry the whole brand 200 times. The voice doc is your first line of defense. The deterministic eval is your second. Shadow mode is your third. Don't skip any of them."

- Voice doc is canonical. Engine never overrides it.
- Voice eval (existing `/api/voice/eval`) gates every draft. Score < 70 = auto-hold for human review even in live mode.
- Crisis playbook: the global PAUSE switch must propagate to every cron in <60 seconds. Use Vercel KV (instant) not env vars (require redeploy).
- Corrections workflow: any verified factual error gets a public correction post within 4 hours. The engine can autonomously post corrections only after a human approves the correction template once.

### Marcus Obi — Founder/CEO Advisor
> "Revenue velocity. Are you closing the loop from impression to dollar? If the answer is 'no, just to email,' that's fine for month 1. By month 3 we should see the cohort math."

- Track signup-cohort-to-paid-conversion at 30/60/90 days.
- Founding-100 lifetime tier ($19/mo) appears in 1-of-6 posts maximum and always with explicit scarcity copy.
- Once Founding-100 is closed, the same cadence pivots to Annual-Analyst ($290/yr) promo.

### Sanjay Mehta — AI/ML Engineer
> "This is a content generation system, not an AGI. Use Haiku for high-volume short-form (X/Bluesky/Threads), Sonnet for long-form (Substack/Medium). Cache the voice profile. Don't pay Sonnet for a 280-character tweet."

- Model selection: claude-haiku-4-5 for X/Bluesky/Threads/LinkedIn short-form; claude-sonnet-4-5 for Substack long-form, Medium long-form, weekly voice retune.
- Cache: voice profile (system prompt) is stable for a week — load once per cron run, reuse across all drafts.
- Cost target: ≤ $30/month at full cadence (~250 short-form drafts + ~20 long-form drafts/month).

### Nadia Torres — Head of CX
> "If a person replies to your auto-post and gets ignored, you've lost them. Period. The reply queue is more important than the posting cadence."

- Auto-post: yes. Auto-reply: no.
- Inbound replies/mentions on X surface in the existing social-queue at /#/admin/social-queue (the queue that ships drafted human-approved replies). Marketing-automation posts go into a separate queue at /#/admin/marketing so the two flows don't collide.

### Devin Park — Sales Specialist
> "Two thresholds: a comment from a director-level intel buyer is a sales signal. A reply from anyone with 'analyst,' 'researcher,' 'PM,' 'newsroom,' 'policy,' or 'fund' in their bio gets flagged at 5x weight."

- Implement intel-buyer signal weight in the engagement table.
- Sales-assist trigger: any reply from an enriched profile matching the intel-buyer regex creates a row in `marketing_sales_signals` (future, not in v1 scope). v1 just flags it in the engagement table.

### Camille Rousseau — Product Marketing Manager
> "Five pillars. Tag every post. Report engagement-by-pillar weekly. Rebalance based on what works."

- Pillars: Signal (40%), Pattern (20%), Methodology (15%), Product (15%), Context (10%).
- Hard-coded distribution for the first 4 weeks — engine respects pillar quotas per week.
- After week 4, allow the voice-retune loop to shift pillar weights based on engagement, but never let any pillar drop below 5% or rise above 60%.

### Helena Voss — Geopolitical Intel Sector Expert
> "Calibration over volume. One post that names a limitation explicitly will earn more credibility than ten that don't."

- Every draft must include either (a) a confidence qualifier, (b) a named source, or (c) an explicit limitation. Voice eval already enforces this.
- First-60-minutes rule: engine does not draft on any breaking event in the first 60 minutes — regardless of platform. Wait for confirmation from a second source.

### Aiyana Brooks — Content Strategist
> "Content waterfall. One Sunday Substack issue → 5 derivative posts across the week. Plan the cascade at draft time, not piecemeal."

- The Sunday Substack long-form generation triggers a planned cascade in `marketing_posts` with `parent_post_id` linking each derivative to the source.
- Topic dedup: `(topic_key, entity_keys)` checked over 7-day window before generating.

### Marcus Liu — Social Media Manager
> "The voice is constant. The shape changes per platform. Get the shape wrong and the voice doesn't matter — the post just doesn't perform."

- Per-platform adapters with hardcoded length, structure, hook patterns, and time windows (see persona doc).
- Cross-post offsets enforced (Medium 24h after Substack, LinkedIn 36h, etc.).

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          NEXUSWATCH PLATFORM                            │
│                                                                         │
│  ┌──────────────────────┐      ┌────────────────────────┐              │
│  │ Intelligence Sources │      │ Editorial Calendar     │              │
│  │ • CII updates        │      │ • Recurring formats    │              │
│  │ • ACLED events       │      │ • Pillar quotas        │              │
│  │ • GDELT signals      │      │ • Content waterfall    │              │
│  │ • Verification engine│      │ • Topic dedup history  │              │
│  └──────────┬───────────┘      └───────────┬────────────┘              │
│             │                              │                           │
│             └──────────────┬───────────────┘                           │
│                            ▼                                           │
│              ┌─────────────────────────────────┐                       │
│              │   topicSelector.ts              │                       │
│              │   Picks next topic + pillar     │                       │
│              │   per platform per cron run     │                       │
│              └────────────┬────────────────────┘                       │
│                           ▼                                            │
│              ┌─────────────────────────────────┐                       │
│              │   contentGenerator.ts           │                       │
│              │   Calls Claude (Haiku/Sonnet)   │                       │
│              │   With voice-profile system     │                       │
│              │   prompt + few-shot examples    │                       │
│              └────────────┬────────────────────┘                       │
│                           ▼                                            │
│              ┌─────────────────────────────────┐                       │
│              │   /api/voice/eval (existing)    │                       │
│              │   Deterministic + semantic      │                       │
│              │   pass/fail + voice_score       │                       │
│              └────────────┬────────────────────┘                       │
│                           ▼                                            │
│              ┌─────────────────────────────────┐                       │
│              │   marketing_posts table         │                       │
│              │   Always logs, regardless       │                       │
│              │   of shadow vs live             │                       │
│              └────────────┬────────────────────┘                       │
│                           ▼                                            │
│           ┌───────────────────────────────────────┐                    │
│           │   Per-platform adapter + dispatcher   │                    │
│           │   Checks: PAUSE flag (KV)             │                    │
│           │           SHADOW flag (KV)            │                    │
│           │           per-platform enabled (KV)   │                    │
│           │           per-platform window (UTC)   │                    │
│           └───┬──────┬──────┬──────┬──────┬───┬───┘                    │
│               ▼      ▼      ▼      ▼      ▼   ▼                        │
│              X    LinkedIn Sub  Medium Bluesky Threads                 │
│              │      │      │      │      │      │                      │
│           Typefully│  email-to│ Medium  AT     Threads                 │
│              │   Typefully post  API   Proto   API                     │
└──────────────┼──────┼──────┼──────┼──────┼──────┼─────────────────────┘
               │      │      │      │      │      │
               ▼      ▼      ▼      ▼      ▼      ▼
                       (live platforms)


┌─────────────────────────────────────────────────────────────────────────┐
│                       FEEDBACK LOOP (weekly)                            │
│                                                                         │
│  marketing_engagement (per-post metrics, polled daily) ──┐              │
│         ▲                                                ▼              │
│         │                                  marketing-voice-learn cron   │
│  Platform APIs (X, LI, Substack, etc.)              │                   │
│         ▲                                           ▼                   │
│         └───────────── poll-engagement ──── voice profile updated       │
│                                             (system prompt + few-shots) │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Data Model

### `marketing_posts`
One row per generated draft (regardless of shadow/live). Source of truth for "what the engine produced."

| Column              | Type           | Notes                                                    |
|---------------------|----------------|----------------------------------------------------------|
| id                  | SERIAL PK      |                                                          |
| platform            | TEXT NOT NULL  | x, linkedin, substack, medium, threads, bluesky, beehiiv |
| pillar              | TEXT           | signal, pattern, methodology, product, context           |
| topic_key           | TEXT           | Semantic key for dedup, e.g. "iran-strikes-2026-04-13"   |
| entity_keys         | TEXT[]         | Countries/orgs mentioned for dedup                       |
| format              | TEXT           | post, thread, longform, short                            |
| content             | TEXT NOT NULL  | The drafted content (for thread: JSON array of tweets)   |
| metadata            | JSONB          | Source URLs, layer refs, charts, scheduled_time          |
| status              | TEXT NOT NULL  | drafted, scheduled, posted, failed, suppressed           |
| shadow_mode         | BOOLEAN        | true = generated in shadow mode, never posted            |
| voice_score         | INTEGER        | from /api/voice/eval                                     |
| voice_violations    | TEXT[]         | from /api/voice/eval                                     |
| parent_post_id      | INTEGER        | FK to marketing_posts (cascade derivative)               |
| scheduled_at        | TIMESTAMPTZ    | when the dispatcher should publish                       |
| posted_at           | TIMESTAMPTZ    | when actually posted                                     |
| platform_post_id    | TEXT           | platform-returned id (or "shadow" prefix in shadow mode) |
| platform_url        | TEXT           |                                                          |
| platform_error      | TEXT           |                                                          |
| created_at          | TIMESTAMPTZ    |                                                          |

### `marketing_voice_context`
Loved/hated/neutral examples for the few-shot voice profile.

| Column      | Type        | Notes                                          |
|-------------|-------------|------------------------------------------------|
| id          | SERIAL PK   |                                                |
| platform    | TEXT        | x, linkedin, substack, etc. or 'all'           |
| category    | TEXT        | loved, hated, neutral                          |
| content     | TEXT        | the example post                               |
| notes       | TEXT        | why it's loved/hated                           |
| created_at  | TIMESTAMPTZ |                                                |
| created_by  | TEXT        | admin email                                    |

### `marketing_topics_used`
Append-only dedup log.

| Column       | Type        | Notes                                  |
|--------------|-------------|----------------------------------------|
| id           | SERIAL PK   |                                        |
| topic_key    | TEXT        |                                        |
| entity_keys  | TEXT[]      |                                        |
| platform     | TEXT        |                                        |
| posted_at    | TIMESTAMPTZ |                                        |
| post_id      | INTEGER     | FK to marketing_posts                  |

### `marketing_engagement`
Per-post engagement, polled daily for 14 days post-publish.

| Column          | Type        | Notes                                |
|-----------------|-------------|--------------------------------------|
| id              | SERIAL PK   |                                      |
| post_id         | INTEGER FK  | marketing_posts.id                   |
| polled_at       | TIMESTAMPTZ |                                      |
| impressions     | INTEGER     |                                      |
| likes           | INTEGER     |                                      |
| reposts         | INTEGER     |                                      |
| replies         | INTEGER     |                                      |
| clicks          | INTEGER     |                                      |
| intel_buyer_signal | INTEGER  | replies from intel-buyer-bio profiles |
| raw_data        | JSONB       | platform-specific metrics            |

---

## API Endpoints

### Cron jobs (added to vercel.json)

| Path                                  | Schedule         | Purpose                                     |
|---------------------------------------|------------------|---------------------------------------------|
| `/api/cron/marketing-x`               | `0 */3 * * *`    | Every 3h: maybe draft+post X content        |
| `/api/cron/marketing-linkedin`        | `0 11 * * 1-5`   | Mon-Fri 11:00 UTC: 1 LI post                |
| `/api/cron/marketing-substack`        | `0 12 * * 0,3`   | Sun 12:00 + Wed 16:00 UTC: long-form/short  |
| `/api/cron/marketing-medium`          | `0 14 * * 0`     | Sun 14:00 UTC: cross-post from Substack     |
| `/api/cron/marketing-bluesky`         | `0 13,19 * * *`  | Twice daily: Bluesky posts (mirror X)       |
| `/api/cron/marketing-threads`         | `0 23 * * *`     | Daily 23:00 UTC: Threads casual register    |
| `/api/cron/marketing-engagement-poll` | `0 */6 * * *`    | Every 6h: poll engagement on recent posts   |
| `/api/cron/marketing-voice-learn`     | `0 4 * * 1`      | Mondays 04:00 UTC: weekly voice retune      |

### Admin endpoints (auth via `resolveAdmin`)

| Method | Path                                       | Purpose                                |
|--------|--------------------------------------------|----------------------------------------|
| GET    | `/api/admin/marketing/state`               | Get pause/shadow/per-platform flags    |
| POST   | `/api/admin/marketing/pause`               | Toggle pause/shadow/per-platform flags |
| GET    | `/api/admin/marketing/posts`               | List recent marketing_posts            |
| POST   | `/api/admin/marketing/posts/:id/suppress`  | Suppress a scheduled post              |
| GET    | `/api/admin/marketing/voice-context`       | List voice context examples            |
| POST   | `/api/admin/marketing/voice-context`       | Add a voice context example            |
| DELETE | `/api/admin/marketing/voice-context/:id`   | Delete a voice context example         |
| POST   | `/api/admin/marketing/preview`             | Generate (no log) a preview draft      |

---

## Content Pillars and Topic Selection

The `topicSelector.ts` service picks the next topic for a cron run. Logic:

1. Determine the **pillar quota gap** for this week (target distribution: Signal 40%, Pattern 20%, Methodology 15%, Product 15%, Context 10%).
2. Pick the pillar with the largest gap.
3. Pull candidate topics from the appropriate source:
   - **Signal:** highest-severity unposted ACLED/USGS/GDELT events in the last 24h
   - **Pattern:** current top-3 CII movers (week-over-week delta) or correlation engine alerts
   - **Methodology:** rotating queue of 12 pre-seeded methodology topics (CII components, source triangulation, etc.)
   - **Product:** unposted entries from `release-notes` source
   - **Context:** rotating queue of 24 pre-seeded context topics (chokepoints, alliances, energy infrastructure)
4. Filter against `marketing_topics_used` for 7-day dedup on `(topic_key, entity_keys)` overlap.
5. Return the highest-scoring candidate or `null` (causes the cron to skip this run).

---

## Voice Evolution System (Feedback Loop)

### `marketing-voice-learn` weekly cron
Runs Mondays at 04:00 UTC. Steps:

1. Pull the last 7 days of `marketing_posts` joined with `marketing_engagement` (latest poll per post).
2. Compute engagement-per-pillar, engagement-per-platform, engagement-per-format.
3. Identify the top-5 over-performing posts (impressions weighted 1x + likes 2x + reposts 5x + replies 3x + intel_buyer_signal 5x).
4. Identify the bottom-5 under-performing posts (same formula).
5. Append the top-5 to `marketing_voice_context` with category=`loved` and an auto-generated note ("auto-promoted week of YYYY-MM-DD, score X").
6. Append the bottom-5 with category=`neutral` (NOT auto-`hated` — that requires human judgment).
7. Re-balance pillar weights for the next week by ±5pp toward over-performing pillars (clamped to [5%, 60%] per pillar).
8. Write a summary row to `marketing_voice_runs` (TODO future table).

The voice profile loaded by `marketingVoice.ts` always reads `marketing_voice_context` at draft time — so updates compound automatically without redeploy.

---

## Platform-Specific Adaptation Rules

| Platform | Length     | Format            | Hook style                     | CTA                           |
|----------|-----------|-------------------|--------------------------------|-------------------------------|
| X        | ≤280/tw   | post or 3-tw thread | Number-first, drop-in-middle  | Soft (1 in 5 posts: NL link)  |
| LinkedIn | 150-600w  | hook + bullets    | One-line tension/number hook  | Soft (link in first comment)  |
| Substack | 800-2000w | long-form article | Headline + 1-line dek         | Direct (paid-tier in footer)  |
| Medium   | 800-2000w | cross-post + canonical link to Substack | Same as Substack | Direct (paid-tier footer) |
| Bluesky  | ≤300 ch   | post              | Same as X but more conversational | Soft (1 in 8 posts)        |
| Threads  | ≤500 ch   | post              | Casual, observational         | None (Threads hates CTAs)     |
| beehiiv  | (separate cron, already wired) | daily AM brief | n/a | Direct (already wired) |

---

## Safety Mechanisms and Kill Switches

1. **Global PAUSE flag** stored in Vercel KV at key `marketing:pause`. Every cron checks first thing. KV propagates in <1s globally.
2. **Shadow mode flag** at `marketing:shadow_mode` (default `true`). Adapter checks before calling external API.
3. **Per-platform enabled flags** at `marketing:enabled:{platform}` (default `false` for all platforms in v1).
4. **Voice eval gate**: every draft passes through `/api/voice/eval`. Score < 70 → status=`drafted` but not scheduled (held). Voice violations of forbidden topics → status=`suppressed` permanently.
5. **Topic dedup gate**: enforced inside `topicSelector.ts` before generation.
6. **Rate limit per platform per 24h** (hardcoded, not flag-controlled, to prevent runaway loops).
7. **First-60-min breaking-event hold**: topicSelector skips any topic whose source event is < 60 min old.
8. **Daily cap on Anthropic spend**: every cron checks a daily counter in KV before calling Claude. Stops at 200 calls/day.
9. **Stub mode for missing API keys**: if `X_API_KEY` (or `TYPEFULLY_API_KEY`, etc.) is missing, the adapter logs "would have posted" and writes status=`posted` with `platform_post_id="stub:{uuid}"`. No exceptions thrown.

---

## Admin Dashboard Wireframe (`/#/admin/marketing`)

```
┌────────────────────────────────────────────────────────────────────────────────┐
│ NEXUSWATCH MARKETING AUTOMATION                            [⏸ PAUSE ALL]       │
│ Status: ⚠ SHADOW MODE  ·  Last run: 2026-04-13 14:00 UTC  ·  Next: 17:00      │
├────────────────────────────────────────────────────────────────────────────────┤
│                                                                                │
│  PER-PLATFORM TOGGLES                                                          │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ X         [○] enabled  [●] shadow  ·  last post: 14:00  ·  posts/day: 0 │  │
│  │ LinkedIn  [○] enabled  [●] shadow  ·  last post: —      ·  posts/day: 0 │  │
│  │ Substack  [○] enabled  [●] shadow  ·  last post: —      ·  posts/wk:  0 │  │
│  │ Medium    [○] enabled  [●] shadow  ·  last post: —      ·  posts/wk:  0 │  │
│  │ Bluesky   [○] enabled  [●] shadow  ·  last post: 13:00  ·  posts/day: 0 │  │
│  │ Threads   [○] enabled  [●] shadow  ·  last post: —      ·  posts/day: 0 │  │
│  │ beehiiv   [●] enabled  [○] shadow  ·  last post: 11:00  ·  (live)       │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  RECENT POSTS (last 30)                                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ 14:02  X       signal     "14 wildfires along the Portuguese coast..."  │  │
│  │        [SHADOW] voice: 87  impr: —  likes: —  replies: —                │  │
│  │ 13:00  Bluesky pattern    "CII shifted in Iran this week..."            │  │
│  │        [SHADOW] voice: 81  impr: —  likes: —  replies: —                │  │
│  │ ... 28 more rows ...                                                    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  VOICE CONTEXT (loved/hated/neutral examples — drives few-shot prompt)        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │ [+ Add example]  Filter: [all platforms ▾] [all categories ▾]           │  │
│  │ ❤ loved  · X  · "14 wildfires..." · auto-promoted 2026-04-12            │  │
│  │ ✗ hated  · LI · "Excited to announce..." · corporate slop, never        │  │
│  │ ◯ neutral · Sub · "Weekly recap of CII..." · acceptable but flat        │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                                                                │
│  PILLAR DISTRIBUTION (this week)                                               │
│  Signal     ████████████████░░░░  38% (target 40%)                            │
│  Pattern    ████████░░░░░░░░░░░░  22% (target 20%)                            │
│  Method     ██████░░░░░░░░░░░░░░  15% (target 15%)                            │
│  Product    ██████░░░░░░░░░░░░░░  15% (target 15%)                            │
│  Context    ████░░░░░░░░░░░░░░░░  10% (target 10%)                            │
└────────────────────────────────────────────────────────────────────────────────┘
```

---

## Analytics and Success Metrics

### North-star
- **Newsletter signups attributable to marketing-automation referrer per week.**
- Tracked via UTM tags on every link the engine emits (`utm_source={platform}&utm_medium=marketing-auto&utm_campaign={pillar}`).

### Health metrics (per platform, per week)
- Posts published, posts suppressed, average voice_score, P50/P90 voice_score
- Total impressions, total engagements, intel_buyer_signal count
- Engagement rate (engagements / impressions)
- CTR to nexuswatch.dev

### Voice metrics (per week)
- Average voice_score across all posts
- Number of voice_violations triggered
- Pillar distribution actual vs target

### Cost metrics
- Anthropic spend per week (target: ≤ $7/wk)
- Per-platform API spend (Typefully, Medium API tokens, etc.)

---

## 12-Month Rollout Plan

### Week 1: SHADOW MODE
- All platforms generating; nothing posting.
- Chairman reviews 30+ shadow drafts daily for 7 days.
- Drops 5-10 examples into `marketing_voice_context` (loved/hated).
- No flag changes until shadow review complete.

### Week 2: BLUESKY + THREADS LIVE (lowest risk)
- Bluesky and Threads flipped to live. These are the lowest-reach platforms — voice mistakes are recoverable.
- Other platforms remain in shadow.

### Week 3-4: X LIVE
- X enabled. Engagement begins to feed the voice-learning loop.
- LinkedIn remains shadow until X voice is calibrated.

### Month 2: LINKEDIN + MEDIUM LIVE
- LinkedIn Company Page live (B2B reach is highest-leverage).
- Medium cross-posts live.
- Substack remains shadow (long-form has highest brand stake).

### Month 3: SUBSTACK LIVE
- Substack publication live with weekly long-form + Wed short post.
- Full engine active across all 7 platforms.

### Months 4-6: OPTIMIZATION PHASE
- Weekly voice-learn loop running. Pillar weights drift based on data.
- Target: 5,000 newsletter subscribers, 50 paid customers (50% of 12-mo target).

### Months 7-12: SCALE PHASE
- Add platforms: Substack Notes, YouTube Shorts (manual upload from Substack content), TikTok (manual).
- Sales-assist trigger productionized (intel-buyer signal → human follow-up CRM).
- Target: 100-200 paid customers, 5-10K newsletter subscribers.

### Months 13-24: ARR PHASE
- Annual plans introduced.
- Founding-100 closes.
- Target: 500 Analyst + 150 Pro = $352K ARR.

---

## Chairman's Action List (credentials Ethan needs)

These are the external accounts and API keys required to take the engine from shadow mode to live mode. Order is "in priority order for live activation."

### Tier 1: Lowest friction (do first)
1. **Bluesky** (`@nexuswatch.bsky.social`)
   - Create the account at https://bsky.app/
   - Generate an app password at https://bsky.app/settings/app-passwords
   - Set env: `BLUESKY_HANDLE=nexuswatch.bsky.social`, `BLUESKY_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx`
2. **Threads** (`@nexuswatchintel`)
   - Create via Instagram (Threads requires IG account)
   - Get a Threads-graph-API access token at https://developers.facebook.com/docs/threads
   - Set env: `THREADS_ACCESS_TOKEN=...`, `THREADS_USER_ID=...`

### Tier 2: Medium friction
3. **X / Twitter** (`@nexuswatchintel`)
   - Create the account
   - Apply for X API Basic tier at https://developer.x.com (~$100/mo) OR
   - Use Typefully (https://typefully.com/) for cross-post (~$15/mo, no API tier needed)
   - **Recommend Typefully** for v1 — cheaper, batches X+LinkedIn+Threads
   - Set env: `TYPEFULLY_API_KEY=...`
4. **LinkedIn Company Page**
   - Create the Company Page at https://www.linkedin.com/company/setup/new/
   - Connect to Typefully OR get LinkedIn Marketing API token
   - **Recommend Typefully** path (same as X)

### Tier 3: Long-form
5. **Substack publication** (`thenexuswatchbrief.substack.com` recommended)
   - Create publication at https://substack.com/
   - Substack does not have a public posting API for free tier. Two options:
     - **Email-to-post**: each Substack issue has an email address that publishes when emailed. Set env: `SUBSTACK_EMAIL_TO_POST=...@inbound.substack.com`. Use Resend to send the article. (Recommended for v1.)
     - **Substack manual paste**: engine generates and emails the chairman the draft; he pastes into Substack. (Fallback.)
6. **Medium publication** (`medium.com/nexuswatch`)
   - Create publication at https://medium.com/me/publications/new
   - Get an integration token at https://medium.com/me/settings/security
   - Set env: `MEDIUM_INTEGRATION_TOKEN=...`, `MEDIUM_PUBLICATION_ID=...`

### Tier 4: Already wired
7. **beehiiv** — already integrated. Daily AM brief already shipping.
8. **Buffer** (existing) — currently wired to `@NexusWatchDev`. Will be deprecated after `@nexuswatchintel` X account is live and Typefully is wired.

### Admin variables (set once)
- `ADMIN_EMAILS=ethan@nexuswatch.dev` (or whatever the chairman's admin email is — check existing setup)
- `MARKETING_AUTOMATION_ENABLED=true` (master gate; defaults off in env, KV flags handle runtime toggling)

---

## What this plan is NOT

- Not a replacement for the existing Track C `social_queue` system. That handles **inbound replies and one-off posts that need human approval**. This new module handles **outbound autonomous content** that runs to a calendar.
- Not a CRM or sales pipeline. Sales-assist signals get flagged but no DMs are auto-sent.
- Not a content management system. Long-form articles are generated and shipped, not edited in a UI. The chairman's job is to set voice context (loved/hated examples), not to edit posts.
- Not magic. This buys distribution leverage, not virality. The voice doc and editorial stance are what make the content credible. The engine just enforces them at scale.

---

## Honest assessment

The 24-month $352K ARR target depends on three multiplicative factors:
1. Distribution velocity (this engine).
2. Newsletter-to-paid conversion (out of scope; Pricing/Onboarding work).
3. Retention (out of scope; product quality work).

This engine alone cannot hit the target. It can plausibly reach **5K newsletter subscribers** in 12 months if voice quality holds. Newsletter→paid at industry-typical 2-4% gives 100-200 paid customers — exactly the 12-mo target. Hitting 500 Analyst + 150 Pro at 24 months requires both this engine AND a tightened conversion funnel AND a real product moat (which the existing CII + verification engine + Meridian integration provides).

This module is necessary, not sufficient.
