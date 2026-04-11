# NexusWatch — Geopolitical Intelligence Platform

## Project Overview
Vite + vanilla TypeScript intelligence platform: 30 data layers on a 3D MapLibre GL globe,
AI command center with terminal interface, auto-threat detection, 4 intelligence systems,
and personalized watchlists. Bloomberg terminal aesthetic.
Open-source, MIT licensed. Ships with smart defaults, fully configurable.
Deployed to Vercel at https://nexuswatch.dev. Built with Claude Code.
Inspired by SitDeck, World Monitor, and Bloomberg Terminal — information-dense, map-centric, AI-native.
Part of Ethan Stuart's portfolio: "I don't just manage products — I build them."

## Tech Stack
- Vite (build tool, dev server, HMR)
- TypeScript (strict mode, no framework)
- MapLibre GL JS (interactive vector tile maps, CARTO dark matter basemap)
- CSS custom properties for theming (terminal aesthetic, JetBrains Mono)
- Vercel Edge Functions for API proxying (16 endpoints)
- Anthropic SDK for AI terminal, sitreps, auto-threat narration, AI chat panel, deployer-hosted Haiku
- Service Worker for PWA offline support (hand-written, no Workbox)
- 10+ data sources: USGS, GDELT, NASA FIRMS, Open-Meteo, Polymarket, OpenSky, Cloudflare, ACLED, GDACS, WHO, AIS, OpenAQ, OSINT feeds

## Intel Map (v2)
The primary view at `#/intel` — a full-screen MapLibre GL 3D globe with 30 data layers across 5 categories:

### Data Layers (30 total)

**Conflict & Military (7):** ACLED Live Conflicts, Conflict Zones, Military Bases (28), Cyber Threat Corridors, OFAC Sanctions, GPS Jamming Zones, Frontlines

**Natural Hazards (5):** Earthquakes (USGS, 1min), Wildfires (NASA FIRMS, 10min), GDACS Disasters, WHO Disease Outbreaks, Weather Alerts (20 cities)

**Infrastructure (9):** Ship Tracking (26), Chokepoint Status (6), Undersea Cables (12), Oil/Gas Pipelines (10), Nuclear Facilities (22), Strategic Ports (18), Trade Routes (8), Space Launches (11), Energy

**Intelligence (7):** GDELT News Events, Prediction Markets, Satellites (animated orbits), Internet Outages (15), Election Calendar (12), Refugee Displacement Arcs (15), Sentiment

**Environment (2):** Air Quality AQI (30 cities), Live Aircraft (OpenSky)

### Intelligence Systems (4)
- **Tension Index Algorithm**: composite 0-100 score from conflict, disasters, sentiment, instability. 7-day rolling history
- **Geo-correlation engine** (`src/services/geoIntelligence.ts`): detects earthquake clusters, fire convergence, negative news surges, multi-signal events
- **Country Intelligence Index** (`src/services/countryIndex.ts`): 23 nations scored 0-100 across events/disasters/sentiment/predictions
- **Personal Intel Engine**: user-defined watchlists, keyword/country matching, AI morning briefs, browser notifications
- **Intel Bar** (`src/ui/intelBar.ts`): severity-colored alert pills with fly-to-location on click
- **AI Sitreps** (`api/sitrep.ts`): Claude Haiku generates situation reports from current layer data

### AI Terminal
- `nexuswatch>` command-line interface for querying layers, generating sitreps, filtering by region/threat type
- Natural language commands against live intelligence data
- Powered by Anthropic SDK (Claude Haiku)

### Auto-Threat Detection
- Continuous scanning across all 30 layers for anomalous patterns
- Automatic alert generation on multi-signal convergence or threshold breaches
- Feeds into Intel Bar and AI narration

### Contextual Narration
- AI-generated situation reports synthesizing active layer data
- On-demand briefs via terminal or sidebar
- Personalized morning briefs for watchlist subscribers

### Map Architecture
- `src/map/MapView.ts` — MapLibre GL init with CARTO dark matter tiles
- `src/map/MapLayerManager.ts` — layer registry, toggle, persistence, refresh cycles
- `src/map/MapOverlayManager.ts` — floating draggable/resizable widget overlays
- `src/map/layers/` — 30 MapDataLayer implementations (each owns its MapLibre sources/layers)
- `src/map/controls/` — LayerPanel (right), CountryPanel (left), ViewToggle
- `src/pages/intel.ts` — page orchestrator (mirrors dashboard.ts pattern)

