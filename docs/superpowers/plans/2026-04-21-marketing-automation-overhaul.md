# Marketing Automation Overhaul — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship production-quality automated posts on X and LinkedIn by April 28, with 4 distinct post types, dynamic social card images for X, per-type prompt injection, and per-platform-per-type kill switches in KV config.

**Architecture:** The dispatcher selects a topic, derives its `post_type` (alert/data_story/cta/product_update), injects a per-type+per-platform prompt prefix into content generation, builds an image URL for X-only posts, checks per-type kill switches in KV, then passes `image_url` to the adapter. A new `/api/og/social` endpoint (extending the existing file) renders 4 new branded templates.

**Tech Stack:** Neon PostgreSQL (migration via SQL), @vercel/og (Edge Function, HTML string API), Vercel KV (kill switches + CTA headline), Anthropic Haiku/Sonnet, Typefully API (image via `media_urls`), TypeScript strict.

**Spec:** `docs/superpowers/specs/2026-04-20-marketing-automation-overhaul-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `docs/migrations/2026-04-20-post-type.sql` | Create | Add `post_type TEXT` to `marketing_posts` |
| `api/marketing/lib/topicSelector.ts` | Modify | Add `PostType` type, `post_type` on `Topic`, urgency detection, `derivePostType()` |
| `api/marketing/lib/contentGenerator.ts` | Modify | Add `postType` to `GenerationRequest`, inject per-type+per-platform prompts |
| `api/marketing/lib/config.ts` | Modify | Add `killSwitches` + `ctaHeadline` fields to `MarketingConfig` |
| `api/og/social.ts` | Modify | Add 4 new post-type image templates (keep existing `cii-card`, `crisis`, `brand`) |
| `api/marketing/lib/dispatcher.ts` | Modify | Platform gate for alerts, `buildImageUrl()`, kill switch check, pass `image_url`, store `post_type` |
| `api/marketing/lib/topicSelector.test.ts` | Create | Unit tests for `derivePostType()` |
| `api/marketing/lib/contentGenerator.test.ts` | Create | Unit tests for per-type prompt injection |
| `api/marketing/lib/dispatcher.test.ts` | Create | Unit tests for `buildImageUrl()` and platform gate |

---

## Task 1: DB Migration — add `post_type` to `marketing_posts`

**Files:**
- Create: `docs/migrations/2026-04-20-post-type.sql`

- [ ] **Step 1: Write the migration file**

```sql
-- 2026-04-20: add post_type to marketing_posts
-- Non-breaking: existing rows get NULL (pre-type-system)
ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS post_type TEXT;
```

Save to `docs/migrations/2026-04-20-post-type.sql`.

- [ ] **Step 2: Run the migration against Neon**

The project uses Neon. Run via the Neon MCP tool or copy-paste into the Neon console SQL editor:

```sql
ALTER TABLE marketing_posts ADD COLUMN IF NOT EXISTS post_type TEXT;
```

Verify with:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'marketing_posts' AND column_name = 'post_type';
```

Expected: one row returned with `column_name = 'post_type'`, `data_type = 'text'`.

- [ ] **Step 3: Commit**

```bash
git add docs/migrations/2026-04-20-post-type.sql
git commit -m "migration: add post_type column to marketing_posts"
```

---

## Task 2: topicSelector.ts — PostType, urgency detection, derivation

**Files:**
- Modify: `api/marketing/lib/topicSelector.ts`
- Create: `api/marketing/lib/topicSelector.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/marketing/lib/topicSelector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

// derivePostType is not yet exported — this import will fail until Task 2 Step 2.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import { derivePostType } from './topicSelector.js';

describe('derivePostType', () => {
  it('signal + urgency high → alert', () => {
    expect(derivePostType({ pillar: 'signal', source_layer: 'acled', metadata: { urgency: 'high' } })).toBe('alert');
  });

  it('signal + no urgency → data_story', () => {
    expect(derivePostType({ pillar: 'signal', source_layer: 'acled', metadata: {} })).toBe('data_story');
  });

  it('pattern → data_story', () => {
    expect(derivePostType({ pillar: 'pattern', source_layer: 'cii', metadata: {} })).toBe('data_story');
  });

  it('product → cta', () => {
    expect(derivePostType({ pillar: 'product', source_layer: undefined, metadata: {} })).toBe('cta');
  });

  it('methodology → product_update', () => {
    expect(derivePostType({ pillar: 'methodology', source_layer: 'methodology', metadata: {} })).toBe('product_update');
  });

  it('product + release-notes source → product_update', () => {
    expect(derivePostType({ pillar: 'product', source_layer: 'release-notes', metadata: {} })).toBe('product_update');
  });

  it('context → data_story (default)', () => {
    expect(derivePostType({ pillar: 'context', source_layer: 'context-rotation', metadata: {} })).toBe('data_story');
  });
});
```

- [ ] **Step 2: Run the test — expect fail**

```bash
cd /Users/ethanstuart/Projects/nexus-watch
npx vitest run api/marketing/lib/topicSelector.test.ts 2>&1 | tail -20
```

Expected: FAIL — `derivePostType is not a function` or similar import error.

- [ ] **Step 3: Add `PostType` type and update `Topic` interface**

In `api/marketing/lib/topicSelector.ts`, after the imports (around line 14), add:

