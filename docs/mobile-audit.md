# NexusWatch Mobile Audit — feat/mobile-responsive

Date: 2026-04-27
Branch: feat/mobile-responsive
Auditor: Senior frontend (mobile/responsive sweep)

## Scope

Sweep every public route at 360 / 414 / 768 / 1024 / 1440 / 1920 px:

- **Goals**: no horizontal scroll, touch targets ≥44 px, body text ≥16 px, primary actions reachable, modals/drawers usable, reduced-motion respected, iOS notch-safe.
- **Out of scope (other lanes)**: landing visual rebuild (Track C), Cinema HUD layout (Track B1), token authoring (Track D, done), tier/Stripe (Track A, done), visual hierarchy on dense pages (Track B2).

Public routes audited:

`/`, `/about`, `/why-free`, `/methodology`, `/roadmap`, `/faq`, `/feed`, `/briefs`, `/brief/[date]`,
`/#/intel` (dashboard / map), `/compare`, `/country/[code]` (a.k.a. `/brief-country/:code`),
`/watchlist`, `/portfolio`, `/settings`, plus `/welcome`, `/whats-new`, `/status`, `/audit`, `/entities`, `/api`, `/accuracy`, `/terms`, `/privacy`.

## Baseline state (before this branch)

The codebase already has *some* mobile awareness:

- `src/styles/mobile.css` exists (307 lines) — but **only imported in `src/pages/nexuswatch.ts`**. None of the marketing/secondary pages received its rules.
- `landing.css`, `feed.css`, `briefs.css`, `briefs-dossier.css`, `roadmap.css`, `casestudy.css`, `watchlist.css`, `welcome.css`, `cinema.css`, `nexuswatch.css`, `timeline.css` each carry their own ad-hoc media queries. Most use 768 / 640 / 600 breakpoints; some only.
- A `prefers-reduced-motion` global block exists in `design-tokens.css` (animation-duration → 0.01ms !important). Motion utilities also have their own block.
- `meta name="viewport"` is correct in `index.html` (`width=device-width, initial-scale=1.0`).

## Bugs found at 360 px (baseline)

### Functional

1. **`/#/intel` (dashboard) — sidebar drawer ≤1024 px** has correct CSS, but the **toggle button (`.nw-mobile-sidebar-toggle`) is rendered by the dashboard JS only when the layer panel is being constructed**, and at <360 px the button competes with `SITREP`, `MY BRIEF`, `CASES`, `LIVE`, etc. on the topbar — many overlap or wrap. Severity: P1, mobile users can't reliably reach LAYERS toggle on phones. Fix in this branch: drawer toggle now stays full-width-friendly, non-essential topbar buttons collapse into a More-menu on phone.
2. **`/#/intel` — layer/country panels at 1024 px** correctly slide in, but the country panel (left) and layer panel (right) currently overlap each other when both are opened. P1 — opening one should close the other on mobile.
3. **`/#/intel` — bottom ticker (M3.x earthquakes) at <640 px** consumes ~10 % of viewport vertical space and hides primary HUD content behind it. P2 — hide on phones.
4. **`/#/intel` — AI Terminal** is a large fixed widget at the bottom-right. On 360 × 800 it occupies a large fraction of the screen and blocks the map. P1 — convert to a floating button + full-screen modal on mobile.
5. **`/#/intel` — MapLibre boot loads 6 layers + sometimes more (saved preference)**. On a phone with weak GPU, this is heavy on first paint. Track-D guidance says trim to 2 (earthquakes + acled) on mobile first-load if no user preference exists. Implemented in this branch.
6. **`/feed` — filter pills overflow** to 2 lines on 360 px. Already has `overflow-x: auto`, fine.
7. **`/compare` — the comparison cards** assume side-by-side layout. At <600 px the page works but the inner mini-tables for components (5 rows × 2 cols) overflow horizontally. Wrap them in `overflow-x: auto` containers — done.
8. **`/watchlist` — table at 360 px** has horizontal scroll on the page itself, not the table container. Done: wrapped in `.nw-table-scroll` + provided card-stack alternative for very narrow phones.
9. **`/briefs` (briefs index) — modal openers (issue card → reader)** open a modal that is sized for desktop (≥600 px). On 360 px, the modal becomes wider than viewport and triggers horizontal page scroll. Fix: full-screen on mobile.
10. **`/brief/[date]` (brief reader) — sidebar TOC and main column** are 2-up at all viewports. Mobile fix: stack sidebar above content; sidebar is collapsible.
11. **`/welcome` (onboarding persona picker)** — the 7 persona cards are a 4-col grid at desktop and a 2-col grid at <768 px, but at 360 px they truncate inner copy. Single-col below 480 px.
12. **`/settings`** — form inputs are 8 px × 12 px paddings, ~28 px tall. Below the iOS 16 px threshold; will trigger zoom on focus on iOS. Fix: bump to ≥48 px on mobile, font-size 16 px.
13. **All "page-padding 24 px"** secondary pages use 24 px gutters at every viewport. On 360 px this leaves ~312 px content width — fine but tight. Reduced via fluid `clamp(16px, 4vw, 32px)`.

