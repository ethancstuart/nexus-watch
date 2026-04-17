# NexusWatch — What's Left For You To Do Manually

**Last updated:** 2026-04-16
**Status:** All database, Stripe (live mode), env vars, deploy infrastructure, and the ANTHROPIC_API_KEY are DONE. What's below is everything that genuinely requires you clicking around in third-party UIs — nothing here can be automated from this machine.

Order is suggested, but each item is independent. Do them in whatever order fits.

---

## 1. Discord approval webhook (3 minutes)

Gives you a private Discord channel where every auto-generated social post appears as a rich embed before going live. Tap approve/reject from your phone.

1. Open Discord (desktop or https://discord.com)
2. **If you don't have a personal server:** click **+** in the left server list → **Create My Own → For me and my friends** → name it (e.g. "NexusWatch Ops")
3. **Create the approvals channel:**
   - Right-click the server name at the top → **Create Channel**
   - Name: `marketing-approvals`
   - Toggle **Private Channel** ON → click **Create Channel**
4. **Create the webhook:**
   - Click the **gear icon** next to the channel name (Edit Channel)
   - **Integrations** → **Webhooks** → **New Webhook**
   - Name it `NexusWatch` → click **Copy Webhook URL** (looks like `https://discord.com/api/webhooks/1234567890/abc...`)
5. Paste the URL here in chat and I'll set the env vars automatically.

**Optional button upgrade (10 min):** Only if you want tap-to-approve directly in Discord instead of clicking through to the web UI. Tell me when you're ready and I'll walk you through the Discord Developer Portal setup (application ID, public key, bot token).

---

## 2. Social media brand accounts (30 minutes)

None are blocking — each platform is independently togglable. Create them when you want, give me the API keys, and I'll set the env vars.

### 2A. Substack (~5 min)

1. https://substack.com/signup with a brand email (e.g. `brief@nexuswatch.dev` — set up via Resend custom domain, or use Gmail for now)
2. **Publication name:** `The NexusWatch Brief`
3. **URL:** `thenexuswatchbrief` → `thenexuswatchbrief.substack.com`
4. **Category:** Politics → Foreign Policy
5. After creation: gear icon → **Publishing** → scroll to **Email-to-post** → **copy the inbound email address** and paste it here

### 2B. LinkedIn Company Page (~5 min)

1. https://linkedin.com → **For Business** (top nav) → **Create a Company Page** → **Small business**
2. Fill in:
   - **Name:** NexusWatch
   - **LinkedIn public URL:** nexuswatch
   - **Industry:** Information Services
   - **Company size:** 1 employee
3. Upload logo (from `~/Projects/nexus-watch/public/favicon.svg`)
4. **Website:** `https://nexuswatch.dev`
5. Copy the first paragraph of your landing page into the **About**
6. Click **Create page**

### 2C. Medium (~3 min)

1. https://medium.com → sign in with brand email or Google
2. Profile icon (top right) → **Settings**
3. Scroll to **Integration tokens** → click **Get integration token**
4. **Copy the token and paste it here**

### 2D. Threads (~2 min)

1. https://threads.net → sign in with Instagram (create `@nexuswatch` on Instagram first if needed)

### 2E. Bluesky (~2 min)

1. https://bsky.app → **Sign up**
2. Handle: `nexuswatch.bsky.social`
3. **App password** for Typefully: Settings → App Passwords → Add → copy → paste it here

### 2F. Typefully ($15/mo Pro — ~3 min)

This is the relay that actually posts to X, LinkedIn, Threads, Bluesky on your behalf.

1. https://typefully.com → sign up for **Pro**
2. **Settings** (gear, bottom left) → **Connections** → connect each:
   - **X/Twitter:** click Connect X → authorize your X account
   - **LinkedIn:** Connect LinkedIn → select the company page from 2B
   - **Threads:** Connect Threads → authorize
   - **Bluesky:** Connect Bluesky → enter handle + app password from 2E
3. **Settings → API** → **Generate API Key** → **copy the key and paste it here**

---

## 3. DNS record for beehiiv custom domain (5 minutes)

So your newsletter is delivered from `brief.nexuswatch.dev` instead of a beehiiv subdomain.

1. **Vercel DNS** (since your domain is on Vercel): go to https://vercel.com/dashboard → your team → **Domains** → click `nexuswatch.dev`
2. Click **Add Record** → **Type:** CNAME → **Name:** `brief` → **Value:** `customdomain.beehiiv.com` → **Add**
3. Go to https://app.beehiiv.com → your publication → **Settings → Custom Domain**
4. Enter `brief.nexuswatch.dev` → **Save**
5. Wait ~5 min for SSL provisioning. Refresh the page — green checkmark = done.

---

## 4. Optional: Bluesky custom handle

Only if you did 2E and want `@nexuswatch.dev` instead of `@nexuswatch.bsky.social`.

1. In Bluesky app: **Settings → Change Handle → I have my own domain** → enter `nexuswatch.dev`
2. Copy the TXT record value shown
3. In Vercel DNS (same place as step 3): Add Record → **TXT** → **Name:** `_atproto` → **Value:** (from Bluesky) → **Add**
4. Back in Bluesky → click **Verify**

---

## 5. Optional: revoke the live Stripe key I used

Stripe auto-rotates your key in 7 days, so this is optional. If you want to revoke it now:

1. https://dashboard.stripe.com/apikeys (live mode)
2. Next to "Secret key" → click **Roll key**
3. Paste the new key here and I'll swap it on Vercel

---

## 6. Launch smoke test (10 minutes — do before flipping anything live)

Run locally: `npm run dev`, then sign in and visit each page:

- **http://localhost:5173/#/admin/marketing** — V1+V2 cockpit should render
- **http://localhost:5173/#/admin/revenue** — $0 MRR cards, no errors
- **http://localhost:5173/#/admin/social-queue** — empty list is fine
- **http://localhost:5173/#/intel** — press `T` for time-travel scrubber

In prod:
- https://nexuswatch.dev/#/admin/revenue — $0 MRR, no errors
- Visit any Stripe checkout link → confirm `NEXUSWATCH` appears as the merchant name

---

## 7. Go live (per-platform rollout)

Order from lowest to highest risk. Do these over days/weeks, not all at once.

| # | Platform | Frequency | Risk | When to flip |
|---|---|---|---|---|
| 1 | beehiiv (daily brief) | daily 10:00 UTC | Low | After DNS verifies (step 3) |
| 2 | Substack | 2x/week | Low | After 2A done |
| 3 | LinkedIn | 1/weekday | Medium | After 7 days of shadow-mode voice-eval passing |
| 4 | Medium | weekly | Low | After 2C done |
| 5 | Bluesky + Threads | 1-2/day | Low | After 2D/2E done |
| 6 | X | 3/day | High | Last to flip — loudest channel |

**To flip a platform LIVE:**
1. Visit **https://nexuswatch.dev/#/admin/marketing**
2. Find the platform's toggle → flip SHADOW → LIVE
3. Wait 24h → check voice scores + engagement in the admin cockpit
4. If any voice score drops below 70 → click **PAUSE ALL** at top right

**To flip the global marketing engine ON** (must happen before any platform posts):
```bash
cd ~/Projects/nexus-watch
vercel env rm MARKETING_AUTOMATION_ENABLED production --yes
vercel env add MARKETING_AUTOMATION_ENABLED production --value "true" --yes
```

---

## Kill switches (bookmark)

- **Panic button:** `/#/admin/marketing` → **PAUSE ALL** (top right) — stops every platform globally in <1 sec
- **Single platform:** admin UI → click the platform's ENABLED chip → flips to DISABLED
- **Revert to shadow mode:** same admin UI → **SHADOW MODE** toggle
- **Nuclear:** Vercel → Project → Settings → Crons → toggle each off

---

## If something breaks

1. **`https://nexuswatch.dev/#/admin/data-health`** — shows every data source + freshness. If a layer is `offline`, that's your answer.
2. **Vercel logs:** `vercel logs <deployment-url>`
3. **Stripe events:** https://dashboard.stripe.com/events (live mode)
4. **Neon slow queries:** Neon dashboard → Monitoring → Slow Queries
5. **Anthropic usage:** https://console.anthropic.com — daily cap is 200 Claude calls. Expected cost ~$30/mo.

---

## What's NOT in this doc (already done — do not redo)

- All 17 database migrations (38 tables live)
- Core env vars: `CRON_SECRET`, `AUTH_SECRET`, `ADMIN_EMAILS`, `STRIPE_FOUNDING_STOCK`, `MARKETING_AUTOMATION_ENABLED` (set to `false`), `DISCORD_APPROVAL_ENABLED` (set to `false`), `API_V2_KEYS`
- `ANTHROPIC_API_KEY` (local + Vercel prod)
- Stripe **live mode** — 3 products, 3 prices ($29/$99/$19), webhook, signing secret, all Vercel env vars swapped to live keys
- Stripe Identity Verification (already activated — `charges_enabled: true`)
- psql installed locally
- Production redeploy with latest env vars (● Ready)
