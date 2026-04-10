# NexusWatch v2 Roadmap — Build + Newsletter + Distribution

> Council-reviewed. Chairman-approved. Updated 2026-04-10.
> Portfolio piece + passion project + potential revenue engine.
> No hard deadlines — production-grade standards throughout.

---

## Vision

NexusWatch is a one-person intelligence platform that rivals tools built by teams of hundreds. It combines real-time geopolitical monitoring, AI-powered analysis, and a daily newsletter that makes staying informed on global threats feel effortless.

Two products, one brand:
1. **The Platform** — 3D globe with 30+ data layers, CII scoring, correlation engine, investigation tools
2. **The NexusWatch Brief** — Daily newsletter that's the Rundown AI of geopolitics. 3-minute scan, smart-friend voice, clean design, genuinely useful.

---

## THE NEXUSWATCH BRIEF — Newsletter Redesign

### Brand Identity
- **Name:** The NexusWatch Brief
- **Tagline:** "3-minute threat scan. What's happening, why it matters, what to watch."
- **Voice:** 40% professional analyst / 60% smart friend. "We" pronoun. Conversational but credible. Like a Bloomberg reporter who actually explains things and occasionally says "this one's wild."
- **Read time promise:** ~3 minutes for the quick scan. Optional deep-dive sections below.
- **Platform:** beehiiv (growth tools, referral program, analytics, ad network for future sponsors)
- **Archive:** Historical briefs also published to nexuswatch.dev/briefs for SEO + site value

### Newsletter Sections (In Order)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
THE NEXUSWATCH BRIEF
[Date] · 3 min read
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

☕ GOOD MORNING
2-3 sentence BLUF. Conversational but specific. "Oil crashed
nearly 10% yesterday — but the real story is what Iran did NOT
do. Here's your 3-minute scan."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 TODAY'S TOP STORIES

1. [Headline]
   What happened → Why it matters → What to watch
   [Source attribution]

2. [Headline]
   ...

3-5 stories, each 3-4 sentences. Not just news — analysis.
"Why it matters" is the money line.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🇺🇸 US IMPACT
2-3 sentences. How today's events affect US security,
economy, energy, alliances. The "so what for America?" section.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⛽ ENERGY & COMMODITIES
Oil, natural gas, chokepoints, pipeline security.
Price data + geopolitical driver + direction.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 MARKET SIGNAL
S&P, gold, oil, nat gas, energy sector, USD, treasuries.
What's priced in vs. what's a surprise.
1-2 sentences connecting geopolitics to price moves.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔭 48-HOUR OUTLOOK
3-4 bullet points. What to watch next.
Each: indicator + threshold + why it matters.
"Pin this to your monitor" energy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🗺️ MAP OF THE DAY
One annotated globe screenshot showing the most
interesting thing NexusWatch detected today.
Caption: what you're looking at + why it matters.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🛠️ INTEL TOOL OF THE WEEK (Fridays only)
One OSINT tool, data source, or methodology.
What it does, how to use it, why it matters.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

👁️ YOUR WATCHLIST (personalized)
CII changes for countries/regions the reader selected.
"Iran: CII 31 (↓5) · Yemen: CII 56 (→) · Ukraine: CII 54 (→)"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[Share] [Refer a friend] [Open the live map]
```

### Visual Design — Light, Clean, Modern
- **Background:** White (#ffffff) or very light gray (#fafafa)
- **Text:** Dark (#1a1a1a) for headlines, (#4a4a4a) for body
- **Accent:** NexusWatch orange (#ff6600) for section headers, CTAs, and highlights
- **Secondary accent:** Muted navy (#1e3a5f) for section dividers and data elements
- **Typography:** Inter for body, JetBrains Mono for data/numbers/market prices
- **Section dividers:** Thin horizontal rules or orange accent lines
- **Market data:** Inline colored indicators (green up, red down) in monospace
- **Map of the Day:** Full-width screenshot with orange border/caption overlay
- **Mobile-first:** Designed for phone reading at 5 AM

### AI Prompt Rewrite

The Sonnet prompt needs a complete overwrite. New system prompt direction:

```
You are the editorial voice of The NexusWatch Brief, a daily geopolitical
intelligence newsletter. You write like a smart, well-connected friend
who happens to have access to a global intelligence platform.

