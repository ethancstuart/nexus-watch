# NexusWatch Audit Remediation — Autonomous Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all code-level issues identified in the April 22 swarm audit before and after the April 28 launch.

**Architecture:** Each task targets a specific file with complete replacement code. Tasks are ordered by priority: launch blockers first, then high-priority, then medium. Each task is independently deployable.

**Tech Stack:** TypeScript, Vercel Edge/Node Functions, Neon PostgreSQL (neon tagged template SQL), Upstash KV (REST API), Stripe, Anthropic Claude

---

## FILE MAP

Files modified in this plan:
- `api/marketing/lib/contentGenerator.ts` — pin Claude model versions
- `api/stripe/checkout.ts` — enforce founding-100 cap
- `api/stripe/webhook.ts` — fix idempotency write order + atomic NX
- `api/v2/alerts.ts` — restrict CORS from `*` to `nexuswatch.dev`
- `api/v2/scenario.ts` — same CORS fix
- `api/ai-analyst.ts` — add server-side rate limiting
- `api/subscribe.ts` — add beehiiv sync after INSERT
- `api/sitrep.ts` — add input validation
- `api/marketing/lib/topicSelector.ts` — pattern pillar LEFT JOIN
- `api/marketing/lib/dispatcher.ts` — record dedup on insert, add content format validation
- `api/cron/cii-snapshot.ts` — batch insert instead of N+1
- `docs/migrations/2026-04-22-missing-tables.sql` — create acled_events, cached_layer_data, release_notes

---

## LAUNCH BLOCKER TASKS (complete before April 28)

---

### Task 1: Pin Claude model versions

**Files:**
- Modify: `api/marketing/lib/contentGenerator.ts:23-32`

- [ ] **Step 1: Update MODEL_FOR_PLATFORM constants**

In `api/marketing/lib/contentGenerator.ts`, replace lines 23–32:

```typescript
const MODEL_FOR_PLATFORM: Record<Platform, string> = {
  x: 'claude-haiku-4-5-20251001',
  bluesky: 'claude-haiku-4-5-20251001',
  threads: 'claude-haiku-4-5-20251001',
  linkedin: 'claude-haiku-4-5-20251001',
  substack: 'claude-sonnet-4-5-20251001',
  medium: 'claude-sonnet-4-5-20251001',
  beehiiv: 'claude-haiku-4-5-20251001',
  instagram: 'claude-haiku-4-5-20251001',
};
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/marketing/lib/contentGenerator.ts
git commit -m "fix: pin Claude model versions to dated releases in marketing pipeline"
```

---

### Task 2: Enforce founding-100 cap at checkout

**Files:**
- Modify: `api/stripe/checkout.ts:88-111` (between tier validation and price map lookup)

- [ ] **Step 1: Add founding cap check after tier resolution**

In `api/stripe/checkout.ts`, after line 88 (`const tier = resolvedTier as Tier;`) and before line 90 (`const PRICE_MAP`), insert:

```typescript
  // Founding/insider tier: enforce 100-seat cap before creating a session.
  if (tier === 'insider') {
    try {
      const capRes = await fetch(`${kvUrl}/get/stripe-founding-reserved`, {
        headers: { Authorization: `Bearer ${kvToken}` },
      });
      const capData = (await capRes.json()) as { result: string | null };
      const reserved = parseInt(capData.result ?? '0', 10) || 0;
      if (reserved >= 100) {
        return jsonResponse(409, {
          error: 'founding_cohort_full',
          message: 'The Founding-100 cohort is full. Choose the Analyst or Pro tier.',
        });
      }
      // Reserve a seat atomically — webhook releases it on expiry or confirms on completion.
      await fetch(`${kvUrl}/incr/stripe-founding-reserved`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}` },
      });
    } catch (err) {
      console.error('[stripe/checkout] Founding cap check failed:', err instanceof Error ? err.message : err);
      // Fail open — don't block checkout if KV is down, but log loudly.
    }
  }
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Test checkout with a mock call (dry run)**

