# NexusWatch — Launch Manual Steps

**Last updated:** 2026-04-15
**Audience:** Ethan (operator). Every item here requires a human — I can't do it from code.
**Format:** Do the phases in order. Each phase is independently shippable.

---

## Phase 0 — Read this first

All the product code for V1, V2, Discord, Tier 2/3, Phase 3-5 is already merged to `main`. Branch: `main`. Latest commits to verify:
- `d5af7e5` — marketing v1
- `5bbe25e` — marketing v2 admin
- `223e753` — Discord approval bot
- `c3fd14e` — v2 API endpoints + crisis detection cron
- `574431c` — time-travel, crisis binding, sparklines, portfolio scenarios, revenue cockpit
- `9c081a5` — scenario engine, AI analyst DB wiring, NL alerts, journeys, prediction ledger, factor feed

Nothing below requires new code changes. Everything is infrastructure / accounts / secrets.

---

## Phase 1 — Apply Neon migrations (required before first run)

Order matters — later migrations reference earlier tables. From your local shell with `$DATABASE_URL` set:

```bash
cd ~/Projects/nexus-watch

# V1 marketing automation (if not already applied)
psql "$DATABASE_URL" -f docs/migrations/2026-04-14-marketing-automation.sql

# V2 marketing A/B variants
psql "$DATABASE_URL" -f docs/migrations/2026-04-15-marketing-v2.sql

# Discord approval bot column on social_queue
psql "$DATABASE_URL" -f docs/migrations/2026-04-15-discord-approval.sql

# Crisis auto-detection triggers
psql "$DATABASE_URL" -f docs/migrations/2026-04-15-crisis-triggers.sql

# Prediction ledger
psql "$DATABASE_URL" -f docs/migrations/2026-04-15-assessments.sql

# Marketing cross-post race fix (P0 bug sweep)
psql "$DATABASE_URL" -f docs/migrations/2026-04-15-marketing-crosspost-unique.sql

# CII perf indices (PERF-1)
psql "$DATABASE_URL" -f docs/migrations/2026-04-15-cii-perf-indices.sql

# New free data sources (OFAC, V-Dem, NOAA, Copernicus)
psql "$DATABASE_URL" -f docs/migrations/2026-04-15-data-sources.sql
```

**Verify each:**
```bash
psql "$DATABASE_URL" -c "\d marketing_posts"
psql "$DATABASE_URL" -c "\d marketing_prompt_variants"
psql "$DATABASE_URL" -c "\d crisis_triggers"
psql "$DATABASE_URL" -c "\d assessments"
psql "$DATABASE_URL" -c "SELECT column_name FROM information_schema.columns WHERE table_name='social_queue' AND column_name='discord_message_id';"
```

**If any migration fails**: read the error carefully. The SQL is idempotent (`CREATE TABLE IF NOT EXISTS`) so re-running is safe. If it's a foreign key error, run the referenced migration first.

---

## Phase 2 — Environment variables (Vercel + .env.local)

Set these in **Vercel → Project → Settings → Environment Variables** (Production + Preview + Development). Also mirror to `.env.local` for local dev.

### 2A. Already-required core (set if missing)

| Variable | Where to get it | Notes |
|---|---|---|
| `DATABASE_URL` | Neon dashboard → Connection Details → Pooled connection | Use the pooler, not the direct URL |
| `KV_REST_API_URL` | Upstash KV → REST API → Endpoint URL | |
| `KV_REST_API_TOKEN` | Upstash KV → REST API → Token | |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Powers AI analyst, NL alert compiler, marketing generator |
| `CRON_SECRET` | `openssl rand -hex 32` | Used by every `/api/cron/*` |
| `ADMIN_EMAILS` | your own email, comma-separated | Gates `/api/admin/*` routes |
| `AUTH_SECRET` | `openssl rand -hex 32` | JWT/session signing |

### 2B. Stripe (for revenue cockpit + paid tier)

**Before setting vars**: finish Stripe Identity Verification. This is blocking beehiiv too. Go to `dashboard.stripe.com` → your account → complete business details + identity doc upload.

Then create 3 products in Stripe dashboard → **Products**:

