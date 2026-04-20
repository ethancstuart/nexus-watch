# NexusWatch Marketing Automation Overhaul — Design Spec
**Date:** 2026-04-20
**Target:** April 28 launch
**Scope:** X + LinkedIn only. 4 post types. Dynamic images. MARKETING_AUTOMATION_ENABLED → true.

---

## Problem

The current marketing automation system is built but off. When tested, posts:
- All carry the same Buffer auto-attached link preview image (now disabled)
- Use a single generic Claude prompt producing bot-like, undifferentiated content
- Have no concept of post type — an alert post looks identical to a CTA post
- Never pass `image_url` to adapters despite the xAdapter supporting it
- Are gated behind `MARKETING_AUTOMATION_ENABLED=false`

## Goal

Ship production-quality automated posts on X and LinkedIn by April 28. Posts should look
and read like NexusWatch content — not like a scheduling tool ran a template. Four
distinct content types, dynamic images on X, automation live.

---

## Post Type System

Four types replace the current single-path pillar-to-content flow.

### Type Definitions

| Type | Trigger | Platforms | Format |
|---|---|---|---|
| `alert` | pillar=signal + urgency signal (CII spike ≥5pts, ACLED event, crisis detection) | X only | Single post ≤280 chars |
| `data_story` | pillar=signal or pattern, no urgency | X + LinkedIn | X: 3-tweet thread. LinkedIn: 150–400 words |
| `cta` | pillar=product | X + LinkedIn | X: single post. LinkedIn: 100–200 words |
| `product_update` | pillar=methodology or product, source_layer=release-notes | X + LinkedIn | X: 1–2 tweets. LinkedIn: 150–300 words |

### Derivation Logic (topicSelector.ts)

`post_type` is computed from existing topic fields — no new DB reads required at selection time:

```
if pillar === 'signal' AND metadata.urgency === 'high' → 'alert'
if pillar === 'signal' OR pillar === 'pattern' → 'data_story'
if pillar === 'product' → 'cta'
if pillar === 'methodology' OR source_layer === 'release-notes' → 'product_update'
default → 'data_story'
```

Alerts only route to X. LinkedIn receives data_story, cta, product_update.

---

## Dynamic Image System

### Endpoint: `/api/og/social`

New Edge Function extending the existing `@vercel/og` pattern from `/api/og`.

**Method:** GET
**Returns:** 1200×630 PNG
**Runtime:** edge

**Query params:**

| Param | Required | Description |
|---|---|---|
| `type` | yes | `alert` \| `data_story` \| `cta` \| `product_update` |
| `title` | yes | Main headline text (truncated at 80 chars) |
| `country` | no | Country name or code (alert + data_story) |
| `metric` | no | Key metric string, e.g. `"CII 84.2"` |
| `layer` | no | Source layer name, e.g. `"ACLED"` |
| `date` | no | ISO date string — defaults to today |

**Templates:**

**Alert** — Dark red background (`#1a0505`), orange accent (`#ff6b35`).
- Large country name (48px, uppercase, orange)
- CII score or event metric (72px, white, bold)
- "ALERT" badge top-right (red pill)
- Layer attribution bottom-left (14px, muted)
- NexusWatch wordmark bottom-right

**Data Story** — Dark background (`#0a0f1e`), blue accent (`#3b82f6`).
- Headline text (32px, white, max 2 lines)
- Key stat if provided (56px, blue, bold)
- Layer name bottom-left (14px, muted)
- Globe/map motif (CSS-only, no external image dependency)
- NexusWatch wordmark bottom-right

**CTA** — Dark background (`#0a0f1e`), gold accent (`#f59e0b`).
- "NexusWatch" wordmark large (center)
- Value prop line (24px, white): e.g. "158 countries. Real-time intelligence."
- Tier callout (18px, gold): e.g. "Free to start · No credit card"
- nexuswatch.dev URL bottom-center

**Product Update** — Dark background (`#0a0f1e`), green accent (`#10b981`).
- "Now live" badge (green pill, top-left)
- Feature name (40px, white, bold)
- One-line description (20px, muted)
- NexusWatch wordmark bottom-right

**Image URL construction (dispatcher):**

