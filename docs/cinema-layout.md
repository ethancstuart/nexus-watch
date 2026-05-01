# Cinema Layout — change log (Track B1)

This document describes the layout contract for `#/intel` Cinema mode after
the `feat/cinema-hud-reflow` reflow. It exists so Track C (landing rebuild)
and Track B2 (dense pages) can know what surface state they're sharing
without reading every diff.

## What changed

The screenshot triage on 2026-04-27 surfaced six concrete bugs:

1. Persona pills (CMD/WAR/SEA/SOS/INFRA/GEO/SPACE/MIN) and the theater
   region pills were both anchored at `top: 12px; left: 50%` and crashed
   into each other at top-center.
2. Country labels from the CARTO base style were larger than data labels —
   "NORTH KOREA / SOUTH KOREA / JAPAN / MONGOLIA" stomped over earthquake
   M-values, ACLED markers, and intel pills around the Korean Peninsula.
3. Event Log permanently covered ~33% of the globe.
4. Intel Brief docked at `bottom: 0` and collided with the bottom ticker.
5. The Reset / Exit button was clipped at the top-right viewport edge.
6. The tension-score `75` was also being clipped at the top-right corner.

All six are fixed in this branch.

## Z-index — single source of truth

Every literal `z-index` in `src/styles/cinema.css` was replaced with a token
from `src/styles/tokens.css`. The scale is now:

| Layer            | Token                | Value | Used by                              |
|------------------|----------------------|-------|--------------------------------------|
| base             | `--z-base`           | 1     | page baseline                        |
| map              | `--z-map`            | 10    | MapLibre canvas                      |
| hud              | `--z-hud`            | 100   | corner brackets, scanline, HUD pills |
| panel            | `--z-panel`          | 200   | profile bar, region bar, ticker, event log, intel brief, exit button |
| modal            | `--z-modal`          | 1000  | mobile gate fail-state               |
| toast            | `--z-toast`          | 2000  | (reserved for transient toasts)      |
| cinema-intro     | `--z-cinema-intro`   | 9999  | "NEXUSWATCH LIVE" intro fade         |

Stacking inside a layer is by document order. Two adjacent panels at
`--z-panel` can still overlap each other, so we anchor them to
non-overlapping regions of the viewport instead of relying on z-order to
solve collisions.

## Top-bar layout — two stacked rows

```
top: 12px   ┌──────────────── persona pills ────────────────┐  ← .cinema-profile-bar
            │   CMD  WAR  SEA  SOS  INFRA  GEO  SPACE  MIN  │
            └────────────────────────────────────────────────┘
top: 56px   ┌──────────────── region pills ─────────────────┐  ← .cinema-region-bar
            │  Eastern Europe · Middle East · East Africa · │
            │  South China Sea · Taiwan Strait · Red Sea    │
            └────────────────────────────────────────────────┘
```

Both rows are horizontally centered (`left: 50%; transform: translateX(-50%)`),
clamp at `max-width: calc(100vw - 32px)`, and scroll horizontally if the
content overflows. Backdrop-filter blur keeps them readable over the globe.

The original `.nw-theater-bar` (the `THEATERS` strip in the standard intel
view) is hidden in cinema mode via `.nw-app.nw-cinema .nw-theater-bar`. The
cinema region bar is built from `CinemaProfile.priorityRegions` in
`src/cinema/profiles.ts`, so each persona has its own region set.

The HUD chrome that used to anchor at `top: 56px` (corner brackets,
top-left LIVE block, top-right tension score) now anchors at `top: 100px /
108px` so it clears both rows.

## Bottom layout

```
bottom: 44px  ┌─── intel brief ───┐    ← .cinema-narration (dock above ticker)
              │  INTEL BRIEF — …  │
              └───────────────────┘
bottom: 0     ████ M3.x ticker ████    ← .cinema-ticker (36px tall)
```

Intel Brief now docks at `bottom: 44px` (36px ticker + 8px gap) so the
two never overlap regardless of which event is featured.

## Country label dimming

`MapView.dimBaseStyleLabels()` runs once per `style.load` (so it survives
basemap swaps via `MapStyleToggle`). It walks every base-style symbol layer
whose id matches `\b(country|place|state|admin|city|town|locality)\b` and
overrides:

- `text-opacity`: zoom-interpolated `0.25@z2 → 0.65@z8` (ambient at globe-zoom).
- `text-size`: zoom-interpolated `10px@z2 → 14px@z8` (no more 20px+ stomps).
- `text-color`: muted gray `#7a7a7a`.
- `text-halo-color` / `text-halo-width`: black halo at 1px so labels read
  against the dark basemap without bleeding into data layers.

Each `setPaintProperty` / `setLayoutProperty` call is wrapped in a
try/catch so layers without text properties just skip silently — best-
effort dimming, never a hard failure.

## Auto-hide on idle

`CinemaMode.installIdleAutoHide()` registers `mousemove`, `keydown`,
`touchstart`, `wheel` listeners. After 10 seconds with no input
(`CINEMA_IDLE_HIDE_MS`), it adds `cinema-chrome-idle` to the app element.
That class drops `.cinema-event-log` and `.cinema-narration` to opacity
0.15, leaving them as ambient ghost panels. Hovering either panel restores
opacity 1 (CSS `:hover` rule). Any input on the document wakes the chrome
back to full opacity.

A small `.cinema-wake-dot` pulses at `bottom: 50px; left: 8px` while idle
to give the user an affordance back. Persona/region rows (navigational)
stay full opacity even when idle.

`prefers-reduced-motion: reduce` neutralizes the fade transitions and the
wake-dot pulse — visibility flips, but instantly.

## Mobile gate

`CinemaMode.enter()` checks `window.innerWidth < 1200` and renders
`.cinema-mobile-gate` instead of the broken layout. The gate offers a
"Continue to standard view" button that dismisses the gate and leaves the
user on the standard `#/intel` page (Cinema is never entered).

We use a one-shot check on entry, not a runtime resize listener — Cinema
is full-screen and doesn't reflow during a session, so a resize check would
only confuse the layout half-way through.

## Label collision — Phase 1 only

The full task included a clustering renderer that hides individual labels
for ≥3 points within a 50px screen-bbox and renders a `+N events` summary
marker that expands on click. That requires a generic clustering pass
across all 30 data layers (each owns its own MapLibre source/layer config),
and is large enough to need its own track.

Phase 1 (this branch) ships the simpler `text-allow-overlap: false` +
`symbol-sort-key` fix on the most collision-prone layer
(`earthquakes-labels`). Larger magnitudes win the collision via a negated
magnitude sort key. The remaining 29 layers default to MapLibre's
`text-allow-overlap: false` already, so they de-clutter automatically.

**TODO (Phase 2):** generic cluster-collision module that wraps every
data-symbol layer with a 50px-bbox cluster pass and renders a `+N events`
summary marker. Likely lives in `src/map/labelCluster.ts` and is registered
once per layer via `MapLayerManager`.

## Changed files

- `src/styles/cinema.css` — z-index tokens, two stacked top rows, region
  bar styles, idle auto-hide rules, wake dot, mobile gate, reduced-motion
  guard, intel brief docking, exit button repositioned.
- `src/cinema/CinemaMode.ts` — region bar lifecycle, idle auto-hide,
  wake dot, mobile gate fail-state.
- `src/map/MapView.ts` — `dimBaseStyleLabels()` invoked from `style.load`.
- `src/map/layers/earthquakeLayer.ts` — `symbol-sort-key` on
  `earthquakes-labels`.
- `docs/cinema-layout.md` — this document.
