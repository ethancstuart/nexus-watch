# The Situation Room — build spec

**Status:** proposed, for commit to `docs/`
**Date:** 2026-09-21
**Measured against:** `ledger-snapshots/2026-09-20.json` (the last committed snapshot), and the working tree at `/Users/ethanstuart/Projects/nexus-watch-sweep`. Every figure in this document was recomputed from those two sources while writing it. Nothing here is remembered.

---

## The decision

**Direction 4 — The Continuous Edition wins, on 2 seats of 3 and 19 points of 30.**

| Direction | Art direction | Engineering / budget | Cold sceptic | Total |
|---|---|---|---|---|
| 4 — The Continuous Edition | 8 | 6 | 5 | **19** |
| 1 — The Cold Reader | 7 | 3 | 6 | **16** |
| 2 — The Exposed Operator | 4 | 3 | 3 | **10** |
| 3 — The Instrument | 3 | 2 | 4 | **9** |

The margin is three points and the council was not unanimous. The sceptic's seat voted for Direction 1 and its dissent is the most important document in the dossier, because it is the only one that asked what a stranger who does not believe us sees first. I have taken its winner's conditions and grafted them onto Direction 4 wholesale. In practice the thing being built is Direction 4's **form** carrying Direction 1's **first sentence**.

**Why Direction 4.** It is the only direction that found the right form for the content that actually exists. The book is one currency robot minting ~65 calls at 09:30 UTC and settling ~65 at 09:45 UTC, every single day, without exception across all fifteen settlement dates in the committed book. Directions 1 and 3 render that as sixty-five of something — sixty-five sentences, sixty-five strips. Direction 4 renders it as **one story** with type beneath it. That is the correct editorial judgement about homogeneous mechanical content, and only one direction made it. It is also the only direction with a real size ladder (lead / column / brief), which is how you express rank without asking a reader to trust a formula.

**Why not Direction 1**, despite the best writing and the best single idea in the dossier: its load-bearing element cannot be built honestly. I sorted Egypt's fifteen resolved FX calls by `made_on` myself — `M M M M M H H H H M H H H H H` — fifteen consecutive daily 14-day windows overlapping by thirteen days. That is one devaluation episode rendered as fifteen trials. Its ranking is worse: `REACH` needs a country population series that does not exist in this repository (the only population-shaped data is UNHCR displaced counts in `api/displacement.ts`), and `MOVEMENT`'s largest term is `liveConflict`, which `api/cron/compute-cii.ts` itself documents as permanently zero. Direction 1 is a voice, not a structure. Its voice has been taken.

**Why not Direction 3**: it makes the pooled calibration array its hero, and `scoring.note` — returned on every ledger response — forbids pooling in writing. I decomposed the bins. Un-pooled, FX populates exactly three; censorship's high bins are a measured decision the page itself calls "not a forecast." There is no honest reliability diagram worth 560px. It also inverts the owner's anatomy: six of thirteen fields are `OUR CALL` and the world appears once, in recede grey, prefixed `UNSCORED`. It is an excellent second page.

**Why not Direction 2**: it puts a settings screen on the front door, and its differentiating line is a constant. All 66 FX units have `batches === n` by construction, so the narrowest scope that can carry skill is kind-wide; every reader who declares any currency gets the identical three numbers.

**What is deleted from the winner.** Direction 4's ranking formula, entirely. `T1 = (p − outcome)² × 35` is a hit-detector: FX probabilities in the resolved book never exceed 0.5, so `(p−1)²` always dominates `p²`, and the promise "we lead with the calls we got most wrong" is arithmetically unreachable. The formula is replaced (§ Ranking) with a rule that fits in one sentence and whose every term can fire.

**The single fact that reorganises the product**, found by the engineering seat and verified here exactly. FX batch hit-rate by resolution date:

```
09-06  43.9      09-11  12.3      09-16  15.4
09-07  34.8      09-12   6.2      09-17  18.8
09-08  19.7      09-13   6.2      09-18  32.8
09-09  21.5      09-14  10.8      09-19  36.9
09-10  18.5      09-15   9.2      09-20  53.8
```

That clean U is the dollar moving sixty-five currencies together against one threshold rule. Every "per-country story" in the last five windows is a decomposition of it. **The honest unit of a situation in this register is the batch, not the country.** That is the spine of everything below.

---

## What we are building

NexusWatch publishes a daily edition. The top of it is the one thing we did today that nobody else does: at 09:45 UTC we settled sixty-five dated, falsifiable forecasts against data we do not control, and we print the score — including on the days the score is bad. Below that is a short, ranked list of things that happened in the world, each one carrying the instrument that detected it, the name of the upstream that instrument reads, and one of three honest answers to "what do you say about this": an open call with its probability and that probability band's measured record; a statement that our last call on this closed and none is open; or a flat refusal — *we do not forecast this.* The map is no longer the front door. It is the evidence view you reach from a situation, showing only the layers that produced that situation's reading. Everything on the page except one annotation sentence per item is arithmetic. On a day with no news the page is still full, because the settlement happens whether the world does anything or not. On a day when the model is switched off, the page loses one sentence per item and nothing else.

---

## At rest

What is on screen at `/` on load, top to bottom, at 1280px. Ground `#161412` throughout.

**1 — MASTHEAD.** Wordmark in Source Serif 4, 24px, ink `#E8E6DE`. Beneath it, a 1px `#C9A86B` rule at 100% width — gold as structure, its only job. Beneath the rule, one mono line at 12px in muted `#9C958A`:

```
EDITION OF 2026-09-20  ·  SETTLED 09:45 UTC  ·  PROSE LAST WRITTEN 09:52 UTC
```

No "next run" countdown. A cron schedule is not a measurement (§ What we are NOT building, 11).

**2 — THE SCOPE DECLARATION.** The most important element on the page, and the first thing a stranger reads. Source Serif 4, 17px, body `#BDB7AA`, max 62 characters per line, sitting directly under the masthead in the slot every competitor fills with a hero number. It is a pure existence query against the register, rebuilt from `by_kind` on every edition:

```
We forecast three things and publish how we do at each: currency
depreciation (976 scored, Brier 0.177), internet censorship (263
scored, Brier 0.058, no call written since 29 August), and earthquake
windows (14 open, a calibration control that claims no edge).

We do not forecast shipping disruption, conflict onset, elections,
commodity prices or sanctions. Everything else on this page is
reported, not forecast, and is marked so.
```

The second paragraph's list is not hand-written. It is the fixed set of domains the product has been asked for and cannot score, held in one constant with a comment pointing at this section. When a kind is added to the register it moves from paragraph two to paragraph one automatically.

**3 — THE INDEX.** One numbered line per item in the edition. Mono 13px, numerals in muted, place and phrase in body. Left-aligned, no leaders, no rules. This is also the entire mobile rendering (§ Degraded states — mobile).

```
01   THE BATCH        Sixty-five currency calls settled. Thirty-five came in.
02   PHILIPPINES      GDACS red — tropical cyclone
03   AFGHANISTAN      USGS M 6.1
04   SUDAN            OONI — eight censorship calls, seven unscorable
05   COLOMBIA         Open call resolves in 14 days
```

