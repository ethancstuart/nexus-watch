# Revenue Conversion System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship three revenue conversion features before the April 28 launch: a live founding seats counter on the pricing page, a tier-aware post-payment welcome modal with 3-email follow-up sequence, and a referral share link system that seeds distribution.

**Architecture:** Feature 1 (founding-status API + pricing UI) is self-contained. Feature 2 (welcome modal) connects to the founding-status API and the existing auth/me endpoint. Feature 3 (referral) threads through checkout → webhook → welcome modal. All three connect at the welcome modal. Phase 2 (Stripe credits) is gated behind `REFERRAL_CREDITS_ENABLED=true` env var, defaults off.

**Tech Stack:** Vite + vanilla TypeScript, Vercel Node/Edge Functions, Upstash KV (REST API via raw fetch), Neon PostgreSQL (`neon()` HTTP mode), Stripe (raw fetch), Resend (raw fetch), `@neondatabase/serverless`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `api/stripe/founding-status.ts` | Create | Public Node endpoint — reads KV, returns `{claimed, remaining, isFull}` |
| `src/pages/pricing.ts` | Modify | Fetch founding-status, inject green progress bar, pass `referredBy` to checkout POST |
| `src/ui/welcomeModal.ts` | Create | Tier-aware post-payment modal with steps + referral share block |
| `src/pages/nexuswatch.ts` | Modify | Replace broken `upgraded=true` toast with welcomeModal |
| `src/pages/landing.ts` | Modify | Capture `?ref=` param into sessionStorage on page load |
| `docs/migrations/2026-04-22-scheduled-emails.sql` | Create | DDL for `scheduled_emails` table |
| `api/stripe/checkout.ts` | Modify | Read `referredBy` from POST body, pass as `metadata[referredBy]` to Stripe |
| `api/stripe/webhook.ts` | Modify | Fix founding tier bug, insert 3 scheduled_emails rows, process referral attribution |
| `api/cron/scheduled-emails.ts` | Create | Cron that queries due emails and sends via Resend |

---

## Task 1: `api/stripe/founding-status.ts` — Public Founding Seats Endpoint

**Files:**
- Create: `api/stripe/founding-status.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
// api/stripe/founding-status.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  res.setHeader('Cache-Control', 'public, max-age=60');

  if (!kvUrl || !kvToken) {
    return res.status(200).json({ claimed: 0, remaining: 100, isFull: false });
  }

  try {
    const kvRes = await fetch(`${kvUrl}/get/stripe-founding-reserved`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await kvRes.json()) as { result: string | null };
    const claimed = data.result !== null ? Math.min(parseInt(data.result, 10) || 0, 100) : 0;
    const remaining = 100 - claimed;
    return res.status(200).json({ claimed, remaining, isFull: remaining <= 0 });
  } catch {
    return res.status(200).json({ claimed: 0, remaining: 100, isFull: false });
  }
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npx tsc --noEmit -p tsconfig.api.json
```

Expected: no errors.

- [ ] **Step 3: Manual smoke test (dev server)**

```bash
vercel dev
curl http://localhost:3000/api/stripe/founding-status
```

Expected: `{"claimed":0,"remaining":100,"isFull":false}` (or current KV value).

- [ ] **Step 4: Commit**

```bash
git add api/stripe/founding-status.ts
git commit -m "feat: add public founding-status endpoint (Task 1)"
```

---

## Task 2: `src/pages/pricing.ts` — Founding Seats Counter UI

**Files:**
- Modify: `src/pages/pricing.ts`

The Insider card gets a new status block. The `startCheckout` function also reads `sessionStorage.getItem('nw-referral')` and passes it in the POST body.

- [ ] **Step 1: Add founding-status fetch + progress bar injection**

Find the section after `container.appendChild(page);` and before the billing toggle wiring (around line 148). Add the founding-status fetch:

```typescript
  // === Founding seats counter ===
  void (async () => {
    try {
      const statusRes = await fetch('/api/stripe/founding-status');
      if (!statusRes.ok) return;
      const status = (await statusRes.json()) as { claimed: number; remaining: number; isFull: boolean };

      const insiderCard = page.querySelector<HTMLElement>('.pricing-insider');
      if (!insiderCard) return;

      // Inject counter block before the CTA button
      const ctaBtn = insiderCard.querySelector<HTMLButtonElement>('.pricing-cta-primary');
      if (!ctaBtn) return;

      const counterBlock = createElement('div', { className: 'pricing-founding-counter' });
      counterBlock.style.cssText = 'margin-bottom:12px;';

      if (status.isFull) {
        counterBlock.innerHTML = `
          <div style="font-size:12px;color:#22c55e;font-family:'JetBrains Mono',monospace;margin-bottom:6px;">
            ● Founding cohort is full
          </div>
          <div style="height:4px;background:#1a1a1a;border-radius:2px;">
            <div style="width:100%;height:100%;background:#22c55e;border-radius:2px;"></div>
          </div>`;
        ctaBtn.textContent = 'Cohort Full — See Analyst Tier →';
        ctaBtn.removeAttribute('data-tier');
        ctaBtn.addEventListener('click', () => {
          const analystCard = page.querySelector('.pricing-featured');
          analystCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
        const badge = insiderCard.querySelector('.pricing-tier');
        if (badge) badge.textContent = 'COHORT CLOSED';
      } else {
        const pct = Math.round((status.claimed / 100) * 100);
        counterBlock.innerHTML = `
          <div style="font-size:12px;color:#22c55e;font-family:'JetBrains Mono',monospace;margin-bottom:6px;">
            ● ${status.claimed} of 100 founding seats claimed
          </div>
          <div style="height:4px;background:#1a1a1a;border-radius:2px;">
            <div style="width:${pct}%;height:100%;background:#22c55e;border-radius:2px;"></div>
          </div>`;
      }

      insiderCard.insertBefore(counterBlock, ctaBtn);
    } catch {
      // Fail silently — pricing page remains fully functional
    }
  })();
```

