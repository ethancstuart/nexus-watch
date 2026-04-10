# NexusWatch Roadmap

## Shipped

### Core Dashboard
- Panel-based architecture with self-contained data sources
- Space-based organization with named contexts (Overview, Markets, World, Personal)
- 12-column responsive widget grid with drag-to-reorder and resize handles
- Weather panel (OpenWeatherMap) with 3-day forecast, hourly sparklines, multi-location support
- Markets panel (Finnhub) with watchlist, detail views, drag-to-reorder, sparklines
- Crypto panel (CoinGecko) with top 10 coins, 7-day sparklines, market cap, ATH tracking
- News panel with 7 categories, custom RSS feeds (tier-gated)
- Sports panel (ESPN) with NBA, NFL, MLB, EPL live scores and team favorites
- Entertainment panel (TMDB) with trending, movies, TV, upcoming tabs
- Notes panel with quick-capture to-dos, fully offline
- Scrolling market ticker

### AI & Intelligence
- AI Bar — persistent input with Cmd+K, `/` commands, natural language AI queries
- Multi-provider AI chat (Anthropic, OpenAI, Google, xAI) with BYO key
- AI shell powered by deployer-hosted Claude Haiku (5 free/day, 25/day premium)
- Daily AI briefing using live dashboard context
- Pulse Bar — cross-panel intelligence strip showing real-time correlations
- Prediction markets (Polymarket, Kalshi)

### Platform
- Google/GitHub OAuth with free and premium tiers
- Cross-device preference sync via Vercel KV (pull on focus, push on change, beacon flush)
- Dashboard config sharing via export/import (JSON + URL codes)
- PWA with service worker, offline caching, install prompt
- Price alerts with browser notifications (tier-gated)
- Lightweight usage analytics (30-day rolling window, visible in settings)

### UX & Accessibility
- Dark, light, and OLED black themes
- 3 density modes (compact, comfortable, spacious)
- Compact/medium/large widget sizes per panel
- Keyboard shortcuts (press ? for help)
- ARIA landmarks, skip-link, focus-visible, screen reader support
- 5-step AI-driven onboarding with interests picker
- Priority-based data loading (P0 → P1 → P2), collapsible panels, retry on error
- Settings panel reactive to changes — panels refresh immediately on preference updates

### Infrastructure
- Vercel Edge Function API proxying (keys stay server-side)
- Circuit breaker fetch pattern (3 failures, 5-min backoff) with request deduplication
- Security headers (CSP, HSTS, X-Content-Type-Options, Permissions-Policy)
- ESLint (flat config) + Prettier for code quality
- TypeScript strict mode for both src/ and api/
- CI pipeline: typecheck, lint, format check, tests, build
- AbortController-based listener cleanup on SPA navigation (no listener leaks)

### Phase 3 — Premium & Launch (Shipped)
- Calendar integration (Google Calendar) — premium-gated
- Advanced alert conditions (crossing, range-based, outside range)
- Stripe payments with founding member pricing ($3/mo)
- Self-healing session tier (Stripe status checked on every session load)
- Webhook-driven subscription lifecycle (checkout, update, cancel)
- Billing portal for self-service subscription management
- OG image generation via Edge Function (@vercel/og)
- Landing page polish with dashboard preview and open-source badges
- Alert limit aligned to 5 for free tier (from 3)
- CSS variable adoption for calendar panel (theme-safe across all 3 themes)
- localStorage quota error events for UI-surfaceable storage errors
- Live waitlist count via KV SCAN
- 100+ tests across tier, auth, calendar, alerts, storage, and more
- Comprehensive quality pass: ESLint, Prettier, CI, listener cleanup

## Phase 4 — Platform Expansion
- Plugin SDK
- Custom dashboards
- API access

## Phase 5 — AI-Native Intelligence
- AI co-pilot
- Natural language config
- Trend detection
- Smart defaults

## Open Source
NexusWatch is MIT licensed and free forever. If community interest grows, a managed hosted version may be offered as a convenience -- the open-source tool will always remain fully functional and free.
