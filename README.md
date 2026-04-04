# NexusWatch

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Deployed on Vercel](https://img.shields.io/badge/deployed%20on-Vercel-black.svg)](https://dashpulse.app)
[![Built with Claude Code](https://img.shields.io/badge/built%20with-Claude%20Code-blueviolet.svg)](https://claude.ai/claude-code)

**Real-time geopolitical intelligence platform.** 30 data layers on a 3D globe, AI command center with terminal interface, auto-threat detection, personalized watchlists, and four independent intelligence systems. Bloomberg terminal aesthetic. No framework. Built entirely with [Claude Code](https://claude.ai/claude-code). Open source under MIT.

## Data Layers

### Conflict & Military

| Layer | Source | Type |
|-------|--------|------|
| ACLED Live Conflicts | ACLED | Real-time events |
| Conflict Zones | Curated dataset | 15 active armed conflicts |
| Military Bases | Curated dataset | 28 NATO/RU/CN installations |
| Cyber Threat Corridors | Cloudflare Radar | Static corridors |
| OFAC Sanctions | Curated dataset | Sanctioned entities |
| GPS Jamming Zones | Curated dataset | 11 interference zones |
| Frontlines | Curated dataset | Active front line positions |

### Natural Hazards

| Layer | Source | Type |
|-------|--------|------|
| Earthquakes | USGS | Real-time, 1min refresh |
| Wildfires | NASA FIRMS | Real-time, 10min refresh |
| GDACS Disasters | GDACS | Real-time alerts |
| WHO Disease Outbreaks | WHO | Outbreak tracking |
| Weather Alerts | Open-Meteo | Real-time, 30min refresh |

### Infrastructure

| Layer | Source | Type |
|-------|--------|------|
| Ship Tracking | AIS | 26 tracked vessels |
| Chokepoint Status | Curated dataset | 6 strategic chokepoints |
| Undersea Cables | Curated dataset | 12 submarine telecom cables |
| Oil/Gas Pipelines | Curated dataset | 10 major pipelines |
| Nuclear Facilities | Curated dataset | 22 power/weapons sites |
| Strategic Ports | Curated dataset | 18 ports + chokepoints |
| Trade Routes | Curated dataset | 8 major routes |
| Space Launches | Curated dataset | 11 launch events |
| Energy | Curated dataset | Energy infrastructure |

### Intelligence

| Layer | Source | Type |
|-------|--------|------|
| Global News | GDELT | Real-time, 15min refresh |
| Prediction Markets | Polymarket/Kalshi | Real-time, 5min refresh |
| Satellites | Computed orbits | 9 military/intel satellites |
| Internet Outages | Curated dataset | 15 monitored regions |
| Election Calendar | Curated dataset | 12 upcoming elections |
| Refugee Displacement | Curated dataset | 15 displacement arcs |
| Sentiment | GDELT tone analysis | Country-level sentiment |

### Environment

| Layer | Source | Type |
|-------|--------|------|
| Air Quality | OpenAQ | AQI for 30 cities |
| Live Aircraft | OpenSky Network | Real-time, 15sec refresh |

## Intelligence Systems

**Tension Index Algorithm** -- Composite 0-100 score computed from 4 weighted components: conflict (ACLED events + fatalities), disasters (earthquakes + fires + GDACS), sentiment (GDELT tone analysis), instability (cyber threats + GPS jamming + predictions). 7-day rolling history.

**Geo-Correlation Engine** -- Multi-signal event detection across all active layers. Earthquake clusters, fire convergence zones, negative news surges, and cross-domain anomalies detected in real-time using geospatial proximity matching.

**Country Intelligence Index** -- 23 nations scored 0-100 across events, disasters, sentiment, and predictions. Per-country component breakdown with historical trend detection. Severity classification: LOW / MODERATE / ELEVATED / CRITICAL.

**Personal Intel Engine** -- User-defined watchlists scan all incoming data for keyword and country matches. AI-generated personalized morning briefs via Claude Haiku. Browser notification alerts with configurable thresholds.

## AI Command Center

**AI Terminal** -- Full command-line interface at `nexuswatch>`. Query any layer, generate situation reports, filter by region or threat type, and issue natural language commands against live intelligence data.

**Auto-Threat Detection** -- Continuous scanning across all 30 layers for anomalous patterns. Automatic alert generation when multi-signal events converge or thresholds are breached.

**Contextual Narration** -- AI-generated situation reports synthesizing active layer data into human-readable intelligence briefs on demand.

## Quick Start

```bash
git clone https://github.com/ethancstuart/dashboard.git
cd dashboard
npm install && npm run dev
```

Open [localhost:5173](http://localhost:5173). Map loads instantly -- no login required.

## Tech Stack

- Vanilla TypeScript + [Vite](https://vitejs.dev) (no framework)
- [MapLibre GL JS](https://maplibre.org) -- 3D globe projection with atmosphere fog, CARTO dark matter tiles
- [Vercel](https://vercel.com) Edge Functions (16 endpoints)
- Anthropic SDK for AI terminal + sitreps + auto-threat narration
- Bloomberg terminal aesthetic: `#000` bg, `#ff6600` accent, JetBrains Mono
- [Vitest](https://vitest.dev) + happy-dom

## Architecture

```
src/
  pages/
    nexuswatch.ts        # Main app orchestrator
    casestudy.ts         # Technical case study page
  map/
    MapView.ts           # MapLibre GL globe initialization
    MapLayerManager.ts   # Layer registry + lifecycle
    PopupCard.ts         # Bloomberg-styled popup cards
    layers/              # 30 MapDataLayer implementations
  services/              # Data fetching + intelligence engines
  ui/                    # Sidebar tabs, AI terminal, controls
  styles/                # Bloomberg terminal CSS
api/                     # Vercel Edge Functions (16 endpoints)
```

## License

MIT
