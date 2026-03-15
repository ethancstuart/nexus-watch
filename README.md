# DashPulse

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Deployed on Vercel](https://img.shields.io/badge/deployed%20on-Vercel-black.svg)](https://dashpulse.app)
[![Built with Claude Code](https://img.shields.io/badge/built%20with-Claude%20Code-blueviolet.svg)](https://claude.ai/claude-code)

![DashPulse](https://dashpulse.app/api/og)

**Your personal intelligence terminal.** Weather, markets, news, sports, crypto, and AI -- organized into customizable spaces with a keyboard-driven interface. No framework, no bloat, just live data.

Built entirely with [Claude Code](https://claude.ai/claude-code). Open source under MIT.

## Why DashPulse

The personal dashboard category hasn't evolved. Momentum and its clones are passive wallpaper -- a clock, a greeting, a photo. DashPulse treats your browser tab as a control surface: real-time data from 10 sources, AI-powered queries, and a terminal aesthetic built for information density.

## Features

**10 Data Panels**
- **Weather** -- Hyperlocal forecasts, hourly sparklines, multi-location support, interactive world map
- **Markets** -- 10-stock watchlist with real-time quotes, detail views, sparklines (Finnhub)
- **Crypto** -- Top 10 coins with 7-day sparklines, market cap, volume, ATH tracking (CoinGecko)
- **News** -- 7 categories + custom RSS feeds, mapped on an interactive globe
- **Sports** -- NBA, NFL, MLB, EPL live scores with team favorites
- **Entertainment** -- Trending movies, TV, upcoming releases (TMDB)
- **AI Chat** -- Multi-provider (Anthropic, OpenAI, Google, xAI), bring your own API key
- **Calendar** -- Google Calendar integration with today/tomorrow view (premium)
- **Notes** -- Quick-capture to-dos, fully offline
- **Globe** -- Interactive 3D map with news correlation and weather overlay

**AI-Native Interface**
- AI Bar (Cmd+K) -- natural language queries and slash commands
- Daily AI Briefing -- morning summary using live dashboard data
- Pulse Bar -- cross-panel intelligence showing what matters NOW
- AI Shell -- deployer-hosted Claude Haiku (5 free/day)

**Platform**
- Space-based layout -- organize panels into named contexts (Overview, Markets, World, Personal)
- 12-column responsive grid with drag-to-reorder and resize
- PWA -- installable as native app, works offline
- Cross-device sync via Vercel KV
- Price alerts with browser notifications (5 free, unlimited premium)
- Stripe-powered premium tier with founding member pricing
- Dark, light, and OLED themes with 3 density modes
- Export/import config as JSON
- Google/GitHub OAuth

## Quick Start

```bash
git clone https://github.com/ethancstuart/Dashboard.git
cd Dashboard
cp .env.example .env.local
# Add your API keys to .env.local
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173).

## API Keys

| Service | Tier | Purpose |
|---------|------|---------|
| [OpenWeatherMap](https://openweathermap.org/api) | Free | Weather data |
| [Finnhub](https://finnhub.io) | Free (60 calls/min) | Stock quotes |
| [Mapbox](https://www.mapbox.com) | Free tier | News map + globe |
| [TMDB](https://www.themoviedb.org/documentation/api) | Free | Entertainment data |

Optional: Stripe keys (premium tier), Anthropic key (hosted AI shell), BYO key for AI Chat (Anthropic/OpenAI/Google/xAI).

## Architecture

```
src/
  panels/        # 10 self-contained panel classes
  services/      # API clients, auth, storage, tier, sync
  pages/         # Landing, dashboard, roadmap
  ui/            # AI bar, settings, command palette, widgets
  config/        # Themes, density, preferences
  types/         # Centralized TypeScript types
  styles/        # 28 CSS files, all using CSS custom properties
api/             # 18 Vercel Edge Functions (API proxies, auth, Stripe)
```

Panel-based -- every data source is a self-contained TypeScript class with its own refresh cycle. No React, no framework. DOM updates are direct. API keys proxied through Edge Functions.

**Key patterns:** Circuit breaker fetch (3 failures, 5-min backoff), priority-based loading (P0-P2), AbortController listener cleanup, self-healing session tier.

## Commands

```bash
npm run dev        # Dev server (localhost:5173)
npm run build      # TypeScript + Vite build + SW manifest
npm run test       # Vitest (100+ tests)
npm run lint       # ESLint
npm run validate   # Typecheck + lint + test
vercel             # Deploy to Vercel
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, PR guidelines, and architecture overview.

## Tech Stack

- [Vite](https://vitejs.dev) + TypeScript (strict mode, ~50-70KB gzipped)
- Vanilla DOM (no framework)
- CSS custom properties for theming (JetBrains Mono, terminal aesthetic)
- [Vercel](https://vercel.com) Edge Functions
- [globe.gl](https://globe.gl) for interactive 3D globe
- [Vitest](https://vitest.dev) + happy-dom for testing
- Stripe (raw fetch, no SDK) for payments

## License

MIT
