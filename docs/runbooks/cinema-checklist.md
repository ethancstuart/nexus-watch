# Runbook — Cinema mode QA

Cinema mode is the wall-display variant of NexusWatch. Slow rotating
globe, alert pills cycling, large-screen aesthetic. Open via:

```
https://nexuswatch.dev/intel?cinema=1
```

or click the cinema CTA on the landing page.

## After 2026-05-02 changes verify

- [ ] Boot path still loads CinemaMode chunk lazily (~40KB)
- [ ] Default zoom 1.5 + pitch 0 looks correct in cinema framing
  (the original cinema design was pitched at 10° — confirm it
  doesn't look flat)
- [ ] Backdrop-filter is enabled (we only disabled it on mobile
  <900px; cinema is desktop-only)
- [ ] Alert pills cycle through the Intel Bar
- [ ] Globe rotation continues without user input
- [ ] Quick-filter chip strip is HIDDEN in cinema mode (the wall
  audience can't tap it; verify CSS hides it)
- [ ] Watchlist orange rings are visible at zoom 1.5

## Known unknowns

- The pitch change from 10° → 0° may have flattened the dramatic
  3D angle that made cinema mode visually distinctive. If it does,
  consider conditionally restoring pitch for the cinema URL only:

```ts
// In src/map/MapView.ts init()
const isCinema = new URLSearchParams(window.location.search).get('cinema') === '1';
pitch: isCinema ? 10 : 0,
```

## Smoke

1. Open `/intel?cinema=1` on a 1920×1080 desktop browser
2. Wait 30s — confirm rotation and alert pill cycling
3. Open DevTools console — confirm 0 errors
4. Resize to 1280×800 — layout should still center the globe