```typescript
export type PostType = 'alert' | 'data_story' | 'cta' | 'product_update';
```

Update the `Topic` interface (currently lines 21–30) to add `post_type`:

```typescript
export interface Topic {
  pillar: Pillar;
  topic_key: string;
  entity_keys: string[];
  hook: string;
  source_layer?: string;
  source_url?: string;
  metadata?: Record<string, unknown>;
  score: number;
  post_type: PostType;
}
```

- [ ] **Step 4: Add `derivePostType()` — exported for tests**

Add this function after the `CONTEXT_ROTATION` constant (around line 198):

```typescript
export function derivePostType(
  topic: Pick<Topic, 'pillar' | 'source_layer' | 'metadata'>,
): PostType {
  if (topic.pillar === 'signal' && topic.metadata?.urgency === 'high') return 'alert';
  if (topic.pillar === 'signal' || topic.pillar === 'pattern') return 'data_story';
  if (topic.source_layer === 'release-notes') return 'product_update';
  if (topic.pillar === 'product') return 'cta';
  if (topic.pillar === 'methodology') return 'product_update';
  return 'data_story';
}
```

- [ ] **Step 5: Add urgency detection in signal pillar candidate builder**

In `buildCandidateForPillar`, the `signal` case currently queries ACLED events. Add CII delta detection and urgency tagging.

Replace the `case 'signal':` block (currently ending around line 325) with:

```typescript
case 'signal': {
  // Pull CII countries with ≥5pt delta in 24h — these become urgency:high signals.
  const [currentCii, prevCii] = await Promise.all([
    sql`SELECT DISTINCT ON (country_code) country_code, country_name, score
        FROM country_cii_history ORDER BY country_code, timestamp DESC`.catch(() => [] as unknown[]),
    sql`SELECT DISTINCT ON (country_code) country_code, country_name, score
        FROM country_cii_history WHERE timestamp < NOW() - INTERVAL '20 hours'
        ORDER BY country_code, timestamp DESC`.catch(() => [] as unknown[]),
  ]);
  const prevCiiMap = new Map(
    (prevCii as Array<{ country_name: string; score: number }>).map((r) => [r.country_name, r.score]),
  );
  const highDeltaCountries = new Set(
    (currentCii as Array<{ country_name: string; score: number }>)
      .filter((r) => {
        const prev = prevCiiMap.get(r.country_name);
        return prev !== undefined && Math.abs(r.score - prev) >= 5;
      })
      .map((r) => r.country_name),
  );

  // Pull ACLED events from last 24h.
  const acled = (
    await sql`
      SELECT id, country, location, fatalities, event_type, source_url, occurred_at
      FROM acled_events
      WHERE occurred_at > NOW() - INTERVAL '24 hours'
        AND occurred_at < NOW() - INTERVAL '60 minutes'
      ORDER BY fatalities DESC NULLS LAST, occurred_at DESC
      LIMIT 5
    `.catch(() => [] as unknown[])
  ) as unknown as Array<{
    id: string;
    country: string;
    location: string;
    fatalities: number;
    event_type: string;
    source_url: string;
    occurred_at: string;
  }>;

  for (const e of acled) {
    const topic_key = `acled-${e.id}`;
    const entity_keys = [e.country];
    if (await isDedup(sql, topic_key, entity_keys)) continue;
    const urgency = highDeltaCountries.has(e.country) ? 'high' : undefined;
    const ciiRows = (currentCii as Array<{ country_name: string; score: number }>).filter(
      (r) => r.country_name === e.country,
    );
    const ciiScore = ciiRows[0]?.score;
    return {
      pillar,
      topic_key,
      entity_keys,
      hook: `${e.event_type} reported in ${e.location}, ${e.country} — ${e.fatalities} fatalities (via our ACLED layer).`,
      source_layer: 'acled',
      source_url: e.source_url,
      metadata: { occurred_at: e.occurred_at, fatalities: e.fatalities, urgency, cii_score: ciiScore },
      score: 100 + (e.fatalities ?? 0),
      post_type: derivePostType({ pillar, source_layer: 'acled', metadata: { urgency } }),
    };
  }

  // Fallback: CII-based signal topic if ACLED is empty but CII spiked.
  if (highDeltaCountries.size > 0) {
    const country = [...highDeltaCountries][0];
    const ciiRow = (currentCii as Array<{ country_name: string; score: number }>).find(
      (r) => r.country_name === country,
    );
    const topic_key = `cii-alert-${country}-${today}`;
    const entity_keys = [country];
    if (!(await isDedup(sql, topic_key, entity_keys))) {
      return {
        pillar,
        topic_key,
        entity_keys,
        hook: `${country}'s instability score jumped — CII is flagging significant change in the last 24 hours.`,
        source_layer: 'cii',
        metadata: { urgency: 'high', cii_score: ciiRow?.score },
        score: 95,
        post_type: 'alert',
      };
    }
  }

  return null;
}
```

- [ ] **Step 6: Add `post_type` to all other pillar candidate returns**

For `pattern` pillar (around line 349), add `post_type: derivePostType({ pillar, source_layer: 'cii', metadata: {} })` to the returned object:

```typescript
return {
  pillar,
  topic_key,
  entity_keys,
  hook: `${m.country_name} CII moved ${direction} ${Math.abs(m.score_delta_7d).toFixed(1)} points week-over-week to ${m.score.toFixed(1)}.`,
  source_layer: 'cii',
  metadata: { country_code: m.country_code, score: m.score, delta: m.score_delta_7d },
  score: 80 + Math.abs(m.score_delta_7d),
  post_type: derivePostType({ pillar, source_layer: 'cii', metadata: {} }),
};
```

For `methodology` pillar (around line 366), add `post_type`:

```typescript
return {
  pillar,
  topic_key: pick.key,
  entity_keys: [],
  hook: pick.hook,
  source_layer: 'methodology',
  score: 60,
  post_type: derivePostType({ pillar, source_layer: 'methodology', metadata: {} }),
};
```

For `product` pillar — release notes (around line 398):

```typescript
return {
  pillar,
  topic_key,
  entity_keys: [],
  hook: n.title,
  source_layer: 'release-notes',
  source_url: `https://nexuswatch.dev/whats-new#${n.slug}`,
  metadata: { body: n.body.slice(0, 500) },
  score: 70,
  post_type: derivePostType({ pillar, source_layer: 'release-notes', metadata: {} }),
};
```

For `context` pillar (around line 414):

```typescript
return {
  pillar,
  topic_key: pick.key,
  entity_keys: pick.entities,
  hook: pick.hook,
  source_layer: 'context-rotation',
  score: 50,
  post_type: derivePostType({ pillar, source_layer: 'context-rotation', metadata: {} }),
};
```

- [ ] **Step 7: Run tests — expect pass**

```bash
npx vitest run api/marketing/lib/topicSelector.test.ts 2>&1 | tail -10
```

Expected: all 7 tests PASS.

- [ ] **Step 8: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head -30
```