```typescript
function buildImageUrl(postType: PostType, topic: Topic): string | undefined {
  if (postType === 'alert') {
    return `https://nexuswatch.dev/api/og/social?type=alert`
      + `&title=${encodeURIComponent(topic.hook.slice(0, 80))}`
      + (topic.entity_keys[0] ? `&country=${encodeURIComponent(topic.entity_keys[0])}` : '')
      + (topic.metadata?.cii_score ? `&metric=CII+${topic.metadata.cii_score}` : '')
      + (topic.source_layer ? `&layer=${encodeURIComponent(topic.source_layer.toUpperCase())}` : '');
  }
  if (postType === 'data_story') {
    return `https://nexuswatch.dev/api/og/social?type=data_story`
      + `&title=${encodeURIComponent(topic.hook.slice(0, 80))}`
      + (topic.source_layer ? `&layer=${encodeURIComponent(topic.source_layer.toUpperCase())}` : '');
  }
  if (postType === 'cta') {
    return `https://nexuswatch.dev/api/og/social?type=cta&title=158+countries.+Real-time+intelligence.`;
  }
  if (postType === 'product_update') {
    return `https://nexuswatch.dev/api/og/social?type=product_update`
      + `&title=${encodeURIComponent(topic.hook.slice(0, 80))}`;
  }
  return undefined;
}
```

Image URL is only passed to X adapter. LinkedIn adapter receives `image_url: undefined`.

---

## Content Generator Changes

### New `postType` field on `GenerationRequest`

```typescript
export interface GenerationRequest {
  platform: Platform;
  topic: Topic;
  voiceProfile: VoiceProfile;
  postType: PostType;           // NEW
  parentContent?: string;
  parentPlatform?: Platform;
}
```

### Per-type system prompt injections

Injected before the existing voice profile. Each is a short instruction block:

**Alert:**
```
POST TYPE: Alert
Lead with a number or a place name — never with "In" or "The."
Name the data layer that flagged this in the first sentence.
One concrete claim. Zero hedging language.
Single post only, ≤280 characters. End with nexuswatch.dev.
```

**Data Story (X):**
```
POST TYPE: Data Story — X Thread (3 tweets)
Tweet 1: hook with a specific stat or observation.
Tweet 2: what the data layer actually shows — be specific about the source.
Tweet 3: why it matters right now + nexuswatch.dev.
Separate tweets with a blank line. No "🧵" opener.
```

**Data Story (LinkedIn):**
```
POST TYPE: Data Story — LinkedIn
Line 1: one-sentence hook with a tension or a number. No preamble.
Paragraph 2: context (2–3 sentences, 40% analyst).
Bullet list: 3–4 observations, each grounded in a NexusWatch layer.
Closing line: one read or next step. No "thoughts?" No "agree or disagree?"
150–400 words total.
```

**CTA (X):**
```
POST TYPE: CTA — X
Show the product working, not the product existing.
One concrete intelligence example a reader can verify for free right now.
Soft close: "it's free to start" not "sign up."
Single post ≤280 chars. Include nexuswatch.dev.
```

**CTA (LinkedIn):**
```
POST TYPE: CTA — LinkedIn
"We built X because Y" logic — lead with the problem, not the product.
One concrete example of NexusWatch solving it.
Soft close with nexuswatch.dev/pricing. 100–200 words.
No "excited to share." No "humbled."
```

**Product Update (X):**
```
POST TYPE: Product Update — X
One sentence: what we shipped. One sentence: why we built it.
Optional third sentence: what it unlocks for the reader.
1–2 tweets max. Include nexuswatch.dev.
```

**Product Update (LinkedIn):**
```
POST TYPE: Product Update — LinkedIn
"We built X because Y" structure.
What it does in one sentence. The decision behind it in one paragraph.
What you can do with it now. nexuswatch.dev link. 150–300 words.
```

---

## Dispatcher Changes

### Updated flow

```
1. preflight()
2. selectTopic()  →  now includes post_type on Topic
3. Platform gate: if post_type === 'alert' AND platform === 'linkedin' → skip
4. buildVoiceProfile()
5. generateContent(topic, post_type)  →  per-type prompt injected
6. evaluateVoice()
7. buildImageUrl(post_type, topic)  →  URL for X, undefined for LinkedIn
8. INSERT marketing_posts (with post_type column)
9. adapter.post({ content, format, image_url })
10. UPDATE marketing_posts
11. recordTopicUsed / recordRun
```

### DB migration

```sql
ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS post_type TEXT;
```

Single non-breaking migration. Existing rows get NULL, which is fine — they predate the type system.

---

## Activation Sequence

After all code is shipped and validated:

1. Deploy to Vercel (auto via git push to main)
2. Run DB migration
3. Manual smoke test: trigger one dispatch run per platform in shadow mode, inspect `marketing_posts` rows
4. Confirm image URLs resolve correctly in browser
5. Flip `MARKETING_AUTOMATION_ENABLED=true` in Vercel
6. Watch first real Buffer queue entries — approve manually in Buffer before anything posts

---

## What's Out of Scope (Post-Launch)

- Instagram (requires explicit `image_url` from outside dispatcher — separate build)
- Threads, Bluesky, Substack, Medium (gated off — re-enable one at a time)
- Engagement polling with real platform metrics (scaffolding exists, needs API tokens)
- A/B test variant promotion (voice-learn cron infrastructure exists, activate after 30 days of data)
- LinkedIn native image posts (text-only performs better; revisit at 60 days)

---

## Files Changed

| File | Change |
|---|---|
| `api/marketing/lib/topicSelector.ts` | Add `post_type` to `Topic` interface + derivation logic |
| `api/marketing/lib/contentGenerator.ts` | Add `postType` to `GenerationRequest`, per-type prompt injection |
| `api/marketing/lib/dispatcher.ts` | Platform gate for alerts, `buildImageUrl()`, pass `image_url` to adapter |
| `api/og/social.ts` | New Edge Function — 4 image templates |
| `api/migrations/` | Add `post_type` column to `marketing_posts` |
| `vercel.json` | No changes needed — existing cron schedule is correct |
