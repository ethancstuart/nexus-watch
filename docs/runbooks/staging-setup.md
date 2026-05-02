# Runbook — Staging environment

NexusWatch currently has only **production** and ephemeral preview
deploys. There's no stable staging URL, which means risky changes hit
prod or live in your laptop.

## Recommended setup

### Option A — Vercel branch deploys (lightest)

1. Create a long-lived `staging` branch:
   ```
   git checkout -b staging
   git push -u origin staging
   ```
2. In **Vercel → Project → Settings → Git**, ensure the staging
   branch creates **Preview** deployments.
3. In **Vercel → Project → Domains**, add `staging.nexuswatch.dev` →
   point it at the staging branch.
4. Workflow: PR → merge to `staging` first, smoke-test on
   `staging.nexuswatch.dev`, then fast-forward `staging` into `main`
   for the real deploy.

### Option B — Separate Vercel project (heavier)

Spin up a second Vercel project (`dashboard-staging`) pointed at the
same git repo, configured to deploy from `staging` branch only. This
gives you fully separate env vars (e.g., a Stripe test webhook
endpoint that doesn't share signatures with prod).

## What to test on staging before promoting

- Layer manager boots in <2s with the default 18 layers
- CCTV catalog returns ≥5 cams (with or without Windy key)
- Country panel opens with all 5 sections populated
- Per-layer filter chips toggle correctly
- Audit page retries on transient 5xx
- Briefs page hero renders (Haiku or fallback)
- /api/* endpoints return 200 with correct envelopes
- No console errors on a fresh page load
- Mobile viewport (DevTools throttling) doesn't break layout

## Auth-gate caveat

Vercel preview URLs are auth-gated by default for this org. Either:
- Disable preview protection on the staging URL only (Vercel → Settings
  → Deployment Protection → Add bypass rule for the staging domain), or
- Use the `vercel-bypass` query parameter for testing.
