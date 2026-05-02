# Hacker News submission

## Title

Choose one — A/B test on a friend's reaction first:

**Option A (product-led):**
> Show HN: NexusWatch – a 3D globe with 45+ live geopolitical data layers

**Option B (tech-led):**
> Show HN: I built a Bloomberg terminal for geopolitics, free and open source

**Option C (curiosity-led):**
> Show HN: Real-time intelligence dashboard for 158 countries

Recommended: **Option A**. "Show HN" + concrete number + "data layers"
gets engineering-curious clicks.

## URL

`https://nexuswatch.dev`

## First comment (post within 5 minutes)

```
Hi HN — I built NexusWatch over the past year as a side project. It's
a 3D globe interface that pulls 45+ live data feeds (USGS earthquakes,
NASA fires, ACLED conflicts, GDELT news, Cloudflare outages, AIS ship
positions, NOAA aurora forecasts, Polymarket prediction markets, and
~40 more) and overlays them in one place.

A few things worth flagging:

- Country Confidence Index (CII) for 158 countries: a 6-component
  composite (conflict, disasters, sentiment, infrastructure,
  governance, market exposure) with full evidence-chain on every
  score. /#/methodology has the rule version + sources.

- Daily AI brief written by Claude that synthesizes the day's CII
  movers into a 3-minute scan. Free, no signup wall.

- Public read API at /api/v2 — no key required for basic queries.
  Five-line bash gets you any country's full report.

Tech: vanilla TypeScript + MapLibre GL (globe projection), Vercel
edge functions, Neon Postgres, Upstash KV for caching + rate
limiting. No React, no Next.js.

I'd love feedback on the methodology page (does the CII feel
defensible?), the data quality grade we expose per country, and
anything you wish was on the globe.

Source: github.com/ethancstuart/nexus-watch
```

## Tone notes

- "Side project" framing avoids overselling
- Concrete numbers (45, 158, 6, 5-line) anchor the claim
- Methodology is the load-bearing trust signal — point them there
- End with a question — invites comments
- Source link last so it's the obvious follow-up click

## Don't

- Don't say "AI-powered" anywhere — HN crowd is allergic
- Don't link to a paywall or signup wall
- Don't describe it as "Bloomberg killer" or any superlative
- Don't reply defensively to skeptical comments — engage with the
  technical substance