Expected: no errors on the modified file.

- [ ] **Step 9: Commit**

```bash
git add api/marketing/lib/topicSelector.ts api/marketing/lib/topicSelector.test.ts
git commit -m "feat: add PostType derivation and urgency detection to topicSelector"
```

---

## Task 3: contentGenerator.ts — per-type prompt injection

**Files:**
- Modify: `api/marketing/lib/contentGenerator.ts`
- Create: `api/marketing/lib/contentGenerator.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/marketing/lib/contentGenerator.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
// buildPostTypePrompt is not yet exported — will fail until Step 3.
import { buildPostTypePrompt } from './contentGenerator.js';

describe('buildPostTypePrompt', () => {
  it('alert: returns alert instructions', () => {
    const prompt = buildPostTypePrompt('alert', 'x');
    expect(prompt).toContain('POST TYPE: Alert');
    expect(prompt).toContain('≤280 characters');
    expect(prompt).toContain('nexuswatch.dev');
  });

  it('data_story x: returns X thread instructions', () => {
    const prompt = buildPostTypePrompt('data_story', 'x');
    expect(prompt).toContain('POST TYPE: Data Story');
    expect(prompt).toContain('3 tweets');
    expect(prompt).not.toContain('LinkedIn');
  });

  it('data_story linkedin: returns LinkedIn instructions with voice ratio', () => {
    const prompt = buildPostTypePrompt('data_story', 'linkedin');
    expect(prompt).toContain('POST TYPE: Data Story');
    expect(prompt).toContain('LinkedIn');
    expect(prompt).toContain('50/50 analyst/friend');
  });

  it('cta x: returns CTA X instructions', () => {
    const prompt = buildPostTypePrompt('cta', 'x');
    expect(prompt).toContain('POST TYPE: CTA');
    expect(prompt).toContain('≤280');
  });

  it('cta linkedin: returns CTA LinkedIn instructions', () => {
    const prompt = buildPostTypePrompt('cta', 'linkedin');
    expect(prompt).toContain('POST TYPE: CTA');
    expect(prompt).toContain('nexuswatch.dev/pricing');
    expect(prompt).not.toContain('excited to share');
  });

  it('product_update x: returns product update X instructions', () => {
    const prompt = buildPostTypePrompt('product_update', 'x');
    expect(prompt).toContain('POST TYPE: Product Update');
    expect(prompt).toContain('1–2 tweets');
  });

  it('product_update linkedin: returns product update LinkedIn instructions', () => {
    const prompt = buildPostTypePrompt('product_update', 'linkedin');
    expect(prompt).toContain('POST TYPE: Product Update');
    expect(prompt).toContain('150–300 words');
  });
});
```

- [ ] **Step 2: Run the test — expect fail**

```bash
npx vitest run api/marketing/lib/contentGenerator.test.ts 2>&1 | tail -10
```

Expected: FAIL — `buildPostTypePrompt is not a function`.

- [ ] **Step 3: Add `postType` to `GenerationRequest` and add `buildPostTypePrompt()`**

In `api/marketing/lib/contentGenerator.ts`:

1. Add import for `PostType` at the top (after existing imports):

```typescript
import type { PostType } from './topicSelector.js';
```

2. Update `GenerationRequest` interface (currently lines 45–52):

```typescript
export interface GenerationRequest {
  platform: Platform;
  topic: Topic;
  voiceProfile: VoiceProfile;
  postType: PostType;
  parentContent?: string;
  parentPlatform?: Platform;
}
```

3. Add `buildPostTypePrompt()` **exported** function after the `MAX_TOKENS_FOR_PLATFORM` constant (around line 43):