### Keyboard Shortcuts (Intel View)
- `L` — toggle layer panel
- `C` — toggle country index
- `S` — generate sitrep
- `1-7` — toggle data layers
- `Esc` — close overlays
- `?` — shortcuts help

## Architecture (Classic Dashboard)
- **Space-based**: dashboard organized into named Spaces (Overview, Markets, World, Personal), each with its own 12-column CSS grid of widgets
- **Widget system**: Panels render at different sizes (compact/medium/large) via `renderAtSize()` — each widget has a `colSpan` in the grid
- **AI Bar**: persistent top bar replacing header/ticker/command palette — handles `/` commands and natural language AI queries
- **Pulse Bar**: cross-panel intelligence strip showing real-time correlations (stock moves, weather alerts, live games)
- **Auth required**: Google/GitHub OAuth, no guest tier — `free` is the baseline, `premium` unlocks more
- App.ts is the central orchestrator, dashboard.ts wires spaces + AI bar + pulse bar
- All external API calls go through api/ Edge Functions (keys stay server-side)
- User preferences persist in localStorage, cross-device sync via Vercel KV
- Each panel manages its own refresh cycle independently
- Circuit breaker pattern on fetch — 3 failures then 5min backoff
- Panels dispatch `dashview:panel-data` events after successful fetch for cross-panel intelligence

## Core Concepts

### Spaces
- Named contexts with their own widget layouts, stored in `dashview:spaces`
- Default spaces: Overview, Markets, World, Personal
- Users can create, rename, delete, and reorder spaces
- CRUD via `src/services/spaces.ts`

### Widgets
- Evolution of Panel system — same data lifecycle, now size-aware
- Sizes: `compact` (2-3 cols), `medium` (4-6 cols), `large` (6-12 cols)
- 12-column CSS grid, drag-to-reorder, resize handles
- Grid rendering via `src/ui/widgetGrid.ts`

### AI Bar
- Persistent input at top: `Cmd+K` or click to focus
- `/` prefix → command mode (autocomplete from registry)
- Natural language → AI mode (deployer Haiku, 5 free/day, BYO key unlimited)
- Status pills: weather temp, market index change
- AI responses shown in transient overlay below bar

### Pulse Bar
- Cross-space intelligence strip at bottom
- Shows pills from `src/services/intelligence.ts` correlation rules
- Categories: market moves >2%, crypto swings >5%, weather alerts, sports proximity, news-stock correlations
- Click pill → scroll to relevant widget with highlight

### Panel Categories
- `markets`: Stocks, Crypto
- `world`: Weather, News, Sports, Entertainment
- `personal`: Chat, Calendar
- `utility`: Notes
- Category determines accent stripe color on widget cards

## Panel Lifecycle
1. dashboard.ts checks auth → redirects to landing if not logged in
2. Spaces loaded, active space determined, widgets rendered into 12-col grid
3. Panels instantiated with category and priority
4. panel.attachToDOM(parent) creates DOM container, shows loading state
5. Data fetched in priority order: P0 (weather) → P1 (stocks, news, crypto) → P2 (sports, chat, notes)
6. panel.startDataCycle() calls fetchData() then starts setInterval(refreshInterval)
7. After successful fetch, dispatches `dashview:panel-data` event for intelligence/pulse
8. panel.renderAtSize(size) renders appropriate compact/medium/large variant
9. panel.render() updates the DOM directly (no virtual DOM)

## File Structure
- Panel classes: `src/panels/` (WeatherPanel.ts, StocksPanel.ts, etc.)
- Map layers: `src/map/layers/` (30 MapDataLayer files: earthquakeLayer.ts, acledLayer.ts, energyLayer.ts, frontlinesLayer.ts, sentimentLayer.ts, etc.)
- Services: `src/services/` (weather.ts, spaces.ts, intelligence.ts, interests.ts, aiShell.ts, geoIntelligence.ts, countryIndex.ts, etc.)
- Edge Functions: `api/` (weather-alerts.ts, acled.ts, fires.ts, flights.ts, ships.ts, osint-feed.ts, sitrep.ts, etc. — 16 endpoints)
- UI modules: `src/ui/` (aiBar.ts, spaceBar.ts, widgetGrid.ts, pulseBar.ts, settingsPanel.ts, aiOverlay.ts, aiTerminal.ts, etc.)
- Pages: `src/pages/` (nexuswatch.ts, casestudy.ts)
- Config: `src/config/` (theme.ts, themes.ts, density.ts, preferences.ts)
- Types: `src/types/index.ts`
- Styles: `src/styles/` (panel.css, layout.css, ai-bar.css, space-bar.css, pulse-bar.css, etc.)
- DOM helpers: `src/utils/dom.ts` — `createElement()`, `qs()`
- Fetch utility: `src/utils/fetch.ts` — `fetchWithRetry()`
- Storage: `src/services/storage.ts` — `get()`, `set()`

