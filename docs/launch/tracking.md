# Launch tracking

What to measure, where it lives, what success looks like. Capture daily
during launch week (T+0 through T+7), then weekly after that.

## Headline metrics

| Metric | Where | Day 1 target | Week 1 target |
|--------|-------|--------------|---------------|
| Unique visitors | Vercel Analytics | 500+ | 2000+ |
| Brief subscribers | beehiiv dashboard | +50 | +200 |
| HN ranking peak | news.ycombinator.com (look at /front) | top 30 | — |
| Reddit upvotes (geopolitics) | reddit.com/r/geopolitics | 50+ | 200+ |
| Twitter impressions | X analytics | 5000+ | 25000+ |
| LinkedIn reactions | LinkedIn analytics | 50+ | 200+ |
| GitHub stars | github.com/ethancstuart/nexus-watch | +25 | +100 |
| API calls | Vercel function logs | 1000+ | 10000+ |

## Quality metrics

| Metric | Where | Threshold |
|--------|-------|-----------|
| 5xx error rate | Vercel logs / Sentry | <0.5% |
| p95 landing TTFB | Vercel Analytics → Speed Insights | <200ms |
| p95 /api/cii latency | /api/status historical | <1500ms |
| Discord cron-health alerts | Discord channel | 0 |
| Anthropic spend (24h) | console.anthropic.com | <$2 |
| Windy quota used (24h) | api.windy.com/dashboard | <500 of 10000 |

## Funnel metrics

Track per channel — which one converts to brief subscribers best?

| Channel | Visitors | Brief subs | Conv rate |
|---------|----------|------------|-----------|
| HN |  |  |  |
| Reddit |  |  |  |
| LinkedIn |  |  |  |
| Twitter |  |  |  |
| Product Hunt |  |  |  |
| Direct (typed URL) |  |  |  |
| Search |  |  |  |

UTM-tag every link you post: `?utm_source=hn` etc.

## Qualitative

Save copies of the best comments / DMs / replies. The best
testimonials are the ones from people you didn't expect (a journalist,
an analyst, a researcher).

## Day-after retro

24 hours in, write a short doc: what worked, what didn't, what
surprised you. File at `docs/launch/retro-2026-MM-DD.md`. Share parts
of it publicly at T+7.

## What "won" looks like

If by T+7 you have:
- 200+ brief subscribers
- 100+ GitHub stars
- A journalist or operator with a real use case asking for a feature
- 0 critical bugs

Then it's a platform, not just a project. Plan the next sprint
around what those people asked for.

## What "missed" looks like

Sub-50 brief subs and ranking outside HN top 50:
- Don't relaunch the same way
- Spend two weeks on warm intros to specific personas (analysts at
  hedge funds, geopolitics journalists, security researchers)
- Iterate on the country panel based on session recordings (if you
  add a recording tool — currently we don't, by design)
- Then launch v2 to the warm list
