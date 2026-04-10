# NexusWatch v2 — Final Build Plan

> All decisions locked. Council-reviewed. Chairman-approved.
> Updated 2026-04-10 after 5 rounds of prompted questions.

---

## DECISIONS REGISTER

| # | Decision | Answer |
|---|----------|--------|
| 1 | Read time | 3-min scan + optional depth |
| 2 | Newsletter name | The NexusWatch Brief |
| 3 | Voice | 40% analyst / 60% smart friend |
| 4 | Pronoun | "We" (brand voice) |
| 5 | Sections | Good Morning → Top Stories → US Impact → Energy → Markets → 48h Outlook → Map of Day → Tool of Week (Fri) |
| 6 | Sponsors | Maybe later, not now |
| 7 | Platform | beehiiv (full migration from Resend for newsletter) |
| 8 | Design | Light/clean (Rundown-style, not dark terminal) |
| 9 | Personalization | Hybrid — same brief + "Your Watchlist" at bottom |
| 10 | X strategy | Automated daily + manual 2-3x/week |
| 11 | Good Morning tone | Varies by day: B (warm+focused) on normal days, C (playful) on big days |
| 12 | Source attribution | Lean platform authority, attribute when specific report/investigation |
| 13 | Story depth | A/B now (summary + context), evolve toward more original analysis over time |
| 14 | Energy depth | 2-3 sentences: price + driver + what could reverse |
| 15 | Map of Day | Tied to top story |
| 16 | Weekend format | Saturday = normal brief, Sunday = week in review |
| 17 | X breaking events | Automated: alert → X pipeline when thresholds hit |
| 18 | X thread format | Varies by day, automated |
| 19 | X screenshots | Whatever looks most dramatic that day (auto-generated) |
| 20 | X engagement | Quote-tweet when adding value, minimal otherwise, lean toward pure NW content |
| 21 | beehiiv subdomain | brief.nexuswatch.dev |
| 22 | Referral rewards | 3 refs = bonus weekend analysis / 10 refs = Pro features free / 25 refs = personal watchlist |
| 23 | Landing page CTA | Platform-first hero + persistent newsletter bar at top |
| 24 | Brief preview | Rotating excerpt with blurred/faded preview of rest |
| 25 | Welcome email | Smart-friend tone + formal onboarding hybrid |
| 26 | Map screenshot | Auto-generate in cron, replaceable manually before publish |
| 27 | beehiiv publish flow | Auto-publish (no review step needed) |
| 28 | Watchlist personalization | Phase 1 — ship with first newsletter launch |
| 29 | Brief archive | Both: standalone /#/briefs page + integrated panel in map view |
| 30 | X posting service | Buffer (existing account) |
| 31 | X alert thresholds | All thresholds active: CII ≥5 change, CII crosses 70, critical correlations, M6+ quake, M5+ near infra, oil ≥5% move, 3+ countries cross CII 50, dark vessels. Restrict later. |
| 32 | Email migration | Fully migrate newsletter to beehiiv. Resend stays for transactional only. |
| 33 | Build approach | Everything in parallel |

---

## PHASE 1 BUILD ITEMS (Start Now)

### 1A. Rewrite Daily Brief Cron — "The Engine"

**What changes:**
- Complete Sonnet prompt rewrite: new voice (smart-friend), new sections, new structure
- Output clean markdown text (not HTML) for beehiiv
- Also generate HTML version for site archive
- New sections: Good Morning → Top Stories → US Impact → Energy → Markets → 48h Outlook
- Sunday variant: Week in Review format
- Remove old email template HTML generation (beehiiv handles email design)

**New integrations added to cron:**
1. **beehiiv API** — Push brief as auto-published post
2. **Buffer API** — Push X thread (automated daily)
3. **Map screenshot** — Auto-generate globe screenshot via headless browser or server-side rendering
4. **X alert pipeline** — Separate lightweight cron (every 30 min) that checks for threshold breaches and posts to Buffer

**Cron schedule:**
- `0 10 * * 1-6` — Daily brief at 5 AM ET (Mon-Sat)
- `0 14 * * 0` — Sunday week-in-review at 9 AM ET
- `*/30 * * * *` — Alert threshold check (reuse compute-cii cron or add new)