| Product name | Price | Billing | Metadata |
|---|---|---|---|
| NexusWatch Analyst | $29/mo recurring | monthly | `tier=analyst` |
| NexusWatch Pro | $99/mo recurring | monthly | `tier=pro` |
| NexusWatch Founding-100 | $19/mo recurring | monthly | `tier=founding` |

Copy the three price IDs (`price_XXX`) and set:

| Variable | Source | Notes |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys → Secret | Use live key for production, test key for preview |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → Add endpoint `https://nexuswatch.dev/api/stripe/webhook` → copy signing secret | Required for subscription events |
| `STRIPE_ANALYST_PRICE_ID` | price_… from Analyst product | |
| `STRIPE_PRO_PRICE_ID` | price_… from Pro product | |
| `STRIPE_FOUNDING_PRICE_ID` | price_… from Founding product | |
| `STRIPE_FOUNDING_STOCK` | `100` | Cohort cap |

**Test the revenue cockpit**: after setting Stripe vars, visit `/#/admin/revenue` — you should see MRR, ARR, tier mix. If 403, add your email to `ADMIN_EMAILS`.

### 2C. Marketing automation (v1 + v2)

| Variable | Where |
|---|---|
| `MARKETING_AUTOMATION_ENABLED` | `true` to enable crons; `false` to hard-disable |
| `TYPEFULLY_API_KEY` | typefully.com → Settings → API | Relay for X + LinkedIn + Threads + Bluesky ($15/mo) |
| `BEEHIIV_API_KEY` | app.beehiiv.com → Settings → API (unlocks AFTER Stripe Identity Verification) |
| `BEEHIIV_PUB_ID` | beehiiv → Publication → ID |
| `SUBSTACK_INBOUND_EMAIL` | from Substack → Settings → Publishing → Email-to-post address |
| `MEDIUM_INTEGRATION_TOKEN` | medium.com → Settings → Integration tokens |
| `BUFFER_ACCESS_TOKEN` | buffer.com → API (only if you prefer Buffer over Typefully; Typefully is the D-3 pick) |

### 2D. Discord approval bot (Phase 1 — webhook only)

**This is the easy path.** Takes 3 minutes:

1. Open Discord. If you don't have a server yet, create one: **+ → Create My Own → For me and my friends**.
2. Create a channel: `#marketing-approvals` (private channel).
3. Right-click channel → **Edit Channel** → **Integrations** → **Webhooks** → **New Webhook**.
4. Name it `NexusWatch`. **Copy Webhook URL**.
5. In Vercel env vars, set:

| Variable | Value |
|---|---|
| `DISCORD_APPROVAL_WEBHOOK_URL` | https://discord.com/api/webhooks/... (from step 4) |
| `DISCORD_APPROVAL_ENABLED` | `true` |

**Verify**: trigger a test enqueue (enable social automation briefly, or manually POST to `/api/social/enqueue` in dev). Within seconds a rich embed with a "Open on nexuswatch.dev →" link should appear in your Discord channel.

### 2E. Discord approval bot Phase 2 — inline buttons (OPTIONAL)

Only do this if Phase 1 feels clunky (e.g., you want to tap ✅ in Discord instead of jumping to the web UI). Takes 10 minutes.

1. Go to **discord.com/developers/applications** → **New Application** → name it `NexusWatch`.
2. **General Information** page → copy:
   - **Application ID** → `DISCORD_APPLICATION_ID`
   - **Public Key** → `DISCORD_PUBLIC_KEY`
3. **Bot** tab → **Reset Token** → copy → `DISCORD_BOT_TOKEN` (optional; needed if we later add message-delete retraction).
4. **General Information** → set **Interactions Endpoint URL** to `https://nexuswatch.dev/api/discord/interactions` → **Save Changes**. Discord will ping the endpoint with a PING; if signature verification works, save succeeds. If it fails, double-check `DISCORD_PUBLIC_KEY`.
5. **OAuth2 → URL Generator** → check scopes `bot` + `applications.commands`. Copy URL, open in browser, add bot to your server.

**Verify**: from now on, every approval embed shows Approve/Reject/Hold buttons. Tapping them transitions `social_queue` server-side and edits the message in place.

