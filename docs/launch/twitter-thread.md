# Twitter / X launch thread

9 tweets, ~1 minute total reading. Pin tweet 1.

## Tweet 1

```
launching NexusWatch today.

a free 3d globe with 45+ live geopolitical data layers. earthquakes,
fires, conflict events, ship traffic, news sentiment, sanctions,
prediction markets — all of it, real time, one place.

nexuswatch.dev
```

(Attach: hero screenshot of the globe with multiple layers active)

## Tweet 2

```
the methodology is the load-bearing piece.

every score on the country index has a full evidence chain pointing
back to specific data fetches. we tell you our grade for each
country's data quality — A through D, no hiding.

nexuswatch.dev/#/methodology
```

## Tweet 3

```
158 countries. 6-component confidence score:

• Conflict (20%)
• Disasters (15%)
• Sentiment (15%)
• Infrastructure (15%)
• Governance (15%)
• Market Exposure (20%)

medians, not means. live data, weighted by source reliability.
```

## Tweet 4

```
the daily brief is written by claude. ~90 seconds to read. covers
the day's biggest CII movers and what they mean.

free in your inbox: brief.nexuswatch.dev
```

(Attach: screenshot of a brief)

## Tweet 5

```
the tech is intentionally boring:

• vanilla typescript (no react)
• MapLibre GL globe
• vercel edge functions
• neon postgres
• upstash kv for cache + rate limiting

~50K loc, mit licensed, github.com/ethancstuart/nexus-watch
```

## Tweet 6

```
my favorite layer is the live AIS ship tracker. ~80k vessels reporting
position every few seconds.

at 0600 UTC you can see the rerouting decisions happening in the
strait of hormuz in real time. it's eerie.
```

(Attach: ship-layer animated GIF if possible)

## Tweet 7

```
also new: the public read API.

curl 'https://nexuswatch.dev/api/v2/intelligence-report?country=UA'

no key required for basic queries. higher rate limits with one.
```

## Tweet 8

```
what's missing? a lot.

ENTSO-E EU grid (waiting on token approval).
ReliefWeb humanitarian feed (waiting on appname approval).
better mobile (iPhone SE specifically).
real onboarding for new users.

it's year one.
```

## Tweet 9

```
if you're an analyst, a journalist, a researcher, or just curious
about the world right now, take a look.

free. no signup. it's the entire site.

nexuswatch.dev
```

## After thread

Quote-tweet the original from a separate thread that thanks the data
sources by name (USGS, NASA, GDELT, ACLED, NOAA, Polymarket, etc).
Public credit goes a long way; some of those teams will RT.