**beehiiv API flow:**
```
POST https://api.beehiiv.com/v2/publications/{pub_id}/posts
{
  "title": "The NexusWatch Brief — April 10, 2026",
  "subtitle": "Oil crashed 10%. Iran went quiet. Here's your scan.",
  "content": [newsletter content blocks],
  "status": "confirmed",  // auto-publish
  "send_to": "all"
}
```

**Buffer API flow:**
```
POST https://api.bufferapp.com/1/updates/create.json
{
  "text": "☕ Good morning...",
  "profile_ids": ["nexuswatchdev_profile_id"],
  "scheduled_at": "now"
}
```

**X alert tweet format:**
```
🚨 NexusWatch Alert

[Country] CII [↑/↓][change] to [score]/100
Driver: [top component]
[one-line context]

Track live → nexuswatch.dev
Subscribe → brief.nexuswatch.dev
```

### 1B. beehiiv Setup & Configuration

**Ethan does:**
1. Create beehiiv account at beehiiv.com
2. Create publication: "The NexusWatch Brief"
3. Configure custom domain: brief.nexuswatch.dev (add CNAME in Vercel DNS)
4. Enable referral program with milestones:
   - 3 referrals: "Weekend Deep Dive" bonus email
   - 10 referrals: NexusWatch Pro features free
   - 25 referrals: Personal watchlist customization
5. Set up welcome email (smart-friend + onboarding tone)
6. Get API key → give to Claude for env var setup
7. Connect Buffer to @NexusWatchDev X account

**Claude does:**
1. Add BEEHIIV_API_KEY and BEEHIIV_PUB_ID to Vercel env
2. Add BUFFER_ACCESS_TOKEN to Vercel env
3. Wire beehiiv API into daily brief cron
4. Wire Buffer API into daily brief cron + alert cron

### 1C. Landing Page Updates

**Persistent newsletter bar:**
- Fixed bar at very top of landing page (above hero)
- "Get The NexusWatch Brief — geopolitical intelligence in 3 minutes → [email] [Subscribe]"
- Orange accent, clean, non-intrusive
- Dismiss button (stores in localStorage)

**Brief preview section:**
- New section on landing page below the platform demo
- Rotating daily excerpt (different section each day) with blurred/faded rest
- "Subscribe to read the full brief every morning" CTA
- Uses latest brief from Postgres

**Brief archive page:**
- New route: `/#/briefs`
- Lists all historical briefs, newest first
- Each brief clickable → full reading page at `/#/brief/[date]`
- Clean reading experience (white bg, Inter font, not terminal aesthetic)
- "Subscribe to get this in your inbox" CTA on every brief page
- SEO: proper meta tags, OG images per brief

**Brief panel in map view:**
- Collapsible sidebar panel in the intel view
- Shows today's brief alongside the map
- "Read while you explore" — brief text + map interaction simultaneously

### 1D. Platform Features

**CII Methodology Page:**
- New route: `/#/methodology`
- Sections: What is CII, how it's calculated, data sources, component weights, update frequency
- Interactive example: pick a country, see score breakdown in real-time
- Links to source code
- "Subscribe to get daily CII analysis" CTA

**6 Theater Presets:**
- Pill/dropdown selector in map UI
- Each preset: camera position + zoom + pitch + bearing + pre-selected layers + composite threat score

| Theater | Center | Key Layers |
|---------|--------|------------|
| Middle East | 30°N, 44°E | CII, conflicts, ships (Hormuz/Bab el-Mandeb), energy |
| Indo-Pacific | 15°N, 125°E | Ships, flights, military bases, earthquakes, CII |
| Eastern Europe | 50°N, 32°E | Conflicts, flights, military bases, CII |
| Africa/Sahel | 10°N, 20°E | Conflicts, displacement, disease, CII |
| Energy Chokepoints | 20°N, 55°E | Ships, energy infrastructure, CII, chokepoints |
| Western Hemisphere | 10°N, -75°W | CII, displacement, earthquakes, fires |

