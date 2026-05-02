# Launch troubleshooting

If something breaks during the launch window, you don't have time to
think — you need a flow chart. This is it.

## "The site is down"

1. Open https://nexuswatch.dev — confirm 5xx
2. Open https://vercel.com/dashboard — check the latest deployment
   status
3. If a deploy is in flight: wait 60s, retry
4. If the latest deploy is "Error": **rollback to the previous
   production deploy via Vercel dashboard → Deployments → click the
   last "Ready" prod deploy → "Promote to Production"**
5. Tweet a transparent status update: "We're seeing elevated errors
   on nexuswatch.dev — investigating now. Status here: nexuswatch.dev/#/status"

## "Specific endpoint is failing"

1. Hit https://nexuswatch.dev/api/status — find the offending endpoint
2. Check Vercel function logs for the function name (e.g. `webcam-catalog`)
3. Common causes:
   - **Upstream API rate limit** (Anthropic, Windy, EIA) — wait 5 min
     for the cache-warm cron to refill
   - **KV connectivity** — check upstash.com console
   - **Cron failure** — check Vercel → Crons → recent invocations
4. The endpoint already has a graceful-fallback envelope (status:
   'awaiting-upstream-error'). Frontend won't crash; users see the
   honest empty state.

## "Cost spike"

1. Check Anthropic dashboard — most likely culprit
2. If briefs-sample is the source: bump the cache TTL in
   `api/briefs-sample.ts` from 6h to 24h, redeploy
3. If a layer is calling the AI on every interaction: check
   `src/services/aiShell.ts` for cache leaks
4. Worst case: temporarily set `ANTHROPIC_API_KEY` to empty in Vercel
   env, redeploy. The endpoint falls back to STATIC_FALLBACK
   automatically.

## "We got featured on a big site and traffic is overwhelming"

1. Check Vercel function quota at https://vercel.com/dashboard/usage
2. KV cache should absorb most of it — if briefs-sample / webcam are
   slow, the cache is missing
3. Force-warm the cache:
   ```
   curl -X POST https://nexuswatch.dev/api/cron/cache-warm \
     -H "Authorization: Bearer $CRON_SECRET"
   ```
4. Increase rate limits temporarily in `api/_lib/rateLimit.ts`. Bump
   30/min → 120/min on briefs-sample, redeploy.

## "An angry comment / accusation"

1. Don't reply emotionally. Wait 10 minutes.
2. If it's a factual concern (data wrong, claim wrong): fix it, then
   reply with what you fixed
3. If it's a methodological objection: point them at
   nexuswatch.dev/#/methodology and engage with substance
4. If it's a brigade: don't engage. The platform's quality is the
   defense.

## "We accidentally leaked a secret"

1. Stop. Don't redeploy.
2. Run `bash scripts/scan-secrets.sh --all` to confirm where it leaked
3. Rotate the leaked key immediately (see
   `docs/runbooks/key-rotation.md`)
4. Force-push a fix that removes the secret + bump the env var in
   Vercel
5. Rewrite git history if the secret hit a public commit:
   `git filter-repo --path-glob '<file>' --invert-paths`
6. Notify the provider's `compromise@*` mailbox

## "Someone threatened legal action"

1. Take the page or endpoint they're objecting to offline immediately
   (env flag the layer off, redeploy)
2. Don't engage in public
3. Get an actual lawyer on the phone
4. Restore once cleared

## Quick links

- Vercel dashboard: https://vercel.com/dashboard
- Sentry: https://sentry.io/
- Discord webhook: env DISCORD_APPROVAL_WEBHOOK_URL
- Status: https://nexuswatch.dev/api/status
- Logs: `vercel logs nexuswatch.dev --follow`
