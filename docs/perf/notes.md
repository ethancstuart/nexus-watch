# Performance Lane Notes

Branch: `feat/performance` (off main).

## What this lane shipped

1. **Cinema mode dynamic-imported** — 38KB chunk now loads on first
   button click instead of at page boot. See
   `perf: dynamic-import Cinema mode` commit.
2. **Vite manual chunks** — vendor splits for maplibre, d3, satellite.js,
   sentry, neon. Plus `rollup-plugin-visualizer` behind `ANALYZE=1`.
3. **Resource hints** — added preconnect for `unpkg.com` and dns-prefetch
   for two more first-fetch API hosts (GDELT, NASA FIRMS).
4. **MapLibre boot tweaks** — `fadeDuration: 300`, explicit
   `maxParallelImageRequests: 16`.
5. **Deferred maplibre-gl.css** — was render-blocking on every route;
   now injected lazily by `MapView.init()` only on `/#/intel`.

## Bundle size: before vs after

| Chunk | Before (KB) | After (KB) | Delta gzip |
| --- | --- | --- | --- |
| `nexuswatch` (dashboard entry) | 438.85 | 340.99 | **-31 KB gzip** |
| `index` (main app entry) | 84.89 | 84.94 | flat |
| `vendor-maplibre` | 1047 | 1047 | flat (unchanged) |
| `vendor-d3` (new) | (inlined into nexuswatch) | 61.43 | now cacheable |
| `vendor-satellite` (new) | (inlined into satelliteLayer) | 21.26 | now cacheable |
| `CinemaMode` (new lazy chunk) | (inlined into nexuswatch) | 37.77 | lazy-only |

## Lighthouse (local preview, headless Chrome, default throttling)

Landing (`/`):
- performance **94** (target ≥90 ✓)
- accessibility 92, best-practices 100, seo 100
- LCP 2.5s, FCP 2.5s, TBT 0ms, CLS 0

Dashboard (`/#/intel`):
- performance **72** (target ≥80 ✗ — 8 short)
- accessibility 93, best-practices 96, seo 100
- LCP 5.5s, FCP 3.4s, TBT 45ms

The dashboard miss is dominated by:
- Google Fonts (Inter + JetBrains Mono) blocking the LCP text element
  (the loading-overlay headline). `display=swap` is set, but Lighthouse
  still measures the swap-in.
- MapLibre GL (`vendor-maplibre`, 1MB raw / 282KB gzip) is required for
  the map and can't realistically shrink without forking maplibre.

Both belong to other lanes:
- The landing rebuild (Track C) will replace the loading overlay text
  and may switch fonts, which would lift dashboard LCP cleanly.
- A future MapLibre lane could explore a self-hosted, narrower style
  with fewer source layers (the basemap fetches ~30 sources we never
  render).

## Service Worker

A SW is already registered in `index.html` (`/sw.js`) with a precache
manifest auto-injected by `scripts/inject-sw-manifest.js` (87 →
post-changes 91 assets). This lane did **not** modify the SW — per the
brief, the landing rebuild lane (Track C) may change the cache strategy
and we want to avoid churn.

TODO for whoever owns the SW lane next:
- Audit whether the network-first API strategy is appropriate for the
  Stripe checkout/portal endpoints (they should always go to network).
- Confirm the cache-versioning bumps are firing on each deploy (search
  for `CACHE_NAME` in `public/sw.js`).
- Consider precaching the maplibre-gl.css now that it's deferred — this
  is the main candidate for a SW-level optimization.

## Files touched

- `vite.config.ts` — vendor chunks + ANALYZE plugin
- `index.html` — preconnect for unpkg, dns-prefetch for GDELT/FIRMS,
  maplibre-gl.css moved to `<noscript>`
- `src/map/MapView.ts` — `fadeDuration`, `maxParallelImageRequests`,
  `ensureMaplibreStylesheet()`
- `src/pages/nexuswatch.ts` — Cinema becomes a lazy proxy
- `package.json`, `package-lock.json` — `rollup-plugin-visualizer`
- `docs/perf/bundle-2026-05-01.html` — `ANALYZE=1` treemap
- `docs/perf/lighthouse-{landing,dashboard}-2026-04-27.report.{json,html}`

## Outside this lane (intentional)

- Did not lazy-load admin V2 — admin pages are already gated by the
  router's dynamic import; the inner `v2ShellHtml()` call inside the
  template literal would require restructuring with no real savings
  since admin is never on the critical path.
- Did not strip the rotating-globe behavior even though it's a tiny
  CPU cost — Cinema lane (Track B1) owns globe motion.
- Did not modify any layer code (Track A owns Stripe).
- Did not touch design tokens (Track D).