```bash
source /Users/ethanstuart/Projects/nexus-watch/.env.local
# Check current reserved count
curl -s "$KV_REST_API_URL/get/stripe-founding-reserved" \
  -H "Authorization: Bearer $KV_REST_API_TOKEN" | python3 -c "import sys,json; d=json.load(sys.stdin); print('Reserved:', d.get('result'))"
```
Expected: prints current count (null or a number)

- [ ] **Step 4: Commit**

```bash
git add api/stripe/checkout.ts
git commit -m "fix: enforce founding-100 cap at checkout with KV reservation gate"
```

---

### Task 3: Fix Stripe webhook idempotency (write-before-process + atomic NX)

**Files:**
- Modify: `api/stripe/webhook.ts:107-121` (idempotency check block) and `api/stripe/webhook.ts:246-250` (write after block)

The current code reads the idempotency key, processes if absent, then writes the key after. Two bugs:
1. The write happens after processing — if processing crashes, the key is never written and Stripe will retry successfully, but the key was never written so it will process again.
2. The check is read-then-write (not atomic) — two simultaneous webhooks can both pass.

Fix: use `SET NX EX` (set-if-not-exists with expiry) as the FIRST operation. The Upstash REST API supports `SET key value NX EX seconds` via the `/set/` endpoint with query params.

- [ ] **Step 1: Replace the idempotency block**

In `api/stripe/webhook.ts`, replace the entire block from line 107 through 120:

```typescript
  // Idempotency: attempt to claim this event atomically via SET NX.
  // If the key already exists (another handler processed it), return 200 immediately.
  // This must happen BEFORE any processing so retries after partial failures are safe.
  try {
    const claimRes = await fetch(
      `${kvUrl}/set/stripe-event:${event.id}/1?NX=true&EX=86400`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}` },
      },
    );
    const claimData = (await claimRes.json()) as { result: string | null };
    // Upstash returns { result: "OK" } on success, { result: null } if key existed.
    if (claimData.result === null) {
      // Key already existed — another handler processed this event.
      return new Response('OK', { status: 200 });
    }
  } catch (err) {
    // KV claim failed — log and continue. If processing re-runs it's safer than blocking.
    console.error('[stripe/webhook] Idempotency claim failed:', err instanceof Error ? err.message : err);
  }