**4 — THE BATCH.** The lead. 38px Source Serif 4 headline in ink; a two-line standfirst at 17px in body; then the deterministic block (§ The register, inline). Occupies roughly the first screen below the index. It is the only item on the page that is guaranteed to exist.

**5 — THE WORLD.** Ranked situations, 22px Source Serif 4 heads in ink, bodies at 16px in body colour, separated by 1px `#2E2A25` hairlines. Hairline is decoration only and carries no meaning here — it is a gutter, and the section is legible without it.

**6 — IN BRIEF.** Mono 13px, one line each, body colour. Items that cleared the print floor but not the column.

**7 — BACK MATTER.** Three fixed blocks, in order: **CORRECTIONS** (a standing count with a link — 54 today, every one a published miss corrected to a hit); **THE INSTRUMENT LOG** (dated one-line changes to the scoring machinery); **THE COLOPHON** (which collectors wrote a row since the last edition, from `api/_lib/collector-health.ts`, and the permalink to this edition).

**Hierarchy, stated as a type scale.** The adopted system names colours and faces but not a scale. I am adding one and declaring it a departure: 38 / 22 / 17 / 16 / 13 / 12. Rank is carried by size and position, never by a printed score. The formula is printed once, in one sentence, at the head of THE WORLD.

**What is not on screen at rest:** no map, no globe, no layer menu, no CII leaderboard, no accuracy percentage, no chokepoint ring, no traffic lights, no sparklines, no charts of any kind on the front door.

---

## The situation object

This is the contract. A situation that cannot fill a required field does not enter the edition; there is no placeholder anywhere in this table. Types are TypeScript.

### Identity and placement

| Field | Type | Source | Empty state |
|---|---|---|---|
| `id` | `string` | Deterministic: `sha1(edition_date + class + place + instrument + source_row_id).slice(0,8)`. Stable across regeneration of the same edition. | Never empty. Cannot be constructed → item does not ship. |
| `edition_date` | `string` (ISO date, UTC) | The edition's own date. | Never empty. |
| `class` | `'BATCH' \| 'I' \| 'II' \| 'III' \| 'BRIEF'` | Computed by § Ranking. | Never empty. |
| `rank` | `number` | Computed by § Ranking. | Never empty. |
| `place` | `string` (ISO-3166-alpha-2) | `calls.country_code`, OONI `probe_cc`, GDACS `title.split(':')[0]` mapped to ISO2, USGS place-string mapped to ISO2 via a committed lookup. | **Country is the most specific place this product can name.** If no ISO2 resolves, the item does not ship. There is no sub-national field and none will be added. |
| `place_name` | `string` | A committed ISO2 → display-name table. | Never empty if `place` resolved. |
| `permalink` | `string` | `/edition/{edition_date}#{id}` | Never empty. Daily grain only. |

### What happened

| Field | Type | Source | Empty state |
|---|---|---|---|
| `what` | `string` | **A template, never generated.** One sentence built from the source row's own typed fields. GDACS: `"{alertLevel} alert, {eventType}, reported {date}."` USGS: `"Magnitude {mag} earthquake, depth {depth} km, {date}."` OONI: `"{n} confirmed blocking measurements across {m} networks in the last 24 hours."` Internet outages: `"{n} outage rows recorded in the last 24 hours."` CII: `"Country Instability Index {score}, rule version 2.1.0."` Batch: `"Sixty-five currency calls settled at 09:45 UTC. Thirty-five came in."` | Never empty. An item with no `what` has no instrument reading and therefore does not exist (§ Ranking). |
| `what_source` | `string` | **The real upstream, named as a stranger would have to find it.** Mono, 12px, muted, directly under `what`. `"GDACS RSS feed, read 06:02Z"`. `"USGS earthquake catalog"`. `"OONI measurements, probe_cc={place}"`. `"open.er-api.com aggregator — one print per currency per day"`. | Never empty. If the collector cannot be named, the item does not ship. **This slot may not be dignified.** "FX reference rates" is laundering; the upstream is a free aggregator and the page says so. |
| `measured` | `{ instrument: string; value: number; unit: string; observed_at: string }` | The exact reading that ranked the item, from the same row as `what`. | Never empty for classes I–III. For `BATCH` it holds `{ instrument: 'fx_batch', value: hits, unit: 'calls', observed_at: resolved_at }`. |
| `freshness` | `{ collector: string; last_row_at: string; state: 'OK' \| 'HELD' }` | `api/_lib/collector-health.ts` — which derives each collector's target table from its own INSERT, and is the only module in the repo that can tell a collector that ran and wrote nothing from one that ran and wrote rows. **Not** `src/services/dataProvenance.ts`, which is browser-side map-layer fetch state and would report a healthy timestamp over a dead table. | Never empty. `state: 'HELD'` withdraws the item from the ranked body and prints one line in IN BRIEF: `"SUDAN — OONI collector has written no row since 2026-09-18. Held."` |

### So what

| Field | Type | Source | Empty state |
|---|---|---|---|
| `so_what` | `string \| null` | **The only generated text on the page.** One sentence, ≤ 30 words, written at a press moment from a closed payload (§ Where the AI runs). | `null` is a normal, frequent, designed state. The line is simply **absent** — no dash, no "unavailable", no grey box. The item reads correctly without it, and on a budget-exhausted day every item in the edition is in this state and the page does not look broken. |
| `so_what_payload_url` | `string \| null` | `/edition/{date}/prose/{id}.json` — the exact input the model saw, published. | `null` when `so_what` is `null`. |

### Exposure

| Field | Type | Source | Empty state |
|---|---|---|---|
| `exposure` | `Array<{ place: string; figure: string; figure_source: string }>` | **Exactly one sourceable figure exists today:** OEC export share, computed at `api/trade-flows.ts:96` against `api-v2.oec.world`. It requires an ISO2 → ISO3 map that does not exist and must be built (Build step 6). | **The entire EXPOSURE line is omitted when the array is empty**, which on most items it will be. No estimate, no "approximately", no derived share. |
| `index_reading` | `{ score: number; deviation: number \| null; computed_at: string } \| null` | `cii_history` read **server-side, directly from the table**, not through `api/cii.ts` — line 96 of that file collapses a missing `deviation` to `0`, making a silent instrument indistinguishable from a quiet day. If no row exists for the country within 24h, this is `null`. | `null` → omitted. It renders as a labelled reading (`"Country Instability Index 92 · rule 2.1.0 · computed 06:02Z"`), never as exposure and never as a ranking term for classes I–III. |

**NOT YET AVAILABLE, and named as such so nobody reaches for them:**

- `route` / chokepoint exposure — **NOT AVAILABLE.** The only chokepoint geometry is six hand-placed coordinates in `src/map/layers/chokepointStatusLayer.ts` with uncited trade-share strings and hardcoded statuses (verified: lines 96–101 assign Bab el-Mandeb `red`, Hormuz and Suez `yellow`; line 84 returns `Date.now()` as "last updated").
- `conflict_events` — **NOT AVAILABLE.** `api.acleddata.com` has no DNS record; `api/acled.ts` is GDELT headlines on country centroids with `Math.random()` jitter (verified, lines 127–128) and `actor1` set to the news outlet's name (line 123). The endpoint is deleted in Build step 2.
- `population` / `reach` — **NOT AVAILABLE.** No country population series exists in this repository.
- `reroute_cost`, `transit_count`, `vessel_position` — **NOT AVAILABLE** and not planned.
- `sub_national_place` — **NOT AVAILABLE** and will not be built. The slot is the invention pressure.

