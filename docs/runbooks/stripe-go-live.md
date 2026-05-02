# Runbook — Stripe go-live

NexusWatch currently runs on **Stripe TEST keys** in production
(`STRIPE_SECRET_KEY=sk_test_*`). Subscription flows display fake
checkout, no real charges occur.

When ready to accept real payments:

1. **Stripe Dashboard → Toggle "View test data" OFF**, then under
   Developers → API keys, copy the live secret + publishable keys.
2. **Stripe Dashboard → Products** — recreate the four pricing tiers
   in live mode (the test mode price IDs do not carry over):
   - Insider monthly $19, annual $199
   - Analyst monthly $29, annual $299
   - Pro monthly $99, annual $999
   - Founding lifetime $19/mo (100 seats, gated by
     `STRIPE_FOUNDING_STOCK`)
3. **Webhooks** — create a new live webhook at
   `https://nexuswatch.dev/api/stripe/webhook`. Copy the signing
   secret (`whsec_*`).
4. **Vercel env (production only — leave dev/preview on test keys):**
   ```
   vercel env rm STRIPE_SECRET_KEY production
   vercel env add STRIPE_SECRET_KEY production    # paste sk_live_*
   vercel env rm STRIPE_WEBHOOK_SECRET production
   vercel env add STRIPE_WEBHOOK_SECRET production  # paste new whsec
   # Repeat for STRIPE_INSIDER_PRICE_ID, STRIPE_INSIDER_ANNUAL_PRICE_ID,
   # STRIPE_ANALYST_PRICE_ID, STRIPE_ANALYST_ANNUAL_PRICE_ID,
   # STRIPE_PRO_PRICE_ID, STRIPE_PRO_ANNUAL_PRICE_ID,
   # STRIPE_FOUNDING_PRICE_ID with their live counterparts.
   ```
5. **Redeploy** to pick up the new env: `vercel deploy --prod --yes`.
6. **Smoke test:** make one $1 payment with a real card, confirm
   webhook fires, refund it, confirm webhook fires again. Watch
   `vercel logs` for `[stripe-webhook]` lines.

## Rollback

If a payment issue surfaces post-launch:
- Re-set `STRIPE_SECRET_KEY` to `sk_test_*` in Vercel and redeploy.
- Stripe automatically suspends the live key if too many payment
  failures occur — check the dashboard for an alert.
