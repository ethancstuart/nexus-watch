# Revenue Conversion System — Design Spec
## April 22, 2026

**Goal:** Three features that close the conversion loop before and after the April 28 launch: a live founding seats counter that drives checkout urgency, a post-payment welcome flow that activates new users, and a referral system that turns the founding cohort into a distribution channel.

**Architecture:** Each feature is independent but they connect at the welcome modal — the counter drives users to pay, the welcome modal fires on payment success, and the referral share link is planted inside the modal. Phase 1 ships April 28. Phase 2 (Stripe credits) ships ~May 5.

**Tech Stack:** Vite + vanilla TypeScript, Vercel Node Functions, Upstash KV (REST API), Neon PostgreSQL, Stripe, Resend

---

## Feature 1 — Founding Seats Counter

### What it does
A live progress bar on the Insider pricing card showing how many of the 100 founding seats have been claimed. Reads from the existing `stripe-founding-reserved` KV key. Drives checkout urgency through visible momentum.

### API

**New endpoint:** `GET /api/stripe/founding-status`
- Runtime: Node (not Edge — needs KV access via env vars)
- Auth: none — public endpoint
- Response:
  ```json
  { "claimed": 61, "remaining": 39, "isFull": false }
  ```
- Implementation: reads `stripe-founding-reserved` from Upstash KV via REST (`GET {kvUrl}/get/stripe-founding-reserved`). Parses result as integer, defaults to 0 on null/error.
- Cache: `Cache-Control: public, max-age=60` — stale by at most 60 seconds, no DB cost on every pricing page load.
- When KV is unreachable: return `{ claimed: 0, remaining: 100, isFull: false }` — fail open, never block the pricing page.

### Pricing Page UI

**File:** `src/pages/pricing.ts`

The Insider pricing card gets a new status block injected after the feature list and before the CTA button:

```
● 61 of 100 founding seats claimed
[████████████░░░░░░░░]          (green progress bar, fills left to right)
```

- Progress bar fills proportionally: `(claimed / 100) * 100%`
- Color: `#22c55e` (green) — consistent with the approved mockup
- Text: `"● {claimed} of 100 founding seats claimed"`
- Font: JetBrains Mono, 12px, color `#22c55e`
- Bar height: 4px, background `#1a1a1a`, fill `#22c55e`, border-radius 2px

**When `isFull: true`:**
- Progress bar shows fully filled
- Text changes to `"Founding cohort is full"`
- CTA button text changes from `"Start 14-Day Trial"` to `"Cohort Full — See Analyst Tier →"`
- Button click scrolls to the Analyst pricing card instead of initiating checkout
- Badge on the card changes from `"FOUNDING INSIDER"` to `"COHORT CLOSED"`

**Fetch behavior:**
- Called once on `DOMContentLoaded` via `fetch('/api/stripe/founding-status')`
- No polling — stale-by-60s cache is acceptable; users don't need real-time updates
- On fetch error: silently skip the counter injection (pricing page still fully functional)

---

## Feature 2 — Post-Payment Welcome Flow

### What it does
Replaces the broken 6-second toast (which always says "Pro" regardless of tier and checks for `upgraded=true` when the URL sends `upgraded=analyst`) with a proper welcome modal plus a 3-email background sequence.

### In-App Welcome Modal

**File:** `src/ui/welcomeModal.ts` (new file)

**Trigger:** Called from `src/pages/nexuswatch.ts` when URL contains `?upgraded=insider|analyst|pro`. Replaces the current `if (window.location.search.includes('upgraded=true'))` block.

**Behavior:**
- Full-screen overlay (`position: fixed; inset: 0; background: rgba(0,0,0,0.75); backdrop-filter: blur(2px)`)
- Modal centered, width 440px, dark terminal aesthetic (matches approved mockup)
- Only shows once per user — gate behind `localStorage.getItem('nw-onboarded')`. If already set, skip the modal.
- On dismiss (CTA click or Escape): set `localStorage.setItem('nw-onboarded', '1')` and `history.replaceState` to clean the URL param

**Tier-aware content** (derived from the `upgraded=` URL param value):