- [ ] **Step 2: Add referredBy to checkout POST body**

In the `startCheckout` function, modify the `fetch('/api/stripe/checkout', ...)` call. The existing body is `JSON.stringify({ tier, interval: currentInterval })`. Change it to include `referredBy`:

```typescript
      const referredBy = sessionStorage.getItem('nw-referral') || '';
      body: JSON.stringify({ tier, interval: currentInterval, referredBy }),
```

The full modified `startCheckout` fetch call (replace the existing one):

```typescript
      const referredBy = sessionStorage.getItem('nw-referral') || '';
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tier, interval: currentInterval, referredBy }),
      });
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Verify visually**

Start dev server (`npm run dev`), navigate to `/#/pricing`. The Insider card should show a green progress bar below the feature list. Check browser DevTools network tab: `/api/stripe/founding-status` should be called once on load.

- [ ] **Step 5: Commit**

```bash
git add src/pages/pricing.ts
git commit -m "feat: founding seats counter + referredBy in checkout (Task 2)"
```

---

## Task 3: `src/ui/welcomeModal.ts` — Post-Payment Welcome Modal

**Files:**
- Create: `src/ui/welcomeModal.ts`

This is a complete new file. The modal renders differently for each tier. It fetches `/api/auth/me` for the userId (referral link) and `/api/stripe/founding-status` for the member number (insider only).

- [ ] **Step 1: Create the welcome modal component**