### Our call — the fourth line

Exactly one of three shapes renders. This field is **never empty**; that is the whole point of it.

| Shape | When | Source | What prints |
|---|---|---|---|
| `OPEN_CALL` | An open call exists for `(kind, place)` | `api/calls/ledger` open array | The claim verbatim, the probability, the base rate, the resolution date, and the band check (§ The register, inline). |
| `NO_OPEN_CALL` | The kind exists in the register; no open call for this place | Same | `"NO OPEN CALL. Our last censorship call on Sudan closed 2026-09-12. We have written none since 2026-08-29."` |
| `NO_CALL` | The kind does not exist in the register at all | The `by_kind` key set | `"NO CALL. We do not forecast shipping disruption. We forecast currency depreciation, internet censorship and earthquake windows, and we publish how we do at each."` |

`NO_CALL` is Direction 1's State C. It is the single best artifact the council produced. It is a pure existence query, it costs nothing, it cannot go stale, it survives the model being switched off entirely, and it implements the no-fabrication constraint as interface *grammar* rather than as data plumbing. **That slot — where a number is expected and none exists — is where the warship endpoint came from.**

| Field | Type | Source | Empty state |
|---|---|---|---|
| `our_call.shape` | `'OPEN_CALL' \| 'NO_OPEN_CALL' \| 'NO_CALL'` | Computed | Never empty. |
| `our_call.claim` | `string \| null` | `calls.claim` verbatim | `null` for the other two shapes. |
| `our_call.probability` | `number \| null` | `calls.probability` | `null` for the other two shapes. |
| `our_call.base_rate` | `number \| null` | `calls.base_rate` | `null` for the other two shapes. |
| `our_call.resolves_on` | `string \| null` | `calls.resolves_on` | `null` for the other two shapes. |
| `our_call.band_check` | `BandCheck \| null` | § The register, inline | `null` → the WITHHELD line prints instead. |
| `our_call.cohort_record` | `CohortRecord` | § The register, inline | Never empty; it prints WITHHELD rather than nothing. |
| `our_call.ladder` | `Ladder \| null` | § The register, inline | `null` when the cohort has no settled call. |
| `our_call.counter_reading` | `string \| null` | § The register, inline | `null` when the contradiction does not hold. Conditional by design. |
| `our_call.corrections` | `{ count: number; url: string } \| null` | `calls.correction` on resolved rows of this cohort | `null` → omitted. |

### Evidence

| Field | Type | Source | Empty state |
|---|---|---|---|
| `evidence` | `{ url: string; layers: string[]; bbox: [number,number,number,number] } \| null` | § The map as evidence | `null` when **no live layer covers the instrument that produced this item**. The link is then absent. We do not link a reader to a map that cannot show them the thing. |

---

## Ranking

**The rule, printed in full at the head of THE WORLD, in one sentence:**

> *The morning's settled batch leads. Everything below it is ordered by the severity of the single instrument reading that put it there, most severe first. Nothing appears on this page without one.*

Two terms. A reader who checks it finds it holds. There is no composite score, no weights, no published formula with a term that cannot fire, and no "how we ordered this" link over arithmetic that contradicts the prose.

### Class 0 — THE BATCH

Rank 1, unconditionally, every edition. It is the only item the register itself authored today.

### Class I

Any one of:
- GDACS alert level **Red**, any hazard type.
- USGS moment magnitude **≥ 6.5**.
- OONI: confirmed-blocked measurements ≥ 20% of that country's measurements in the last 24h **and** ≥ 50 measurements in that window.
- An `internet_outages` row flagged at the table's own top severity.

Ordered within class by normalised magnitude: GDACS alert score, then moment magnitude, then blocked share, then outage severity.

### Class II

- GDACS alert level **Orange**.
- USGS **5.5 ≤ M < 6.5**.
- OONI confirmed blocks present but below the Class I threshold.

### Class III

- Wikipedia attention z-score **≥ 3** for a country, with no Class I or II reading.

### Class BRIEF

- GDACS Green with fatalities reported.
- USGS **5.0 ≤ M < 5.5**.
- A country whose `cii_history.deviation` changed by ≥ 10 points since the previous edition, **read directly from the table** so that a missing row is a missing row and not a zero.

Below Class BRIEF, nothing prints. An empty class renders **no heading at all** — no empty box, no "nothing today" placeholder inside the body. (The whole-page empty state is different and is specified in § Degraded states.)

### Tie-breaks

Within a class, by normalised magnitude descending; then by `observed_at` descending; then by ISO2 ascending. The last term is arbitrary and exists only so the edition is byte-reproducible.

### What is deliberately NOT a ranking term

- **CII deviation for classes I–III.** `compute-cii.ts:313` defines `deviation = liveConflict + disasters + attention + infrastructure + fxStress`. Three of the four signals that would pay into a confirmation term are already deviation components, so using both double-counts one OONI row through two terms sold as independent. Deviation appears only as a Class BRIEF trigger and as a labelled printed reading.
- **Population or any reach proxy.** No source exists, and on the 67 countries in the open book — which include DE, GB, JP, CA, AU, CH, SE, NO, NZ, KR, TW, PL, CZ, HU, RO and SG — a population-weighted feed is a permanent ranking of large economies with the world switched off.
- **Anything from `api/acled.ts`.** Deleted in Build step 2.
- **Chokepoint coordinates.** Flagging a file as unusable for its status and then ranking on its hand-placed lat/lon is the same act with a step removed.
- **Squared error on individual calls.** A hit at p=0.15 and a miss at p=0.15 are two draws from the same Bernoulli. Calling one "our worst call today" ranks noise. Wrongness is measured at the batch, where it means something.

### The yield is unknown, and the spec does not claim one

These thresholds are a starting point. **Build step 5 is to run them against 30 days of GDACS, USGS, OONI and outage history and publish the resulting item counts per day.** The Class BRIEF trigger is then tuned so a typical edition holds roughly 6–14 items. Until that run exists, this document asserts no yield. An estimate with nothing behind it is how Direction 1 got "TYPICAL YIELD: 6–14."

---

## The register, inline

This section is the differentiator and it is also where the product is most likely to lie to itself. Every rule here is a restriction.

### Cohorts — what a record may describe

A **cohort** is a set of resolved calls a record may be computed over. There are exactly three legal cohorts:

1. **KIND** — all resolved calls of one kind. This is the running estimate of how we do.
2. **BATCH** — all calls of one kind sharing one `resolves_on`. This is a scoreboard for one morning, not an estimate of a parameter.
3. **BAND × KIND** — resolved calls of one kind whose stated probability falls in one decile. This is the band check.

