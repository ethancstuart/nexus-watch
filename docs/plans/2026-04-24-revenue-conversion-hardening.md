# Revenue Conversion System — Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all bugs surfaced by the QA swarm across the revenue conversion system — covering critical data integrity, security vulnerabilities, and UX failures — without breaking any existing functionality. Launch readiness by April 28.

**Architecture:** 8 tasks across 7 files + 1 migration. Tasks 1–4 are API/backend and must run in order (migration first, then webhook, then cron, then founding-status). Tasks 5–7 are frontend and are independent of each other but depend on Task 6 (founding-status adds `active` field). Task 8 is a final validation deploy. All changes go directly to main.

**Tech Stack:** Vite + vanilla TypeScript, Vercel Edge + Node Functions, Upstash KV (REST), Neon PostgreSQL (`@neondatabase/serverless` HTTP mode), Stripe (raw fetch), Resend (raw fetch)

**Bugs fixed:** C1 (idempotency pre-claim), C2 (no ON CONFLICT), C3 (no SKIP LOCKED), C4 (XSS innerHTML), H1 (founding paidTier mismatch), H2 (email field lost on renewal), H3 (CRON_SECRET fail-open), H4 (self-referral), H5 (localStorage crash), H6 (modal steps don't dismiss), H7 (59-min welcome email delay), P1 (ref param persists in URL), P2 (sessionStorage cross-tab loss), P3 (email in Stripe description), P4 (reserved vs active member number), P5 (infinite retry), P6 (empty referredBy always sent)

---

## File Map

| File | Action | Changes |
|------|--------|---------|
| `docs/migrations/2026-04-24-scheduled-emails-hardening.sql` | Create | Add `claimed_at`, `retry_count`, `last_error`; add UNIQUE(user_id, template) |
| `api/stripe/webhook.ts` | Modify | Two-phase idempotency, ON CONFLICT, founding fix, email preservation, self-referral guard, strip PII from credit description, send welcome_d0 immediately |
| `api/cron/scheduled-emails.ts` | Modify | Fail-closed CRON_SECRET, atomic row claiming, KV key encoding fix, retry cap, skip welcome_d0 |
| `api/stripe/founding-status.ts` | Modify | Also read `stripe-founding-active`, return `active` field |
| `src/ui/welcomeModal.ts` | Modify | DOM construction (XSS fix), localStorage try/catch, steps 1+2 dismiss, use `active` for member number |
| `src/pages/landing.ts` | Modify | replaceState after ref capture, switch to localStorage |
| `src/pages/pricing.ts` | Modify | Omit referredBy when absent, read localStorage instead of sessionStorage |

---

## Task 1: Migration — `scheduled_emails` Schema Hardening

**Files:**
- Create: `docs/migrations/2026-04-24-scheduled-emails-hardening.sql`

Adds four changes to the existing `scheduled_emails` table: (1) `claimed_at` for atomic row claiming by the cron, (2) `retry_count` + `last_error` for permanent failure tracking, (3) UNIQUE constraint to prevent duplicate email rows on webhook retry.

- [ ] **Step 1: Write the migration file**

```sql
-- 2026-04-24: scheduled_emails hardening
-- Run via: node -e (same pattern as initial migration)

-- Atomic cron row claiming (prevents duplicate sends under concurrent invocations)
ALTER TABLE scheduled_emails
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Retry tracking (prevents infinite retries on permanent Resend failures)
ALTER TABLE scheduled_emails
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE scheduled_emails
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Idempotency: prevents duplicate rows on Stripe webhook retry
-- ON CONFLICT DO NOTHING in the INSERT references this constraint.
ALTER TABLE scheduled_emails
  ADD CONSTRAINT IF NOT EXISTS scheduled_emails_user_template_unique
  UNIQUE (user_id, template);

-- Update partial index to also exclude rows past retry cap and claimed rows
DROP INDEX IF EXISTS scheduled_emails_send_at_idx;
CREATE INDEX IF NOT EXISTS scheduled_emails_due_idx
  ON scheduled_emails (send_at)
  WHERE sent_at IS NULL AND retry_count < 5;
```

- [ ] **Step 2: Pre-flight deduplication check (required before UNIQUE constraint)**

The UNIQUE constraint will fail if duplicate (user_id, template) rows exist from test webhook events. Delete extras first, keeping the oldest row per pair:

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
async function run() {
  const dupes = await sql\`
    SELECT user_id, template, COUNT(*) as cnt
    FROM scheduled_emails
    GROUP BY user_id, template
    HAVING COUNT(*) > 1
  \`;
  if (dupes.length > 0) {
    console.log('Duplicates found, deduplicating:', JSON.stringify(dupes));
    await sql\`
      DELETE FROM scheduled_emails
      WHERE id NOT IN (
        SELECT MIN(id) FROM scheduled_emails GROUP BY user_id, template
      )
    \`;
    console.log('Deduplicated.');
  } else {
    console.log('No duplicates — safe to proceed.');
  }
}
run().catch(e => { console.error(e.message); process.exit(1); });
"
```

- [ ] **Step 3: Apply migration to production Neon database**

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
async function run() {
  await sql\`ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ\`;
  await sql\`ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0\`;
  await sql\`ALTER TABLE scheduled_emails ADD COLUMN IF NOT EXISTS last_error TEXT\`;
  await sql\`
    DO \$\$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'scheduled_emails_user_template_unique'
      ) THEN
        ALTER TABLE scheduled_emails
          ADD CONSTRAINT scheduled_emails_user_template_unique UNIQUE (user_id, template);
      END IF;
    END \$\$
  \`;
  await sql\`DROP INDEX IF EXISTS scheduled_emails_send_at_idx\`;
  await sql\`
    CREATE INDEX IF NOT EXISTS scheduled_emails_due_idx
    ON scheduled_emails (send_at)
    WHERE sent_at IS NULL AND retry_count < 5
  \`;
  const cols = await sql\`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'scheduled_emails' ORDER BY ordinal_position
  \`;
  console.log('Columns:', cols.map(r => r.column_name).join(', '));
}
run().catch(e => { console.error(e.message); process.exit(1); });
"
```

Expected output: `Columns: id, user_id, email, tier, template, send_at, sent_at, created_at, claimed_at, retry_count, last_error`

- [ ] **Step 4: Verify the UNIQUE constraint and index exist**

```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
async function run() {
  const constraints = await sql\`
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'scheduled_emails'::regclass AND contype = 'u'
  \`;
  const indexes = await sql\`
    SELECT indexname FROM pg_indexes WHERE tablename = 'scheduled_emails'
  \`;
  console.log('Constraints:', constraints.map(r => r.conname).join(', '));
  console.log('Indexes:', indexes.map(r => r.indexname).join(', '));
}
run().catch(e => { console.error(e.message); process.exit(1); });
"
```

Expected: constraints includes `scheduled_emails_user_template_unique`, indexes includes `scheduled_emails_due_idx`.

- [ ] **Step 5: Commit**

```bash
git add docs/migrations/2026-04-24-scheduled-emails-hardening.sql
git commit -m "feat: scheduled_emails schema hardening — claimed_at, retry_count, unique constraint (Task 1)"
```

---

## Task 2: `api/stripe/webhook.ts` — 7 Bug Fixes

**Files:**
- Modify: `api/stripe/webhook.ts`

Seven fixes in one file. Read the full file before editing.

**Fix inventory:**
- **C1** — Idempotency: two-phase (lock key EX=60s prevents concurrent duplicates; permanent key written only on success, so Stripe retries work on transient failures)
- **C2** — `scheduled_emails` INSERT: add `ON CONFLICT (user_id, template) DO NOTHING`; remove `welcome_d0` row (now sent immediately)
- **H1** — `subscription.deleted`: `'founding'` → `'insider'` in `wasFounding` check
- **H2** — `subscription.updated`: read existing `email` from KV before overwriting, re-include it in the write
- **H4** — Self-referral guard: skip if `referrerId === userId`
- **P3** — Stripe credit description: remove subscriber email, use generic string
- **H7** — Send `welcome_d0` email immediately via Resend inside `checkout.session.completed`, wrapped in its own try/catch

- [ ] **Step 1: Replace the idempotency block (C1)**

Find the current idempotency block (lines ~109–123):
```typescript
  // Idempotency: attempt to claim this event atomically via SET NX.
  // If the key already exists, return 200 immediately without processing.
  try {
    const claimRes = await fetch(`${kvUrl}/set/stripe-event:${event.id}/1?NX=true&EX=86400`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const claimData = (await claimRes.json()) as { result: string | null };
    // Upstash returns { result: "OK" } on success, { result: null } if key existed.
    if (claimData.result === null) {
      return new Response('OK', { status: 200 });
    }
  } catch (err) {
    console.error('[stripe/webhook] Idempotency claim failed:', err instanceof Error ? err.message : err);
  }
```

Replace with two-phase idempotency. The lock key (EX=60) blocks concurrent duplicates. The permanent key is written after successful processing:

```typescript
  // Phase 1: check permanent idempotency key (already processed successfully)
  try {
    const doneRes = await fetch(`${kvUrl}/get/stripe-event:${event.id}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const doneData = (await doneRes.json()) as { result: string | null };
    if (doneData.result !== null) {
      return new Response('OK', { status: 200 }); // already processed
    }
  } catch (err) {
    console.error('[stripe/webhook] Idempotency check failed:', err instanceof Error ? err.message : err);
    // Continue — a failed read should not block processing
  }

  // Phase 2: acquire short-lived lock to prevent concurrent duplicate processing.
  // Lock expires in 60s. On transient processing failure (500), Stripe retries
  // after ~30s minimum, so the lock will have expired and the retry can proceed.
  try {
    const lockRes = await fetch(`${kvUrl}/set/stripe-lock:${event.id}/1?NX=true&EX=60`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const lockData = (await lockRes.json()) as { result: string | null };
    if (lockData.result === null) {
      return new Response('OK', { status: 200 }); // concurrent duplicate, skip
    }
  } catch (err) {
    console.error('[stripe/webhook] Lock acquisition failed:', err instanceof Error ? err.message : err);
    // Continue — a failed lock should not block processing
  }
```

Then at the very end of the function, before the final `return new Response('OK', ...)`, add:

```typescript
  // Write permanent idempotency key only after successful processing.
  // On processing failure the handler returns 500 (above), so this line is
  // never reached — the lock expires in 60s and Stripe's retry can re-process.
  try {
    await fetch(`${kvUrl}/set/stripe-event:${event.id}/1?NX=true&EX=86400`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
  } catch {
    // Non-fatal — worst case is re-processing a duplicate event
  }

  return new Response('OK', { status: 200 });
```

Remove the old `return new Response('OK', { status: 200 });` at the previous end of the function.

- [ ] **Step 2: Fix `scheduled_emails` INSERT — remove welcome_d0, add ON CONFLICT (C2 + H7 setup)**

Find the INSERT block (lines ~181–186):
```typescript
            await sql`
              INSERT INTO scheduled_emails (user_id, email, tier, template, send_at) VALUES
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'welcome_d0', NOW()),
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'nudge_d3',   NOW() + INTERVAL '3 days'),
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'upgrade_d7', NOW() + INTERVAL '7 days')
            `;
```

Replace with (removes `welcome_d0` row — it will be sent immediately below; adds ON CONFLICT guard):
```typescript
            await sql`
              INSERT INTO scheduled_emails (user_id, email, tier, template, send_at) VALUES
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'nudge_d3',   NOW() + INTERVAL '3 days'),
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'upgrade_d7', NOW() + INTERVAL '7 days')
              ON CONFLICT (user_id, template) DO NOTHING
            `;
```

- [ ] **Step 3: Send `welcome_d0` email immediately with cron fallback (H7)**

The pattern: try to send immediately via Resend. If it succeeds, mark the scheduled row `sent_at = NOW()` so the cron skips it. If it fails, the cron row remains unclaimed and the cron picks it up within 60 minutes.

The `scheduled_emails` INSERT block from Step 2 already inserts `nudge_d3` and `upgrade_d7`. Now also insert `welcome_d0` as a fallback row (cron will skip it if `sent_at` is already set):

**Modify Step 2's INSERT to include welcome_d0 as a fallback row:**
```typescript
            await sql`
              INSERT INTO scheduled_emails (user_id, email, tier, template, send_at) VALUES
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'welcome_d0',  NOW()),
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'nudge_d3',   NOW() + INTERVAL '3 days'),
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'upgrade_d7', NOW() + INTERVAL '7 days')
              ON CONFLICT (user_id, template) DO NOTHING
            `;
```

Then immediately after the scheduled_emails try/catch block, attempt immediate Resend send. On success, mark the cron row sent:

```typescript
        // Attempt to send welcome_d0 immediately. On success, mark the cron row
        // sent_at = NOW() so it won't be picked up by the hourly cron.
        // On failure, the cron row remains and the cron delivers it within 60 minutes.
        const resendKey = process.env.RESEND_API_KEY;
        if (resendKey && sessionEmailRaw) {
          const activeTier = tierMeta || 'insider';
          try {
            const welcomeRes = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
              signal: AbortSignal.timeout(15000),
              body: JSON.stringify({
                from: 'NexusWatch <hello@nexuswatch.dev>',
                to: sessionEmailRaw,
                subject: "You're in — here's what NexusWatch shows right now",
                html: `<div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:32px;max-width:600px;margin:0 auto;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#22c55e;margin-bottom:24px;">NEXUSWATCH</div><h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px;">Welcome to NexusWatch.</h1><p style="font-size:14px;color:#888;line-height:1.6;margin:0 0 24px;">Your ${activeTier} access is active. Three things to do right now:</p><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:12px;"><a href="https://nexuswatch.dev/#/intel" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Open the Intel Map</a><p style="font-size:12px;color:#666;margin:4px 0 0;">45+ live layers. 150+ countries. Add your first watchlist country.</p></div><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:12px;"><a href="https://nexuswatch.dev/#/intel?open=ai-terminal" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Run a Sitrep</a><p style="font-size:12px;color:#666;margin:4px 0 0;">Ask the AI analyst: "What's the current situation in [region]?"</p></div><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:24px;"><a href="https://nexuswatch.dev/#/briefs" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Read the Brief Archive</a><p style="font-size:12px;color:#666;margin:4px 0 0;">Daily intelligence briefs, every morning.</p></div><p style="font-size:11px;color:#555;margin:0;">NexusWatch — nexuswatch.dev</p></div>`,
              }),
            });
            if (welcomeRes.ok) {
              await sql`UPDATE scheduled_emails SET sent_at = NOW() WHERE user_id = ${userId} AND template = 'welcome_d0' AND sent_at IS NULL`;
              console.log(`[stripe/webhook] welcome_d0 sent immediately to ${sessionEmailRaw}`);
            } else {
              console.warn(`[stripe/webhook] welcome_d0 send failed (${welcomeRes.status}), cron fallback active`);
            }
          } catch (err) {
            console.warn('[stripe/webhook] welcome_d0 send failed (exception), cron fallback active:', err instanceof Error ? err.message : err);
          }
        }
```

- [ ] **Step 4: Add self-referral guard (H4)**

Find the referral attribution block (line ~193–196):
```typescript
        const referredBy = metadata.referredBy as string | undefined;
        if (referredBy && referredBy.trim()) {
          const referrerId = referredBy.trim();
          if (!/^[\w-]{1,128}$/.test(referrerId)) {
```

Add self-referral check after the regex check:
```typescript
        const referredBy = metadata.referredBy as string | undefined;
        if (referredBy && referredBy.trim()) {
          const referrerId = referredBy.trim();
          if (!/^[\w-]{1,128}$/.test(referrerId)) {
            console.warn('[stripe/webhook] Skipping referral: suspicious referrerId format:', referrerId);
          } else if (referrerId === userId) {
            console.warn('[stripe/webhook] Skipping self-referral for user:', userId);
          } else {
```

Ensure the closing `}` for the `else` block aligns with the existing catch block. The referral attribution logic (`kvIncr`, `kvSet`, Phase 2 credit) now sits inside the `else` branch.

- [ ] **Step 5: Strip subscriber email from Stripe credit description (P3)**

Find (line ~222):
```typescript
                        description: `Referral credit — ${encodeURIComponent(sessionEmailRaw)} converted`,
```

Replace with:
```typescript
                        description: 'NexusWatch referral conversion',
```

- [ ] **Step 6: Fix `subscription.updated` to preserve email (H2)**

Find the `subscription.updated` case, specifically the `kvSet` call (lines ~287–292):
```typescript
        await kvSet(kvUrl, kvToken, `stripe:${userId}`, {
          customerId,
          subscriptionId: subscription.id as string,
          status,
          paidTier,
        });
```

The `existing` read just above already fetches the record. Extend the `existing` type and preserve the email:
```typescript
        const existing = await kvGetJson<{
          paidTier?: 'insider' | 'analyst' | 'pro' | 'founding';
          email?: string;
        }>(kvUrl, kvToken, `stripe:${userId}`);
        const paidTier = existing?.paidTier;
        const existingEmail = existing?.email ?? '';

        const tier = status === 'active' || status === 'trialing' ? 'premium' : 'free';
        await kvSet(kvUrl, kvToken, `stripe:${userId}`, {
          customerId,
          subscriptionId: subscription.id as string,
          status,
          paidTier,
          email: existingEmail,
        });
```

- [ ] **Step 7: Fix `subscription.deleted` founding check (H1)**

Find (line ~310):
```typescript
        const wasFounding = existing?.paidTier === 'founding';
```

Replace with:
```typescript
        const wasFounding = existing?.paidTier === 'insider' || existing?.paidTier === 'founding';
```

The `'founding'` is kept for any legacy records that may have been written before the rename.

- [ ] **Step 8: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.api.json
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add api/stripe/webhook.ts
git commit -m "fix: webhook hardening — two-phase idempotency, ON CONFLICT, founding paidTier, email preservation, self-referral guard, immediate welcome email (Task 2)"
```

---

## Task 3: `api/cron/scheduled-emails.ts` — 4 Bug Fixes

**Files:**
- Modify: `api/cron/scheduled-emails.ts`

**Fix inventory:**
- **H3** — CRON_SECRET fail-closed
- **C3** — Atomic row claiming via UPDATE...RETURNING with claimed_at (prevents duplicate sends)
- **BUG-15** — KV key encoding: `encodeURIComponent` must wrap full key including `stripe:` prefix
- **P5** — Retry cap: skip rows with `retry_count >= 5`, increment on Resend failure

The cron no longer processes `welcome_d0` (sent immediately by webhook). The SQL query uses `UPDATE...SET claimed_at = NOW()...RETURNING` to atomically claim rows before processing.

- [ ] **Step 1: Fix CRON_SECRET guard to fail-closed (H3)**

Find (lines ~53–56):
```typescript
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
```

Replace with:
```typescript
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
```

- [ ] **Step 2: Replace the SQL SELECT with atomic UPDATE...RETURNING (C3)**

The current query:
```typescript
  const dueEmails = (await sql`
    SELECT id, user_id, email, tier, template
    FROM scheduled_emails
    WHERE send_at <= NOW() AND sent_at IS NULL
    ORDER BY send_at ASC
    LIMIT 100
  `) as ScheduledEmail[];
```

Replace with an atomic claim query. This marks rows as claimed before processing, preventing two concurrent cron invocations from processing the same rows. Claims expire after 10 minutes (handles worker crash recovery). Also excludes `welcome_d0` (now sent by webhook) and rows past retry cap:

```typescript
  const dueEmails = (await sql`
    UPDATE scheduled_emails
    SET claimed_at = NOW()
    WHERE id IN (
      SELECT id FROM scheduled_emails
      WHERE send_at <= NOW()
        AND sent_at IS NULL
        AND retry_count < 5
        AND (claimed_at IS NULL OR claimed_at < NOW() - INTERVAL '10 minutes')
      ORDER BY send_at ASC
      LIMIT 50
    )
    RETURNING id, user_id, email, tier, template
  `) as ScheduledEmail[];
  // Note: welcome_d0 rows with sent_at IS NOT NULL are already excluded by the WHERE clause above.
  // If the webhook's immediate Resend send failed, sent_at is NULL and the cron picks it up here.
```

- [ ] **Step 3: Fix KV key encoding mismatch (BUG-15)**

Find (line ~89):
```typescript
        const kvRes = await fetch(`${kvUrl}/get/stripe:${encodeURIComponent(row.user_id)}`, {
```

Replace with (encode the full key, matching how `kvSet` in webhook.ts stores it):
```typescript
        const kvRes = await fetch(`${kvUrl}/get/${encodeURIComponent(`stripe:${row.user_id}`)}`, {
```

- [ ] **Step 4: Add retry tracking on Resend failure (P5)**

Find the else branch after `if (emailRes.ok)` (lines ~134–137):
```typescript
      } else {
        const body = await emailRes.text();
        errors.push(`id=${row.id}: ${emailRes.status} ${body.slice(0, 100)}`);
      }
```

Replace with:
```typescript
      } else {
        const errBody = await emailRes.text();
        const errMsg = `${emailRes.status} ${errBody.slice(0, 100)}`;
        errors.push(`id=${row.id}: ${errMsg}`);
        await sql`
          UPDATE scheduled_emails
          SET retry_count = retry_count + 1, last_error = ${errMsg}
          WHERE id = ${row.id}
        `;
      }
```

Similarly, in the catch block (lines ~138–140):
```typescript
    } catch (err) {
      errors.push(`id=${row.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
```

Replace with:
```typescript
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'unknown';
      errors.push(`id=${row.id}: ${errMsg}`);
      try {
        await sql`
          UPDATE scheduled_emails
          SET retry_count = retry_count + 1, last_error = ${errMsg}
          WHERE id = ${row.id}
        `;
      } catch {
        // Non-fatal — retry count update failure is acceptable
      }
    }
```

- [ ] **Step 5: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.api.json
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/cron/scheduled-emails.ts
git commit -m "fix: cron hardening — fail-closed auth, atomic row claiming, KV key encoding, retry tracking (Task 3)"
```

---

## Task 4: `api/stripe/founding-status.ts` — Add `active` Field

**Files:**
- Modify: `api/stripe/founding-status.ts`

Adds a second KV read to return `stripe-founding-active` (confirmed paid subscribers) alongside `stripe-founding-reserved` (includes in-flight). The welcome modal will use `active` for the member number badge so founding members see their real, stable seat number.

- [ ] **Step 1: Fetch both counters in parallel and return `active`**

Replace the full handler body with:

```typescript
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  res.setHeader('Cache-Control', 'public, max-age=60');

  if (!kvUrl || !kvToken) {
    return res.status(200).json({ claimed: 0, active: 0, remaining: 100, isFull: false });
  }

  try {
    const headers = { Authorization: `Bearer ${kvToken}` };
    const [reservedRes, activeRes] = await Promise.all([
      fetch(`${kvUrl}/get/stripe-founding-reserved`, { headers }),
      fetch(`${kvUrl}/get/stripe-founding-active`, { headers }),
    ]);

    if (!reservedRes.ok) {
      return res.status(200).json({ claimed: 0, active: 0, remaining: 100, isFull: false });
    }

    const reservedData = (await reservedRes.json()) as { result: string | null };
    const activeData = activeRes.ok ? ((await activeRes.json()) as { result: string | null }) : { result: null };

    const claimed = reservedData.result !== null ? Math.min(parseInt(reservedData.result, 10) || 0, 100) : 0;
    const active = activeData.result !== null ? Math.min(parseInt(activeData.result, 10) || 0, 100) : 0;
    const remaining = 100 - claimed;

    return res.status(200).json({ claimed, active, remaining, isFull: remaining <= 0 });
  } catch {
    return res.status(200).json({ claimed: 0, active: 0, remaining: 100, isFull: false });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.api.json
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/stripe/founding-status.ts
git commit -m "feat: founding-status returns active paid count alongside reserved (Task 4)"
```

---

## Task 5: `src/ui/welcomeModal.ts` — 4 Bug Fixes

**Files:**
- Modify: `src/ui/welcomeModal.ts`

**Fix inventory:**
- **C4** — Rewrite `overlay.innerHTML` as DOM construction (eliminates attribute-injection XSS)
- **H5** — Wrap all `localStorage` access in try/catch (Safari private mode crash)
- **H6** — Steps 1 and 2 call `dismiss()` before dispatching events (modal was blocking panels)
- **P4** — Use `active` field from founding-status for member number (not `claimed`/reserved count)

The modal is fully rebuilt using `createElement` + `textContent`/`setAttribute`. This is the largest single change in the file. Do NOT use `innerHTML` anywhere in the rewrite.

- [ ] **Step 1: Add localStorage helper functions at the top of the file (H5)**

After the existing `type WelcomeTier = ...` line, add:

```typescript
function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* no-op in private mode */ }
}
```

- [ ] **Step 2: Update the `nw-onboarded` guard and FoundingStatus type (H5 + P4)**

Replace:
```typescript
export async function maybeShowWelcomeModal(tier: WelcomeTier): Promise<void> {
  if (localStorage.getItem('nw-onboarded')) return;
```

With:
```typescript
export async function maybeShowWelcomeModal(tier: WelcomeTier): Promise<void> {
  if (lsGet('nw-onboarded')) return;
```

Update the `FoundingStatus` interface to include `active`:
```typescript
interface FoundingStatus {
  claimed: number;
  active: number;
  remaining: number;
  isFull: boolean;
}
```

- [ ] **Step 3: Update member number to use `active` count (P4)**

Find:
```typescript
  if (
    tier === 'insider' &&
    statusResult.status === 'fulfilled' &&
    statusResult.value !== null &&
    typeof (statusResult.value as FoundingStatus).claimed === 'number'
  ) {
    memberNumber = ` #${(statusResult.value as FoundingStatus).claimed}`;
  }
```

Replace with (use `active` — the confirmed-paid count — for the badge number):
```typescript
  if (
    tier === 'insider' &&
    statusResult.status === 'fulfilled' &&
    statusResult.value !== null &&
    typeof (statusResult.value as FoundingStatus).active === 'number'
  ) {
    const activeCount = (statusResult.value as FoundingStatus).active;
    if (activeCount > 0) memberNumber = ` #${activeCount}`;
  }
```

- [ ] **Step 4: Rewrite `overlay.innerHTML` as DOM construction (C4)**

This is the largest change. Replace the entire block from `const overlay = document.createElement('div');` through `document.body.appendChild(overlay);` with DOM-built elements. No `innerHTML` anywhere.

```typescript
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Welcome to NexusWatch');

  // Modal card
  const modal = document.createElement('div');
  modal.style.cssText =
    'background:#0e0e0e;border:1px solid #2a2a2a;border-radius:8px;width:440px;max-width:calc(100vw - 32px);max-height:calc(100vh - 32px);overflow-y:auto;padding:28px 32px 32px;box-shadow:0 24px 64px rgba(0,0,0,0.8);font-family:"JetBrains Mono","Fira Code",monospace;';

  // Badge
  const badge = document.createElement('div');
  badge.style.cssText = `display:inline-flex;align-items:center;gap:6px;font-size:10px;text-transform:uppercase;letter-spacing:2px;color:${content.badgeColor};background:${content.badgeBg};border:1px solid ${content.badgeBorder};border-radius:3px;padding:3px 8px;margin-bottom:14px;`;
  badge.textContent = badgeText;
  modal.appendChild(badge);

  // Headline
  const headline = document.createElement('h2');
  headline.style.cssText = 'font-size:20px;font-weight:700;color:#fff;line-height:1.3;margin:0 0 6px;';
  headline.textContent = content.headline;
  modal.appendChild(headline);

  // Subheadline
  const subheadline = document.createElement('p');
  subheadline.style.cssText = 'font-size:12px;color:#666;margin:0 0 24px;line-height:1.5;';
  subheadline.textContent = content.subheadline;
  modal.appendChild(subheadline);

  // Steps container
  const stepsContainer = document.createElement('div');
  stepsContainer.id = 'nw-modal-steps';
  stepsContainer.style.cssText = 'display:flex;flex-direction:column;gap:10px;margin-bottom:24px;';

  const stepDefs = [
    { step: 'watchlist', num: '1', title: 'Add your first country to watchlist', sub: 'Get alerts when CII moves or crises develop' },
    { step: 'schedule',  num: '2', title: 'Set your brief schedule', sub: 'Daily or Mon / Wed / Fri delivery' },
    { step: 'sitrep',   num: '3', title: 'Run your first sitrep', sub: 'Ask the AI analyst about any region right now' },
  ];

  for (const def of stepDefs) {
    const stepEl = document.createElement('div');
    stepEl.className = 'nw-modal-step';
    stepEl.dataset.step = def.step;
    stepEl.style.cssText =
      'display:flex;align-items:center;gap:12px;background:#141414;border:1px solid #222;border-radius:5px;padding:11px 14px;cursor:pointer;';

    const numEl = document.createElement('div');
    numEl.style.cssText =
      'width:22px;height:22px;background:#1a1a1a;border:1px solid #333;border-radius:50%;font-size:11px;color:#555;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
    numEl.textContent = def.num;

    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'flex:1;';
    const strong = document.createElement('strong');
    strong.style.cssText = 'font-size:13px;color:#ccc;display:block;margin-bottom:2px;';
    strong.textContent = def.title;
    const span = document.createElement('span');
    span.style.cssText = 'font-size:11px;color:#555;';
    span.textContent = def.sub;
    textWrap.appendChild(strong);
    textWrap.appendChild(span);

    const arrow = document.createElement('span');
    arrow.style.cssText = 'color:#333;font-size:14px;';
    arrow.textContent = '›';

    stepEl.appendChild(numEl);
    stepEl.appendChild(textWrap);
    stepEl.appendChild(arrow);
    stepsContainer.appendChild(stepEl);
  }
  modal.appendChild(stepsContainer);

  // Divider
  const hr = document.createElement('hr');
  hr.style.cssText = 'border:none;border-top:1px solid #1a1a1a;margin:0 0 20px;';
  modal.appendChild(hr);

  // Referral block (only if we have a userId)
  let referralInputEl: HTMLInputElement | null = null;
  let copyBtnEl: HTMLButtonElement | null = null;

  if (referralUrl) {
    const referralBlock = document.createElement('div');
    referralBlock.style.cssText =
      'background:#0a0a0a;border:1px solid #1e1e1e;border-radius:5px;padding:12px 14px;margin-bottom:20px;';

    const referralLabel = document.createElement('div');
    referralLabel.style.cssText =
      'font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#444;margin-bottom:8px;';
    referralLabel.textContent = 'Your Founding Referral Link';

    const referralRow = document.createElement('div');
    referralRow.style.cssText = 'display:flex;align-items:center;gap:8px;';

    referralInputEl = document.createElement('input');
    referralInputEl.type = 'text';
    referralInputEl.id = 'nw-referral-input';
    referralInputEl.readOnly = true;
    referralInputEl.value = referralUrl; // safe: assigned via .value, not innerHTML
    referralInputEl.style.cssText =
      'flex:1;background:#111;border:1px solid #222;border-radius:3px;color:#22c55e;font-family:inherit;font-size:11px;padding:6px 10px;';

    copyBtnEl = document.createElement('button');
    copyBtnEl.id = 'nw-referral-copy';
    copyBtnEl.style.cssText =
      'background:#1a1a1a;border:1px solid #333;color:#888;font-family:inherit;font-size:11px;padding:6px 10px;border-radius:3px;cursor:pointer;white-space:nowrap;';
    copyBtnEl.textContent = 'Copy';

    referralRow.appendChild(referralInputEl);
    referralRow.appendChild(copyBtnEl);

    const referralNote = document.createElement('div');
    referralNote.style.cssText = 'font-size:10px;color:#444;margin-top:6px;';
    referralNote.textContent = 'Refer paying subscribers → earn free months (coming May 5)';

    referralBlock.appendChild(referralLabel);
    referralBlock.appendChild(referralRow);
    referralBlock.appendChild(referralNote);
    modal.appendChild(referralBlock);
  }

  // CTA button
  const ctaBtn = document.createElement('button');
  ctaBtn.id = 'nw-modal-cta';
  ctaBtn.style.cssText =
    'width:100%;background:#22c55e;color:#000;border:none;border-radius:4px;padding:12px;font-family:inherit;font-size:13px;font-weight:700;letter-spacing:1px;cursor:pointer;';
  ctaBtn.textContent = 'START EXPLORING →';
  modal.appendChild(ctaBtn);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
```

- [ ] **Step 5: Fix `dismiss()` — use `lsSet` helper (H5)**

```typescript
  function dismiss() {
    document.removeEventListener('keydown', onKeyDown);
    lsSet('nw-onboarded', '1');
    history.replaceState(null, '', window.location.pathname + window.location.hash);
    overlay.remove();
  }
```

- [ ] **Step 6: Wire events using DOM references instead of querySelector (H6)**

Replace the event wiring section (from `overlay.querySelector('#nw-modal-cta')` through the end of the function) with:

```typescript
  ctaBtn.addEventListener('click', dismiss);

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      dismiss();
    }
  }
  document.addEventListener('keydown', onKeyDown);

  // Step interactions — steps 1 and 2 dismiss the modal before dispatching
  // so the panel they open is not blocked by the overlay.
  stepsContainer.querySelectorAll<HTMLElement>('.nw-modal-step').forEach((step) => {
    step.addEventListener('mouseenter', () => { step.style.borderColor = '#333'; });
    step.addEventListener('mouseleave', () => { step.style.borderColor = '#222'; });

    step.addEventListener('click', () => {
      const action = step.dataset.step;
      if (action === 'watchlist') {
        dismiss();
        document.dispatchEvent(new CustomEvent('nw:open-watchlist'));
      } else if (action === 'schedule') {
        dismiss();
        document.dispatchEvent(new CustomEvent('nw:open-preferences', { detail: { section: 'briefs' } }));
      } else if (action === 'sitrep') {
        dismiss();
        document.dispatchEvent(
          new CustomEvent('nw:open-ai-terminal', {
            detail: { prompt: 'Give me a sitrep on the region with the highest CII score right now' },
          }),
        );
      }
    });
  });

  // Copy button
  if (copyBtnEl && referralInputEl) {
    const inputEl = referralInputEl;
    const btnEl = copyBtnEl;
    btnEl.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(inputEl.value);
        btnEl.textContent = 'Copied ✓';
        setTimeout(() => { btnEl.textContent = 'Copy'; }, 2000);
      } catch {
        inputEl.select();
        document.execCommand('copy');
        btnEl.textContent = 'Copied ✓';
        setTimeout(() => { btnEl.textContent = 'Copy'; }, 2000);
      }
    });
  }
}
```

- [ ] **Step 7: Typecheck frontend**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/ui/welcomeModal.ts
git commit -m "fix: welcomeModal DOM construction (XSS), localStorage guards, steps dismiss, active member count (Task 5)"
```

