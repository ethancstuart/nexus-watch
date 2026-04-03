# NexusWatch

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Deployed on Vercel](https://img.shields.io/badge/deployed%20on-Vercel-black.svg)](https://dashpulse.app)
[![Built with Claude Code](https://img.shields.io/badge/built%20with-Claude%20Code-blueviolet.svg)](https://claude.ai/claude-code)

**Real-time geopolitical intelligence platform.** 15 data layers on an interactive map — earthquakes, wildfires, live flights, cyber threats, military installations, conflict zones, undersea cables, and more. Bloomberg terminal aesthetic. No framework.

Built entirely with [Claude Code](https://claude.ai/claude-code). Open source under MIT.

## Features

**15 Data Layers**

| Layer | Source | Type |
|-------|--------|------|
| Earthquakes | USGS | Real-time, 1min refresh |
| Global News | GDELT | Real-time, 15min refresh |
| Wildfires | NASA FIRMS | Real-time, 10min refresh |
| Weather Alerts | Open-Meteo | Real-time, 30min refresh |
| Prediction Markets | Polymarket/Kalshi | Real-time, 5min refresh |
| Live Aircraft | OpenSky Network | Real-time, 15sec refresh |
| Cyber Threats | Cloudflare Radar | Static corridors |
| Military Bases | Curated dataset | 28 NATO/RU/CN installations |
| Nuclear Facilities | Curated dataset | 22 power/weapons sites |
| Strategic Ports | Curated dataset | 18 ports + chokepoints |
| Conflict Zones | Curated dataset | 15 active armed conflicts |
| Undersea Cables | Curated dataset | 12 submarine telecom cables |
| Oil/Gas Pipelines | Curated dataset | 10 major pipelines |
| GPS Jamming | Curated dataset | 11 interference zones |
| Satellites | Computed orbits | 9 military/intel satellites |

**Intelligence System**
- Geo-correlation engine detecting earthquake clusters, fire convergence, multi-signal events
- Country Intelligence Index scoring 23 nations (0-100) across events, disasters, sentiment
- AI Situation Reports via Claude Haiku (on-demand)

**Sidebar**
- **Intel tab**: Real-time alerts + country index + layer controls
- **Markets tab**: Stock quotes + crypto prices
- **Feeds tab**: Categorized news headlines (World/US/Markets/Tech/Sci)

## Quick Start

```bash
git clone https://github.com/ethancstuart/dashboard.git
cd dashboard
cp .env.example .env.local
npm install
npm run dev
```

Open [localhost:5173](http://localhost:5173). Map loads instantly — no login required.

## Tech Stack

- Vanilla TypeScript + [Vite](https://vitejs.dev) (no framework)
- [MapLibre GL JS](https://maplibre.org) + CARTO dark matter tiles
- [Vercel](https://vercel.com) Edge Functions (12 endpoints)
- Bloomberg terminal aesthetic: `#000` bg, `#ff6600` accent, JetBrains Mono
- [Vitest](https://vitest.dev) + happy-dom (23 tests)

## Architecture

```
src/
  pages/nexuswatch.ts    # Main app orchestrator
  map/
    MapView.ts           # MapLibre GL initialization
    MapLayerManager.ts   # Layer registry + lifecycle
    PopupCard.ts         # Bloomberg-styled popup cards
    layers/              # 15 MapDataLayer implementations
  services/              # Data fetching + intelligence
  ui/                    # Sidebar tab components
  styles/                # Bloomberg terminal CSS
api/                     # Vercel Edge Functions
```

## License

MIT