VOICE RULES:
- Use "we" (brand voice): "We're watching Iran closely" not "Iran should be watched"
- Conversational but credible: "This one's worth paying attention to" not "This development warrants monitoring"
- Specific over vague: Numbers, names, percentages, always
- "Why it matters" is the most important line in every story
- Occasional personality: "Okay, this is wild" or "We've been saying this for a week"
- Never say: "geopolitical landscape", "in the realm of", "it remains to be seen"
- Brevity is respect: every sentence earns its place
- The reader is smart but busy. Don't explain what NATO is. Do explain why a CII move matters.

OUTPUT: Clean readable text (NOT HTML). Use markdown-style formatting:
- ## for section headers
- **bold** for emphasis
- Numbered lists for stories
- Bullet points for the outlook
- One blank line between sections

STRUCTURE:
1. ☕ GOOD MORNING — 2-3 sentences. Conversational hook + the single most important thing.
2. 📍 TODAY'S TOP STORIES — 3-5 stories. Each: headline → what happened → why it matters → what to watch. 3-4 sentences each.
3. 🇺🇸 US IMPACT — 2-3 sentences on how today affects American interests.
4. ⛽ ENERGY & COMMODITIES — Price data + geopolitical driver + direction.
5. 📊 MARKET SIGNAL — Connect geopolitics to market moves. What's priced in.
6. 🔭 48-HOUR OUTLOOK — 3-4 bullet points. Each: what to watch + threshold + why.
```

### Publishing Workflow

```
5:00 AM ET — Vercel cron fires
             → Sonnet generates brief in new voice/format
             → Stored in Postgres
             → Pushed to Notion (copy-paste ready)
             → Pushed to beehiiv via API (draft or auto-publish)
             → Map screenshot generated and attached
             → X thread auto-posted (Situation Summary + top story + CTA)

5:15 AM PT — Ethan reviews in Notion/beehiiv
  (M-F)      → Minor edits if needed
             → Publish on beehiiv (or confirm auto-publish)
             → Manual X post: globe screenshot or commentary

8-9 AM PT  — Same workflow for weekends
  (Sat-Sun)
```

### beehiiv Setup
- Publication: "The NexusWatch Brief"
- Custom domain: brief.nexuswatch.dev or newsletter.nexuswatch.dev
- Referral program: Enable with milestone rewards
  - 3 referrals: "Intel Insider" badge
  - 10 referrals: Weekly deep-dive email
  - 25 referrals: Access to raw CII data feed
- Welcome email: "Here's what you just signed up for" + today's brief + "here's how to get the most out of it"
- List hygiene: Weekly automated cleanup of non-openers (30-day inactive)
- Analytics: Track open rate, click rate, growth, referral performance

### Site-Based Brief Archive
- New route: `nexuswatch.dev/#/briefs` or `nexuswatch.dev/briefs`
- Lists all historical briefs, newest first
- Each brief has its own URL: `nexuswatch.dev/brief/2026-04-10`
- Public (no login required) — SEO value
- Clean reading experience (not the email template — optimized for web)
- "Subscribe to get this in your inbox every morning" CTA on every brief page

---

## PLATFORM BUILD ROADMAP

### Phase 1: Newsletter + Foundation (Now → 2 weeks)

#### Build Items
1. **Rewrite daily brief cron** — New Sonnet prompt for Rundown-style voice, new section structure, output clean text instead of HTML for beehiiv
2. **beehiiv API integration** — Push brief directly to beehiiv as draft (or auto-publish) from the cron
3. **Brief preview on landing page** — Embed recent brief in scrollable preview, "Get this free every morning" CTA
4. **Shareable brief pages** — `nexuswatch.dev/brief/[date]` public URLs with OG images
5. **Brief archive page** — `nexuswatch.dev/#/briefs` listing all historical briefs
6. **CII methodology page** — `nexuswatch.dev/#/methodology` with interactive scoring example
7. **Preset theater views** — 6 regional presets (Middle East, Indo-Pacific, Eastern Europe, Africa/Sahel, Energy Chokepoints, Western Hemisphere)
8. **Map of the Day screenshot** — Auto-generate annotated globe screenshot in the cron for newsletter inclusion
9. **X automation** — Auto-post daily thread from cron (Situation Summary + top story + subscribe CTA)