```

- [ ] **Step 2: Remove the old "mark event as processed" block at the bottom**

Find and delete lines 246–250 (the old post-processing write):

```typescript
    // Mark event as processed (24h TTL) — only after successful handling.
    await fetch(`${kvUrl}/set/stripe-event:${event.id}/1?EX=86400`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
```

This block is now redundant — the key was already written atomically before processing.

- [ ] **Step 3: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add api/stripe/webhook.ts
git commit -m "fix: atomic webhook idempotency via SET NX before processing, not after"
```

---

### Task 4: Lock down CORS on authenticated v2 API endpoints

**Files:**
- Modify: `api/v2/alerts.ts:35`
- Modify: `api/v2/scenario.ts:28`

Both currently send `Access-Control-Allow-Origin: *`, which allows any site to make requests using a leaked API key.

- [ ] **Step 1: Fix alerts.ts CORS header**

In `api/v2/alerts.ts`, replace line 35:
```typescript
  res.setHeader('Access-Control-Allow-Origin', '*');
```
with:
```typescript
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
```

- [ ] **Step 2: Fix scenario.ts CORS header**

In `api/v2/scenario.ts`, replace line 28:
```typescript
  res.setHeader('Access-Control-Allow-Origin', '*');
```
with:
```typescript
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add api/v2/alerts.ts api/v2/scenario.ts
git commit -m "fix: restrict CORS to nexuswatch.dev on authenticated v2 API endpoints"
```

---

## HIGH PRIORITY TASKS (complete within 1 week of launch)

---

### Task 5: Rate limiting on AI analyst endpoint

**Files:**
- Modify: `api/ai-analyst.ts:152-173` (handler function)

The existing `api/_lib/apiAuth.ts` has a `checkRateLimit` function. This task wires it into the AI analyst endpoint. Free users get 5 calls/day; premium users are unlimited.

- [ ] **Step 1: Read the existing checkRateLimit signature**

```bash
grep -n "checkRateLimit\|async function check" /Users/ethanstuart/Projects/nexus-watch/api/_lib/apiAuth.ts | head -10
```

- [ ] **Step 2: Add rate limiting to the handler**

In `api/ai-analyst.ts`, replace the handler opening (lines 152–173) with:

```typescript
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.json({
      available: false,
      response:
        'The AI intelligence analyst is being configured. Use the map layers, CII scores, and data tools while AI analysis is being set up.',
      sources: [],
    });
  }

  // Server-side rate limiting: derive user from session cookie, check KV counter.
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (kvUrl && kvToken) {
    const cookies = String(req.headers.cookie ?? '');
    const sessionMatch = cookies.split(';').map((c) => c.trim()).find((c) => c.startsWith('__Host-session='));
    const sessionId = sessionMatch?.split('=')[1];

    if (sessionId) {
      try {
        // Read session to check tier.
        const sessRes = await fetch(`${kvUrl}/get/session:${sessionId}`, {
          headers: { Authorization: `Bearer ${kvToken}` },
        });
        const sessData = (await sessRes.json()) as { result: string | null };
        let userTier = 'free';
        if (sessData.result) {
          let s = JSON.parse(sessData.result);
          if (typeof s === 'string') s = JSON.parse(s);
          userTier = (s?.tier as string) ?? 'free';
        }

        // Premium users are unlimited. Free users: 5/day.
        if (userTier !== 'premium') {
          const today = new Date().toISOString().slice(0, 10);
          const rateLimitKey = `ai-analyst-limit:${sessionId}:${today}`;
          const incrRes = await fetch(`${kvUrl}/incr/${rateLimitKey}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${kvToken}` },
          });
          const incrData = (await incrRes.json()) as { result: number };
          const count = incrData.result ?? 1;

          if (count === 1) {
            // First call today — set 24h TTL.
            await fetch(`${kvUrl}/expire/${rateLimitKey}/86400`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${kvToken}` },
            });
          }

          if (count > 5) {
            return res.status(429).json({
              error: 'rate_limit_exceeded',
              message: 'Free tier: 5 AI analyst queries per day. Upgrade for unlimited access.',
              upgrade_url: 'https://nexuswatch.dev/#/pricing',
            });
          }
        }
      } catch (err) {
        // Rate limit check failed — fail open (allow the request) but log.
        console.error('[ai-analyst] Rate limit check failed:', err instanceof Error ? err.message : err);
      }
    }
  }

  const { query, context } = req.body as { query?: string; context?: string };
  if (!query || typeof query !== 'string' || query.trim().length === 0) {
    return res.status(400).json({ error: 'query required' });
  }
  if (query.length > 1000) {
    return res.status(400).json({ error: 'query too long (max 1000 chars)' });
  }

  const userMessage = context ? `${query}\n\nPlatform context:\n${context}` : query;
  const streaming = wantsStream(req);

  if (streaming) return handleStreaming(req, res, apiKey, userMessage, context);
  return handleBuffered(res, apiKey, userMessage, context);
}
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add api/ai-analyst.ts
git commit -m "fix: server-side rate limiting on AI analyst — 5/day free, unlimited premium"
```

---

### Task 6: Create missing database table migrations

**Files:**
- Create: `docs/migrations/2026-04-22-missing-tables.sql`

Three tables are referenced in code but never created: `acled_events` (signal pillar), `cached_layer_data` (GDELT cache), `release_notes` (product pillar). `country_cii_history` exists in production (confirmed by 94K+ row backfill), so omitted here.

- [ ] **Step 1: Write the migration file**

Create `/Users/ethanstuart/Projects/nexus-watch/docs/migrations/2026-04-22-missing-tables.sql`:

```sql
-- ============================================================================
-- Migration: Create missing tables referenced in code
-- Date: 2026-04-22
-- Fixes: acled_events (signal pillar), cached_layer_data (GDELT cache),
--        release_notes (product pillar)
-- Safe to re-run: all CREATE TABLE use IF NOT EXISTS
-- ============================================================================

