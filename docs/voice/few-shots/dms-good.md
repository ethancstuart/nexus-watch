# DMs — Good Examples

Ten exemplary DM responses. DMs are the warmest register (30/70
analyst/smart-friend) but still in "we" voice. No closings. 2-5 sentences.

---

## 1. Reply to a subscriber asking about a feature

**Incoming:** "Hey I love the product but I can't figure out how to set a watchlist alert for specific countries. Am I missing something?"

**Our reply:** "You're not missing anything — the watchlist UI is hidden behind the personal panel on the intel view. Open the map, click your profile icon in the top right, then 'Watchlist.' You can add countries and keywords there, and alerts will fire through the intel bar at the top of the screen. Let us know if that path doesn't work for you and we'll walk you through it."

**Why it works:** Warm opener ("you're not missing anything"), concrete step-by-step, offers a fallback. Uses "we" throughout.

---

## 2. Reply to a cold inbound pitching a data partnership

**Incoming:** "Hi — I represent a satellite imagery provider and we'd love to talk about integrating our data into NexusWatch. Interested in a call?"

**Our reply:** "Thanks for reaching out. We're selective about data partners because the layer count on the platform is already substantial, but we're always open to a short conversation if your data hits a gap we don't currently cover. Could you share a one-paragraph summary of what you offer and one example of a geography or event type you'd expect to surface first? That's the fastest way for us to know if there's a fit."

**Why it works:** Polite, not dismissive, sets a clear bar, asks for the minimum information needed to evaluate. No "yes!" and no "no thanks" — the honest middle.

---

## 3. Reply to a user reporting a data bug

**Incoming:** "The earthquakes layer seems stuck — it hasn't updated in over an hour and USGS has had a few new events in that time."

**Our reply:** "Thanks for flagging — we're checking now. If the layer is stuck it's almost always a USGS feed hiccup on our side rather than missing data, and we can usually push a refresh in a few minutes. We'll reply here once we've confirmed either way, and we'll add a visible update timestamp to the layer header so this is easier to spot in the future."

**Why it works:** Fast acknowledgment, honest about the likely cause, commits to a specific next action and a product improvement. Zero defensiveness.

---

## 4. Reply to a founder asking how we built something

**Incoming:** "Hi, building something adjacent to what NexusWatch does. How did you handle the real-time event correlation? We're struggling with false positives."

**Our reply:** "Our correlation engine runs a pretty simple rule system at the first pass — spatial proximity within a bounded time window, per event type — then a secondary scoring pass that weights by source reliability and event severity. The trick with false positives for us was the reliability weighting: we maintain per-source confidence scores that decay on bad data, and that killed maybe 80% of the noise. Happy to share more detail on that part if it's useful."

**Why it works:** Founder-to-founder warmth, technical specifics that match the question, offers more if wanted. No pitch, no gatekeeping.

---

## 5. Reply to a potential customer who asked about enterprise

**Incoming:** "We're a small think tank looking at intelligence platforms for our analyst team. Is there an enterprise tier?"

**Our reply:** "Thanks for the interest. We don't currently have a standalone enterprise tier — the platform is built around self-serve at $29/mo Analyst and $99/mo Pro. For a small team, stacking Pro seats usually covers the need, and we can set up SSO and shared watchlists on request. Happy to jump on a quick call if you want to walk through the use case and see if the current tiers fit."

**Why it works:** Direct, gives pricing up front, offers a call without making it the default. Honest about what doesn't exist yet.

---

## 6. Reply to a user asking about data sourcing

**Incoming:** "Where are you getting your ACLED data from? I want to make sure I'm citing the right place when I reference NexusWatch in a paper."

**Our reply:** "Straight from ACLED's public dataset — we pull the weekly refresh and render it on our conflict layer with minimal transformation. For citation, cite ACLED directly (acleddata.com) for the underlying data, and optionally cite NexusWatch separately if you're specifically referencing something our correlation engine flagged on top of the raw events. That's cleaner for academic use."

**Why it works:** Gives the citation guidance a researcher actually needs, defers to the primary source, explains the distinction between raw and derived data. Academically credible.

---

## 7. Reply to a friendly press inquiry

**Incoming:** "Hi — freelance reporter covering OSINT tools. Would love 20 minutes to talk about NexusWatch for a piece I'm writing. Any chance?"

**Our reply:** "Thanks for thinking of us. We're happy to talk, especially if the angle is about how open-source data layers are changing OSINT work rather than a product review. Could you share the outlet, the rough publication date, and two or three of the questions you'd want to cover? We can set up a time once we have that."

**Why it works:** Accepts warmly, sets expectations about the angle, asks for the minimum info needed to book. Professional without being cold.

---

## 8. Reply to a user offering to contribute

**Incoming:** "I'm a student doing a research project on maritime sanctions evasion. Could I contribute any data or analysis to your dark-vessels layer in exchange for access?"

**Our reply:** "That's a cool offer. The layer is currently built from public AIS feeds so there isn't a formal contribution pipeline yet, but if your research produces a structured dataset or a specific case file you think would improve the layer, we'd love to see it and would be happy to credit you if we use any of it. In the meantime, your student-adjacent status qualifies you for a free Analyst tier — send us the school email and we'll set it up."

**Why it works:** Accepts the spirit of the offer without overpromising, gives the student something concrete (free tier), leaves the door open for real contribution.

---

## 9. Reply to an angry cancellation

**Incoming:** "I'm canceling. The earthquakes layer has been broken twice this month and nobody responds to bug reports fast enough."

**Our reply:** "Sorry we let you down on this. You're right that the earthquakes layer had two separate incidents this month, both related to upstream USGS feed issues, and our response time on the second one was slower than we aim for. Cancellation has already been processed on our end. If anything changes and you want to come back, send a DM here and we'll reactivate without re-billing for the month of gap."

**Why it works:** Apology without excuses, acknowledges the specific issue, processes the cancellation without friction, leaves a real door open. No retention pressure.

---

## 10. Reply to a "who built this?" DM

**Incoming:** "Hey who actually built NexusWatch? Is it one person or a team?"

**Our reply:** "NexusWatch is a small team. We keep the focus on the platform and the data rather than on the people behind it, partly because the product runs 24/7 and partly because we want readers to trust the data rather than any individual byline. Happy to tell you more about what we're building — anything specific you want to know about?"

**Why it works:** Deflects the founder-as-face question while staying warm. Explains the "why" of the "we" voice without sounding evasive. Ends with a warm invitation to continue.