## Key Commands
npm run dev        → Start dev server (localhost:5173)
npm run build      → Production build (dist/) + SW manifest injection
npm run preview    → Preview production build locally
npm run test       → Run test suite (vitest)
npm run lint       → ESLint
npm run validate   → Typecheck + lint + test (CI gate)
vercel             → Deploy to Vercel

## Panel Status
- [x] Weather (OpenWeatherMap) — world, priority 0, compact variant
- [x] Stocks (Finnhub) — markets, priority 1, price alerts, compact variant
- [x] News (RSS feeds via proxy) — world, priority 1
- [x] Sports (ESPN) — world, priority 2, compact variant
- [x] Crypto (CoinGecko) — markets, priority 1, price alerts, compact variant
- [x] Chat (multi-provider) — personal, priority 2
- [x] Notes (localStorage) — utility, priority 2, no network
- [x] Calendar (Google Calendar API) — personal, priority 1, premium-gated
- [x] Entertainment (TMDB) — world, priority 2, compact variant
- [x] Hacker News (Firebase API) — dev, priority 2, tabs (Top/Best/New/Show/Ask), compact variant
- [x] GitHub Activity (GitHub API) — dev, priority 2, username setup, compact variant
- [x] Spotify (Spotify API) — personal, priority 2, premium-gated, OAuth connect, now playing + recent

## Shared Context — home-base
This project is part of a portfolio managed from ~/Projects/home-base.
Before planning features or making architectural decisions, reference:
- `~/Projects/home-base/registry.md` — project registry, status, and cross-project alignment
- `~/Projects/home-base/apis/catalog.md` — curated API catalog for potential integrations and new panels
- `~/Projects/home-base/standards/quality.md` — shared quality standards
- `~/Projects/home-base/standards/design-principles.md` — shared design philosophy
- `~/Projects/home-base/standards/design-toolkit.md` — skills, component libraries, and design references
- `~/Projects/home-base/personal/CLAUDE.local.md` — who Ethan is, how he works

When designing UI, consult the design toolkit before building components from scratch.
Use `/brand-guidelines` to auto-apply this project's brand identity.
Use `/frontend-design` for intentional aesthetic direction on new UI work.

When planning new panels, check the API catalog first — it maps APIs to NexusWatch features.

## Notion Context
This project is tracked in Notion under NexusWatch.
- **NexusWatch page:** `33945c2d-baf4-8144-9e57-d904bd93233e`
- **Technical Architecture:** `33945c2d-baf4-819f-af1a-e19def623679`
- **Feature Roadmap:** `33945c2d-baf4-8114-a45b-f04e7d568d41`
- **Bugs & Issues:** `33945c2d-baf4-81fa-97c9-f0f3b05ae85f`
- **Session Brief (global):** `33945c2d-baf4-81df-bdcf-f10616ef92cf`
- **Weekly Execution Brief (global):** `33945c2d-baf4-81d6-8e6e-e401346c03d1`
- **Prompt Library (global):** `33945c2d-baf4-81dc-9f20-c8f04a134c5f`

### Bugs & Issues Severity
- **P0 — Critical**: data loss, broken auth, payment failures, crashes in core flows. Drop everything and fix immediately.
- **P1 — High**: broken feature, bad UX blocking a key user task. Fix in current session before starting new work.
- **P2 — Normal**: cosmetic issues, edge cases, minor UX degradation. Fix in order when capacity allows.
Always label new bugs with their severity tier.

### Session start — read in this order:
1. **Weekly Execution Brief** — read the most recent week entry for priority context.
   - **Staleness check**: if the most recent entry is more than 7 days old or the page is empty, flag this immediately and ask Ethan for today's priorities before proceeding.