```typescript
export function buildPostTypePrompt(postType: PostType, platform: Platform): string {
  if (postType === 'alert') {
    return `POST TYPE: Alert
Lead with a number or a place name — never with "In" or "The."
Name the data layer that flagged this in the first sentence.
One concrete claim. Zero hedging language.
Single post only, ≤280 characters. End with nexuswatch.dev.
LinkedIn: write at 50/50 analyst/friend ratio.`;
  }

  if (postType === 'data_story' && platform === 'x') {
    return `POST TYPE: Data Story — X Thread (3 tweets)
Tweet 1: hook with a specific stat or observation.
Tweet 2: what the data layer actually shows — be specific about the source.
Tweet 3: why it matters right now + nexuswatch.dev.
Separate tweets with a blank line. No "🧵" opener.`;
  }

  if (postType === 'data_story' && platform === 'linkedin') {
    return `POST TYPE: Data Story — LinkedIn
LinkedIn: write at 50/50 analyst/friend ratio.
Line 1: one-sentence hook with a tension or a number. No preamble.
Paragraph 2: context (2–3 sentences, 40% analyst).
Bullet list: 3–4 observations, each grounded in a NexusWatch layer.
Closing line: one read or next step. No "thoughts?" No "agree or disagree?"
150–400 words total.`;
  }

  if (postType === 'cta' && platform === 'x') {
    return `POST TYPE: CTA — X
Show the product working, not the product existing.
One concrete intelligence example a reader can verify for free right now.
Soft close: "it's free to start" not "sign up."
Single post ≤280 chars. Include nexuswatch.dev.`;
  }

  if (postType === 'cta' && platform === 'linkedin') {
    return `POST TYPE: CTA — LinkedIn
LinkedIn: write at 50/50 analyst/friend ratio.
"We built X because Y" logic — lead with the problem, not the product.
One concrete example of NexusWatch solving it.
Soft close with nexuswatch.dev/pricing. 100–200 words.
No "excited to share." No "humbled."`;
  }

  if (postType === 'product_update' && platform === 'x') {
    return `POST TYPE: Product Update — X
One sentence: what we shipped. One sentence: why we built it.
Optional third sentence: what it unlocks for the reader.
1–2 tweets max. Include nexuswatch.dev.`;
  }

  if (postType === 'product_update' && platform === 'linkedin') {
    return `POST TYPE: Product Update — LinkedIn
LinkedIn: write at 50/50 analyst/friend ratio.
"We built X because Y" structure.
What it does in one sentence. The decision behind it in one paragraph.
What you can do with it now. nexuswatch.dev link. 150–300 words.`;
  }

  // Fallback for data_story on non-X/LinkedIn platforms
  return `POST TYPE: Data Story
Share one concrete intelligence finding. Be specific about the data source.
Include nexuswatch.dev.`;
}
```

- [ ] **Step 4: Inject `buildPostTypePrompt()` into `generateContent()`**

In `generateContent()`, the system prompt is built at line 150:
```typescript
const systemPrompt = req.voiceProfile.systemPrompt;
```

Replace that line with:

```typescript
const postTypePrompt = buildPostTypePrompt(req.postType, req.platform);
const systemPrompt = `${postTypePrompt}\n\n${req.voiceProfile.systemPrompt}`;
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npx vitest run api/marketing/lib/contentGenerator.test.ts 2>&1 | tail -10
```

Expected: all 7 tests PASS.

