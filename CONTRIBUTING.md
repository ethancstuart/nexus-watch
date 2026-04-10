# Contributing to NexusWatch

Thanks for your interest in contributing! NexusWatch is built entirely with [Claude Code](https://claude.ai/claude-code) and vanilla TypeScript -- no framework overhead.

## Development Setup

```bash
git clone https://github.com/ethancstuart/Dashboard.git
cd Dashboard
cp .env.example .env.local
# Add API keys to .env.local (see below)
npm install
npm run dev
```

The dev server runs at [localhost:5173](http://localhost:5173) with hot module replacement.

### Environment Variables

Required for core functionality:
- `OPENWEATHER_API_KEY` -- Weather panel
- `FINNHUB_API_KEY` -- Stock quotes
- `MAPBOX_TOKEN` -- News globe/map
- `TMDB_API_KEY` -- Entertainment panel

Required for auth + sync:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` -- Google OAuth
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` -- GitHub OAuth
- `KV_REST_API_URL`, `KV_REST_API_TOKEN` -- Vercel KV (sessions, sync)
- `AUTH_SECRET` -- Session signing
- `ADMIN_IDS`, `ADMIN_EMAILS` -- Admin override

Optional (premium):
- `STRIPE_SECRET_KEY`, `STRIPE_PRICE_ID`, `STRIPE_FOUNDING_PRICE_ID`, `STRIPE_WEBHOOK_SECRET`
- `ANTHROPIC_API_KEY` -- Hosted AI shell

## Running Tests

```bash
npm run test          # Run all tests once
npm run test:watch    # Watch mode
npm run validate      # Typecheck + lint + test (CI gate)
```

Tests use [Vitest](https://vitest.dev) with happy-dom. All tests live next to their source files (`*.test.ts`).

## Architecture Overview

NexusWatch uses a **panel-based architecture**. Every data source is a self-contained class:

```
src/
  panels/        # Panel classes (WeatherPanel, StocksPanel, etc.)
  services/      # API clients, auth, storage, tier
  pages/         # Full-page views (landing, roadmap, dashboard)
  ui/            # AI bar, settings, command palette, widgets
  utils/         # DOM helpers, fetch with circuit breaker
  types/         # Centralized TypeScript types
api/             # Vercel Edge Functions (API proxies, auth, Stripe)
```

### Key Patterns

- **Panel lifecycle:** Each panel extends `Panel` base class, manages its own DOM container, refresh interval, and data fetching
- **No framework:** Direct DOM manipulation via helpers in `src/utils/dom.ts`
- **Circuit breaker:** All fetches go through `src/utils/fetch.ts` -- 3 failures trigger 5-minute backoff
- **API proxying:** External API calls route through `api/` Edge Functions so keys stay server-side
- **Tier system:** `src/services/tier.ts` controls access, alert limits, and feature gates
- **Self-healing sessions:** `api/auth/session.ts` re-derives admin and Stripe tier on every load

### Adding a New Panel

1. Create `src/panels/YourPanel.ts` extending `Panel`
2. Implement `fetchData()` and `render(data)`
3. Register in `src/pages/dashboard.ts`
4. Add an Edge Function in `api/` if the panel needs external API access
5. Add types to `src/types/index.ts`
6. Add tests in `src/panels/YourPanel.test.ts`

## Pull Request Guidelines

- **One feature per PR** -- keep changes focused and reviewable
- **Run `npm run validate`** before submitting -- CI will check typecheck + lint + tests
- **TypeScript strict mode** -- no `any` types, no type assertion shortcuts
- **Test locally** -- verify your changes work in the browser
- **Descriptive commits** -- imperative mood, explain the "why" not just the "what"

## Code Style

- PascalCase for panel classes, camelCase for services and utils
- CSS custom properties for all colors and spacing
- No external UI libraries -- vanilla TypeScript + DOM
- Keep panel implementations self-contained
- ESLint + Prettier enforced in CI

## Reporting Issues

Open an issue on GitHub with:
- What you expected to happen
- What actually happened
- Browser and OS info
- Console errors (if any)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
