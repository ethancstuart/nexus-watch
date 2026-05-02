# Reddit launch posts

Different subs want different angles. Same product, three voices.

## r/geopolitics

**Title:** I built a free real-time geopolitical intelligence dashboard — 45+ data layers, 158 countries scored daily

**Body:**

```
Built this over the past year as a side project. It pulls 45+ live
feeds (ACLED conflict events, GDELT news, USGS earthquakes, NASA
fires, AIS ship positions, OFAC sanctions, GDACS disasters, Polymarket
prediction markets, and more) and overlays them on a 3D globe.

The core analytical thing is the Country Confidence Index — a
6-component score (conflict, disasters, sentiment, infrastructure,
governance, market exposure) with full evidence-chain on every score.
Currently covers 158 countries. Methodology is public:
nexuswatch.dev/#/methodology

Free, no signup. Daily AI brief if you want a 3-minute scan in your
inbox.

Looking for feedback from people who actually consume geopolitical
risk data professionally. Specifically:

1. Is the CII methodology defensible? What's missing?
2. Which data sources do you wish were on there?
3. What does Bloomberg / Janes / Stratfor do that this doesn't?

nexuswatch.dev
```

**Avoid:** any "Show HN" framing — Reddit reads that as cross-posting

## r/dataisbeautiful

**Title:** [OC] 45+ live geopolitical data layers on a 3D globe

**Body:**

```
Real-time visualization of every conflict event, fire, earthquake,
ship, satellite, news event, and pipeline I could find. Layers
include:

- ACLED armed conflict events
- NASA FIRMS active fires
- USGS earthquakes
- AIS ship positions (live WebSocket stream)
- GDELT news sentiment heatmap
- NOAA aurora forecast (greenish polar oval)
- Cloudflare internet outages
- OFAC sanctions
- Polymarket prediction markets
- Pipelines, undersea cables, chokepoints, ports
- Refugee displacement flows

All free, no signup. Sources cited per layer.

nexuswatch.dev
```

**Tone:** lead with the data, no marketing. Reddit data viz crowd
appreciates a good treemap or layer list.

## r/SideProject

**Title:** Spent 12 months building a free Bloomberg-style geopolitical dashboard

**Body:**

```
Side project I've been chipping at for a year. Started as "what if
I could see every conflict at once" and grew into a 45-layer 3D
globe with daily AI briefs and a public API.

Stack: vanilla TypeScript + MapLibre GL, Vercel edge functions,
Neon Postgres, Upstash KV. No React. ~50K lines.

Free, no paywall, MIT licensed:
- Site: nexuswatch.dev
- Source: github.com/ethancstuart/nexus-watch

Hardest parts:
1. Source-of-truth on geopolitical claims — every score has an
   evidence chain pointing back to specific data fetches.
2. Cost containment — Anthropic / Windy quotas blow up fast if you're
   not careful with caching. Ended up rolling my own KV-backed cache
   layer.
3. The globe projection on MapLibre is browser-dependent; falls back
   to mercator on older Safari.

Happy to answer technical questions.
```

**Tone:** be honest about hard parts, this sub respects engineering
candor.