#### Distribution Items
10. Set up beehiiv publication ("The NexusWatch Brief")
11. Configure referral program with milestone rewards
12. Set up brief.nexuswatch.dev or newsletter.nexuswatch.dev subdomain
13. First X thread from @NexusWatchDev
14. Record 90-second cinema mode demo video

### Phase 2: Timeline & Temporal Intelligence (2-4 weeks after Phase 1)

#### 2.1 Timeline View
- Horizontal timeline bar at bottom of map (collapsible)
- Time ranges: 7-day, 14-day, 30-day toggle
- Scrub slider: drag to any point, map updates in real-time
- Layers with temporal support: earthquakes, CII scores, fires, disease outbreaks, conflicts (when ACLED approved)
- Playback controls: play/pause, speed (1x/2x/5x/10x), step by day
- Event markers on timeline: colored dots by layer type, click to fly to location
- Data source: `event_snapshots` table + `country_cii_history`

#### 2.2 Crisis Replay
- Named crisis replays auto-generated from correlation engine
- Camera animates between events chronologically with AI narration
- Shareable: `nexuswatch.dev/replay/[crisis-name]`

#### 2.3 CII Trend Sparklines
- Inline 30-day sparkline charts next to each country in CII panel
- Click to expand full 90-day chart with component breakdown

### Phase 3: Intelligence Depth (4-8 weeks after Phase 2)

#### 3.1 Natural Language Alert Creation
- "Alert me when CII for any country rises 5+ points in 24 hours"
- "Earthquake above 6.0 within 200km of nuclear facility"
- Parse with Claude → structured alert rule → evaluate in alertEngine.ts
- Tier-gated: Free=1, Analyst=5, Pro=unlimited

#### 3.2 Dark Vessel Detection
- Monitor live AIS feed for ships that stop broadcasting in sensitive areas
- Store gap events in `vessel_gaps` table
- Render ghost ship icons on map with "DARK" label
- Auto-correlate with chokepoints/sanctioned zones
- Feed into daily brief

#### 3.3 AI Command Center Upgrades
- NL queries: "Show me all M5+ earthquakes near energy infrastructure this week"
- Claude parses → generates filter → returns results + map + mini-report
- Makes the terminal actually powerful, not just decorative

#### 3.4 Enhanced Cinema Mode
- AI-narrated globe tour with TTS voiceover
- Camera flies between active threats sorted by severity
- Auto-updated daily from brief data
- Export-ready for X clips and demo videos

### Phase 4: Investigation Platform (8-12 weeks after Phase 3)

#### 4.1 Entity Relationship Graph (Full Palantir)
- Force-directed graph: countries, infrastructure, vessels, conflicts, alliances
- Click any entity → expand connections
- Interactive: drag nodes, filter by relationship type, search
- Example: Iran → Hormuz, Bushehr NPP, proxy conflicts, sanctioned vessels, trade partners
- Tech: D3.js force simulation, resizable panel alongside map

#### 4.2 Synchronized Multi-View
- Split screen: Map | Timeline | Graph | Data Table — all linked
- Click event in any view → all others update
- User-configurable panel layout
- Keyboard shortcuts: M/T/G/D for view focus

#### 4.3 Investigation Workspaces
- Save: map view + layers + timeline range + graph state → named investigation
- Share via URL
- Auto-generate from correlation alerts

#### 4.4 Predictive Intelligence
- 30/90-day CII trends → forward-looking risk assessments
- "73% probability [country] crosses critical threshold within 14 days"
- Transparent methodology (trend extrapolation + Sonnet analysis)
- Rendered as Forecast panel with confidence intervals

### Phase 5: Launch & Growth (Parallel to building)

#### Product Hunt Launch
- Tagline: "Real-time geopolitical intelligence on a 3D globe — built by one person"
- Assets: 4 screenshots + demo video + description
- Launch day: Tuesday or Wednesday
- Respond to every comment within 1 hour

