# ReliefWeb API Registration — appname for `nexuswatch`

ReliefWeb's public API requires an approved `appname` parameter on all
requests. Without it, the v2 API returns HTTP 403. The v1 API was
decommissioned 2026-04 so we have no fallback.

## Action required (Ethan)

ReliefWeb does not have a self-service registration form. Send an email
to **api@reliefweb.int** with the message below. Approval typically
takes 1–3 business days.

---

**To:** api@reliefweb.int
**From:** ethan.c.stuart@gmail.com
**Subject:** Approved appname request for "nexuswatch"

Hello ReliefWeb team,

I'm requesting an approved `appname` for our public-facing platform.

- **Project name:** NexusWatch
- **Production URL:** https://nexuswatch.dev
- **Description:** Open-source geopolitical intelligence platform — a
  3D globe with 45+ data layers covering conflict, hazards, trade,
  cyber, and humanitarian crises across 158 countries. The platform is
  free, MIT-licensed, and serves analysts, journalists, and policy
  researchers. Currently active monthly users measured in the low
  thousands.
- **Requested appname:** `nexuswatch`
- **API usage profile:**
  - Endpoint: `/v2/disasters` (read-only)
  - Cadence: 1× hourly cron + on-demand reads on country detail panels
  - Cached server-side for 60 minutes; expected upstream calls ≤ 50/day
  - User-Agent always sent: `NexusWatch/1.0 (https://nexuswatch.dev)`
- **Data use:** Disaster events shown in the country panel and a future
  "Humanitarian" map layer. ReliefWeb is credited inline ("Source:
  ReliefWeb / OCHA") with link-back to the source page on every event.
- **Contact:** ethan.c.stuart@gmail.com (project maintainer)

Happy to provide any additional information. Thank you for the work
ReliefWeb does.

— Ethan Stuart, NexusWatch

---

## Once approved

The codebase already uses `appname=nexuswatch` in `api/reliefweb.ts` and
`api/cron/source-reliefweb.ts`. No code change needed — the endpoint
will start returning data automatically as soon as the appname is on
ReliefWeb's allowlist.

To verify after approval:

```bash
curl 'https://nexuswatch.dev/api/reliefweb?country=UA&limit=3' | jq .
# Should now return { "events": [...] } instead of awaiting-upstream-registration.
```
