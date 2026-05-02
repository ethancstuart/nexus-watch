# Runbook — External webcam links policy

The CCTV modal links out to vendor sites (windy.com, youtube.com,
nasa.gov, livefromiceland.is, skylinewebcams.com, ndbc.noaa.gov,
kennedyspacecenter.com). These are external, not operated by
NexusWatch.

## Current safeguards (verified in `src/ui/cctvPanel.ts`)

- All `window.open()` calls use `'noopener,noreferrer'` — prevents
  the opened tab from accessing window.opener and prevents the
  Referer header from leaking the user's NexusWatch state.
- All embedded iframes carry `sandbox="allow-scripts allow-same-origin
  allow-presentation"` (no top-navigation, no forms) and
  `referrerpolicy="no-referrer"`.
- Vercel CSP `frame-src` allowlist limits iframe sources to the five
  approved providers.
- Each card displays the source name (NASA / Windy.com / NOAA / etc.)
  so the user knows the destination before clicking.

## What's still possible

If a vendor site is later compromised:
- Their JS could ask the user for camera/mic — Permissions-Policy
  blocks both globally (`camera=(), microphone=()`).
- Their JS could phish — only matters for users who didn't notice
  the URL bar change. Mitigate by including the source label visibly.

## Response procedure if a vendor is compromised

1. Identify the vendor (e.g., earthcam.com flagged on a security
   feed).
2. Edit `src/ui/cctvPanel.ts` — comment out the affected entries in
   `LIVE_IFRAME_CAMS` and remove the seed location from
   `api/webcam-catalog.ts` if applicable.
3. Update the CSP `frame-src` in `vercel.json` to remove the host.
4. Deploy: `vercel deploy --prod --yes`.
5. The webcam catalog cache TTL is 1h, so the change propagates in
   ≤1h. Force-refresh with `?cache_buster=N` if urgent.

## Allowlist review cadence

Recommend reviewing the CSP `frame-src` and `LIVE_IFRAME_CAMS` list
quarterly. New additions go through a quick check: HTTPS, no known
breach in the past year, embed terms allow display.