- [ ] **Step 6: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head -30
```

Expected: no errors (note: dispatcher.ts will now have a type error on `generateContent` call missing `postType` — this is expected and will be fixed in Task 5).

- [ ] **Step 7: Commit**

```bash
git add api/marketing/lib/contentGenerator.ts api/marketing/lib/contentGenerator.test.ts
git commit -m "feat: add per-type prompt injection to contentGenerator"
```

---

## Task 4: api/og/social.ts — add 4 post-type image templates

**Files:**
- Modify: `api/og/social.ts` (keep existing `cii-card`, `crisis`, `brand` templates — add 4 new ones)

> **Note:** This file already exists with an Edge Function handler and 3 templates. We are ADDING 4 new templates. Do not remove or rename existing templates.

- [ ] **Step 1: Update the handler to route new `type` values**

In `api/og/social.ts`, the handler currently (around lines 104–133) routes to `cii-card`, `crisis`, or brand default. Update it to also route the 4 new types:

```typescript
export default async function handler(req: VercelRequest) {
  const url = new URL(req.url!, 'https://nexuswatch.dev');
  const type = url.searchParams.get('type') || 'brand';
  const sizeParam = url.searchParams.get('size') || '1200x630';
  const [width, height] = sizeParam.split('x').map(Number);

  // Shared params for new post-type templates
  const rawTitle = url.searchParams.get('title') || 'NexusWatch Intelligence';
  const title = escapeHtml(rawTitle.slice(0, 80));
  const countryRaw = (url.searchParams.get('country') || '').toUpperCase().replace(/[^A-Z ]/g, '').slice(0, 40);
  const country = escapeHtml(countryRaw);
  const metric = escapeHtml(url.searchParams.get('metric') || '');
  const layer = escapeHtml(url.searchParams.get('layer') || '');
  const date = escapeHtml(url.searchParams.get('date') || new Date().toISOString().split('T')[0]);

  // Legacy params (kept for existing cii-card / crisis templates)
  const legacyCountry = (url.searchParams.get('country') || 'UA').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2);
  const countryName = escapeHtml(COUNTRY_NAMES[legacyCountry] || legacyCountry);
  const score = Math.max(0, Math.min(100, parseInt(url.searchParams.get('score') || '65', 10) || 0));
  const delta = Math.max(-100, Math.min(100, parseFloat(url.searchParams.get('delta') || '3') || 0));
  const signals = escapeHtml(url.searchParams.get('signals') || '');
  const today = new Date().toISOString().split('T')[0];

  let html: string;

  if (type === 'alert') {
    html = renderMarketingAlert(title, country, metric, layer, date);
  } else if (type === 'data_story') {
    html = renderMarketingDataStory(title, metric, layer, date);
  } else if (type === 'cta') {
    html = renderMarketingCta(title);
  } else if (type === 'product_update') {
    html = renderMarketingProductUpdate(title, date);
  } else if (type === 'cii-card') {
    html = renderCiiCard(legacyCountry, countryName, score, delta, today);
  } else if (type === 'crisis') {
    html = renderCrisisCard(legacyCountry, countryName, score, delta, signals, today);
  } else {
    html = renderBrandCard();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new ImageResponse(html as any, { width, height });
}
```

- [ ] **Step 2: Add the 4 new template render functions**

Add these functions after `renderBrandCard()` (end of file):

```typescript
function renderMarketingAlert(title: string, country: string, metric: string, layer: string, date: string): string {
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;background:#1a0505;padding:48px 64px;font-family:Inter,system-ui,sans-serif;">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span style="color:#ff6b35;font-size:16px;font-weight:700;letter-spacing:0.08em;">NEXUSWATCH</span>
      <span style="color:#fff;font-size:11px;font-weight:700;letter-spacing:0.14em;padding:4px 14px;background:#dc2626;border-radius:20px;">ALERT</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:12px;">
      ${country ? `<span style="color:#ff6b35;font-size:48px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;">${country}</span>` : ''}
      ${metric ? `<span style="color:#fff;font-size:72px;font-weight:700;line-height:1;">${metric}</span>` : ''}
      <span style="color:#e0e0e0;font-size:28px;font-weight:600;line-height:1.3;">${title}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      ${layer ? `<span style="color:#888;font-size:13px;letter-spacing:0.06em;">SOURCE: ${layer}</span>` : '<span></span>'}
      <span style="color:#ff6b35;font-size:13px;font-weight:600;">nexuswatch.dev</span>
    </div>
  </div>`;
}

function renderMarketingDataStory(title: string, metric: string, layer: string, date: string): string {
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;background:#0a0f1e;padding:48px 64px;font-family:Inter,system-ui,sans-serif;">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span style="color:#ff6600;font-size:16px;font-weight:700;letter-spacing:0.08em;">NEXUSWATCH</span>
      <span style="color:#3b82f6;font-size:12px;letter-spacing:0.1em;">${date}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:16px;">
      ${metric ? `<span style="color:#3b82f6;font-size:56px;font-weight:700;line-height:1;">${metric}</span>` : ''}
      <span style="color:#ededed;font-size:32px;font-weight:600;line-height:1.3;">${title}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      ${layer ? `<span style="color:#666;font-size:13px;letter-spacing:0.06em;">via ${layer}</span>` : '<span></span>'}
      <span style="color:#666;font-size:13px;">nexuswatch.dev</span>
    </div>
  </div>`;
}

function renderMarketingCta(valueProp: string): string {
  return `<div style="display:flex;flex-direction:column;justify-content:center;align-items:center;width:100%;height:100%;background:#0a0f1e;padding:48px;font-family:Inter,system-ui,sans-serif;gap:20px;">
    <span style="color:#ff6600;font-size:48px;font-weight:700;letter-spacing:0.08em;">NEXUSWATCH</span>
    <span style="color:#ededed;font-size:24px;font-weight:500;text-align:center;max-width:800px;">${valueProp}</span>
    <span style="color:#f59e0b;font-size:18px;font-weight:600;letter-spacing:0.04em;">Free to start · No credit card</span>
    <span style="color:#555;font-size:14px;margin-top:8px;">nexuswatch.dev</span>
  </div>`;
}