```typescript
// src/ui/welcomeModal.ts

interface FoundingStatus {
  claimed: number;
  remaining: number;
  isFull: boolean;
}

interface AuthMe {
  id: string;
  email: string;
  tier: string;
}

type WelcomeTier = 'insider' | 'analyst' | 'pro';

interface TierContent {
  badgeColor: string;
  badgeBg: string;
  badgeBorder: string;
  badge: string;
  headline: string;
  subheadline: string;
}

const TIER_CONTENT: Record<WelcomeTier, TierContent> = {
  insider: {
    badgeColor: '#22c55e',
    badgeBg: 'rgba(34,197,94,0.1)',
    badgeBorder: 'rgba(34,197,94,0.2)',
    badge: '● Founding Member',
    headline: "You're in. The map is yours.",
    subheadline: 'Lifetime rate locked. Founding cohort closes at 100.',
  },
  analyst: {
    badgeColor: '#3b82f6',
    badgeBg: 'rgba(59,130,246,0.1)',
    badgeBorder: 'rgba(59,130,246,0.2)',
    badge: '● Analyst Access Unlocked',
    headline: 'Intelligence, fully unlocked.',
    subheadline: 'Daily briefs, full AI analyst, watchlist alerts.',
  },
  pro: {
    badgeColor: '#a855f7',
    badgeBg: 'rgba(168,85,247,0.1)',
    badgeBorder: 'rgba(168,85,247,0.2)',
    badge: '● Pro Access Unlocked',
    headline: 'You have the full picture.',
    subheadline: 'API access, scenario simulation, unlimited everything.',
  },
};

export async function maybeShowWelcomeModal(tier: WelcomeTier): Promise<void> {
  if (localStorage.getItem('nw-onboarded')) return;

  const content = TIER_CONTENT[tier];
  if (!content) return;

  // Fetch userId (for referral link) and founding member number (insider only)
  let userId = '';
  let memberNumber = '';

  const [meResult, statusResult] = await Promise.allSettled([
    fetch('/api/auth/me', { credentials: 'include' }).then((r) => r.json() as Promise<AuthMe>),
    tier === 'insider'
      ? fetch('/api/stripe/founding-status').then((r) => r.json() as Promise<FoundingStatus>)
      : Promise.resolve(null),
  ]);

  if (meResult.status === 'fulfilled' && meResult.value?.id) {
    userId = meResult.value.id;
  }

  if (
    tier === 'insider' &&
    statusResult.status === 'fulfilled' &&
    statusResult.value !== null &&
    (statusResult.value as FoundingStatus).claimed
  ) {
    memberNumber = ` #${(statusResult.value as FoundingStatus).claimed}`;
  }

  const badgeText = tier === 'insider' ? `${content.badge}${memberNumber}` : content.badge;
  const referralUrl = userId ? `nexuswatch.dev/?ref=${userId}` : '';

  // Build overlay
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,0.75);backdrop-filter:blur(2px);z-index:9999;display:flex;align-items:center;justify-content:center;';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Welcome to NexusWatch');

  overlay.innerHTML = `
    <div style="
      background:#0e0e0e;
      border:1px solid #2a2a2a;
      border-radius:8px;
      width:440px;
      max-width:calc(100vw - 32px);
      max-height:calc(100vh - 32px);
      overflow-y:auto;
      padding:28px 32px 32px;
      box-shadow:0 24px 64px rgba(0,0,0,0.8);
      font-family:'JetBrains Mono','Fira Code',monospace;
    ">
      <div style="
        display:inline-flex;align-items:center;gap:6px;
        font-size:10px;text-transform:uppercase;letter-spacing:2px;
        color:${content.badgeColor};
        background:${content.badgeBg};
        border:1px solid ${content.badgeBorder};
        border-radius:3px;padding:3px 8px;margin-bottom:14px;
      ">${badgeText}</div>

      <h2 style="font-size:20px;font-weight:700;color:#fff;line-height:1.3;margin:0 0 6px;">${content.headline}</h2>
      <p style="font-size:12px;color:#666;margin:0 0 24px;line-height:1.5;">${content.subheadline}</p>

      <div id="nw-modal-steps" style="display:flex;flex-direction:column;gap:10px;margin-bottom:24px;">
        <div class="nw-modal-step" data-step="watchlist" style="
          display:flex;align-items:center;gap:12px;
          background:#141414;border:1px solid #222;border-radius:5px;
          padding:11px 14px;cursor:pointer;
        ">
          <div style="width:22px;height:22px;background:#1a1a1a;border:1px solid #333;border-radius:50%;font-size:11px;color:#555;display:flex;align-items:center;justify-content:center;flex-shrink:0;">1</div>
          <div style="flex:1;">
            <strong style="font-size:13px;color:#ccc;display:block;margin-bottom:2px;">Add your first country to watchlist</strong>
            <span style="font-size:11px;color:#555;">Get alerts when CII moves or crises develop</span>
          </div>
          <span style="color:#333;font-size:14px;">›</span>
        </div>
        <div class="nw-modal-step" data-step="schedule" style="
          display:flex;align-items:center;gap:12px;
          background:#141414;border:1px solid #222;border-radius:5px;
          padding:11px 14px;cursor:pointer;
        ">
          <div style="width:22px;height:22px;background:#1a1a1a;border:1px solid #333;border-radius:50%;font-size:11px;color:#555;display:flex;align-items:center;justify-content:center;flex-shrink:0;">2</div>
          <div style="flex:1;">
            <strong style="font-size:13px;color:#ccc;display:block;margin-bottom:2px;">Set your brief schedule</strong>
            <span style="font-size:11px;color:#555;">Daily or Mon / Wed / Fri delivery</span>
          </div>
          <span style="color:#333;font-size:14px;">›</span>
        </div>
        <div class="nw-modal-step" data-step="sitrep" style="
          display:flex;align-items:center;gap:12px;
          background:#141414;border:1px solid #222;border-radius:5px;
          padding:11px 14px;cursor:pointer;
        ">
          <div style="width:22px;height:22px;background:#1a1a1a;border:1px solid #333;border-radius:50%;font-size:11px;color:#555;display:flex;align-items:center;justify-content:center;flex-shrink:0;">3</div>
          <div style="flex:1;">
            <strong style="font-size:13px;color:#ccc;display:block;margin-bottom:2px;">Run your first sitrep</strong>
            <span style="font-size:11px;color:#555;">Ask the AI analyst about any region right now</span>
          </div>
          <span style="color:#333;font-size:14px;">›</span>
        </div>
      </div>

      <hr style="border:none;border-top:1px solid #1a1a1a;margin:0 0 20px;">

      ${
        referralUrl
          ? `<div style="
          background:#0a0a0a;border:1px solid #1e1e1e;border-radius:5px;
          padding:12px 14px;margin-bottom:20px;
        ">
          <div style="font-size:10px;text-transform:uppercase;letter-spacing:2px;color:#444;margin-bottom:8px;">
            Your Founding Referral Link
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <input type="text" id="nw-referral-input" readonly value="${referralUrl}" style="
              flex:1;background:#111;border:1px solid #222;border-radius:3px;
              color:#22c55e;font-family:inherit;font-size:11px;padding:6px 10px;
            ">
            <button id="nw-referral-copy" style="
              background:#1a1a1a;border:1px solid #333;color:#888;
              font-family:inherit;font-size:11px;padding:6px 10px;
              border-radius:3px;cursor:pointer;white-space:nowrap;
            ">Copy</button>
          </div>
          <div style="font-size:10px;color:#444;margin-top:6px;">
            Refer paying subscribers → earn free months (coming May 5)
          </div>
        </div>`
          : ''
      }

      <button id="nw-modal-cta" style="
        width:100%;background:#22c55e;color:#000;border:none;border-radius:4px;
        padding:12px;font-family:inherit;font-size:13px;font-weight:700;
        letter-spacing:1px;cursor:pointer;
      ">START EXPLORING →</button>
    </div>
  `;

  document.body.appendChild(overlay);

  function dismiss() {
    localStorage.setItem('nw-onboarded', '1');
    history.replaceState(null, '', window.location.pathname + window.location.hash);
    overlay.remove();
  }

  // CTA button dismisses
  overlay.querySelector('#nw-modal-cta')?.addEventListener('click', dismiss);

  // Escape key dismisses
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      dismiss();
      document.removeEventListener('keydown', onKeyDown);
    }
  }
  document.addEventListener('keydown', onKeyDown);

  // Step click handlers
  overlay.querySelectorAll<HTMLElement>('.nw-modal-step').forEach((step) => {
    step.addEventListener('mouseenter', () => {
      step.style.borderColor = '#333';
    });
    step.addEventListener('mouseleave', () => {
      step.style.borderColor = '#222';
    });

    step.addEventListener('click', () => {
      const action = step.dataset.step;
      if (action === 'watchlist') {
        document.dispatchEvent(new CustomEvent('nw:open-watchlist'));
      } else if (action === 'schedule') {
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

  // Copy referral link
  const copyBtn = overlay.querySelector<HTMLButtonElement>('#nw-referral-copy');
  const referralInput = overlay.querySelector<HTMLInputElement>('#nw-referral-input');
  if (copyBtn && referralInput) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(referralInput.value);
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      } catch {
        // Fallback for older browsers
        referralInput.select();
        document.execCommand('copy');
        copyBtn.textContent = 'Copied ✓';
        setTimeout(() => {
          copyBtn.textContent = 'Copy';
        }, 2000);
      }
    });
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui/welcomeModal.ts
git commit -m "feat: add tier-aware welcome modal component (Task 3)"
```

---

## Task 4: `src/pages/nexuswatch.ts` — Wire Welcome Modal

**Files:**
- Modify: `src/pages/nexuswatch.ts`

Replace the broken `upgraded=true` check with a call to `maybeShowWelcomeModal`.

- [ ] **Step 1: Add import at the top of nexuswatch.ts**

Find the existing imports block and add:

```typescript
import { maybeShowWelcomeModal } from '../ui/welcomeModal.ts';
```

- [ ] **Step 2: Replace the broken toast block**

Find this block (around line 785):

```typescript
  // ── Upgrade confirmation (after Stripe checkout) ──
  if (window.location.search.includes('upgraded=true')) {
    const toast = createElement('div', { className: 'nw-upgrade-toast' });
    toast.innerHTML =
      '<span class="nw-upgrade-toast-text"><strong>Welcome to NexusWatch Pro!</strong> All features unlocked.</span><button class="nw-upgrade-toast-close" onclick="this.parentElement.remove()">✕</button>';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
    // Clean URL
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }
```

Replace it entirely with:

```typescript
  // ── Upgrade confirmation (after Stripe checkout) ──
  const upgradedParam = new URLSearchParams(window.location.search).get('upgraded');
  if (upgradedParam === 'insider' || upgradedParam === 'analyst' || upgradedParam === 'pro') {
    void maybeShowWelcomeModal(upgradedParam);
  }
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual verify (requires a dev server with a live session)**

Open `http://localhost:5173/#/intel?upgraded=insider` in a browser (after `npm run dev`). The welcome modal should appear. Dismiss with ESC or "START EXPLORING →". Reload — modal should NOT appear again (localStorage gate).

Open browser DevTools → Application → Local Storage → confirm `nw-onboarded` = `'1'` after dismiss.

Clear localStorage, reload with `?upgraded=analyst` — blue badge modal. Then `?upgraded=pro` — purple badge modal.

- [ ] **Step 5: Commit**

```bash
git add src/pages/nexuswatch.ts
git commit -m "feat: replace broken toast with tier-aware welcome modal (Task 4)"
```

---

## Task 5: `docs/migrations/2026-04-22-scheduled-emails.sql` — Database Migration

**Files:**
- Create: `docs/migrations/2026-04-22-scheduled-emails.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- scheduled_emails: queue for timed onboarding and lifecycle emails.
-- Rows are inserted at checkout; the scheduled-emails cron delivers them.
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  tier        TEXT        NOT NULL,
  template    TEXT        NOT NULL,   -- 'welcome_d0' | 'nudge_d3' | 'upgrade_d7'
  send_at     TIMESTAMPTZ NOT NULL,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scheduled_emails_send_at_idx
  ON scheduled_emails (send_at)
  WHERE sent_at IS NULL;
```

- [ ] **Step 2: Apply the migration**

Open the Neon console at https://console.neon.tech, select the `nexuswatch` project and `main` branch, navigate to the SQL Editor, paste the contents of `docs/migrations/2026-04-22-scheduled-emails.sql`, and run it.

Verify success:
```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'scheduled_emails' ORDER BY ordinal_position;
```

Expected: 8 rows (id, user_id, email, tier, template, send_at, sent_at, created_at).

- [ ] **Step 3: Commit**

```bash
git add docs/migrations/2026-04-22-scheduled-emails.sql
git commit -m "feat: add scheduled_emails migration (Task 5)"
```

---

## Task 6: `api/stripe/webhook.ts` — Referral Attribution + Scheduled Emails

**Files:**
- Modify: `api/stripe/webhook.ts`

Three changes:
1. Fix the founding tier bug: `tierMeta === 'founding'` → `tierMeta === 'insider'` (checkout now sends 'insider').
2. On `checkout.session.completed`: insert 3 rows into `scheduled_emails`.
3. On `checkout.session.completed`: read `session.metadata.referredBy` and write referral KV keys.

- [ ] **Step 1: Add neon import at top of webhook.ts**

After the existing `export const config = { runtime: 'edge' };` line, add:

```typescript
import { neon } from '@neondatabase/serverless';
```

- [ ] **Step 2: Fix the founding tier counter bug**

Find this block (around line 164):

```typescript
        // Founding tier: INCR the confirmed-active counter. Reservation counter
        // already counted this session when checkout.ts created the Stripe session.
        if (tierMeta === 'founding') {
          await kvIncr(kvUrl, kvToken, 'stripe-founding-active');
        }
```

Change `tierMeta === 'founding'` to `tierMeta === 'insider'`:

```typescript
        if (tierMeta === 'insider') {
          await kvIncr(kvUrl, kvToken, 'stripe-founding-active');
        }
```

Also fix the expired handler around line 175 — find:

```typescript
        if (metadata.tier === 'founding') {
          await kvDecr(kvUrl, kvToken, 'stripe-founding-reserved');
```

Change to:

```typescript
        if (metadata.tier === 'insider') {
          await kvDecr(kvUrl, kvToken, 'stripe-founding-reserved');
```

- [ ] **Step 3: Add scheduled_emails insert + referral attribution to checkout.session.completed**

Find the end of the `checkout.session.completed` case, just before the `break;` statement (after the founding tier INCR block). Add:

```typescript
        // Insert 3-email onboarding sequence into scheduled_emails
        const dbUrl = process.env.DATABASE_URL;
        const userEmail = (session.customer_email as string | null) || (session.customer_details as { email?: string } | null)?.email || '';
        if (dbUrl && userEmail) {
          try {
            const sql = neon(dbUrl);
            await sql`
              INSERT INTO scheduled_emails (user_id, email, tier, template, send_at) VALUES
              (${userId}, ${userEmail}, ${tierMeta || 'insider'}, 'welcome_d0', NOW()),
              (${userId}, ${userEmail}, ${tierMeta || 'insider'}, 'nudge_d3',   NOW() + INTERVAL '3 days'),
              (${userId}, ${userEmail}, ${tierMeta || 'insider'}, 'upgrade_d7', NOW() + INTERVAL '7 days')
            `;
          } catch (err) {
            console.error('[stripe/webhook] scheduled_emails insert failed:', err instanceof Error ? err.message : err);
          }
        }

        // Referral attribution
        const referredBy = metadata.referredBy as string | undefined;
        if (referredBy && referredBy.trim()) {
          const referrerId = referredBy.trim();
          try {
            await kvIncr(kvUrl, kvToken, `referral:count:${referrerId}`);
            await kvSet(kvUrl, kvToken, `referral:conversion:${userId}`, referrerId);

            // Phase 2: Stripe credit — gated behind env var, defaults off
            if (process.env.REFERRAL_CREDITS_ENABLED === 'true') {
              const referrerStripe = await kvGetJson<{ customerId?: string }>(kvUrl, kvToken, `stripe:${referrerId}`);
              const referrerCustomerId = referrerStripe?.customerId;
              const referralCountRaw = await kvGetStr(kvUrl, kvToken, `referral:count:${referrerId}`);
              const referralCount = referralCountRaw ? parseInt(referralCountRaw, 10) : 1;
              const stripeKey = process.env.STRIPE_SECRET_KEY;

              if (referrerCustomerId && referralCount <= 12 && stripeKey) {
                await fetch(`https://api.stripe.com/v1/customers/${referrerCustomerId}/balance_transactions`, {
                  method: 'POST',
                  headers: {
                    Authorization: `Basic ${btoa(stripeKey + ':')}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                  },
                  body: new URLSearchParams({
                    amount: '-2900',
                    currency: 'usd',
                    description: `Referral credit — ${userEmail} converted`,
                  }).toString(),
                });

                const resendKey = process.env.RESEND_API_KEY;
                const referrerEmailRes = await kvGetJson<{ email?: string }>(kvUrl, kvToken, `stripe:${referrerId}`);
                const referrerEmail = (referrerEmailRes as Record<string, string> | null)?.email;
                if (resendKey && referrerEmail) {
                  await fetch('https://api.resend.com/emails', {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      from: 'NexusWatch <hello@nexuswatch.dev>',
                      to: referrerEmail,
                      subject: 'Someone used your link — a free month added',
                      html: `<p>Someone just signed up using your NexusWatch referral link. A $29 credit has been applied to your account — it will automatically offset your next renewal.</p>`,
                    }),
                  });
                }
              }
            }
          } catch (err) {
            console.error('[stripe/webhook] referral attribution failed:', err instanceof Error ? err.message : err);
          }
        }
```

- [ ] **Step 4: Add `kvGetStr` helper at bottom of webhook.ts**

After the existing `kvGetJson` helper function, add:

```typescript
async function kvGetStr(kvUrl: string, kvToken: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    return data.result;
  } catch {
    return null;
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
git add api/stripe/webhook.ts
git commit -m "feat: webhook referral attribution + scheduled emails + fix founding tier bug (Task 6)"
```

---

## Task 7: `api/stripe/checkout.ts` — Capture referredBy

**Files:**
- Modify: `api/stripe/checkout.ts`

Read `referredBy` from the POST body and pass it to Stripe as `metadata[referredBy]`.

- [ ] **Step 1: Read referredBy from body**

Find the body parsing block (around lines 70–75):

```typescript
  try {
    const body = (await req.json()) as { tier?: string; interval?: string };
    bodyTier = body.tier || null;
    bodyInterval = body.interval || null;
  } catch {
    // No JSON body — fall back to query params
  }
```

Change to:

```typescript
  let bodyReferredBy: string | null = null;
  try {
    const body = (await req.json()) as { tier?: string; interval?: string; referredBy?: string };
    bodyTier = body.tier || null;
    bodyInterval = body.interval || null;
    bodyReferredBy = body.referredBy || null;
  } catch {
    // No JSON body — fall back to query params
  }
```

Also add the variable declaration with the other `let` declarations at the top of the function (around lines 67–68):

```typescript
  let bodyTier: string | null = null;
  let bodyInterval: string | null = null;
  let bodyReferredBy: string | null = null;
```

(If `bodyReferredBy` is declared inside the try block already from the edit above, move it out — it needs to be accessible outside the try/catch.)

- [ ] **Step 2: Pass referredBy to Stripe metadata**

Find the params building block (around line 160–163) where metadata is appended:

```typescript
  params.append('metadata[sessionId]', sessionId);
  params.append('metadata[tier]', tier);
  params.append('metadata[userId]', user.id);
  params.append('metadata[interval]', interval);
```

Add after those lines:

```typescript
  if (bodyReferredBy) {
    params.append('metadata[referredBy]', bodyReferredBy);
  }
```

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.api.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/stripe/checkout.ts
git commit -m "feat: pass referredBy through Stripe checkout metadata (Task 7)"
```

---

## Task 8: `src/pages/landing.ts` — Capture ref= Param

**Files:**
- Modify: `src/pages/landing.ts`

Capture `?ref=` from the URL into sessionStorage when the landing page loads. The pricing.ts checkout call (Task 2) already reads from `sessionStorage.getItem('nw-referral')`.

- [ ] **Step 1: Add ref capture at end of renderLanding function**

Find the end of the `renderLanding` function, before the closing `}`. Add:

```typescript
  // Capture referral attribution from share link
  const refParam = new URLSearchParams(window.location.search).get('ref');
  if (refParam) {
    sessionStorage.setItem('nw-referral', refParam);
  }
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Manual verify**

Open `http://localhost:5173/?ref=usr_testid123`. Open DevTools → Application → Session Storage. Confirm `nw-referral` = `usr_testid123`.

Navigate to `/#/pricing`. Open DevTools → Network. Click "Start 14-Day Trial" on any tier. Confirm the POST to `/api/stripe/checkout` includes `referredBy: "usr_testid123"` in the request body.

- [ ] **Step 4: Commit**

```bash
git add src/pages/landing.ts
git commit -m "feat: capture ref= param from share links into sessionStorage (Task 8)"
```

---

## Task 9: `api/cron/scheduled-emails.ts` — Email Delivery Cron

**Files:**
- Create: `api/cron/scheduled-emails.ts`

Runs hourly. Queries `scheduled_emails` for due rows, sends via Resend, marks `sent_at`. For `upgrade_d7`, skips if user is already on Pro.

- [ ] **Step 1: Create the cron handler**

The `upgrade_d7` template must check the user's *current* tier from KV — not the tier stored at checkout time — because the spec requires skipping if they're already on Pro even if they upgraded after checkout.

```typescript
// api/cron/scheduled-emails.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 120 };

interface ScheduledEmail {
  id: number;
  user_id: string;
  email: string;
  tier: string;
  template: string;
}

function buildEmailContent(
  template: string,
  currentTier: string,
): { subject: string; html: string } | null {
  if (template === 'welcome_d0') {
    return {
      subject: "You're in — here's what NexusWatch shows right now",
      html: `
        <div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:32px;max-width:600px;margin:0 auto;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#22c55e;margin-bottom:24px;">NEXUSWATCH</div>
          <h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px;">Welcome to NexusWatch.</h1>
          <p style="font-size:14px;color:#888;line-height:1.6;margin:0 0 24px;">
            You're in. Your ${tier} access is active. Here are three things to do right now:
          </p>
          <div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:12px;">
            <a href="https://nexuswatch.dev/#/intel" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Open the Intel Map</a>
            <p style="font-size:12px;color:#666;margin:4px 0 0;">45+ live layers. 150+ countries. Your first watchlist country.</p>
          </div>
          <div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:12px;">
            <a href="https://nexuswatch.dev/#/intel?open=ai-terminal" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Run a Sitrep</a>
            <p style="font-size:12px;color:#666;margin:4px 0 0;">Ask the AI analyst: "What's the current situation in [region]?"</p>
          </div>
          <div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:24px;">
            <a href="https://nexuswatch.dev/#/briefs" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Read the Brief Archive</a>
            <p style="font-size:12px;color:#666;margin:4px 0 0;">Daily intelligence briefs, every morning.</p>
          </div>
          <p style="font-size:11px;color:#555;margin:0;">NexusWatch — nexuswatch.dev</p>
        </div>
      `,
    };
  }

  if (template === 'nudge_d3') {
    // nudge_d3 always sends
    return {
      subject: 'Have you run a sitrep yet?',
      html: `
        <div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:32px;max-width:600px;margin:0 auto;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#22c55e;margin-bottom:24px;">NEXUSWATCH</div>
          <h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px;">The AI analyst is waiting.</h1>
          <p style="font-size:14px;color:#888;line-height:1.6;margin:0 0 24px;">
            Ask it anything — regional instability, crisis trajectories, CII movement. It synthesizes live data across 45+ sources in seconds.
          </p>
          <a href="https://nexuswatch.dev/#/intel?open=ai-terminal" style="
            display:inline-block;background:#22c55e;color:#000;
            font-weight:700;font-size:13px;letter-spacing:1px;
            padding:12px 24px;border-radius:4px;text-decoration:none;margin-bottom:24px;
          ">RUN YOUR FIRST SITREP →</a>
          <p style="font-size:11px;color:#555;margin:0;">NexusWatch — nexuswatch.dev</p>
        </div>
      `,
    };
  }

  if (template === 'upgrade_d7') {
    if (currentTier === 'pro') return null; // Skip — already on Pro (caller passes current KV tier)

    const upgradeTarget = currentTier === 'analyst' ? 'Pro' : 'Analyst';
    const upgradeDesc =
      currentTier === 'analyst'
        ? 'Unlock unlimited scenario simulations, portfolio geopolitical exposure, and REST API access.'
        : 'Unlock unlimited AI queries, full evidence chains, and daily intelligence briefs.';
    const upgradeHref =
      currentTier === 'analyst'
        ? 'https://nexuswatch.dev/#/pricing?highlight=pro'
        : 'https://nexuswatch.dev/#/pricing?highlight=analyst';

    return {
      subject: 'What are you tracking?',
      html: `
        <div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:32px;max-width:600px;margin:0 auto;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#22c55e;margin-bottom:24px;">NEXUSWATCH</div>
          <h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px;">You've been in NexusWatch for a week.</h1>
          <p style="font-size:14px;color:#888;line-height:1.6;margin:0 0 24px;">
            ${upgradeDesc}
          </p>
          <a href="${upgradeHref}" style="
            display:inline-block;background:#22c55e;color:#000;
            font-weight:700;font-size:13px;letter-spacing:1px;
            padding:12px 24px;border-radius:4px;text-decoration:none;margin-bottom:24px;
          ">SEE ${upgradeTarget.toUpperCase()} TIER →</a>
          <p style="font-size:11px;color:#555;margin:0;">NexusWatch — nexuswatch.dev</p>
        </div>
      `,
    };
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dbUrl = process.env.DATABASE_URL;
  const resendKey = process.env.RESEND_API_KEY;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!dbUrl || !resendKey) {
    return res.status(200).json({ success: false, reason: 'Missing DATABASE_URL or RESEND_API_KEY' });
  }

  const sql = neon(dbUrl);

  // Fetch due emails
  const dueEmails = await sql<ScheduledEmail[]>`
    SELECT id, user_id, email, tier, template
    FROM scheduled_emails
    WHERE send_at <= NOW() AND sent_at IS NULL
    ORDER BY send_at ASC
    LIMIT 100
  `;

  if (dueEmails.length === 0) {
    return res.status(200).json({ success: true, sent: 0 });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of dueEmails) {
    // For upgrade_d7, check the user's *current* tier from KV (not stored tier at checkout time)
    // so we correctly skip if they've since upgraded to Pro.
    let currentTier = row.tier;
    if (row.template === 'upgrade_d7' && kvUrl && kvToken) {
      try {
        const kvRes = await fetch(`${kvUrl}/get/stripe:${encodeURIComponent(row.user_id)}`, {
          headers: { Authorization: `Bearer ${kvToken}` },
        });
        const kvData = (await kvRes.json()) as { result: string | null };
        if (kvData.result) {
          let parsed: unknown = JSON.parse(kvData.result);
          if (typeof parsed === 'string') parsed = JSON.parse(parsed);
          const stripeObj = parsed as { paidTier?: string };
          if (stripeObj.paidTier) currentTier = stripeObj.paidTier;
        }
      } catch {
        // Fall back to stored tier on KV failure
      }
    }

    const content = buildEmailContent(row.template, currentTier);

    if (!content) {
      // upgrade_d7 skipped for pro tier — mark sent so it doesn't retry
      await sql`UPDATE scheduled_emails SET sent_at = NOW() WHERE id = ${row.id}`;
      skipped++;
      continue;
    }

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'NexusWatch <hello@nexuswatch.dev>',
          to: row.email,
          subject: content.subject,
          html: content.html,
        }),
      });

      if (emailRes.ok) {
        await sql`UPDATE scheduled_emails SET sent_at = NOW() WHERE id = ${row.id}`;
        sent++;
      } else {
        const body = await emailRes.text();
        errors.push(`id=${row.id}: ${emailRes.status} ${body.slice(0, 100)}`);
      }
    } catch (err) {
      errors.push(`id=${row.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return res.status(200).json({ success: true, sent, skipped, errors });
}
```

- [ ] **Step 2: Register the cron in vercel.json**

In `vercel.json`, find the `"crons"` array (line 12). Add this entry after the last existing entry, before the closing `]`:

```json
{ "path": "/api/cron/scheduled-emails", "schedule": "0 * * * *" }
```

The array should end like:
```json
    { "path": "/api/cron/source-vdem", "schedule": "0 3 1 * *" },
    { "path": "/api/cron/scheduled-emails", "schedule": "0 * * * *" }
  ],