#### Show HN
- Title: "Show HN: NexusWatch — Open-source geopolitical intelligence platform"
- Emphasize: vanilla TS, built with Claude Code, solo builder, CII algorithm, Sonnet briefs
- Tuesday-Thursday, 9-11 AM ET

#### X Content Strategy (@NexusWatchDev)
- **Automated daily (from cron):**
  - Thread: ☕ opener + top story + CII movers + "Full brief → [beehiiv link]"
  - Single tweet: "NexusWatch CII Alert: [country] [↑↓] [score]" with globe screenshot
- **Manual 2-3x/week:**
  - Globe screenshots of active hotspots
  - Cinema mode clips (15-30 seconds)
  - Analysis threads on developing situations
  - Correlation alert visualizations
- **Engagement:**
  - Reply to @sentdefender, @RALee85, @IntelCrab with NexusWatch data
  - Quote-tweet breaking events with CII context
  - Never broadcast-only — always add value

#### Substack → beehiiv Migration
- Create beehiiv publication immediately
- Configure API integration in cron
- Set up referral program
- Set up custom subdomain
- Future: Enable native ad slot when audience hits 5K+ subscribers

#### Email Growth Funnel
- Landing page: "Get the NexusWatch Brief free every morning" → email capture
- Welcome sequence:
  - Day 0: Today's brief + "Here's what you just signed up for"
  - Day 3: "How our Country Instability Index works" + link to methodology
  - Day 7: "Explore the live threat map" + link to platform
  - Day 14: "Upgrade to Analyst for custom alerts + 7-day timeline"
- Target: 1,000 subscribers before optimizing for paid conversion

---

## NEW DATABASE TABLES

```sql
-- Dark vessel detection
CREATE TABLE vessel_gaps (
  id SERIAL PRIMARY KEY,
  mmsi TEXT NOT NULL,
  vessel_name TEXT,
  vessel_type TEXT,
  last_lat DOUBLE PRECISION,
  last_lon DOUBLE PRECISION,
  gap_start TIMESTAMP NOT NULL,
  gap_end TIMESTAMP,
  duration_minutes INTEGER,
  near_sensitive BOOLEAN DEFAULT FALSE,
  sensitive_area TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Investigation workspaces
CREATE TABLE investigations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crisis replay events
CREATE TABLE crisis_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  events JSONB NOT NULL,
  start_date DATE,
  end_date DATE,
  auto_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Brief archive (for public pages)
-- Uses existing daily_briefs table, add column:
ALTER TABLE daily_briefs ADD COLUMN IF NOT EXISTS
  newsletter_text TEXT;  -- Clean text version for beehiiv/archive
```

---

## COMPETITIVE POSITIONING

| | SitDeck | World Monitor | Rundown AI | **NexusWatch** |
|---|---------|--------------|------------|----------------|
| **Product** | Widget dashboard | Globe + feeds | Newsletter | Globe + newsletter + analysis |
| **Newsletter** | AI summary | None | Smart-friend daily | Smart-friend daily + platform data |
| **Scoring** | None | None | N/A | CII (50 countries) |
| **Correlation** | None | None | N/A | Cross-domain auto-detection |
| **Temporal** | None | None | N/A | Timeline + crisis replay |
| **Investigation** | None | None | N/A | Entity graph + workspaces |
| **Voice** | Data dump | Data dump | Conversational | Conversational + analyst |
| **Growth model** | Free tier | Free tier | X threads → newsletter | X threads → newsletter → platform |

NexusWatch is the only product that combines a **Rundown-quality newsletter** with a **Palantir-inspired analysis platform**. That's the moat.

---

## SUCCESS METRICS

### Portfolio ("one person built this?")
- Technical depth: CII algorithm, temporal visualization, entity graphs, AI integration, cross-domain correlation, dark vessel detection
- Product breadth: Newsletter + platform + API + email + Notion integration
- Design quality: Clean newsletter + terminal platform = range

### Distribution
- X followers (weekly tracking)
- beehiiv subscribers (weekly tracking)
- Brief open rate (target: 40%+, Rundown is 51.7%)
- Landing page → subscribe conversion rate

### Revenue (future, no targets yet)
- beehiiv subscriber count (sponsors care about this)
- Free → Analyst conversion rate
- Sponsor interest inbound (track when it starts happening)