**COUNTRY IS NOT A LEGAL COHORT.** All 66 FX units have `batches === n` by construction, because `record-calls` writes one call per unit per day and `resolutionBatches()` counts distinct resolution dates. Egypt has fifteen batches and one independent unit. Any per-country skill number, hit tally or superlative is forbidden (§ What we are NOT building, 4).

### The WITHHELD rule

A Brier score, a climatology comparison or a skill figure prints **only** when all four hold:

1. **Single kind.** The cohort contains exactly one `kind`. No pooled figure, ever, including by adjacency.
2. **≥ 3 independent units** — `size(set(country_code))`. **This is the repair.** The shipped rule keys on resolution batches, which is vacuous on the temporal axis.
3. **≥ 3 resolution batches** — `size(set(resolves_on))`.
4. **Not a control** — `kind ∉ CALIBRATION_KINDS` (`api/_lib/calls.ts:74`).

Otherwise the slot prints, in the same face and size the number would have taken:

```
SKILL WITHHELD — 1 independent unit; needs 3.
```

A withheld line is not a footnote and is never omitted. A band check that reads WITHHELD four times out of eight is the most honest sentence this product can put next to a probability.

**What passes today**, from `by_kind` in the committed snapshot:

| Kind | Units | Batches | Result |
|---|---|---|---|
| `fx_devaluation` | 66 | 15 | **Passes.** Brier 0.1771 over 976 scored rows; skill −0.47% vs base rate. |
| `censorship_event` | 36 | 9 | **Passes.** Brier 0.0583 over 263 scored rows (312 rows, 49 unresolvable); skill −2.48%. |
| `seismicity_window` | 14 | 1 | **Withheld** — 1 batch, and it is a control. Prints `NO EDGE CLAIMED — THIS IS THE BASE RATE.` |

### The band check, per kind, at the point of use

Wherever a probability is printed, that probability's band record **for its own kind** prints beside it. Recomputed from the committed snapshot's resolved array while writing this:

**fx_devaluation**

| Band | n | units | batches | predicted | observed |
|---|---|---|---|---|---|
| 0.1–0.2 | 540 | 48 | 15 | 0.169 | **0.220** |
| 0.2–0.3 | 400 | 38 | 15 | 0.241 | 0.245 |
| 0.3–0.4 | 37 | 8 | 15 | 0.311 | **0.135** |
| all other bands | 0 | — | — | WITHHELD — no rows | |

**censorship_event**

| Band | n | units | batches | predicted | observed |
|---|---|---|---|---|---|
| 0.1–0.2 | 145 | 23 | 8 | 0.108 | **0.007** |
| 0.2–0.3 | 30 | 4 | 8 | 0.238 | 0.300 |
| 0.3–0.4 | 12 | 3 | 8 | 0.302 | 0.000 |
| 0.4–0.5 | 16 | 3 | 8 | 0.400 | 0.000 |
| 0.5–0.6 | 8 | 3 | 7 | 0.505 | 0.125 |
| 0.7–0.8 | 3 | **1** | 3 | — | **WITHHELD — 1 unit** |
| 0.8–0.9 | 10 | 8 | 4 | 0.828 | 1.000 |
| 0.9–1.0 | 50 | 8 | 7 | 0.900 | 1.000 |

**seismicity_window** — every band, 1 batch. All WITHHELD. The kind prints `NO EDGE CLAIMED`.

The `units` column prints alongside `n`, always. Thirty-seven rows over eight units is not thirty-seven observations, and the reader is entitled to see the difference.

**The pooled row is what this replaces, and it is currently live.** `src/pages/landing.ts` renders `scoring.calibration` — the pooled array — as the present front door's hero figure. Its 0.1–0.2 row reads a flattering 0.156 predicted / 0.175 observed, because FX running cold (0.169 / 0.220 over 540 rows) and censorship running blazing hot (0.108 / 0.007 over 145 rows) cancel inside it. That is `/api/accuracy/stats` one level of indirection down, already shipped. Build step 4 removes it.

### The ladder

`■` hit · `□` miss · `·` unscored. Source Serif 4 at the body size, ink `#E8E6DE`, letter-spaced 0.15em. Ordered by `resolved_at` ascending.

```
CANADA · fx_devaluation · settled in resolution order

□ □ □ □ □ □ □ □ □ □ □ □ ■ ■ ■

One call per currency per morning. Fourteen-day windows
overlap by thirteen days. This is a picture of the book,
not of the world.
```

Verified exactly: Canada has fifteen settled FX calls, twelve misses then three hits.

**The three rules that make a ladder honest:**

1. **A ladder is a sequence, never a sample.** It shows an order. It may not be counted, and no rate may be derived from it on the page. Canada's three hits are one CAD move seen through three overlapping windows — exactly as Egypt's nine are one devaluation. Direction 1's strip died because it sat under a sentence that drew an inference requiring independence. The ladder draws no inference.
2. **The overlap caption travels with it, always**, in muted at 12px, in the same block. Never a tooltip, never a footnote.
3. **The third glyph is mandatory.** `src/styles/register-tokens.ts:93` already defines `unscored: '·'`. 49 of the 312 censorship rows carry status `unresolvable`, and there is a `2026-08-28-calls-unresolvable-status.sql` migration. The ladder is the first element in this product to place all three states in one visual run; a binary ladder would paint those 49 rows as misses, which is fabrication by omission in the figure whose only job is to be the honest one. Sudan's censorship ladder, in resolution order, is:

```
· · · · · □ · ·

Eight censorship calls on Sudan. Seven could not be scored —
OONI coverage was too thin to decide them. One scored, and missed.
```

### The counter-reading

An automatic rendering rule. Wherever a cohort's **realised hit rate** and its **skill against climatology** point in opposite directions, the contradiction prints in place, in the same face as the numbers, rather than letting either number stand alone.

```
fires when:  (hit_rate > mean_base_rate AND skill < 0)
          or (hit_rate < mean_base_rate AND skill > 0)
```

This is the exact guard that would have caught `/api/accuracy/stats` publishing 90.3% accuracy against −17% real skill — firing automatically, rather than waiting for a person to notice. It needs no model, no endpoint and no table: it is a sign comparison over two numbers already in the resolved array.

**Where it fires, measured.** At kind level today it fires on nothing — FX and censorship are both modestly negative on both measures, consistently. At **batch** level it fires on five of the fifteen settlement dates in the book, including today's lead: 09-06, 09-07, 09-18, 09-19 and 09-20. The batch is the cohort we have made the lead, so the rule has a live home.

It is **not** computed per country. Morocco is the reason the rule exists — 15 resolved, 15 hits, Brier 0.6964 against climatology 0.5555, skill −25.4%, because all fifteen were stated at 0.157–0.190 against a base near 0.246 and all fifteen came in — but those fifteen are one currency's fortnight, and printing "the worst-scoring unit on the book" over them is the closed loop rebuilt at strip level. Morocco justifies the rule inside this document. It does not appear on the page.

---

## Where the AI runs

Three principles before the table. **One:** generation happens on a cron, never on a reader request, so reader traffic costs zero and the page is cacheable, shareable and citable. **Two:** every generation's exact input payload is published at a URL beside the sentence it produced. **Three:** the page never tells a reader that a gate makes the sentence true.

