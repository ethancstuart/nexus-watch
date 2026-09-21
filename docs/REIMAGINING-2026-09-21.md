# Re-imagining NexusWatch — the one place to find out what is going on

Written 2026-09-21 at the owner's direction: *"re-imagine what an AI one-place
hub for what is going on in the world is, and build the absolute best version
of that on the foundation I know we have."*

This is a proposal, not a decision. It ends with three directions and a
recommendation.

---

## What the foundation actually is

Measured today, not remembered:

| asset | state |
|---|---|
| **The register** | 1,304 resolved calls, 910 open, 102 independent units, 17 resolution batches. Brier published per kind. Corrections published beside the figures they correct. |
| **The CII** | 85 countries scored on 6 components, rule version 2.1.0, 3.2M rows of history |
| **The map** | 49 layers, 77 API endpoints, all restored |
| **The brief** | written daily by Claude, delivered by email, archived and indexed |
| **The AI** | analyst, sitreps, alert parsing — restored today, budget-gated |
| **The sources** | OONI, FX, OFAC, UCDP, Wikipedia attention, World Bank governance, USGS, NASA, ACLED |

**The rarest asset is not the map. It is the register.** Almost nobody publishes
a dated, falsifiable, externally-scored forecast record — including, today, a
*negative* skill number on FX, because that is what the evidence says.

---

## The diagnosis

The product is three products wearing one skin.

- **The map** answers *where*.
- **The register** answers *how much should you trust us*.
- **The brief** answers *what happened*.

Nobody's actual question is any of those. The question is:

> **What is going on, does it matter to me, and what happens next?**

A dot on a globe does not say that a Bab el-Mandeb closure moves LNG spreads
and Egyptian FX. The 2026-09-20 brief *did* say that — in prose, once, by
email, to whoever opened it. **The intelligence exists and the interface
does not carry it.**

That is the gap. Not layers. Not polish.

### Why it reads as weak right now

Three things, all true at once:

1. **The map is the front door**, so the product opens on the surface with the
   least meaning per pixel. 49 layers of coloured dots is a capability
   demonstration, not an answer.
2. **Nothing connects a signal to a consequence.** `FLOOD` over Sudan and
   `Suez Canal ELEVATED` are adjacent pixels with no stated relationship,
   though one plausibly drives the other.
3. **The credibility is invisible where it matters.** The register is a
   separate page. A claim on the map carries no score, no track record, no
   "we have said this 14 times and been right 4."

---

## The idea: lead with consequence, keep the map as evidence

**The front door becomes the answer, and everything else becomes its
citation.**

A single ranked feed of **situations** — not events, not layers. A situation is
a named thing with a claim attached, and every situation carries four things
the foundation can already produce:

```
  BAB EL-MANDEB — Houthi ground advance                    ▲ rising
  ─────────────────────────────────────────────────────────────────
  WHAT      Crisis Group reports ground forces at the strait;
            first confirmed advance since the war resumed.
  SO WHAT   12% of global trade transits here. Tanker reroute
            adds ~9 days Gulf→Rotterdam.
  EXPOSURE  EG ▲ FX  ·  energy ▲  ·  SUEZ traffic ▼
  OUR CALL  38% chance of a confirmed transit disruption by
            Oct 5.   Record on this kind: 24/40 · Brier 0.19
  EVIDENCE  [map] [3 sources] [what would change our mind]
```

Four properties, and each already has machinery behind it:

| line | powered by | exists today |
|---|---|---|
| WHAT | news-feed, osint-feed, ACLED, GDACS | yes |
| SO WHAT | ai-analyst | restored today |
| EXPOSURE | CII components, FX, trade-flows, energy, markets | yes |
| OUR CALL | the register — probability *and* the track record on that kind | yes |

**The fourth line is the whole product.** It is the thing no other dashboard
can print, because no other dashboard has an externally-scored record to quote.
It is also self-limiting in the right way: where we have no record, the line
says so, and that absence is information.

### What the map becomes

Not the front door — the **evidence view**. You arrive at it *from* a
situation, already filtered to that situation's layers and bounded to its
geography. The 49 layers stop being a menu and become a citation.

This also fixes the composition problem without a design argument: a globe with
17 unrelated layers on it is hard to make beautiful; a globe showing one
situation's evidence is easy.

### What the AI is actually for

Not a chat box bolted to the side. Three jobs, each narrow and checkable:

1. **Synthesis** — turn N signals into one named situation with a SO WHAT.
2. **Exposure** — say which countries, currencies and commodities are
   plausibly affected, *from the data*, and mark which are inference rather
   than measurement.
3. **Falsification** — state what would change its mind. The brief already
   does this ("What would change our mind"); it belongs on every situation.

Every one of those is a *bounded* generation over structured inputs, which is
the only kind this project should ship — and `check:llm-spend` already gates
the budget.

---

## Three directions

### A — The Situation Room *(recommended)*
The feed of situations above is the home page. Map becomes the evidence view.
Register surfaces inline as "our record on this kind". Brief becomes the daily
digest of the same objects, so one system produces both.

- **Strongest because** it uses the rarest asset (the record) on every screen,
  and it answers the actual question.
- **Cost** — a real new surface, plus the synthesis pipeline.
- **Risk** — situation quality is the product. A weak situation is worse than
  no situation.

### B — The Instrumented Map
Keep the map as home. Add a consequence rail: click anything and get SO WHAT,
EXPOSURE, OUR CALL in a panel. Declutter to ~8 default layers.

- **Cheapest**, ships soonest, keeps the existing shape.
- **Weaker** — still asks the reader to find the story themselves.

### C — The Daily Front Page
The brief becomes the product. A newspaper published continuously rather than
daily, with the map and register as departments. Leans hardest on the "Late
Edition" design language already adopted for the register.

- **Most distinctive**, best fit with the design system already built.
- **Risk** — reads as media, not as an instrument. The live map becomes
  decorative, which is how it got deleted the first time.

---

## Recommendation

**A, built so that B falls out of it.** The situation object is the unit of
work; the consequence rail is how a situation renders next to the map. Build
the object and you have both surfaces.

Sequence:

1. **Define the situation object** and render it from data that already exists
   — no AI in the first cut. Prove the four lines can be filled honestly.
2. **Wire OUR CALL to the register.** This is the differentiator and it is
   pure query, no generation.
3. **Add synthesis** (ai-analyst) for WHAT and SO WHAT, budget-gated.
4. **Re-point the map** as the evidence view; declutter defaults.
5. **Regenerate the brief** from situation objects, so email and site cannot
   diverge.

Step 2 is the one that makes this product unlike anything else, and it needs no
model at all.

---

## What I need from you

1. **Direction** — A, B, C, or a different one.
2. **How to design it.** There is precedent for a design council here: four
   directions commissioned, independently critiqued, judged by three seats
   (`wf_d7af2c20-f3b`), which produced the dark register. That is a
   multi-agent run and costs real tokens, so it is your call whether to spend
   them.
3. **Scope of the first cut** — one situation rendered end to end, or the
   whole feed.
