# NexusWatch Data Sources — Integration Roadmap

**Last updated:** 2026-04-15. See `/LAUNCH-MANUAL-STEPS.md` for env var setup.

This doc tracks every data source the platform ingests — shipped, in-flight, and
on the roadmap. Four sources landed on 2026-04-15:

## Shipped this session (2026-04-15)

| Source | Status | Tier | Requires | Cron |
|--------|--------|------|----------|------|
| OFAC SDN + UN sanctions | ✅ scaffold | free | — | `/api/cron/source-ofac` |
| V-Dem democracy indicators | ✅ scaffold | free | `VDEM_DATA_URL` (NDJSON mirror) | `/api/cron/source-vdem` |
| NOAA tropical storms | ✅ live | free | — | `/api/cron/source-noaa-storms` |
| Copernicus EMS damage | ✅ scaffold | free | — | `/api/cron/source-copernicus` |

To enable: apply `docs/migrations/2026-04-15-data-sources.sql`, then add
the crons to `vercel.json` (done) and let them run on their schedule. No
API keys required for OFAC/UN, NOAA, or Copernicus — they're public feeds.
V-Dem requires a pre-processed NDJSON mirror (see `source-vdem.ts` header).

## Roadmap — paid maritime sources (Q3 2026)

| Source | Est. cost | Unlocks | Effort |
|--------|-----------|---------|--------|
| MarineTraffic | $500-2000/mo | Dark-vessel detection + sanctioned tanker tracking | M |
| Kpler | $2000+/mo | Real-time oil/LNG flow + tank-farm imagery | M |
| Windward | enterprise | Dark-vessel + sanctions enforcement | M |

Gate: wait until paid-tier revenue covers the subscription (break-even ~20 Pro subs).

## Roadmap — free sources, lower priority

| Source | Category | Effort | Blocker |
|--------|----------|--------|---------|
| Global Fishing Watch (GFW) | maritime | S | Free API key registration |
| Space-Track TLEs | space | S | US citizen account required |
| Crisis Group RSS | conflict | S | Just RSS scraping |
| ISW daily updates | conflict | M | RSS + NLP parsing |
| Airwars civilian casualties | conflict | S | Web scrape |
| IOM Displacement Tracking Matrix | migration | S | Needs API access request |
| ECDC disease surveillance | health | S | Public feed |
| ProMED Mail RSS | health | S | Public RSS |
| EIA Petroleum status | energy | S | Free API key |
| ENTSO-E European grid | energy | S | Free API key |
| UN Comtrade | trade | S | Free but heavy dataset |
| Transparency Int'l CPI | governance | S | Yearly CSV |

## Integration pattern

Every data source follows the same scaffold:

1. **Migration**: one table per source. Use UNIQUE constraints + UPSERTs for idempotency.
2. **Cron**: `api/cron/source-<name>.ts`. Protected by `CRON_SECRET`. Returns
   structured counts of ingested/skipped/errors so Vercel logs are actionable.
3. **Env var gate**: if the source needs a key, check `process.env.X` and return
   `{ skipped: true, reason: 'env_not_set' }` rather than 500.
4. **Hash-based short-circuit**: store the last feed hash in KV with a 7-day TTL;
   skip the ingest pass when the hash is unchanged. Keeps Neon writes minimal.

## What we're intentionally NOT building

- **Bloomberg / Refinitiv / Stratfor redistribution** — terms-of-service prohibit.
- **Scraped Twitter firehose** — API cost + legal risk.
- **Commercial satellite imagery** (Maxar, Planet) — cost gate; use Copernicus.
- **Telegram channel monitoring** — operational risk + legal greys.
