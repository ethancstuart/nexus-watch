# Runbook — Database backup & recovery

**Provider:** Neon Postgres (`snowy-snow-85076940`)
**Connection string:** `DATABASE_URL` in Vercel (pooled) +
`POSTGRES_URL_NON_POOLING` (unpooled, for migrations).

## What's in the database

- `daily_briefs` — historical briefs (powers archive)
- `cii_history` — CII score snapshots over time
- `audit_log` — evidence chain entries per CII computation
- `alert_subscriptions` — user watchlists + alert rules
- `email_subscriptions` — beehiiv-mirror table for delivery
- `marketing_*` — Track C social automation queues

## Backup posture (verify on Neon dashboard)

Neon's standard plan includes:
- **Point-in-time recovery (PITR)** to any second within the last 7
  days (Hobby) or 30 days (Pro). Confirm via **Neon Console → Project
  → Branches → main → Restore Branch**.
- **Automatic snapshots** taken hourly.

## To verify PITR is enabled

```
neonctl branches list
# If only one branch (main), PITR is the only recovery path.
neonctl branches restore main --to-timestamp <ISO-8601>
# Restoring creates a new branch; you can then point DATABASE_URL at it
# in Vercel and redeploy.
```

## Disaster recovery procedure

If the main branch is corrupted or dropped:

1. `neonctl branches list` — pick the most recent good branch or
   timestamp.
2. `neonctl branches restore main --to-timestamp <TS> --new-branch recovery`
3. Get the new branch's connection string:
   `neonctl connection-string recovery`
4. In Vercel, replace `DATABASE_URL` and `POSTGRES_URL_NON_POOLING`
   with the recovery branch's strings.
5. Redeploy: `vercel deploy --prod --yes`
6. Once verified, promote the recovery branch to main in Neon Console
   and rotate the env vars back to the canonical names.

## Manual snapshot before risky changes

Before running migrations or large data deletions:

```
neonctl branches create --from main --name pre-migration-$(date +%Y%m%d)
```

This is free, instant, and gives you a point-in-time fallback.