| Tier | Badge | Headline | Subheadline |
|------|-------|----------|-------------|
| `insider` | `● Founding Member #{n}` (green) | You're in. The map is yours. | Lifetime rate locked. Founding cohort closes at 100. |
| `analyst` | `● Analyst Access Unlocked` (blue, `#3b82f6`) | Intelligence, fully unlocked. | Daily briefs, full AI analyst, watchlist alerts. |
| `pro` | `● Pro Access Unlocked` (purple, `#a855f7`) | You have the full picture. | API access, scenario simulation, unlimited everything. |

The founding member number (`#62`) is fetched from `/api/stripe/founding-status` — `claimed` value at the time of modal display. If the fetch fails, omit the number.

**3 setup steps** (same for all tiers, each is a clickable row):
1. **Add your first country to watchlist** → dispatches a `CustomEvent('nw:open-watchlist')` that the map page already listens for
2. **Set your brief schedule** → opens user preferences panel, scrolled to brief frequency setting
3. **Run your first sitrep** → closes modal and opens the AI terminal pre-loaded with `"Give me a sitrep on the region with the highest CII score right now"`

Clicking a step does NOT dismiss the modal — user can complete steps and then click "START EXPLORING →" to dismiss.

**Referral share block** (inside the modal, below the steps):
```
YOUR FOUNDING REFERRAL LINK
nexuswatch.dev/?ref=usr_8f2k    [Copy]
Refer paying subscribers → earn free months (coming May 5)
```
- `ref` value is the user's session userId — call `GET /api/auth/me` (already exists, returns `{ id, email, tier }` from the KV session) on modal init and use the `id` field
- "Copy" button writes to clipboard and changes text to "Copied ✓" for 2 seconds

**CTA button:** `"START EXPLORING →"` — green (`#22c55e`), full width, dismisses modal

### Email Sequence

**New Neon table:** `scheduled_emails`
```sql
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL,
  email       TEXT NOT NULL,
  tier        TEXT NOT NULL,
  template    TEXT NOT NULL,   -- 'welcome_d0' | 'nudge_d3' | 'upgrade_d7'
  send_at     TIMESTAMPTZ NOT NULL,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON scheduled_emails (send_at) WHERE sent_at IS NULL;
```

**Trigger:** `api/stripe/webhook.ts` on `checkout.session.completed` — after updating the user's KV tier, insert 3 rows into `scheduled_emails`:
- `template: 'welcome_d0'`, `send_at: NOW()`
- `template: 'nudge_d3'`, `send_at: NOW() + INTERVAL '3 days'`
- `template: 'upgrade_d7'`, `send_at: NOW() + INTERVAL '7 days'`

**Delivery:** Extend the existing `api/cron/deliver-briefs.ts` (or create `api/cron/scheduled-emails.ts`) to query `WHERE send_at <= NOW() AND sent_at IS NULL`, send via Resend, then set `sent_at = NOW()`.

**Email templates** (sent via Resend, plain HTML, dark aesthetic):

| Template | Subject | Body focus |
|----------|---------|------------|
| `welcome_d0` | `"You're in — here's what NexusWatch shows right now"` | Welcome + tier confirmation + 3 deep-links into the product (watchlist, sitrep, brief archive) |
| `nudge_d3` | `"Have you run a sitrep yet?"` | Feature spotlight: AI analyst. One-click link: `nexuswatch.dev/#/intel?open=ai-terminal` |
| `upgrade_d7` | `"What are you tracking?"` | Engagement check. If on Analyst: soft push to Pro. If on Insider: soft push to Analyst. If already on Pro: skip send. |

`upgrade_d7` skips if the user is already on Pro tier (check `stripe:{userId}` in KV before sending).

---

## Feature 3 — Referral System

### Phase 1 — April 28: Share Links + Badge

**Share link format:** `https://nexuswatch.dev/?ref={userId}`

The `userId` is the user's internal session ID (already stored in KV as `session:{sessionId}`).

**Capturing referrals:**

`api/stripe/checkout.ts` — if `referredBy` is present in the POST body, attach it to the Stripe checkout session metadata:
```typescript
metadata: { referredBy: body.referredBy ?? '' }
```
No KV write at this point — the Stripe session object carries the attribution through to the webhook.

`api/stripe/webhook.ts` — on `checkout.session.completed`, read `session.metadata.referredBy`. If non-empty:
1. `referrerId` = `session.metadata.referredBy`
2. Increment `referral:count:{referrerId}` in KV
3. Write `referral:conversion:{newUserId}` = `referrerId` (permanent record, where `newUserId` = the user resolved from `session.client_reference_id` or `session.customer_email`)
4. If Phase 2 is active: apply Stripe credit (see below)

