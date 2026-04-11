# LinkedIn Posts — Good Examples

Ten exemplary LinkedIn posts. LinkedIn gets the cleanest register: no emoji,
hook-then-list structure, 150-600 words, thought-leader cadence without
"excited to announce" filler.

---

## 1. The Quiet Is Also A Signal

There are 18 commercial vessels rerouting around the Cape of Good Hope this week to avoid the Red Sea. That sounds like a lot until you look at the number from Q1 2024, which was over 60 in a comparable week.

On our layers, the Red Sea looks calmer than it did last year. Houthi attack frequency is down. Insurance premiums for Gulf of Aden transits have dropped meaningfully from their 2024 peak. The chokepoint is still elevated, but it is no longer spiking.

A few things worth noting about the quiet:

- The 18 reroutes this week are still 18 reroutes. Baseline is zero. The cost is still real, just less visible in headlines.
- Our tension index for the region is at 54/100, down from 73 in January. That's the biggest quarter-over-quarter drop we've seen in any MENA chokepoint.
- Every previous "quiet" period in this region has ended with a single-event escalation that reset the baseline. Watching for that is now the main job.

The hardest part of watching a conflict region is interpreting the quiet. When a story drops out of the headlines, the instinct is to assume it was solved. Usually it was just rebalanced. We try to surface that rebalancing so our readers don't get caught when the quiet ends.

What we're watching next: dark-vessel activity near the Bab el-Mandeb and AIS gaps longer than 4 hours on any vessel registered to Greece, Cyprus, or Singapore. If those numbers move, we'll post an update.

**Why it works:** 275 words. Hook opens with a number. Clear list of three substantive points. Names the tension index. Ends with a concrete "what we're watching next." Zero emoji. Zero "excited to announce." Reads like a thought leader who knows what they're talking about.

---

## 2. What the Tension Index Actually Measures

People ask us what's inside the NexusWatch tension index. Fair question, because "0-100 composite score" doesn't mean much on its own.

Our tension index is a rolling score across four components, weighted differently for each region:

- Conflict activity: fatality-weighted ACLED events in the region over the last 14 days.
- Disaster load: GDACS-tiered events + earthquake/fire counts above a severity threshold.
- Sentiment: GDELT-derived tone of English and regional-language news coverage.
- Instability signals: election calendar, sanctions changes, leadership transitions, and cyber events.

The components are normalized, weighted, and combined into a single score. The score is recomputed every 6 hours and stored with a trend indicator (rising, falling, stable). For the last 30 days of any region, you can see which component is doing the work.

That last part is the most useful feature, in our experience. A 70 driven by sentiment reads very differently from a 70 driven by conflict fatalities. When the components diverge, something is usually happening that headlines haven't caught up with yet.

The index is not a prediction. It is a structured way to say "too many needles are moving in the same place at the same time." What to do about that is a human judgment.

**Why it works:** 240 words. Explains a product feature without pitching it. Uses the layer names we actually have. Explicitly doesn't overclaim. Reads like a post from a team that takes their own work seriously.

---

## 3. Why Data Layers Beat Headlines

A geopolitical newsletter we respect recently published a brief that said "tensions are escalating rapidly in the Taiwan Strait." The same week, our AIS shipping layer showed commercial traffic through the strait at its 30-day average. No reroutes. No insurance premium spikes. No changes in filed destinations.

Both of those things were true. They are not in contradiction.

Here is what headlines are good at: compressing a week of signal into a story a reader can hold in one sentence. Here is what headlines are bad at: telling you which of the signals actually changed behavior on the ground. Those two jobs need different tools.

On our layers this week:

- PLA air incursions: elevated (24 in 24 hours vs. 30-day avg of 18).
- Commercial shipping: normal.
- Insurance: normal.
- Sentiment: spiking.
- Tension index: 71, up from 68 a week ago.

The right read is probably "elevated, not breaking." The headline version compresses that into "escalating." Both are defensible. Only one tells you what to actually watch for tomorrow.