function renderMarketingProductUpdate(title: string, date: string): string {
  return `<div style="display:flex;flex-direction:column;justify-content:space-between;width:100%;height:100%;background:#0a0f1e;padding:48px 64px;font-family:Inter,system-ui,sans-serif;">
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <span style="color:#10b981;font-size:12px;font-weight:700;letter-spacing:0.12em;padding:4px 14px;background:#052e16;border:1px solid #10b981;border-radius:20px;">NOW LIVE</span>
      <span style="color:#ff6600;font-size:16px;font-weight:700;letter-spacing:0.08em;">NEXUSWATCH</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:16px;">
      <span style="color:#ededed;font-size:40px;font-weight:700;line-height:1.2;">${title}</span>
    </div>
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="color:#666;font-size:12px;">${date}</span>
      <span style="color:#10b981;font-size:13px;">nexuswatch.dev</span>
    </div>
  </div>`;
}
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit 2>&1 | grep 'og/social' | head -10
```

Expected: no errors.

- [ ] **Step 4: Smoke test the new endpoints manually**

Open in browser (requires `vercel dev` running):
```
http://localhost:3000/api/og/social?type=alert&title=Ukraine+instability+spike&country=Ukraine&metric=CII+84&layer=ACLED
http://localhost:3000/api/og/social?type=data_story&title=Taiwan+Strait+tensions+rising&metric=CII+71&layer=GDELT
http://localhost:3000/api/og/social?type=cta&title=158+countries.+Real-time+intelligence.
http://localhost:3000/api/og/social?type=product_update&title=AI+Analyst+now+covers+86+nations
```

Verify each returns a 1200×630 image with correct colors and layout.

- [ ] **Step 5: Commit**

```bash
git add api/og/social.ts
git commit -m "feat: add alert/data_story/cta/product_update image templates to /api/og/social"
```

---

## Task 5: config.ts + dispatcher.ts — kill switches, buildImageUrl, platform gate

**Files:**
- Modify: `api/marketing/lib/config.ts`
- Modify: `api/marketing/lib/dispatcher.ts`
- Create: `api/marketing/lib/dispatcher.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `api/marketing/lib/dispatcher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
// These are not yet exported — will fail until Step 3.
import { buildImageUrl, isPostTypeEnabled } from './dispatcher.js';
import type { Topic } from './topicSelector.js';

const baseTopic: Topic = {
  pillar: 'signal',
  topic_key: 'acled-123',
  entity_keys: ['Ukraine'],
  hook: 'Conflict reported in eastern Ukraine — ACLED flagging new frontline activity.',
  source_layer: 'acled',
  metadata: { urgency: 'high', cii_score: 84 },
  score: 110,
  post_type: 'alert',
};

describe('buildImageUrl', () => {
  it('alert: returns alert image URL with country, metric, layer', () => {
    const url = buildImageUrl('alert', baseTopic);
    expect(url).toContain('/api/og/social?type=alert');
    expect(url).toContain('country=Ukraine');
    expect(url).toContain('metric=CII+84');
    expect(url).toContain('layer=ACLED');
  });

  it('data_story: returns data_story URL', () => {
    const topic = { ...baseTopic, post_type: 'data_story' as const };
    const url = buildImageUrl('data_story', topic);
    expect(url).toContain('type=data_story');
  });

  it('cta: returns cta URL with default title', () => {
    const topic = { ...baseTopic, post_type: 'cta' as const };
    const url = buildImageUrl('cta', topic);
    expect(url).toContain('type=cta');
  });

  it('product_update: returns product_update URL', () => {
    const topic = { ...baseTopic, post_type: 'product_update' as const };
    const url = buildImageUrl('product_update', topic);
    expect(url).toContain('type=product_update');
  });
});

describe('isPostTypeEnabled', () => {
  it('returns true when kill switch is absent', () => {
    expect(isPostTypeEnabled({}, 'x', 'alert')).toBe(true);
  });

  it('returns false when kill switch explicitly false', () => {
    expect(isPostTypeEnabled({ 'x:alert': false }, 'x', 'alert')).toBe(false);
  });

  it('returns true when kill switch explicitly true', () => {
    expect(isPostTypeEnabled({ 'x:alert': true }, 'x', 'alert')).toBe(true);
  });

  it('does not cross platforms', () => {
    expect(isPostTypeEnabled({ 'x:alert': false }, 'linkedin', 'alert')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test — expect fail**

```bash
npx vitest run api/marketing/lib/dispatcher.test.ts 2>&1 | tail -10
```

Expected: FAIL — `buildImageUrl is not a function`.

- [ ] **Step 3: Add `killSwitches` and `ctaHeadline` to config.ts**

In `api/marketing/lib/config.ts`:

1. Add fields to `MarketingConfig` interface (after the `updatedBy` field):

```typescript
export interface MarketingConfig {
  cadence: Record<Platform, number>;
  pillarMix: Record<Pillar, number>;
  voiceKnobs: VoiceKnobs;
  embargo: EmbargoEntry[];
  version: number;
  updatedAt: string;
  updatedBy?: string;
  /**
   * Per-platform-per-type kill switches. Key: `${platform}:${post_type}`.
   * If absent or true → enabled. If false → skip this type on this platform.
   * Example: { "x:alert": false } disables alert posts on X only.
   */
  killSwitches?: Record<string, boolean>;
  /**
   * Optional CTA headline override. If set, the CTA post type uses this as
   * the hook instead of generating it dynamically. Editable via KV without deploy.
   */
  ctaHeadline?: string;
}
```

2. Update `DEFAULT_CONFIG` to include defaults:

After the existing `updatedAt` field in `DEFAULT_CONFIG`:
```typescript
killSwitches: {},
ctaHeadline: undefined,
```

3. Update `hydrate()` to merge the new fields:

In the `hydrate()` function return statement, add:
```typescript
killSwitches: typeof r.killSwitches === 'object' && r.killSwitches !== null ? (r.killSwitches as Record<string, boolean>) : {},
ctaHeadline: typeof r.ctaHeadline === 'string' ? r.ctaHeadline : undefined,
```

- [ ] **Step 4: Add exported helpers and `buildImageUrl()` to dispatcher.ts**

In `api/marketing/lib/dispatcher.ts`:

1. Add import for `PostType` at the top:

```typescript
import type { PostType } from './topicSelector.js';
```

2. Add two exported helper functions before `runDispatch()`:

```typescript
const BASE_URL = 'https://nexuswatch.dev';