- Deep-linkable: `/#/intel?theater=middle-east`

**Shareable Brief URLs:**
- Public route: `/#/brief/2026-04-10`
- OG image auto-generated: date + top threat + CII leader
- No login required
- Clean reading experience
- "Subscribe" + "Open live map" CTAs

### 1E. Map Screenshot Auto-Generation

**Approach:** Use the Vercel OG image endpoint pattern — server-side rendering of a simplified map view.

**Implementation:**
- New API endpoint: `api/brief-screenshot.ts`
- Takes today's top story location/theater as input
- Renders a static map image (MapLibre static API or Mapbox Static Images API)
- Overlays CII data, key markers, NexusWatch branding
- Returns PNG
- Called from the daily brief cron, attached to beehiiv post as featured image
- Also used as OG image for shareable brief URLs

### 1F. X Automation Setup

**Daily brief thread (via Buffer):**
```
Tweet 1: ☕ [Good Morning hook — 1-2 sentences]

Tweet 2: 📍 Top story:
[headline]
[why it matters — 2 sentences]

Tweet 3: [if big news day, second story. if not, skip]

Tweet 4: 🔭 48-Hour Outlook:
• [indicator 1]
• [indicator 2]
• [indicator 3]

Full brief → brief.nexuswatch.dev

Tweet 5 (if dramatic map): 🗺️ Map of the day: [caption]
[attached screenshot]
```

**Alert tweets (via Buffer, triggered by threshold cron):**
- One tweet per threshold breach
- Max 3 alert tweets per day (avoid spam)
- Rate limit: minimum 2 hours between alert tweets
- Format shown above in 1A

---

## PHASE 2-4 BUILD ITEMS (Unchanged from Roadmap)

### Phase 2: Timeline & Temporal Intelligence
- Timeline view (7/14/30 day scrubbing)
- Crisis replay (auto-generated from correlations)
- CII trend sparklines (30-day inline charts)

### Phase 3: Intelligence Depth
- Natural language alert creation
- Dark vessel detection (AIS gap analysis)
- AI command center upgrades (NL queries against live data)
- Enhanced cinema mode (AI-narrated, TTS voiceover)

### Phase 4: Investigation Platform (Full Palantir)
- Entity relationship graph (D3.js force-directed)
- Synchronized multi-view (map + timeline + graph + table)
- Investigation workspaces (save + share configurations)
- Predictive intelligence (CII trend extrapolation + Sonnet)

### Phase 5: Launch & Growth
- Product Hunt launch
- Show HN
- X content flywheel
- beehiiv growth (referrals, cross-promotion)
- Email welcome sequence

---

## ENVIRONMENT VARIABLES NEEDED

```
# beehiiv
BEEHIIV_API_KEY=        # From beehiiv dashboard → Settings → API
BEEHIIV_PUB_ID=         # From beehiiv dashboard → Settings → Publication ID

# Buffer
BUFFER_ACCESS_TOKEN=    # From buffer.com → Settings → API

# Existing (already configured)
ANTHROPIC_API_KEY=      ✅
NOTION_API_KEY=         ✅
RESEND_API_KEY=         ✅ (keep for transactional emails only)
DATABASE_URL=           ✅
TWELVEDATA_API_KEY=     ✅
```

---

## COUNCIL REVIEW REQUEST

Council members: review this plan through your lens.

**Key tensions to evaluate:**
1. Newsletter voice pivot (CIA analyst → smart friend) — does this dilute credibility or expand audience?
2. beehiiv over Substack — right call for growth, or losing Substack's built-in discovery?
3. Light design for newsletter vs dark terminal for platform — brand coherence or smart segmentation?
4. Auto-publish with no review step — acceptable risk or reckless?
5. Building personalization (watchlist) in Phase 1 — too ambitious or table-stakes?
6. All thresholds active for X alerts from day one — too noisy or appropriately aggressive?
7. Phase 4 (Palantir-level features) — portfolio impressive or scope creep for a passion project?

**Verdict options:** Approved / Approved with conditions / Revise and resubmit / Rejected