| Generation | When | Inputs | Bound | Cost control | Reader check |
|---|---|---|---|---|---|
| **`so_what`** — one sentence per situation | Two press moments: 09:50 UTC (after settlement) and 16:00 UTC (only if a new Class I item appeared since) | A closed JSON payload: `what`, `what_source`, `measured`, `place_name`, `index_reading`, and the situation's `our_call` shape. Nothing else. No retrieval, no web, no history. | ≤ 30 words, exactly one sentence, no line breaks. Rejected and dropped — not retried, not patched — on any violation. | Max 2 runs/day × ≤ 14 items = **≤ 28 completions/day**. Runs from cron only. `api/_lib/llm-budget.ts` hard-kills at $9 against a $10 plan cap; front-door generation is charged before `/api/ai-analyst` and `/api/sitrep` in the same counter. | `so_what_payload_url` — the literal input, published at `/edition/{date}/prose/{id}.json`. |
| **Daily brief** | Unchanged | Unchanged | Unchanged | Unchanged. Email stays `#FAF8F3`. | Unchanged. |
| **`/api/ai-analyst`, `/api/sitrep`, `/api/parse-alert`, `/api/cinema-narrate`** | On demand | Unchanged | Unchanged | Unchanged; budget-gated by `check:llm-spend`. **None of them is reachable from the front door.** | Unchanged. |

### How `so_what` renders, and why it looks different

Inter, 15px, body `#BDB7AA` — **not** Source Serif 4. The serif is the record. The sans is annotation. This is a departure from the adopted system, which names Inter as the sans and assigns it no meaning; I am assigning it one and saying so. A reader learns in one edition that serif is measured and sans is written.

It carries a left marker: a 2px `#C9A86B` vertical rule, 1em tall, at the line start — gold as structure, framing a block, which is its documented job. Beneath it, mono 11px muted: `WRITTEN BY CLAUDE 09:52Z · FROM THIS INPUT` with the last three words linking to the payload.

### The gate, and what it does not do

`api/_lib/grounding.ts` runs on `so_what`, **re-calibrated to zero tolerance.** Its shipped thresholds (`unsupportedRate > 0.25`, or `≥ 4 unsupported AND rate > 0.1`, at line 118) were tuned against an 88-numeral brief so that four benign roundings could not sink a grounded issue. On a one-sentence card, one unsupported numeral currently passes. For front-door prose the threshold is zero.

**And the page does not mention it.** The gate polices digits, not meaning. "Pressure on the pound is building ahead of the window" passes it. So do *doubled*, *tripled*, *a third*, *most*, *record*, and every causal claim. The warship coordinates were well-formed numbers too. Telling a reader the gate is why the sentence can be trusted is itself a false claim about our own rigour, printed in the place where we claim rigour. The published payload is the honest check, and it is the one we advertise.

### The sentence is also constrained by what it may not be about

`so_what` may not state a cause, a forecast, an imminence, or an attribution. It states a consequence that follows from the fields in its payload. The prompt carries the three forbidden moves by name, and a failure here is caught in review, not by a regex. This is the one place in the product where the safety is editorial rather than mechanical, and the spec says so rather than pretending otherwise.

---

## The map as evidence

The globe is not deleted. It is moved.

**`/map`** keeps the vector globe, MapLibre v6, CARTO dark-matter, all 49 layers, the layer menu, and everything that works today. It stops being the front door.

**`/evidence/{edition_date}/{situation_id}`** is new. It is a captioned plate, not a workspace:

- Bounded to the situation's country bounding box, from a committed ISO2 → bbox table. Not centred on a point; no dot is placed unless the source row carries a real coordinate from a real instrument.
- **Only** the layers that produced this situation's `measured` reading are on. Named in a caption above the map, in mono: `LAYERS: usgs-earthquakes`. No other layer is toggleable from this view.
- The situation's `what` sentence is restated verbatim above the map, in the serif, at 17px. The `what_source` line sits under the caption.
- A single link back: `← EDITION OF 2026-09-20`.
- No status ring, no traffic lights, no chokepoints, no ACLED. `src/services/dataProvenance.ts`'s `#22c55e / #eab308 / #f97316 / #dc2626` are off-palette and are not used on this route.

**Reached by** one link on each situation, in mono 12px under the `measured` block: `SEE THE INSTRUMENT →`.

**Absent when** no live layer covers the instrument. A CII reading has no map layer; an OONI block has one; an outage row has one. When `evidence` is `null` the link does not render. We do not send a reader to a map that cannot show them the thing — an empty layer is a fact, but an empty layer reached from a link promising evidence is a broken promise.

---

## Degraded states

### Quiet day

**There is no quiet day for the batch.** `record-calls` writes ~65 FX calls at 09:30 UTC and `resolve-calls` settles ~65 at 09:45 UTC, every single day, across all fifteen settlement dates in the committed book. The lead always exists, always changes, and needs nothing from the world.

The WORLD section, however, can be genuinely empty. When no item clears Class BRIEF:

```
THE WORLD

No instrument of ours crossed its reporting threshold since the
last edition. Six collectors wrote rows; none of them wrote one
we would print.
```

Then, and only then, the **COVERAGE** item runs: one country per quiet edition, printing what we do *not* have coverage of — Sudan's eight censorship calls, seven unscorable, is the exemplar and it is exact. **Coverage supply is finite** (~40 countries with a gap worth printing), so it runs at most once per week regardless of how many quiet days occur, and the rotation is committed so it cannot repeat inside a quarter. A standing feature that becomes a rerun is dead furniture.

### A source is down

Driven by `collector-health`, never by `dataProvenance`. A collector that runs and writes zero rows reports `lastFetchOk: true`; four of the twelve scheduled `source-*` collectors are currently failing silently, and two of them were cited as live sources on public pages. That is how an empty table becomes a false claim.

The item is **withdrawn from the ranked body** and one line prints in IN BRIEF:

```
SUDAN — OONI collector has written no row since 2026-09-18 06:02Z. Held.
```

Set in muted `#9C958A` with the word `HELD` in ink. No colour, no icon, no ring. A departure from the adopted system in that it defines a new treatment; it introduces no new token.

The COLOPHON always lists every collector and its last-row timestamp, whether healthy or not.

### AI budget exhausted

Every `so_what` is `null`. Every item renders without its annotation line and **the layout does not change** — the sentence was never a required row. One line in the back matter:

```
No prose was written for this edition. Every figure on this page
is arithmetic and is unaffected.
```

That is true: the batch, the record block, the ladders, the band checks, the counter-reading, the corrections box, the index and the ranking are all deterministic.

### The ledger endpoint is down or slow

This is the single point of failure Direction 3 never covered, and it takes 100% of the page rather than one band. Three defences:

1. **The batch block is served from the committed snapshot**, not from a live query. `ledger-snapshots/{date}.json` is already committed daily.
2. If today's snapshot has not been written, yesterday's serves, with an explicit `as of` **on the number itself**, not in a footer: `AS OF 2026-09-19 — today's settlement has not been written.`
3. Aggregates are computed **server-side inside `api/calls/ledger.ts`** and returned as small objects (Build step 1), so the front door never fetches `?all=1` — 742 KB on 2026-09-20, growing ~22 KB/day, monotonic, under `maxDuration 20`. The endpoint's `complete: false` flag is honoured: when it is false, the page prints `PARTIAL — this reading is a page of the book, not the book.`