What we try to build at NexusWatch is the second kind. Not a replacement for headlines — a layer under them.

**Why it works:** 230 words. Hook is a pointed observation about a real publishing pattern. Uses a 5-item data list to make the case. Lands on a product thesis without pitching. "A layer under them" is a nice phrase that a smart friend would drop.

---

## 4. What Dark Vessels Tell Us About Sanctions Enforcement

We added a dark-vessel layer to NexusWatch eight weeks ago. Here's what eight weeks of data has taught us.

A "dark vessel" in our layer is a ship that's turned off its Automatic Identification System transponder for longer than 4 hours in a zone where AIS is legally required or practically expected. Every week, we get between 80 and 140 dark-vessel events, almost all of which involve tankers.

The geography is clustered. Three zones produce the majority of events:

- Off the coast of Venezuela, primarily tankers heading to East Asia.
- The Strait of Malacca, primarily Iranian-origin crude in ship-to-ship transfer patterns.
- The Baltic, primarily Russian-origin crude and refined product.

What the data doesn't tell us: whether any individual dark period is actual sanctions evasion, a legitimate operational decision, or a transponder fault. What it does tell us: where to look when a specific shipment becomes a news story.

The layer isn't a sanctions enforcement tool. It's a prompt. It narrows the field from "the entire ocean" to "these three zones, these vessel classes, these hours." That narrowing is the actual work.

**Why it works:** 225 words. Gives a specific number range (80-140). Names three specific zones. Is explicit about what the layer does and doesn't do. Lands on a definition of "the actual work" that's defensible and useful.

---

## 5. The 30-Layer Globe

NexusWatch now runs 30 real-time data layers on a 3D MapLibre globe. We're often asked whether that's too many.

The answer is: only if you try to look at all 30 at once. Nobody does. Most sessions on the platform use 3 to 5 layers. The value of having 30 is that those 3-5 change depending on what you're looking for.

A typical session:

- A fire analyst in California opens wildfires, weather alerts, air quality, and flights. That's it.
- A maritime security team watching the Red Sea opens ships, chokepoint status, dark vessels, GDELT news, and cyber. Five layers.
- A country analyst covering Sudan opens ACLED, GDELT news, displacement arcs, and disease outbreaks. Four layers.

The layer count isn't the feature. The layer composition is. A platform with 8 layers would be fine for the first two sessions and useless for the third. A platform with 30 lets each user compose the right 4.

We try to build the globe as a base and let composition be the user's job. That decision is why we're not smaller, and why we will probably keep growing the layer count.

**Why it works:** 215 words. Reframes a common critique as a design principle. Uses concrete composition examples to make the point. Ends on a decision, not a slogan.

---

## 6. When The Ground Truth Moves Faster Than The Feed

A lesson from this week: we had a draft ready to post about an active fire situation in Greece. Between when the draft was generated and when a human was going to approve it, the wind direction changed and the evacuation zone moved by 12 kilometers.

We held the draft. The old one said "threat is receding." The actual situation was the opposite.

This is the argument for permanent human-in-the-loop. There are automated pipelines for data ingestion, for signal detection, for draft generation. There is no automated pipeline for judgment about when a fast-moving situation has outrun the model that drafted it. That judgment is a human job, and we don't see that changing any time soon.

What we're building is not an autonomous social account. It is a 24/7 drafting engine with a human reviewer. Drafts enter a queue, a human reviews in batches, and nothing ships without approval. The engine saves the human time, not replaces the human.

The ratio we aim for: drafts should take a reviewer less than 20 seconds per item. If a draft is complex enough that it takes longer, it's already failed the voice check.

**Why it works:** 225 words. Tells a concrete story. Builds the case for the HIL architecture from the story, not from a slogan. Lands on a specific number (20 seconds) that makes the principle operational.

---

## 7. On Not Being The Face

Something we've tried to hold to from the start: NexusWatch is the protagonist, not the team behind it.

There's a growing pattern in the startup world where the founder's face is the product. The newsletter is "from [founder name]." The pitch is "I built this because I couldn't find..." The brand is the person. That works, sometimes. It is not what we're building.