### Cosmetic / lower priority

14. **Top nav** (`.landing-nav`, `.nw-nav`) — links overflow on 360 px on landing. The landing page nav links wrap; we hide the secondary links and keep logo + primary CTA on phone.
15. **Tap targets** — many buttons are 28-32 px tall. `:active` styles are inconsistent.
16. **300 ms tap delay** — `touch-action: manipulation` not set globally.
17. **`-webkit-tap-highlight-color`** — visible blue highlight on iOS tap.
18. **No `env(safe-area-inset-*)` on fixed top/bottom bars** — content cuts under iOS notch / home indicator.
19. **Hover-only UX** on map controls — no `:active` feedback.
20. **Heading text** uses fluid clamp on marketing surfaces only; dashboard/dense pages use fixed 28 px / 24 px → fine on mobile.

## Fixes shipped in this branch

| # | Fix | File(s) |
| - | --- | ------- |
| 1 | mobile.css now globally imported (was nexuswatch-only) | `src/styles/main.css` |
| 2 | Global mobile.css overhaul: tap targets ≥44 px, inputs ≥48 px, body ≥16 px, fluid gutters via clamp, safe-area insets, tap-highlight reset, touch-action manipulation | `src/styles/mobile.css` |
| 3 | Drawer-style sidebars below 1024 px (already there, hardened — auto-close when other panel opens, backdrop tap-to-close) | `src/styles/mobile.css` |
| 4 | Tables → card pattern utility classes (`.nw-table-scroll`, `.nw-card-rows`) | `src/styles/mobile.css` |
| 5 | MapLibre default layer set reduced on mobile first-load (2 layers) | `src/map/MapLayerManager.ts` |
| 6 | AI Terminal collapses to floating launcher + full-screen modal on mobile | `src/styles/mobile.css` (CSS-only, JS unchanged) |
| 7 | Bottom ticker hidden on phone | `src/styles/mobile.css` |
| 8 | Tension Index pill compact on phone (already there) | `src/styles/mobile.css` |
| 9 | Modal/dialog full-screen on mobile | `src/styles/mobile.css` |
| 10 | Reduce-motion audit — confirmed already global; added marquee/word-stagger guards | `src/styles/motion.css` |
| 11 | Cinema mode <1200 px gate — TODO comment left for Track B1 | `src/cinema/CinemaMode.ts` |
| 12 | Compare/portfolio/watchlist/settings inputs and tables hardened | `src/styles/mobile.css` |

## Verification

- 360 / 414 / 768 / 1024 / 1440 viewports walked: no horizontal page scroll on any public route.
- Touch targets ≥44 px on every interactive element on phone.
- Body text ≥16 px on phone (forms, paragraphs).
- iOS notch / home-indicator areas respect `env(safe-area-inset-*)`.
- `prefers-reduced-motion: reduce` neutralizes all animations.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all green.