export function buildImageUrl(postType: PostType, topic: Topic): string | undefined {
  const t = encodeURIComponent(topic.hook.slice(0, 80));
  const country = topic.entity_keys[0] ? `&country=${encodeURIComponent(topic.entity_keys[0])}` : '';
  const metric = topic.metadata?.cii_score
    ? `&metric=${encodeURIComponent(`CII ${topic.metadata.cii_score}`)}`
    : '';
  const layer = topic.source_layer
    ? `&layer=${encodeURIComponent(topic.source_layer.toUpperCase())}`
    : '';

  if (postType === 'alert') {
    return `${BASE_URL}/api/og/social?type=alert&title=${t}${country}${metric}${layer}`;
  }
  if (postType === 'data_story') {
    return `${BASE_URL}/api/og/social?type=data_story&title=${t}${layer}`;
  }
  if (postType === 'cta') {
    return `${BASE_URL}/api/og/social?type=cta&title=${encodeURIComponent('158 countries. Real-time intelligence.')}`;
  }
  if (postType === 'product_update') {
    return `${BASE_URL}/api/og/social?type=product_update&title=${t}`;
  }
  return undefined;
}

export function isPostTypeEnabled(
  killSwitches: Record<string, boolean> | undefined,
  platform: Platform,
  postType: PostType,
): boolean {
  if (!killSwitches) return true;
  const key = `${platform}:${postType}`;
  return killSwitches[key] !== false;
}
```

Also add the `Topic` import if not already there (it comes from topicSelector via the existing imports):

Check the existing dispatcher imports — `Topic` is used indirectly. Add explicit import if needed:

```typescript
import type { Topic } from './topicSelector.js';
```

- [ ] **Step 5: Run tests — expect pass**

```bash
npx vitest run api/marketing/lib/dispatcher.test.ts 2>&1 | tail -10
```

Expected: all 8 tests PASS.

- [ ] **Step 6: Wire everything into `runDispatch()`**

In `dispatcher.ts`, update `runDispatch()` in these exact spots:

**After `selectTopic()` call (currently around line 115), add platform gate for alerts:**

```typescript
const topic = await selectTopic(sql, platform);
if (!topic) {
  summary.reason = 'no_eligible_topic';
  await recordRun(platform);
  return summary;
}

// Platform gate: alert post type only goes to X.
if (topic.post_type === 'alert' && platform === 'linkedin') {
  summary.reason = 'alert_skipped_linkedin';
  await recordRun(platform);
  return summary;
}

summary.topic_key = topic.topic_key;
summary.pillar = topic.pillar;
```

**After `getConfig()` call (currently around line 85), add kill switch check:**

Add after the cadence cap block:

```typescript
// Per-type kill switch — checked after topic is selected.
// (We check it here to avoid burning an Anthropic token on a killed type.)
// NOTE: Kill switch check must come AFTER selectTopic() so we have post_type.
```

Actually, the kill switch check needs to come after topic selection. Move it there:

After the platform gate block above, add:

```typescript
// Per-platform-per-type kill switch from KV config.
if (!isPostTypeEnabled(cfg?.killSwitches, platform, topic.post_type)) {
  summary.reason = `kill_switch_${platform}:${topic.post_type}`;
  await recordRun(platform);
  return summary;
}
```

**For CTA headline from KV, before `generateContent()` call:**

```typescript
// CTA headline override from KV config — editable without deploy.
if (topic.post_type === 'cta' && cfg?.ctaHeadline) {
  topic.hook = cfg.ctaHeadline;
}
```

Note: `topic` is declared as `const` — change to `let topic` at the selectTopic call, or create a local mutable copy:

```typescript
let topic = await selectTopic(sql, platform);
```

**Update `generateContent()` call (currently line 134) to include `postType`:**

```typescript
const gen = await generateContent({ platform, topic, voiceProfile: voice, postType: topic.post_type });
```

**After voice eval, before the INSERT, compute `imageUrl`:**

Add after `summary.voice_passed = voicePassed;`:

```typescript
// Image URL: only for X posts. LinkedIn gets undefined (text-only performs better).
const imageUrl = platform === 'x' ? buildImageUrl(topic.post_type, topic) : undefined;
```

**Update INSERT to include `post_type` (currently lines 158–169):**

Change the INSERT column list and VALUES to include `post_type`:

```typescript
const insertRows = (await sql`
  INSERT INTO marketing_posts (
    platform, pillar, topic_key, entity_keys, format, content, metadata,
    status, shadow_mode, voice_score, voice_violations, scheduled_at, variant_id,
    post_type
  )
  VALUES (
    ${platform}, ${topic.pillar}, ${topic.topic_key}, ${topic.entity_keys},
    ${gen.format}, ${gen.content}, ${JSON.stringify({ source_url: topic.source_url, source_layer: topic.source_layer, rationale: gen.rationale, model: gen.model, input_tokens: gen.input_tokens, output_tokens: gen.output_tokens, variant: variant ? { experiment: variant.experiment_key, label: variant.label } : null })}::jsonb,
    ${status}, ${pf.shadow}, ${voiceScore}, ${voiceViolations}, NOW(), ${variant?.id ?? null},
    ${topic.post_type}
  )
  RETURNING id
`) as unknown as Array<{ id: number }>;
```

**Update `adapter.post()` call (currently line 183) to include `image_url`:**

```typescript
const result = await adapter.post(
  { content: gen.content, format: gen.format, image_url: imageUrl, metadata: { source_url: topic.source_url } },
  pf.shadow,
);
```

- [ ] **Step 7: Typecheck the full codebase**

```bash
npx tsc --noEmit 2>&1 | grep -v node_modules | head -40
```

Expected: no errors.

- [ ] **Step 8: Run all marketing tests**

```bash
npx vitest run api/marketing/lib/ 2>&1 | tail -20
```

Expected: all tests pass (topicSelector, contentGenerator, dispatcher).

- [ ] **Step 9: Run full validate**

```bash
npm run validate 2>&1 | tail -30
```

Expected: typecheck + lint + tests all pass.

- [ ] **Step 10: Commit**

```bash
git add api/marketing/lib/config.ts api/marketing/lib/dispatcher.ts api/marketing/lib/dispatcher.test.ts
git commit -m "feat: wire post_type system, kill switches, image URLs into dispatcher"
```

---

## Task 6: Smoke test + flip MARKETING_AUTOMATION_ENABLED

- [ ] **Step 1: Deploy to Vercel**

```bash
git push origin main
```

Wait for Vercel deployment to complete.

- [ ] **Step 2: Verify image endpoint in production**

Open in browser:
```
https://nexuswatch.dev/api/og/social?type=alert&title=Ukraine+CII+spike&country=Ukraine&metric=CII+84&layer=ACLED
https://nexuswatch.dev/api/og/social?type=data_story&title=Taiwan+tensions&layer=GDELT
https://nexuswatch.dev/api/og/social?type=cta&title=158+countries.+Real-time+intelligence.
https://nexuswatch.dev/api/og/social?type=product_update&title=AI+Analyst+now+covers+86+nations
```

Expected: each returns a properly branded 1200×630 PNG.

- [ ] **Step 3: Shadow mode smoke test**

Trigger one dispatch in shadow mode (MARKETING_AUTOMATION_ENABLED=true but shadow mode active) by hitting the marketing cron endpoint directly:

```bash
curl -X GET "https://nexuswatch.dev/api/cron/marketing-x" \
  -H "Authorization: Bearer $CRON_SECRET"