---

## Task 6: `src/pages/landing.ts` + `src/pages/pricing.ts` — Attribution Fixes

**Files:**
- Modify: `src/pages/landing.ts`
- Modify: `src/pages/pricing.ts`

**Fix inventory:**
- **P1** — `landing.ts`: Call `history.replaceState` after capturing `ref` param to clean the URL
- **P2** — Both files: Switch `nw-referral` from `sessionStorage` to `localStorage` (survives new tabs and session restores)
- **P6** — `pricing.ts`: Omit `referredBy` from checkout POST body when absent (don't send empty string)

- [ ] **Step 1: Fix `landing.ts` — replaceState + localStorage (P1 + P2)**

Find (lines ~457–461):
```typescript
  // Capture referral attribution from share link
  const refParam = new URLSearchParams(window.location.search).get('ref');
  if (refParam) {
    sessionStorage.setItem('nw-referral', refParam);
  }
```

Replace with:
```typescript
  // Capture referral attribution from share link
  const refParam = new URLSearchParams(window.location.search).get('ref');
  if (refParam && /^[\w-]{1,128}$/.test(refParam)) {
    localStorage.setItem('nw-referral', refParam);
    // Clean the URL so users don't accidentally share their own ref link
    const cleanUrl = new URL(window.location.href);
    cleanUrl.searchParams.delete('ref');
    history.replaceState(null, '', cleanUrl.toString());
  }
```

- [ ] **Step 2: Fix `pricing.ts` — localStorage + omit empty referredBy (P2 + P6)**

Find (line ~248):
```typescript
      const referredBy = sessionStorage.getItem('nw-referral') || '';
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier, interval: currentInterval, referredBy }),
      });
```

Replace with:
```typescript
      const referredBy = localStorage.getItem('nw-referral');
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          tier,
          interval: currentInterval,
          ...(referredBy ? { referredBy } : {}),
        }),
      });
```

- [ ] **Step 3: Typecheck frontend**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/landing.ts src/pages/pricing.ts
git commit -m "fix: referral attribution — localStorage, URL cleanup, omit empty referredBy (Task 6)"
```

---

## Task 7: Full Validate + Deploy

**Files:** none (validation + deploy only)

- [ ] **Step 1: Full validate**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: all pass.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean build, no errors, same chunk counts as before.

- [ ] **Step 3: Deploy**

```bash
vercel --prod
```

Expected: deployment URL printed, aliased to nexuswatch.dev.

- [ ] **Step 4: Smoke test all endpoints**

```bash
# Founding status — now returns `active` field
curl -s https://nexuswatch.dev/api/stripe/founding-status

# Cron — should return { success: true, sent: 0, skipped: 0, errors: [] }
curl -s -H "Authorization: Bearer $CRON_SECRET" https://nexuswatch.dev/api/cron/scheduled-emails
```

Expected:
- founding-status returns `{"claimed":N,"active":M,"remaining":R,"isFull":false}`
- cron returns `{"success":true,"sent":0,"skipped":0,"errors":[]}`

- [ ] **Step 5: Commit and push**

```bash
git add -A
git commit -m "chore: hardening plan deployed and verified (Task 7)"
git push
```

---

## Post-Implementation Checklist

### Before April 28 launch (non-blocking, complete after deploy)

- [ ] **Initialize `stripe-founding-active` KV counter** — run a script that counts confirmed paid founding members from Neon and sets the KV key to the correct value. Without this, the member number badge undercounts on day 1.
```bash
node -e "
const { neon } = require('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL);
async function run() {
  // Count rows that represent confirmed founding members in KV — proxy via scheduled_emails
  // (Each successful checkout inserts scheduled_emails rows; adjust if you have a better source)
  const result = await sql\`SELECT COUNT(DISTINCT user_id) as cnt FROM scheduled_emails WHERE tier = 'insider'\`;
  const count = parseInt(result[0].cnt, 10);
  console.log('Setting stripe-founding-active to:', count);
  await fetch(\`\${process.env.KV_REST_API_URL}/set/stripe-founding-active/\${count}\`, {
    method: 'POST',
    headers: { Authorization: \`Bearer \${process.env.KV_REST_API_TOKEN}\` }
  });
  console.log('Done.');
}
run().catch(e => { console.error(e.message); process.exit(1); });
"
```

- [ ] **Spot-check `nw:open-ai-terminal` pre-fill** — verify the AI terminal event listener reads `detail.prompt` and auto-fills it when step 3 is clicked from the welcome modal
- [ ] **Verify `nw:open-watchlist` and `nw:open-preferences` event listeners** — confirm both open their respective panels correctly on modal step click

### Post-deploy smoke tests (Task 7 covers these, listed here for reference)

- [ ] Monitor Vercel function logs for `[stripe/webhook]` after Stripe test checkout — confirm `welcome_d0 sent immediately to ...` in logs
- [ ] Check `scheduled_emails` table after test checkout — should have exactly **3 rows** (welcome_d0 with `sent_at` set, nudge_d3, upgrade_d7)
- [ ] Confirm welcome email arrives within 30 seconds of test checkout completion
- [ ] Verify `nw-referral` now persists across tabs (set in one tab, open a new tab, check `localStorage.getItem('nw-referral')`)
- [ ] Verify `?ref=` param is cleaned from URL after visiting a referral link
- [ ] Check Vercel logs for any unauthenticated hits to `/api/cron/scheduled-emails` during the prior fail-open window

### Phase 2 (May 5)
- [ ] Set `REFERRAL_CREDITS_ENABLED=true` in Vercel