### Cold start — day one

No `situations` table exists and none is required. The ranking has **no history term**: no repetition penalty, no "↑1 from yesterday", no first-appearance logic. Day one renders identically to day one hundred. This is the direct benefit of deleting the composite — the only corrective term Direction 1 needed was the one that did not exist yet.

### Mobile

**The INDEX is the mobile edition.** Numbered lines, full width, tap to expand one item in place. The batch lead is always expanded. The size ladder collapses to 24 / 17 / 15 / 13. The ladder glyph run wraps; the overlap caption stays with it. Nothing horizontal scrolls. The evidence view is reachable but the map is not the default on a phone, and a situation with `evidence: null` reads correctly without it.

---

## What we are NOT building

Fourteen vetoes. Every one was verified in the working tree while writing this document.

**1 — No second meaning for `■`, `□` or `·`.** Hue was abandoned on measurement (the live HIT/MISS pair is 1.11:1 apart, 1.09:1 under deuteranopia), so shape is the only channel left standing. The filled square means a scored hit and nothing else — not summed probability, not out-of-tolerance, not emphasis. Overload the last surviving channel and the register loses its one reliable mark everywhere, including in the light email and in alt text.

**2 — No pooled cross-kind calibration figure, including by adjacency.** `scoring.note` is returned on every ledger response and forbids it in writing. This includes **removing the one that is live** in `src/pages/landing.ts`.

**3 — Nothing sourced from `api/acled.ts`, and the endpoint is deleted.** Verified: it reads `cached_layer_data WHERE layer_id = 'gdelt-conflict'`, sets `actor1` to the news outlet's name, and emits `lat: geo.lat + (Math.random() - 0.5) * 1.5` — roughly ±83 km of invented position on a country centroid. This is the deleted warship endpoint under a different filename. It is deleted today, in the same gesture and for the same stated reason. Note that the CII's `acled` key is a *different* thing — the real `api.acleddata.com`, env-gated and DNS-dead — so "ACLED" means two incompatible things in this repository and neither is usable.

**4 — No per-country skill number, hit tally or superlative.** All 66 FX units have `batches === n`, so `MIN_RESOLUTION_BATCHES` protects none of them. "9 of 15 for Egypt" is n=1 rendered as n=15. A contiguous ladder is permitted because a run reads as a regime; a tally is not, because it reads as independent trials.

**5 — No chokepoint status ring and none of its numbers.** `computeStatuses()` hardcodes Bab el-Mandeb `red`, Hormuz and Suez `yellow`; `getLastUpdated()` returns `Date.now()`, a constant that reports itself freshly measured on a 5-minute refresh. The descriptions — "21% of global oil transit", "12% of global trade", "9% of global oil, Houthi threat zone" — are uncited. Not as a claim, not as a ranking bonus, not as an exposure row, and not as coordinates.

**6 — No population or reach term.** No source exists.

**7 — No sub-national place slot.** GDACS country is `title.split(':')[0]`; the deleted ACLED resolved to centroids. Country is the floor. A slot the data cannot fill will be filled from headline text — the slot *is* the invention pressure.

**8 — No per-reader front door.** No localStorage manifest as the primary page, no per-reader generated line against an unauthenticated shared $9 cap, and no migration from `dashview:interests` — that key was never written; the storage namespace is `nw:*`. The front door is one page, the same for everyone, cacheable and citable.

**9 — No dead furniture.** No standing box whose row reads HELD forever (the OFAC sanctions row can never move — `source-ofac.ts` hardcodes `change_type: 'add'`), no rail that prints NO INSTRUMENT every day for the life of the product, no permanently empty band with a heading over it.

**10 — No renamed measurements.** `evidence_count` of 120 on a hit FX call means the currency moved 1.20%, not 120 rows of anything; `resolve-calls.ts` carries a comment headed *EVIDENCE UNITS ARE PER KIND* and for censorship the same column holds blocked days. Label a quantity what it is or do not print it. This is the warship class exactly — a true number under a caption the data does not support — and it is the one failure mode a numeral gate is structurally blind to.

**11 — No cron schedule printed as a measurement.** "NEXT RESOLUTION 2026-09-22 09:45 UTC" in tabular figures beside real counts is `vercel.json` rendered as an observation, and 63 of the 1,302 resolved rows already disagree with it.

**12 — No minute-grain edition permalinks.** One snapshot commit exists per day. "Every front page this paper prints is permanently citable, including against us" is the strongest trust claim available and it must be true at the cadence the committed artifact supports. Daily grain, or the claim is not made.

**13 — No strip containing two dates or two denominators.** `counts.open` is 910 and excludes the 14 calibration rows; `by_kind` open sums to 924. `counts.resolved` is 1,239; the resolved array is 1,302; 49 of those are unresolvable. A masthead pairing 1,304 with 910 splices two days and two denominators. One reading, one timestamp, one source — or an explicit `as of` on each — and the staleness rule applies to the number we rank on, not only to the number we are proud of.

**14 — No numeral-containment gate advertised on the page as a fabrication guard.** Build it; run it at zero tolerance; do not name it as the reason a sentence can be trusted.

**Also deleted, standing:** `/api/accuracy/stats`. It stays deleted.

---

## A fully rendered example

### The refusal test, run first

Before anything else, the format is put through the brief's own showcase example: *"OUR CALL — 38% chance of a confirmed transit disruption at Bab el-Mandeb by Oct 5."*

Rendering it honestly produces this:

1. **`place`** resolves to `YE`. Fine.
2. **`what`** — no instrument recorded an event. GDACS has no Yemen alert. USGS has no qualifying quake. OONI has no Yemen block above threshold. Wikipedia attention is below z=3. `what` cannot be built from any source row.
3. **Therefore the item does not enter the edition at all.** § Ranking: *nothing appears on this page without an instrument reading.*
4. Had it entered on some other instrument, `our_call` would resolve to `NO_CALL` — there is no `shipping_disruption` key in `by_kind`, and no resolver that would ever score one.

**The format refuses its own brief's favourite example, and the refusal appears in exactly one place — the masthead scope declaration, where it already reads "We do not forecast shipping disruption."** That is the correct output. A direction that cannot refuse its own showcase example is not finished, and this one has now been tested. The test is committed as a CI assertion in Build step 3.

The chokepoint constants (`9% of global oil`, radius 120 km) are used nowhere.

### The edition of 2026-09-20, as it renders

All figures below are recomputed from `ledger-snapshots/2026-09-20.json`. No figure in this block comes from any other day.

