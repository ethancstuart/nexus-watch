# Runbook — API key rotation

**When to rotate:** scheduled (every 90 days), after a known leak,
after offboarding a contributor with access, or when an upstream
provider warns of compromise.

## Inventory

All keys live in two places:
1. **`.env.local`** (gitignored, dev only)
2. **Vercel project env vars** (production / preview / development)

| Key | Provider | Where to rotate |
|-----|----------|-----------------|
| `ANTHROPIC_API_KEY` | console.anthropic.com → Settings → API Keys |
| `WINDY_WEBCAM_KEY` | api.windy.com/keys |
| `AISSTREAM_API_KEY` | aisstream.io → Account → API Keys |
| `EIA_API_KEY` | eia.gov/opendata → request a new key (5-min email) |
| `ENTSOE_API_KEY` | transparency.entsoe.eu → My Account → Token |
| `OPENWEATHER_API_KEY` | home.openweathermap.org/api_keys |
| `FINNHUB_API_KEY` | finnhub.io → Dashboard → API Keys |
| `TWELVEDATA_API_KEY` | twelvedata.com → Dashboard → API Keys |
| `STRIPE_SECRET_KEY` | dashboard.stripe.com → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → click endpoint |
| `RESEND_API_KEY` | resend.com → API Keys |
| `BEEHIIV_API_KEY` | app.beehiiv.com → Settings → Integrations |
| `NOTION_API_KEY` | notion.so/my-integrations |
| `SUPABASE_SERVICE_ROLE_KEY` | supabase.com/dashboard → Settings → API |
| `KV_REST_API_TOKEN` | upstash.com → KV → Manage |
| `AUTH_SECRET` | local — generate via `openssl rand -hex 32` |
| `CRON_SECRET` | local — generate via `openssl rand -hex 32` |
| `OPENSKY_CLIENT_SECRET` | opensky-network.org → Settings |
| `GOOGLE_CLIENT_SECRET` | console.cloud.google.com → APIs & Services |
| `GITHUB_CLIENT_SECRET` | github.com/settings/developers |
| `SPOTIFY_CLIENT_SECRET` | developer.spotify.com/dashboard |
| `BUFFER_ACCESS_TOKEN` | buffer.com → Account → Apps |
| `DISCORD_BOT_TOKEN` | discord.com/developers/applications |
| `MAPBOX_TOKEN` | account.mapbox.com → Tokens |

## Rotation procedure (per key)

1. **Generate a new key** at the provider's dashboard.
2. **Add to Vercel first** (so the deployed function still has a valid
   key during the cutover):
   ```
   vercel env add KEY_NAME production --value "new_value" --yes --force
   vercel env add KEY_NAME development --value "new_value" --yes --force
   # Preview env requires a git branch arg; set it via dashboard or skip.
   ```
3. **Trigger a rebuild** so the new key takes effect:
   `vercel deploy --prod --yes`
4. **Verify the relevant endpoint works** with the new key.
5. **Revoke the old key** at the provider's dashboard.
6. **Update `.env.local`** so dev + your machine have the new key.
7. **Document the rotation** in this file (date + key name) so the
   next rotation is on schedule.

## Post-leak emergency rotation

If a key is in a public Slack message, GitHub commit, or a screenshot:

1. **Revoke first** at the provider, even before generating a new
   one. Most providers revoke within seconds.
2. **Then generate the replacement** and follow the standard rotation
   above.
3. **Audit:** `git log -p --all -S "<leaked_value>"` to confirm the
   key isn't elsewhere in history. If it is, either rewrite history
   (`git filter-repo`) or accept the rotation as the recovery.
4. **Notify** the provider — most have a `compromise@*` mailbox.

## Last rotation log

| Date | Key | Reason |
|------|-----|--------|
| 2026-05-02 | AISSTREAM_API_KEY | switched to user-provided key |
| 2026-05-02 | WINDY_WEBCAM_KEY | initial provisioning |
| 2026-05-02 | EIA_API_KEY | initial provisioning |