```

Check Vercel function logs. Confirm a `marketing_posts` row was inserted with a non-null `post_type`.

- [ ] **Step 4: Verify the DB row**

Via Neon console:
```sql
SELECT id, platform, post_type, status, shadow_mode, created_at
FROM marketing_posts
ORDER BY created_at DESC
LIMIT 5;
```

Expected: rows with `post_type` populated (not null).

- [ ] **Step 5: Flip the switch**

Once shadow mode results look correct, push `MARKETING_AUTOMATION_ENABLED=true` to Vercel:

```bash
vercel env add MARKETING_AUTOMATION_ENABLED production
# Enter: true
vercel --prod
```

- [ ] **Step 6: Watch first live Buffer queue entries**

Monitor Typefully or Buffer queue. Approve manually before anything posts publicly.

---

## Self-Review Against Spec

**Spec requirement → Task mapping:**

| Spec Requirement | Task | Status |
|---|---|---|
| `post_type` column in `marketing_posts` | Task 1 | ✅ |
| `PostType` type + `post_type` on `Topic` | Task 2 | ✅ |
| CII delta ≥5 → urgency: 'high' | Task 2 | ✅ |
| Platform gate: alert → X only | Task 5 | ✅ |
| `postType` on `GenerationRequest` | Task 3 | ✅ |
| Per-type + per-platform prompt injection | Task 3 | ✅ |
| LinkedIn voice ratio line (50/50) | Task 3 | ✅ (in all LinkedIn prompts) |
| `/api/og/social` — 4 new templates | Task 4 | ✅ |
| `buildImageUrl()` in dispatcher | Task 5 | ✅ |
| `image_url` passed to X adapter only | Task 5 | ✅ |
| `image_url: undefined` to LinkedIn | Task 5 | ✅ (platform === 'x' gate) |
| Per-platform-per-type KV kill switches | Task 5 | ✅ |
| CTA headline from KV config | Task 5 | ✅ |
| Voice eval: log but don't block | Existing code | ✅ (Jordan: C then A) |
| Send without image on `/api/og/social` failure | Existing adapter | ✅ (Riley: B — image is enhancement) |
| `MARKETING_AUTOMATION_ENABLED=true` | Task 6 | ✅ |

**Type consistency check:**
- `PostType` exported from `topicSelector.ts`, imported in `contentGenerator.ts` and `dispatcher.ts` ✅
- `buildPostTypePrompt(postType: PostType, platform: Platform)` matches call site in `generateContent` ✅
- `buildImageUrl(postType: PostType, topic: Topic)` matches call site in `runDispatch` ✅
- `isPostTypeEnabled(killSwitches, platform, postType)` matches `cfg?.killSwitches` usage ✅
- `Topic.post_type: PostType` (non-optional) — all 5 pillar return paths set it ✅