```
─────────────────────────────────────────────────────────────────────
  NEXUSWATCH                                                    (24px serif, ink)
─────────────────────────────────────────────────────────────────────  (1px #C9A86B)
  EDITION OF 2026-09-20  ·  SETTLED 09:45 UTC  ·  PROSE 09:52 UTC     (12px mono, muted)


  We forecast three things and publish how we do at each: currency      (17px serif, body)
  depreciation (976 scored, Brier 0.177), internet censorship
  (263 scored, Brier 0.058, no call written since 29 August), and
  earthquake windows (14 open, a calibration control that claims
  no edge).

  We do not forecast shipping disruption, conflict onset, elections,
  commodity prices or sanctions. Everything else on this page is
  reported, not forecast, and is marked so.


  01   THE BATCH        Sixty-five calls settled. Thirty-five came in.  (13px mono)
  02   SUDAN            OONI — eight censorship calls, seven unscorable
  03   COLOMBIA         Open call, resolves 2026-10-04

─────────────────────────────────────────────────────────────────────


  THIRTY-FIVE OF SIXTY-FIVE                                    (38px serif, ink)
  CAME IN

  Sixty-five currency calls settled against the morning reference     (17px serif, body)
  rate. We priced them at 20.3% on average. Fifty-three point eight
  per cent of them came in — the highest realised rate in the book's
  fifteen settlement dates.

  ┃ The dollar moved, and it moved against most of the board at once.  (15px Inter, body,
  ┃ WRITTEN BY CLAUDE 09:52Z · FROM THIS INPUT                          gold ┃ marker,
                                                                       11px mono under)

  THIS BATCH                                                   (12px mono, muted label)
  calls            65                                          (13px mono tabular, ink)
  countries        65
  came in          35          53.8%
  we priced        20.3%       (mean stated probability)
  base rate        25.1%       (mean climatology)
  Brier            0.3723
  climatology      0.3300
  skill on this batch          −12.8%

  ── COUNTER-READING ──────────────────────────────────           (rule: #6B655B)
  More of these came in than we priced, and we still scored          (16px serif, ink)
  worse than the base rate — because we priced them below it.

  ── ONE MOVE, SIXTY-FIVE TIMES ───────────────────────────
  53.8% against a 25.1% base rate is 2.1× climatology across         (16px serif, body)
  sixty-five currencies settling on one morning against one
  reference print. Read this as one dollar move observed
  sixty-five times, not as sixty-five events.

  OUR RUNNING RECORD — fx_devaluation                          (12px mono, muted label)
  Brier 0.1771 over 976 scored calls · 66 independent units ·
  15 resolution batches · skill −0.47% against the base rate,
  published anyway.

  CANADA, SETTLED IN RESOLUTION ORDER                          (12px mono, muted label)
  □ □ □ □ □ □ □ □ □ □ □ □ ■ ■ ■
  One call per currency per morning. Fourteen-day windows overlap
  by thirteen days. This is a picture of the book, not of the world.

  FX REFERENCE ANCHOR: open.er-api.com aggregator — one print       (12px mono, muted)
  per currency per day.

─────────────────────────────────────────────────────────────────────

  THE WORLD
  The morning's settled batch leads. Everything below it is ordered    (13px mono, muted)
  by the severity of the single instrument reading that put it there,
  most severe first. Nothing appears on this page without one.


  02 · SUDAN                                                   (22px serif, ink)

  WHAT     Eight censorship calls have been written on Sudan.        (16px serif, body)
           Seven could not be scored.
           OONI measurements, probe_cc=SD · collector wrote last 06:02Z   (12px mono)

  · · · · · □ · ·

  OUR CALL NO OPEN CALL. Our last censorship call on Sudan closed
           2026-09-12. We have written none since 2026-08-29.

           RUNNING RECORD — censorship_event
           Brier 0.0583 over 263 scored calls · 36 units · 9 batches ·
           skill −2.48%. 49 further rows could not be scored at all.

           SEE THE INSTRUMENT →


  03 · COLOMBIA                                                (22px serif, ink)

  WHAT     COP is the widest open currency call on the book.
           open.er-api.com aggregator · anchor 3140.32, 2026-09-20     (12px mono)

  OUR CALL "COP depreciates 3.04% or more against USD at any point
           within 14 days, from 3140.32."

           WE SAY   36.3%        BASE RATE  25.7%    RESOLVES  2026-10-04

           BAND CHECK — our fx_devaluation calls at 0.3–0.4:
           predicted 0.311, observed 0.135, over 37 calls across
           8 independent units and 15 batches.

           RUNNING RECORD — fx_devaluation
           Brier 0.1771 over 976 · 66 units · 15 batches · skill −0.47%.

─────────────────────────────────────────────────────────────────────

  CORRECTIONS                                                  (12px mono, muted label)
  54 calls published MISS were later shown by the evidence to be      (16px serif, body)
  HITS. Every one is shown beside its published verdict. No verdict
  has been rewritten.  SEE ALL →

  THE INSTRUMENT LOG
  2026-09-21  FX recency blend weight 0.4 → 0.2. Open calls issued
              under both settings are not marked.
  2026-09-21  /api/acled deleted — positions were randomised.
  2026-09-21  /api/accuracy/stats stays deleted.

  COLOPHON
  Collectors that wrote a row since the last edition: fx-rates 06:02Z,
  ooni 06:02Z, usgs 06:02Z, gdacs 06:02Z, wikipedia 06:02Z, worldbank
  2026-09-14. Silent: ucdp, firms, flights, sanctions.
  Permalink: /edition/2026-09-20
─────────────────────────────────────────────────────────────────────
```

Note what is absent and was not replaced with anything: no EXPOSURE line on any item (no OEC figure is joined yet), no `so_what` on items 02 and 03 (nothing to say that the template did not already say), no map link on item 03 (no layer covers an FX call), no CII reading anywhere (no country in this edition had a qualifying deviation change).

---

## Build order

Each step ships on its own and leaves the product better than it found it. **Step 1 needs no model at all.**

**1 — Server-side aggregates in `api/calls/ledger.ts`. No model. No new page.**
Extend the existing server-side block — which already computes `counts`, `scoring`, `by_kind`, `independent_units` and `resolution_batches` over the full book — to also return, as small objects: per-kind calibration bins with `n`, `units`, `batches`, `predicted`, `observed`; per-batch statistics keyed by `resolves_on`; per-cohort ladders as ordered status arrays; and the counter-reading boolean per cohort. Re-key the withholding guard from batches to **units**. The front door must never call `?all=1`. Verification: a unit test asserting the returned bins match a recomputation from the committed snapshot, exactly, for all three kinds.

**2 — Delete the fabrications. No model.**
`rm api/acled.ts`. Remove `computeStatuses()` and the hardcoded statuses from `src/map/layers/chokepointStatusLayer.ts`, along with the uncited trade-share strings. Remove the pooled `scoring.calibration` figure from `src/pages/landing.ts`. Each deletion gets its own commit and an instrument-log entry.

**3 — The refusal test as a CI gate. No model.**
A test that constructs the Bab el-Mandeb input and asserts the format emits no situation, and that the string "shipping" appears on the front door only inside the scope declaration. Extend `scripts/check-design-tokens.ts` to re-measure any new meaning-bearing mark against the surface it actually sits on (hairline is 1.29:1 on `bgPage`, 1.20:1 on `bgCard`, 1.35:1 on `bgSunken`; ink-versus-muted is 2.37:1 mark-to-mark), failing anything under 3:1 for a non-text mark.