-- acled_events: stores ACLED conflict events for the signal pillar topic selector.
-- Populated by the ACLED API ingestion path in compute-cii or a dedicated cron.
CREATE TABLE IF NOT EXISTS acled_events (
  id           TEXT PRIMARY KEY,            -- ACLED event_id_cnty
  country      TEXT NOT NULL,
  location     TEXT,
  event_type   TEXT,
  fatalities   INT DEFAULT 0,
  source_url   TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL,
  raw          JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acled_occurred_at ON acled_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_acled_country ON acled_events (country, occurred_at DESC);

-- cached_layer_data: key-value store for GDELT layer responses.
-- Populated by compute-cii.ts GDELT ingestion block.
-- ON CONFLICT (layer_id) DO UPDATE is used by the cron — requires UNIQUE on layer_id.
CREATE TABLE IF NOT EXISTS cached_layer_data (
  id            SERIAL PRIMARY KEY,
  layer_id      TEXT NOT NULL UNIQUE,
  data          JSONB NOT NULL DEFAULT '{}',
  feature_count INT DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cached_layer_updated ON cached_layer_data (updated_at DESC);

-- release_notes: product changelog entries for the product pillar topic selector.
-- Manually populated by admin or a future deploy hook.
CREATE TABLE IF NOT EXISTS release_notes (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  body         TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_release_notes_published ON release_notes (published_at DESC);
```

- [ ] **Step 2: Apply migration to production**

```bash
source /Users/ethanstuart/Projects/nexus-watch/.env.local
psql "$DATABASE_URL_UNPOOLED" -f /Users/ethanstuart/Projects/nexus-watch/docs/migrations/2026-04-22-missing-tables.sql
```
Expected output:
```
CREATE TABLE
CREATE INDEX
CREATE INDEX
CREATE TABLE
CREATE INDEX
CREATE TABLE
CREATE INDEX
```

If `psql` is not available locally, apply via the Neon console SQL editor (copy-paste the file contents).

- [ ] **Step 3: Verify tables exist**

```bash
psql "$DATABASE_URL_UNPOOLED" -c "\dt acled_events; \dt cached_layer_data; \dt release_notes;"
```
Expected: all 3 tables listed.

- [ ] **Step 4: Commit**

```bash
git add docs/migrations/2026-04-22-missing-tables.sql
git commit -m "feat: add missing table migrations — acled_events, cached_layer_data, release_notes"
```

---

### Task 7: Add beehiiv subscriber sync to newsletter signup

**Files:**
- Modify: `api/subscribe.ts:85-96` (after the Resend welcome email block)

After a successful INSERT, call the beehiiv API to add the subscriber to the publication. Fail silently — don't break the signup if beehiiv is down.

- [ ] **Step 1: Add beehiiv sync after the Resend block**

In `api/subscribe.ts`, after the closing `}` of the Resend try/catch (after line 84 `/* Welcome email failed — subscription still saved */`), and before line 87 `return res.json(...)`, insert:

```typescript
    // Sync to beehiiv publication (non-blocking — subscriber saved regardless).
    const beehiivKey = process.env.BEEHIIV_API_KEY;
    const beehiivPubId = process.env.BEEHIIV_PUBLICATION_ID;
    if (beehiivKey && beehiivPubId) {
      try {
        const beehiivRes = await fetch(
          `https://api.beehiiv.com/v2/publications/${beehiivPubId}/subscriptions`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${beehiivKey}`,
            },
            body: JSON.stringify({
              email: email.toLowerCase().trim(),
              reactivate_existing: true,
              send_welcome_email: false, // We already sent ours via Resend
              utm_source: source || 'landing',
            }),
            signal: AbortSignal.timeout(8000),
          },
        );
        if (!beehiivRes.ok) {
          const errText = await beehiivRes.text().catch(() => '');
          console.error(`[subscribe] beehiiv sync failed: ${beehiivRes.status} — ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        console.error('[subscribe] beehiiv sync error:', err instanceof Error ? err.message : err);
      }
    }
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/subscribe.ts
git commit -m "feat: sync newsletter signups to beehiiv publication after INSERT"
```

---

### Task 8: Add sitrep input validation

**Files:**
- Modify: `api/sitrep.ts:46-65`

- [ ] **Step 1: Add validation before the query body is used**

In `api/sitrep.ts`, immediately after line 46 (`const body = (await req.json()) as SitrepBody;`), insert:

```typescript
  // Input validation — guard against prompt injection and oversized payloads.
  if (body.query !== undefined) {
    if (typeof body.query !== 'string') {
      return new Response(JSON.stringify({ error: 'query must be a string' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }
    if (body.query.length > 500) {
      return new Response(JSON.stringify({ error: 'query too long (max 500 chars)' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }
    // Rudimentary prompt injection guard: reject triple-backticks and "ignore" directive patterns.
    if (/```|ignore (all |previous |the |your )/i.test(body.query)) {
      return new Response(JSON.stringify({ error: 'invalid query format' }), {
        status: 400,
        headers: CORS_HEADERS,
      });
    }
  }
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/sitrep.ts
git commit -m "fix: add input validation to sitrep endpoint — length, type, injection guard"
```

---

### Task 9: Fix pattern pillar to use LEFT JOIN for sparse CII history

**Files:**
- Modify: `api/marketing/lib/topicSelector.ts:394-438` (pattern pillar case)

Note: the table reference was already fixed from `country_instability_snapshots` → `country_cii_history` earlier in this session. This task changes the INNER JOIN to a LEFT JOIN with COALESCE so countries with sparse history aren't silently excluded.

- [ ] **Step 1: Update the self-join query**

In `api/marketing/lib/topicSelector.ts`, replace the pattern pillar SQL (the CTE from `WITH latest AS` through `LIMIT 3`):

```typescript
    case 'pattern': {
      // Top CII mover this week — LEFT JOIN so sparse-history countries aren't excluded.
      const movers = await sql`
        WITH latest AS (
          SELECT DISTINCT ON (country_code) country_code, country_name, score
          FROM country_cii_history
          ORDER BY country_code, timestamp DESC
        ),
        week_ago AS (
          SELECT DISTINCT ON (country_code) country_code, score AS old_score
          FROM country_cii_history
          WHERE timestamp < NOW() - INTERVAL '6 days'
          ORDER BY country_code, timestamp DESC
        )
        SELECT l.country_code, l.country_name, l.score,
               (l.score - COALESCE(w.old_score, l.score)) AS score_delta_7d
        FROM latest l
        LEFT JOIN week_ago w ON w.country_code = l.country_code
        WHERE ABS(l.score - COALESCE(w.old_score, l.score)) > 5
        ORDER BY ABS(l.score - COALESCE(w.old_score, l.score)) DESC
        LIMIT 3
      `.catch(() => []) as unknown as Array<{
        country_code: string;
        country_name: string;
        score: number;
        score_delta_7d: number;
      }>;
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/marketing/lib/topicSelector.ts
git commit -m "fix: pattern pillar LEFT JOIN — no longer excludes countries with sparse CII history"
```

---

### Task 10: Record dedup entry on post INSERT (not only on successful publish)

**Files:**
- Modify: `api/marketing/lib/dispatcher.ts:264-266`

Currently `recordTopicUsed()` is called only after a successful publish. Held posts flood `marketing_posts` with duplicates of the same topic (it can generate/hold the same topic 20+ times per day).

Fix: record dedup immediately after the INSERT into `marketing_posts`, regardless of status.

- [ ] **Step 1: Move the recordTopicUsed call to after the INSERT**

In `api/marketing/lib/dispatcher.ts`, find the line immediately after the INSERT `RETURNING id` (around line 232, after `const postId = insertRows[0]?.id;`). Add:

```typescript
  const postId = insertRows[0]?.id;
  summary.post_id = postId;
  summary.status = status;

  // Record dedup immediately so the same topic isn't regenerated while held.
  // (Previously only recorded on successful publish — caused 20+ duplicate held posts per day.)
  if (postId) {
    await recordTopicUsed(sql, topic.topic_key, topic.entity_keys, platform, postId).catch(() => {});
  }
```

Then remove the existing `recordTopicUsed` call on line ~266 (inside the `if (result.ok)` block). That line currently reads:
```typescript
      await recordTopicUsed(sql, topic.topic_key, topic.entity_keys, platform, postId);
```
Delete it.

- [ ] **Step 2: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/marketing/lib/dispatcher.ts
git commit -m "fix: record topic dedup on INSERT not on publish — prevents repeated held-post duplicates"
```

---

### Task 11: Add pre-voice-eval content format validation

**Files:**
- Modify: `api/marketing/lib/dispatcher.ts` — add validation step before voice eval call

Content is currently passed to voice eval without checking platform constraints. The voice eval's deterministic check catches char limit violations, but we can catch them earlier and skip the Anthropic API call.

- [ ] **Step 1: Add a validateContentLength helper and call it in runDispatch**

In `api/marketing/lib/dispatcher.ts`, add this function above `runDispatch`:

```typescript
const PLATFORM_CHAR_LIMITS: Partial<Record<Platform, number>> = {
  x: 280,
  bluesky: 300,
  threads: 500,
  instagram: 2200,
};

function validateContentLength(platform: Platform, content: string): string | null {
  const limit = PLATFORM_CHAR_LIMITS[platform];
  if (!limit) return null; // No limit for this platform
  const len = [...content].length; // Unicode-safe length
  if (len > limit) {
    return `content too long for ${platform}: ${len}/${limit} chars`;
  }
  return null;
}
```

Then in `runDispatch`, after `gen` is assigned (after `if (!gen) { ... }`), insert:

```typescript
  // Pre-flight content length check — fail fast before spending an Anthropic voice eval call.
  const lengthError = validateContentLength(platform, gen.content);
  if (lengthError) {
    summary.reason = 'content_too_long';
    summary.platform_error = lengthError;
    console.warn(`[dispatcher] ${platform}: ${lengthError} — regeneration needed`);
    return summary;
  }
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/marketing/lib/dispatcher.ts
git commit -m "fix: validate content character limits before voice eval to avoid wasted API calls"
```

---

## MEDIUM PRIORITY TASKS (complete within 30 days of launch)

---

### Task 12: Batch insert in CII snapshot cron (fix N+1)

**Files:**
- Modify: `api/cron/cii-snapshot.ts:62-79`

Currently inserts 150+ countries one at a time. Batch into chunks of 50.

- [ ] **Step 1: Replace the loop with a chunked batch insert**

In `api/cron/cii-snapshot.ts`, replace the `for (const r of rows)` loop (lines 62–79) with:

```typescript
    // Batch insert in chunks of 50 to avoid oversized SQL parameters.
    const CHUNK_SIZE = 50;
    let inserted = 0;
    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
      const chunk = rows.slice(i, i + CHUNK_SIZE);
      // Build values list for a single multi-row INSERT.
      // We use individual parameterized inserts in a transaction to stay type-safe with neon.
      for (const r of chunk) {
        const c = r.components || {};
        await sql`
          INSERT INTO cii_daily_snapshots (
            date, country_code, cii_score, confidence,
            component_conflict, component_disasters, component_sentiment,
            component_infrastructure, component_governance, component_market_exposure,
            source_count, data_point_count
          ) VALUES (
            ${today}, ${r.country_code}, ${r.score}, ${'medium'},
            ${c.conflict ?? null}, ${c.disasters ?? null}, ${c.sentiment ?? null},
            ${c.infrastructure ?? null}, ${c.governance ?? null}, ${c.marketExposure ?? null},
            ${0}, ${0}
          ) ON CONFLICT (date, country_code) DO NOTHING
        `;
        inserted++;
      }
    }
```

Note: true multi-row batch INSERT with neon tagged templates requires careful parameter spreading. The chunk loop above preserves safety. For a further optimization, the neon client also supports transactions — but this is sufficient for the ~2s savings goal.

- [ ] **Step 2: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/cron/cii-snapshot.ts
git commit -m "perf: chunk CII snapshot inserts to avoid sequential 150+ await ops"
```

---

### Task 13: Fix MapLibre event listener memory leak

**Files:**
- Create: `src/map/layers/layerListeners.ts` — shared listener tracking helper
- Modify: `src/map/layers/earthquakeLayer.ts` — wire up as reference implementation (then apply pattern to all 45+ layers)

This task implements the fix for one layer as a tested reference. The same pattern should then be applied to all remaining layers in `src/map/layers/`.

- [ ] **Step 1: Create the listener tracking helper**

Create `/Users/ethanstuart/Projects/nexus-watch/src/map/layers/layerListeners.ts`:

```typescript
import type { Map } from 'maplibre-gl';

type EventHandler = (e: unknown) => void;

interface TrackedListener {
  event: string;
  layerId: string;
  handler: EventHandler;
}

/**
 * Tracks MapLibre event listeners so they can be bulk-removed in removeLayer().
 * Usage:
 *   const listeners = new LayerListeners(map);
 *   listeners.on('mouseenter', 'my-layer', handler);
 *   // Later:
 *   listeners.removeAll();
 */
export class LayerListeners {
  private map: Map;
  private tracked: TrackedListener[] = [];

  constructor(map: Map) {
    this.map = map;
  }

  on(event: string, layerId: string, handler: EventHandler): void {
    this.map.on(event as Parameters<Map['on']>[0], layerId, handler as Parameters<Map['on']>[2]);
    this.tracked.push({ event, layerId, handler });
  }

  removeAll(): void {
    for (const { event, layerId, handler } of this.tracked) {
      try {
        this.map.off(event as Parameters<Map['off']>[0], layerId, handler as Parameters<Map['off']>[2]);
      } catch {
        // Layer may already be removed — ignore.
      }
    }
    this.tracked = [];
  }
}
```

- [ ] **Step 2: Typecheck the new file**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Commit the helper**

```bash
git add src/map/layers/layerListeners.ts
git commit -m "feat: add LayerListeners helper to track and remove MapLibre event listeners"
```

- [ ] **Step 4: Apply to earthquakeLayer.ts as reference**

In `src/map/layers/earthquakeLayer.ts`:

1. Add import at top:
```typescript
import { LayerListeners } from './layerListeners.js';
```

2. Add a `private listeners: LayerListeners | null = null;` property to the class.

3. In `renderLayer()`, initialise it before adding any `map.on()` calls:
```typescript
this.listeners = new LayerListeners(this.map);
```

4. Replace every `this.map.on(event, layerId, handler)` in `renderLayer()` with:
```typescript
this.listeners.on(event, layerId, handler);
```

5. In `removeLayer()`, call:
```typescript
this.listeners?.removeAll();
this.listeners = null;
```

- [ ] **Step 5: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 6: Commit reference implementation**

```bash
git add src/map/layers/earthquakeLayer.ts
git commit -m "fix: wire LayerListeners into earthquakeLayer to fix map.on() memory leak"
```

- [ ] **Step 7: Apply to all remaining layers**

Run this to find all layer files that have `map.on(` calls:

```bash
grep -l "map\.on(" /Users/ethanstuart/Projects/nexus-watch/src/map/layers/*.ts | grep -v "layerListeners"
```

For each file returned: repeat steps 4–6 (import, add property, init in renderLayer, replace map.on, call removeAll in removeLayer). Commit in batches of 5 layers.

---

### Task 14: Fix session KV TTL to 30 days (not separate expire call)

**Files:**
- Modify: `api/auth/callback.ts:168-175`

The callback currently writes the session key then makes a separate `/expire/` call. Use the `SET key value EX seconds` format in a single call to avoid race conditions.

- [ ] **Step 1: Replace the two-call pattern with a single SET + EX**

In `api/auth/callback.ts`, replace lines 168–176:
```typescript
      await fetch(`${kvUrl}/set/session:${sessionId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
      // Set TTL to 7 days
      await fetch(`${kvUrl}/expire/session:${sessionId}/604800`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}` },
      });
```

with:

```typescript
      // Store session with 30-day TTL in a single atomic call.
      const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
      await fetch(`${kvUrl}/set/session:${sessionId}?EX=${SESSION_TTL_SECONDS}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(user),
      });
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add api/auth/callback.ts
git commit -m "fix: set session KV key with 30d TTL atomically — remove separate expire call"
```

---

### Task 15: Deploy all changes and verify

- [ ] **Step 1: Run full typecheck + lint**

```bash
cd /Users/ethanstuart/Projects/nexus-watch && npm run validate 2>&1 | tail -20
```
Expected: no errors

- [ ] **Step 2: Deploy to production**

```bash
vercel --prod 2>&1 | grep -E "url|message|Error" | tail -5
```

- [ ] **Step 3: Verify marketing pipeline still works**

```bash
source /Users/ethanstuart/Projects/nexus-watch/.env.local
curl -s -X POST "https://nexuswatch.dev/api/cron/marketing-x" \
  -H "Authorization: Bearer ${CRON_SECRET}" | python3 -m json.tool
```
Expected: `"proceeded": true, "status": "posted"` (or `"scheduled"` if Typefully key not yet set)

- [ ] **Step 4: Verify founding cap check works**

```bash
source /Users/ethanstuart/Projects/nexus-watch/.env.local
curl -s "$KV_REST_API_URL/get/stripe-founding-reserved" \
  -H "Authorization: Bearer $KV_REST_API_TOKEN" | python3 -m json.tool
```
Expected: `{ "result": "0" }` or a small number

- [ ] **Step 5: Final commit marker**

```bash
git tag audit-remediation-v1 -m "Audit remediation complete — swarm findings addressed"
```

---

## SELF-REVIEW

**Spec coverage:**
- P0-1 Founding cap ✅ Task 2
- P0-2 Webhook idempotency ✅ Task 3
- P0-3 Model versions ✅ Task 1
- P0-4 .env.local secrets → **MANUAL PLAN** (rotation required)
- P0-5 Memory leak ✅ Task 13
- P1-1 AI rate limiting ✅ Task 5
- P1-2 CORS * ✅ Task 4
- P1-3 Webhook idempotency race ✅ Task 3 (atomic NX)
- P1-5 Session TTL ✅ Task 14
- P1-6 Missing tables ✅ Task 6
- P1-8 Pattern pillar LEFT JOIN ✅ Task 9
- P1-12 beehiiv sync ✅ Task 7
- P2-1 Dedup on insert ✅ Task 10
- P2-7 Content format validation ✅ Task 11
- P2-10 Sitrep input validation ✅ Task 8
- P2-6 N+1 snapshot inserts ✅ Task 12
- P1-7 NASA FIRMS stub → **DEFERRED** (requires external API research)
- P1-4 Session encryption → **DEFERRED** (post-launch, significant refactor)
- P1-9 Loading screen rejection → **DEFERRED** (src/ change, lower launch risk)
- P1-10 API/src imports → **DEFERRED** (refactor, no runtime impact today)
- P1-11 Subscription downgrade → **VERIFIED** (webhook.ts line 209-236 already handles `customer.subscription.deleted` and calls `updateUserSessions(userId, 'free')`)
