# Runbook — Mobile QA checklist

Run on a real iPhone (Safari) and an Android device (Chrome) before
promoting major UI changes.

## Setup

- iPhone 13 / iPhone SE (3rd gen) — represents the modal Safari user
- Pixel 6+ on Chrome — Android baseline
- Throttle to "Slow 4G" in DevTools for the desktop simulation

## Smoke

### Landing
- [ ] Hero "Open the dashboard" CTA is tappable (≥44×44)
- [ ] No horizontal scroll
- [ ] Tap targets in nav are reachable with thumb

### Intel map
- [ ] Globe boots in <4s on Slow 4G
- [ ] Default zoom shows full sphere (zoom 1.5)
- [ ] Quick-filter chip strip horizontally scrolls smoothly
- [ ] Right-edge gradient hint is visible to indicate more chips
- [ ] Tap on chip toggles layer in <100ms
- [ ] LAYERS drawer opens, scrolls, closes via tap-backdrop
- [ ] Backdrop-filter blur is OFF (replaced with flat surface)
- [ ] Click country → panel opens, scrolls, all 5 sections render
- [ ] Pinch-zoom works on the globe
- [ ] Two-finger rotation works (touch event)

### CCTV modal
- [ ] Cards stack 1-2 columns on small screen
- [ ] Iframe streams work (NASA ISS, Iceland)
- [ ] Open feed → opens new tab
- [ ] Fly-to → globe pans

### Briefs
- [ ] Sample hero renders 3 cards stacked
- [ ] Tap card → opens brief detail
- [ ] Subscribe form submits

### Country panel sections
- [ ] Top Entities expanded by default
- [ ] Trade / Alliances / Energy / Headlines collapsible
- [ ] Headlines tap → opens article in new tab

## Known issues to verify post-fix

- Cinema mode: untested with new zoom default (was zoom 3.8 + pitch
  10°, now zoom 1.5 + pitch 0). Open `/intel?cinema=1` and walk it.
- The 18 default layers may render too dense on a small screen —
  consider whether the mobile default (currently 4 layers) needs
  to fall back from 4 to 2 on iPhone SE.

## Tooling

- **Playwright** with iPhone 13 + iPhone SE device profiles can
  automate most of this. See `scripts/smoke-personas.ts` (specced
  but not yet implemented).
- **Lighthouse Mobile** in Chrome DevTools surfaces perf regressions
  fast.