**4 — The edition skeleton at `/`. No model.**
Masthead, scope declaration, index, THE BATCH with its full deterministic block, ladders, corrections box, instrument log, colophon. Served from the committed snapshot with the `as of` fallback. This is a shippable product on its own: it is the best page NexusWatch has ever had and it contains no generated text.

**5 — Threshold calibration run. No model.**
Run the Class I–BRIEF thresholds against 30 days of GDACS, USGS, OONI and outage history. Publish the per-day item counts. Tune Class BRIEF so a typical edition holds 6–14 items. **Commit the run's output.** Until this exists, § Ranking's thresholds are provisional and the spec claims no yield.

**6 — THE WORLD, without `so_what`. No model.**
Situation objects from real instrument rows, templated `what`, honest `what_source`, `collector-health` freshness and the HELD state, the three-shape `our_call`, band checks at point of use, the counter-reading rule. Build the ISO2 → ISO3 map and join OEC export share where it exists; where it does not, the EXPOSURE line is omitted.

**7 — The evidence view.**
`/evidence/{date}/{id}`, bounded, single-layer, captioned. The `evidence: null` path ships first so the absence is correct before the presence exists.

**8 — `so_what`. The first model call on the front door.**
Cron-only, two press moments, closed payload, 30-word bound, zero-tolerance grounding gate, published payload URL, Inter treatment. Behind a flag for one week with the output reviewed by hand each morning before it goes live.

**9 — Editions archive.**
`/edition/{date}` at daily grain, backed by the existing snapshot commit. The archive promise is made only at this grain.

**10 — The instrument log as a real route.**
A dated table on a public route, not `docs/OPERATIONAL-KNOWLEDGE.md`. Backfill the FX recency-weight change and the two deletions from step 2.

**11 — Mobile pass and the index-as-edition behaviour.**

**12 — `/map` demoted in navigation, not deleted.**

---

## Open questions for the owner

1. **The 54 corrections.** Every one is a published miss the evidence later showed to be a hit, from two causes (`ooni-hourly-bucket` and the final-day-unseen case). They are currently shown beside the published verdict and the verdict is not rewritten. Does that stand, or do the corrected calls re-score into the kind's Brier? This changes the censorship figures on the masthead and it is your call, not mine.

2. **Censorship has zero open calls and none written since 2026-08-29.** Do we reopen the kind, or does the scope declaration say it is closed? The wording in § At rest currently says "no call written since 29 August", which is true either way — but if the kind is closed, it should say *closed*.

3. **All 14 seismicity controls resolve 2026-09-22.** From tomorrow the live book is 100% one automated FX screen. Do we mint a new control batch, or does the masthead say so? The scope declaration handles it honestly either way; I want to know which sentence to write.

4. **Two press moments or one?** Two is specified. One at 09:50 is cheaper, simpler, and removes any risk of the second moment becoming ceremony. The second exists only to catch a Class I event arriving after breakfast.

5. **OEC export share.** It is the only sourceable exposure figure in the product and it needs an ISO2 → ISO3 map built by hand. Worth it in step 6, or does EXPOSURE ship empty and wait?

6. **Does `/map` keep its own entry in navigation**, or is it reachable only from an evidence view? I have specified the former; the latter is the more disciplined choice and the more painful one.

7. **The FX recency blend moved 0.4 → 0.2 today**, and 924 open calls were issued under both settings with nothing marking which. The instrument log records it. Should the open calls also carry a marker, or do we accept the mixture and say so?

8. **The masthead name.** "NexusWatch" alone, or "NexusWatch · The Situation Room"? The second names the thing; the first is what a returning reader already types.

9. **One thing I could not verify and will not guess.** The dossier attributes to the audit that four of twelve `source-*` collectors are currently failing silently. `api/_lib/collector-health.ts` exists and is the right instrument, but I did not run it against the live database while writing this. The COLOPHON in the worked example lists collectors as *illustrative*, not measured. Before step 6 ships, that list must come from an actual run. **UNKNOWN** until then.
---

# Verification of this spec — 2026-09-21

The council measured against the committed `ledger-snapshots/2026-09-20.json`.
I re-checked its load-bearing claims against the LIVE database on 09-21. The
repo's rule is that a council's claims are measured before they are acted on,
and all eleven contrast ratios of the last council were exact — these are not.
They are close, and where they drift the drift is one day of new data.

**VERIFIED — the U-shaped FX hit rate.** The spine of the whole spec. Every
figure matched, and the extra day extends the pattern rather than breaking it:

```
09-06 43.9   09-11 12.3   09-16 15.4
09-07 34.8   09-12  6.2   09-17 18.8
09-08 19.7   09-13  6.2   09-18 32.8
09-09 21.5   09-14 10.8   09-19 36.9
09-10 18.5   09-15  9.2   09-20 53.8   09-21 55.4
```

Sixty-five currencies moving together against one threshold rule. The batch,
not the country, is the honest unit.

**VERIFIED — FX probabilities never exceed 0.5.** Measured range 0.142–0.341,
zero rows above 0.5. So `(p−1)²` always dominates `p²`, and the winning
direction's own ranking formula really was a hit-detector. Deleting it was
correct.

**VERIFIED, with one day's drift — the Egypt sequence.** The council found 15
resolved calls reading `M M M M M H H H H M H H H H H`. Live there are now 16,
`M M M M M H H H H M H H H H H H` — the same sequence with one more settled
since the snapshot. The windows confirm the finding: first made 2026-08-23
resolving 09-06, second made 08-24. Consecutive daily 14-day windows
overlapping by thirteen days. **One devaluation episode rendered as sixteen
trials.** That is a real problem for what the Brier means, and it was not in
the brief the council was given — it went and found it.

**VERIFIED — `liveConflict` is structurally zero.** `api/cron/compute-cii.ts:251`
says so in terms: *"Live conflict events (feed currently returns nothing —
api.acleddata.com has no DNS record; kept so a replacement feed lands in the
right place)."* Confirmed independently: `api.acleddata.com` does not resolve,
while `acleddata.com` does. Refusing CII deviation as a ranking term for
classes I–III is correct.

**OPEN QUESTION 9 IS CLOSED — the collectors are not failing.** The council
marked this UNKNOWN rather than guess, which was the right call. Measured
against `/api/public/status` at 19:4x UTC on 09-21:

```
fx-rates   green 100   governance green 100   ooni       green 100
sanctions  green 100   ucdp       green 100   wikipedia  green 100
```

All six green, score 100, last success inside the hour, every circuit closed.
The dossier's "four of twelve `source-*` collectors failing silently" is not
true today. The COLOPHON may list them as measured.

*(OONI shows green here and flaps red roughly a quarter of the time on a
timeout that PR #64 fixes — that is a probe defect, not a collector failure.)*

**A SEPARATE FINDING, not part of this spec.** ACLED is dead at DNS. That kills
the `liveConflict` CII component and, presumably, the "Live Conflicts (ACLED)"
map layer. For a geopolitical product whose top CII scores are YE, SY, SD, SS
and AF, having no live conflict feed is worth a decision of its own.