**Badge:**

When `referral:count:{userId}` >= 1, the user has the "Founding Ambassador" status. This is stored in the KV session object as `ambassador: true` at conversion time. The nav bar and user settings panel display a `⬡ FOUNDING AMBASSADOR` badge in green.

**Share link surfaces:**
- Welcome modal (planted immediately post-payment — highest visibility)
- User settings panel (persistent)
- beehiiv brief footer (passive distribution): each brief sent to paying members includes a one-line "Share NexusWatch: nexuswatch.dev/?ref={userId}" at the bottom

**Referral attribution flow:**
1. User A shares `nexuswatch.dev/?ref=usr_abc`
2. User B visits — `ref=usr_abc` stored in `sessionStorage` by the landing page JS
3. User B clicks "Start 14-Day Trial" — checkout API includes `referredBy: usr_abc` in POST body
4. Stripe webhook fires on conversion → A gets badge + credit

**Landing page JS** (`src/pages/landing.ts` or equivalent):
```typescript
const ref = new URLSearchParams(window.location.search).get('ref');
if (ref) sessionStorage.setItem('nw-referral', ref);
```

Checkout call reads from `sessionStorage.getItem('nw-referral')` and passes it in the POST body.

### Phase 2 — ~May 5: Stripe Credits

On verified conversion in `api/stripe/webhook.ts`:
```typescript
// Apply one free month as a negative balance transaction on the referrer's Stripe customer
await stripe.customers.createBalanceTransaction(referrerStripeCustomerId, {
  amount: -2900,  // $29 in cents — one Analyst month
  currency: 'usd',
  description: `Referral credit — ${newUserEmail} converted`,
});
```

Credit amount is always $29 (one Analyst month) regardless of the referred user's tier.

**Cap:** 12 credits per referrer (1 year free maximum). Check `referral:count:{referrerId}` before applying — if >= 12, skip the credit but still record the conversion.

**Referrer notification email** (sent immediately via Resend):
- Subject: `"Someone used your link — a free month added"`
- Body: `"[email redacted] just signed up using your NexusWatch referral link. A $29 credit has been applied to your account — it will automatically offset your next renewal."`

**Admin dashboard** (`src/pages/adminRevenue.ts`): add a referral leaderboard section showing top referrers by conversion count. Data from KV `referral:count:*` keys.

---

## Data Model Summary

**New KV keys:**
| Key | Value | TTL |
|-----|-------|-----|
| `referral:pending:{userId}` | referrerId | 24h |
| `referral:count:{referrerId}` | integer (conversion count) | permanent |
| `referral:conversion:{userId}` | referrerId | permanent |

**New Neon table:** `scheduled_emails` (see DDL above)

**Modified KV session object:** add `ambassador: boolean` field when referral count >= 1

---

## Files Created / Modified

| File | Change |
|------|--------|
| `api/stripe/founding-status.ts` | New — public endpoint returning claimed/remaining/isFull |
| `src/ui/welcomeModal.ts` | New — welcome modal component replacing post-payment toast |
| `src/pages/nexuswatch.ts` | Modify — wire welcomeModal, remove old toast block |
| `src/pages/pricing.ts` | Modify — fetch founding-status, inject progress bar |
| `api/stripe/checkout.ts` | Modify — capture referredBy param, pass to KV |
| `api/stripe/webhook.ts` | Modify — insert scheduled_emails rows, process referral conversion |
| `api/cron/scheduled-emails.ts` | New — cron to send due emails from scheduled_emails table |
| `docs/migrations/2026-04-22-scheduled-emails.sql` | New — DDL for scheduled_emails table |
| `src/pages/landing.ts` | Modify — capture ref param into sessionStorage |

---

## Phase Boundary

Everything above is Phase 1 (April 28) **except** the Stripe credit call in `api/stripe/webhook.ts` and the referrer notification email — those are gated behind a `REFERRAL_CREDITS_ENABLED=true` env var that defaults to false. Phase 2 is: set that env var in Vercel on ~May 5.

---

## Out of Scope

- Referral leaderboard public page (admin-only for now)
- Multi-tier credit amounts (all credits are $29 regardless of referred tier)
- Referral link click tracking / analytics beyond conversion count
- Welcome modal A/B testing