```

The cron runs hourly. `welcome_d0` emails (send_at = NOW()) will be picked up within the hour.

- [ ] **Step 3: Typecheck**

```bash
npx tsc --noEmit -p tsconfig.api.json
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/cron/scheduled-emails.ts vercel.json
git commit -m "feat: scheduled-emails cron for 3-email onboarding sequence (Task 9)"
```

---

## Task 10: Full Typecheck, Format, and Deploy

**Files:** none (validation + deploy only)

- [ ] **Step 1: Full validate**

```bash
npm run typecheck && npm run lint && npm run format:check
```

Expected: all pass. If format:check fails, run `npm run format` and re-run.

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: clean build, no errors.

- [ ] **Step 3: Deploy to production**

```bash
vercel --prod
```

Expected: deployment URL printed. Monitor build logs for errors.

- [ ] **Step 4: Smoke test founding-status**

```bash
curl https://nexuswatch.dev/api/stripe/founding-status
```

Expected: `{"claimed":N,"remaining":M,"isFull":false}` with correct values from KV.

- [ ] **Step 5: Verify Stripe webhook env vars**

Confirm `REFERRAL_CREDITS_ENABLED` is NOT set (or set to `false`) in Vercel dashboard — Phase 2 is off by default until ~May 5.

Confirm `DATABASE_URL` is set in Vercel dashboard (used by scheduled-emails cron and webhook).

- [ ] **Step 6: Test the full checkout flow (staging)**

Use a Stripe test card:
1. Go to `https://nexuswatch.dev/#/pricing`
2. Confirm green founding seats counter appears on Insider card
3. Click "Start 14-Day Trial" on Insider
4. Complete Stripe checkout with test card `4242 4242 4242 4242`
5. Verify redirect to `/#/intel?upgraded=insider`
6. Verify welcome modal appears with green "Founding Member" badge
7. Verify localStorage `nw-onboarded` is set on dismiss
8. Check Neon `scheduled_emails` table — should have 3 rows for the test user

- [ ] **Step 7: Commit deploy verification**

```bash
git add -A
git commit -m "chore: post-deploy smoke test verification (Task 10)"
git push
```

---

## Post-Implementation Checklist

- [ ] Apply `docs/migrations/2026-04-22-scheduled-emails.sql` via Neon console (required before cron runs)
- [ ] Add `DATABASE_URL` env var to Vercel if not already set
- [ ] Confirm `RESEND_API_KEY` is set in Vercel (needed for scheduled-emails cron)
- [ ] Set `REFERRAL_CREDITS_ENABLED=true` in Vercel on ~May 5 to enable Phase 2 Stripe credits
- [ ] Monitor Vercel cron logs for `api/cron/scheduled-emails` after first hourly run
- [ ] Verify `welcome_d0` email delivered to test inbox within 1 hour of test checkout

---

## Phase 2 Activation (May 5)

Set `REFERRAL_CREDITS_ENABLED=true` in Vercel dashboard. No code deploy needed — the Phase 2 Stripe credit block in `webhook.ts` is already in place, gated behind this env var.
