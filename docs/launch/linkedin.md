# LinkedIn launch post

## The post

```
For the past year I've been building NexusWatch — a free, open-source
intelligence platform that puts every conflict, hazard, vessel,
satellite, and signal we can pull into one 3D globe.

It went live today.

What's on it:
- 45+ live data layers (ACLED, GDELT, USGS, NASA FIRMS, AIS, OFAC,
  Cloudflare, NOAA, Polymarket, and more)
- Country Confidence Index for 158 countries with full evidence chains
- A daily AI brief that synthesizes top movers
- A public API — no key required for basic queries

What it isn't:
- Not a Bloomberg killer
- Not a Janes substitute
- Not finished — it's a year-one cut

Why free? Because the marginal cost of letting one more analyst,
journalist, or curious citizen look at the world this way is zero,
and the marginal benefit of more eyeballs on geopolitical data is
not zero.

Three things I'd love feedback on:
1. Does the methodology read defensible to people who do this work?
2. Which data source would you most want added next?
3. What's the use case I'm missing?

Take a look: nexuswatch.dev

Source code (MIT): github.com/ethancstuart/nexus-watch
```

## Follow-up posts (T+3, T+7, T+14)

### T+3: data-source highlight

```
Quick technical note from the NexusWatch launch: the trickiest
data integration was AIS ship tracking. AIS is a UDP-style vessel
self-reporting protocol — every ship transmits position every few
seconds, but signal collection is fragmented across regional receivers.

I ended up using AISStream, which aggregates regional receivers into
a single WebSocket. ~80,000 vessels visible globally at any moment.

The interesting product moment is when you watch the Strait of
Hormuz at 0600 UTC and you can see the rerouting decisions happening
in real time.

nexuswatch.dev (Layer drawer → Ships)
```

### T+7: a "what we learned"

```
Week one of NexusWatch in public:

- [N] visitors
- [N] daily-brief subscribers
- [N] countries clicked into the detail panel (Ukraine, Sudan, Iran
  topped the list — no surprise)
- 0 critical bugs
- 1 unintentional API rate-limit on launch day (now KV-backed)

Three lessons:
1. The country detail panel is the hook. People come for the globe,
   stay for the per-country evidence chains.
2. Methodology page traffic was 4× expected. People want to know how
   the score is computed before they trust it.
3. Mobile usage was higher than I expected (~40%). Wide-globe default
   zoom was the right call.

nexuswatch.dev
```

### T+14: a thoughtful angle

Pick one of: methodology deep-dive, "what I removed and why",
"the source we couldn't get", or "what a journalist used it for."

Tone: thoughtful, specific, no hype.