### 2F. Public API v2 (optional — for institutional consumers)

| Variable | Value | Notes |
|---|---|---|
| `API_V2_KEYS` | comma-separated keys, e.g. `nwk_abc123,nwk_def456` | Generate with `openssl rand -hex 16`. Hand out one key per consumer. |

Without this var, `/api/v2/*` returns 401 to everyone. Default state = disabled, which is safe.

### 2G. Data source ingestion (optional but recommended)

These env vars enable the new free-tier data sources shipped 2026-04-15.
All four sources degrade gracefully if unset — cron runs return
`{ skipped: true, reason: 'env_not_set' }` instead of 500.

| Variable | Source | Notes |
|---|---|---|
| `VDEM_DATA_URL` | V-Dem | URL to a NDJSON subset of V-Dem indicators you host yourself. See `api/cron/source-vdem.ts` header for format. Skip if you don't need democracy indicators (CII falls back to baseline governance). |

No other env vars are needed — OFAC, NOAA, and Copernicus pull from public feeds. Just apply the migration and let the crons run.

### 2H. Resend (email delivery)

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | resend.com → API keys |

Required for: welcome email, weekly recap, email alerts, unsubscribe flow. Free tier is fine for launch.

---

## Phase 3 — External accounts (brand-scoped, not personal)

Per Chairman D-1/D-2 decisions, create dedicated brand accounts so nothing ties to your day job.

### 3A. Substack

- Go to **substack.com/signup**. Sign up with `brief@nexuswatch.dev` (set up that address first via Resend or Google Workspace).
- Publication name: **The NexusWatch Brief**
- URL: `thenexuswatchbrief.substack.com` (confirmed in D-2)
- Category: **Politics** → subcategory **Foreign Policy**
- **Settings → Publishing → Email-to-post**: copy the inbound email address → `SUBSTACK_INBOUND_EMAIL`
- Connect to Stripe (for paid tier later; optional at launch).

### 3B. LinkedIn Company Page

- linkedin.com → **Work → Create a Company Page** → **Small business**
- Name: **NexusWatch**
- LinkedIn URL: `linkedin.com/company/nexuswatch`
- Industry: **Information Services**
- Size: **1 employee** (can change later)
- Upload logo (use `/public/favicon.svg` or the wordmark from `/public/og-default.png`)
- **About**: first 100 words of your landing page
- Add website: `https://nexuswatch.dev`

### 3C. Medium

- medium.com → Sign in with the same brand email.
- **Settings → Publications → New publication** → name **The NexusWatch Brief**.
- **Settings → Integration tokens** → copy → `MEDIUM_INTEGRATION_TOKEN`.

### 3D. Threads