2. **Session Brief** — check for a same-day brief. Overrides the weekly brief if present.
3. **Bugs & Issues** — check for any OPEN items. P0 blocks all other work. P1 blocks new features unless brief says otherwise.
4. **Feature Roadmap** — check which items are open vs done. Note the Meridian geo-layer integration as a priority dependency.
5. Then begin work.

### Session end — always:
- Append a Feature Roadmap note: what was worked on this session, what was completed, what's next open item.
  Format: `## [YYYY-MM-DD] Session: [what was done] | Next: [next open roadmap item]`
- If any data layers are broken or returning stale data, add a P1 bug to Bugs & Issues.
- If the Meridian geo-layer integration was discussed or progressed, update the Dependency Register in Command Center.

## Important Notes
- No React or UI framework — vanilla TypeScript + DOM
- .env.local for deployer API keys (gitignored), .env.example committed
- `ANTHROPIC_API_KEY` env var powers deployer-hosted Haiku for AI shell (5 free queries/day per user)
- Finnhub free tier: 60 calls/min
- RSS feeds fetched server-side via proxy to avoid CORS
- No personal data in defaults — location auto-detected, tickers are broad market
- Adding a new panel: create class extending Panel with category, register in dashboard.ts, add Edge Function if needed
- Three themes (dark/light/OLED) stored in dashview:theme, three density modes in dashview:density
- Terminal aesthetic: JetBrains Mono font, category accent stripes, uppercase monospace section headers
- Unit preferences (°F/°C, 12h/24h) stored in dashview:preferences
- AI Bar: Cmd+K opens AI bar, `/` prefix for commands, natural language for AI queries
- Keyboard shortcuts: Cmd+K AI bar, ? help, t theme, 1-6 panels, Esc close
- AI-driven onboarding: interests picker → personalized spaces (dashview:onboarding)
- All panels support collapse (click header), state persists per panel
- ARIA landmarks, skip-link, focus-visible, and role attributes for screen readers
- PWA: manifest.json, service worker (public/sw.js), install prompt, offline indicator
- SW caching: network-first for API, cache-first for static/external assets, stale fallback when offline
- Price alerts: stored in dashview-alerts, tier-gated (5 free / unlimited premium), browser notifications via SW
- Notes: stored in dashview-notes, fully offline, no refresh cycle
- Export/Import: JSON config portability via configSync.ts, excludes sensitive keys
- Analytics: lightweight event tracking in dashview-analytics, 30-day rolling window, visible in settings
- Layout: 12-column CSS grid per space, responsive (12 cols >1200px, 8 cols 768-1200px, 1 col <768px)
- Multi-location weather: up to 5 saved locations in dashview-locations, pill switcher in panel
- Cross-device sync: logged-in users sync preferences to KV via api/prefs.ts
  - Pulls on login and tab focus (5-min cooldown), pushes on change (5-sec debounce)
  - Conflict resolution: per-key merge, local dirty keys take priority over server
  - Beacon flush on tab close for pending changes
  - Change tracking via dashview:storage-changed CustomEvent on document
- Stripe premium: raw fetch (no SDK). Tiers: $29/mo Analyst + $99/mo Pro + $19/mo founding-100 lifetime (locked 2026-04-11). Founding tier is first-100-subscribers-only; closes after cohort fills. Comparables anchor: Stratfor $149, Rundown Pro $20, Dataminr enterprise.
  - Checkout: POST /api/stripe/checkout → Stripe hosted checkout → webhook → KV update
  - Webhook: HMAC-SHA256 signature verification via Web Crypto, idempotency keys (24h TTL)
  - Self-healing: api/auth/session.ts checks stripe:{userId} in KV on every session load
  - Portal: POST /api/stripe/portal → Stripe billing portal for self-service cancel/update
  - Reverse session mapping: user-sessions:{userId} enables webhook to update all active sessions
- Calendar panel is premium-gated (requiredTier: 'premium')
- Alert limit: 5 for free tier, unlimited for premium (aligned in tier.ts, re-exported from alerts.ts)
- localStorage quota errors dispatch dashview:storage-error CustomEvent for UI toasts
- OG image: /api/og generates 1200x630 PNG via @vercel/og (Edge Function, zero client impact)