NexusWatch is a system. It has 30 live data layers, a correlation engine, an AI terminal, and a briefing pipeline that runs whether anyone on our team is awake. When it speaks — in a brief, in a tweet, in a reply — it speaks as "we." Not as any individual.

There are good reasons for this, some of them boring:

- The product works when nobody is watching, so the brand should work that way too.
- Readers should be able to trust the data, not the person who happened to publish it.
- If one of us gets hit by a bus, the brand has to keep going.

And one less boring reason: the people who need this product do not want a personality. They want a dashboard. We try to build for them.

**Why it works:** 240 words. Addresses the "not the face" principle directly without sounding defensive. Gives three concrete reasons. Lands on "they want a dashboard," which is a great smart-friend phrase for a thought-leader post.

---

## 8. The Correlation Engine Is The Point

Adding a new data layer to NexusWatch isn't hard. The engineering is mostly just another fetch, another parser, another style spec. We've done it 30 times.

The hard part — the part that actually changes what users can see — is wiring the correlation engine to the new layer. The engine is the thing that notices when earthquake clusters overlap with refugee displacement arcs. Or when negative sentiment surges in a geography where ACLED is already showing elevated fatalities. Those overlaps are where the product stops being a feed and starts being intelligence.

We have 30 layers and a correlation engine that notices about a dozen types of multi-layer event. That ratio is the thing we're most focused on growing — not the layer count, but the types of cross-layer patterns the engine can detect.

If you ask us what the product is, the honest answer is: the correlation engine is the product. The layers are the inputs.

**Why it works:** 190 words. Distinguishes the easy engineering from the hard work. Names a specific ratio we care about. Lands on a one-sentence thesis about what the product actually is. This is a post a thoughtful engineer would write.

---

## 9. Watching The Chokepoints

The world has six major maritime chokepoints that matter if you care about trade, energy, or conflict:

- The Strait of Hormuz (20% of global oil).
- The Strait of Malacca (between the Indian Ocean and the South China Sea).
- The Suez Canal.
- The Bab el-Mandeb (entry to the Red Sea).
- The Panama Canal.
- The Taiwan Strait.

NexusWatch tracks all six on a single layer, with a status indicator that moves between "normal," "elevated," and "disrupted." The status is derived from AIS ship tracking, insurance premium data, and news events from GDELT. The chokepoint layer is one of the most-used layers on the platform, and it's the single best way to see whether the global trade system is behaving normally or not.

Today, five of the six are normal. One is elevated. You can probably guess which.

Over the next year we expect all six to see at least one elevated week. That's not a prediction — it's a baseline. Chokepoints are where the world's tensions get visible first, and we try to put them all in one place so you don't have to.

**Why it works:** 230 words. Lists the six chokepoints cleanly. Explains what the layer combines. Ends with a mild teasing line ("you can probably guess which") that reads as smart-friend without being cute. The "baseline, not a prediction" caveat is exactly right.

---

## 10. Why We Use Open-Source Data Wherever Possible

A thing we believe and practice at NexusWatch: if a data source we rely on isn't public, we try not to rely on it.

ACLED is public. USGS is public. NASA FIRMS is public. GDELT is public. GDACS, WHO, Open-Meteo, OpenSky, OpenAQ — all public. The majority of our 30 layers are built on data that any government, journalist, NGO, or grad student can also pull, for free.

That's deliberate, for three reasons:

- We want our briefings to be reproducible. A reader should be able to check our work if they care to.
- We want the product to keep working even if a single vendor changes their pricing or their terms. Public data doesn't get pulled out from under you on a quarterly earnings call.
- We think the open-source intelligence community is doing some of the best work anywhere, and we want to be part of it rather than wall it off.

There are a few layers we license because the public version isn't good enough. When we do, we label it. But public data is the default, and we're proud of that.

**Why it works:** 240 words. Specific list of public sources. Three clear reasons. Values statement at the end that's earned by the list above it. This is the kind of post that builds credibility with the OSINT crowd.