- threads.net → create account with the brand email (uses Instagram under the hood; create an IG `@nexuswatch` account first if you don't have one).

### 3E. Bluesky

- bsky.app → sign up, handle `@nexuswatch.bsky.social`.
- Later: set up custom domain handle `@nexuswatch.dev` using the DNS method (put a TXT record at `_atproto.nexuswatch.dev`).

### 3F. Typefully

- typefully.com → Sign up ($15/mo Pro).
- **Settings → Connections** → connect X (@NexusWatchDev), LinkedIn (company page from 3B), Threads, Bluesky.
- **Settings → API** → generate key → `TYPEFULLY_API_KEY`.

---

## Phase 4 — DNS records

### 4A. `brief.nexuswatch.dev` → beehiiv

In your DNS provider (Vercel DNS or Cloudflare):

| Type | Host | Value | TTL |
|---|---|---|---|
| CNAME | `brief` | `customdomain.beehiiv.com` | Auto |

Then in beehiiv → **Settings → Custom domain** → enter `brief.nexuswatch.dev` → wait for SSL provisioning (~5 min).

### 4B. (Optional) `@nexuswatch.dev` Bluesky handle

| Type | Host | Value |
|---|---|---|
| TXT | `_atproto` | (value from Bluesky handle verification page) |

### 4C. (Optional) `api.nexuswatch.dev` subdomain for v2 API

This is a branding polish, not required. If you want institutional consumers hitting `api.nexuswatch.dev/v2/cii` instead of `nexuswatch.dev/api/v2/cii`:

| Type | Host | Value |
|---|---|---|
| CNAME | `api` | `cname.vercel-dns.com` |

Then in Vercel → Domains → add `api.nexuswatch.dev` → configure rewrite `/v2/(.*)` → `/api/v2/$1`.

---

## Phase 5 — First-run verification

Once migrations, env vars, and accounts are in place, do this 10-minute smoke test.

### 5A. Admin pages load

Sign in with your admin email, then visit each and screenshot-check:

- `/#/admin/marketing` — V1+V2 cockpit. Cadence/pillar/voice/embargo controls should render. Pillar bars show last 7-day distribution.
- `/#/admin/revenue` — Stripe pull. Cards show $0 MRR initially.
- `/#/admin/social-queue` — existing approval UI. Empty list is fine.

### 5B. Marketing automation (shadow mode)

1. Toggle `MARKETING_AUTOMATION_ENABLED=true` in Vercel.
2. Redeploy (automatic when env changes).
3. Trigger one cron manually to prove the pipeline:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://nexuswatch.dev/api/cron/marketing-x
   ```
4. Check `/#/admin/marketing` → "Recent Posts". You should see one row with `[SHADOW]` tag and `scheduled` status (no real post).
5. Check Discord: if `DISCORD_APPROVAL_WEBHOOK_URL` is set, an embed fires on the first `pending` row.

### 5C. Crisis detection

1. Trigger the cron manually:
   ```bash
   curl -H "Authorization: Bearer $CRON_SECRET" https://nexuswatch.dev/api/cron/crisis-detection
   ```
2. Expected response: `{"ok":true,"inserted_count":0,"resolved_count":0,"inserted":[]}` unless a CII country happens to have spiked >15 pts in 24h.
3. Hit `/api/crisis/active` — should return `{"triggers":[]}` on a quiet day.

### 5D. v2 API (if you set `API_V2_KEYS`)

```bash
# List scenarios
curl -H "X-API-Key: your_key" https://nexuswatch.dev/api/v2/scenario

# Run one
curl -H "X-API-Key: your_key" "https://nexuswatch.dev/api/v2/scenario?id=hormuz-closure"

# Active alerts
curl -H "X-API-Key: your_key" https://nexuswatch.dev/api/v2/alerts

# Systematic factors (for Quant integration)
curl -H "X-API-Key: your_key" "https://nexuswatch.dev/api/v2/factors?lookback_days=30"

# Portfolio exposure
curl -H "X-API-Key: your_key" -H "Content-Type: application/json" -X POST \
  -d '{"holdings":[{"symbol":"TSM","weight":20},{"symbol":"XOM","weight":10}]}' \
  https://nexuswatch.dev/api/v2/exposure
```

### 5E. Time-travel + sparklines

- Visit `/#/intel` → press `T` (or click the TIME-TRAVEL toggle) → scrubber should render with the latest date selected.
- Drag the scrubber left → map should re-render country scores from the historical snapshot. Expect sparse data early on (cii_daily_snapshots only has data since 2026-04-13).

### 5F. Prediction ledger bootstrap

Trigger the recorder once manually so you have seed data:
```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://nexuswatch.dev/api/cron/record-assessments
```
After ~7 days of daily runs + the scorer, you'll have real outcome data to power a future `/#/accuracy` page.

---

## Phase 6 — Go live (per-platform, one at a time)

Order from lowest-risk to highest:

1. **beehiiv** — daily brief delivery. Enable once Stripe Identity Verification clears and `BEEHIIV_API_KEY` is set. `/api/cron/daily-brief` will post automatically at 10:00 UTC.
2. **Substack** — articles 2×/week. Enable by setting `platforms.substack.enabled = true` at `/#/admin/marketing`.
3. **LinkedIn** — 1 post/weekday. Start in shadow mode for 7 days per D-5. After 7 days of voice-eval passing, flip to live.
4. **Medium** — weekly cross-post. Derivative of Substack; low risk.
5. **Bluesky + Threads** — 1-2 posts/day. Low engagement risk.
6. **X** — 3 posts/day (D-12 cadence cap). Last to flip because it's the loudest channel.

For each: toggle **LIVE** → wait 24h → check `/#/admin/marketing` for engagement data + voice scores → if any voice score <70 or any forbidden-topic violation, PAUSE all and review.

---

## Phase 7 — Kill switches (print and tape to your wall)

### Emergency "stop everything" flow

```bash
# Marketing engine — one KV write halts all 7 platforms globally in <1s
curl -X POST https://nexuswatch.dev/api/admin/marketing/pause \
  -b "cookie from your browser" \
  -H "Content-Type: application/json" \
  -d '{"action":"pause"}'
```
Or from admin UI: `/#/admin/marketing` → top-right **PAUSE ALL** button.

### Revert to shadow mode

```bash
curl -X POST https://nexuswatch.dev/api/admin/marketing/pause \
  -H "Content-Type: application/json" \
  -d '{"action":"shadow"}'
```

### Disable a single platform

Admin UI → click the platform's **ENABLED** chip to flip to **DISABLED**.

### Stop all crons entirely

Vercel → Project → Settings → Crons → toggle each off. Nuclear option.

---

## Phase 8 — What's explicitly NOT in this session (roadmap)

Deferred because they need separate sessions, design work, or external coordination:

- **Phase 4B (streaming terminal UI)** — polish pass on the aiTerminal.ts UX. The backend is wired via this session's AI analyst DB tools; the UI just needs token-streaming render.
- **Phase 6B (cascade overlay animation)** — animation loop + click→evidence. Rule engine is live; just needs render polish.
- **Phase 11 (competitive monitoring)** — cron already exists and runs Mondays. If you want the scorecard rendered as a public page, that's new UI work.
- **Entity relationship graph (D3 force-directed)** — XL effort, defer post-launch.
- **ElevenLabs audio brief** — requires ElevenLabs API key + TTS pipeline.
- **Mobile native app** — PWA is done; native is a much bigger lift.
- **SDK packages (`@nexuswatch/sdk` TS + Python)** — the API is stable; wrappers are a day's work each but need to wait until a consumer asks.

All of these are tracked implicitly in the code (services + files exist). A new session can pick any of them up and ship in < 1 week each.

---

## Phase 9 — If anything breaks

1. **First stop**: `/#/admin/data-health` — shows every data source + freshness. If a layer is `offline`, that's probably your answer.
2. **Vercel function logs**: `vercel logs <deployment-url>` — filter by `/api/cron/...` or `/api/admin/...`.
3. **Stripe events**: `dashboard.stripe.com/events` — every webhook we processed is logged.
4. **Neon slow queries**: Neon dashboard → Monitoring → Slow Queries. The marketing + assessments tables are new; watch for unindexed scans.
5. **Cost spike**: Check Anthropic usage dashboard. Daily cap is 200 Claude calls (D-12); if you're hitting it, the dispatcher returns `anthropic_daily_cap_reached` and skips. Cost should be ~$30/mo.

---

## Quick reference — which env var powers which feature

| Feature | Required env vars |
|---|---|
| Core app | `DATABASE_URL`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `AUTH_SECRET` |
| AI (brief, analyst, NL alerts, marketing) | `ANTHROPIC_API_KEY` |
| Paid tier | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID`, `STRIPE_FOUNDING_STOCK` |
| Revenue dashboard | `STRIPE_SECRET_KEY` + `ADMIN_EMAILS` |
| Email alerts | `RESEND_API_KEY` |
| Newsletter | `BEEHIIV_API_KEY`, `BEEHIIV_PUB_ID` |
| Social automation | `MARKETING_AUTOMATION_ENABLED=true`, `TYPEFULLY_API_KEY`, platform-specific tokens |
| Discord push | `DISCORD_APPROVAL_WEBHOOK_URL`, `DISCORD_APPROVAL_ENABLED=true` |
| Discord buttons | + `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` |
| v2 public API | `API_V2_KEYS` |
| All crons | `CRON_SECRET` |
| Admin routes | `ADMIN_EMAILS` (comma-separated) |

---

**Total work estimate on your side:** 2-3 hours (most of it waiting on Stripe Identity Verification + SSL provisioning). Actual keystrokes: ~15 minutes.
