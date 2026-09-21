# PR #53 — the endpoints the restored map fetches and production does not serve

Audit requested 2026-09-21. **#53 is not merged and this document is the reason.**

## The headline, and a correction to my own first number

I first reported **11** missing endpoints. That was an undercount from an
incomplete enumeration — my pattern only matched `fetch('/api/…')` and
`url: '/api/…'`, so it missed every path built any other way.

The real figure, measured against **#53's own preview deployment**:

| | |
|---|---|
| distinct `/api/` paths referenced in `src/` on the branch | 54 |
| served by the branch | 26 |
| **returning 404 on the branch's own preview** | **25** |

(The remaining three are not ours — fragments of a treasury.gov path, a
Wikimedia REST path, and a `/api/country/` prefix built at runtime.)

**#53 does restore twelve layer endpoints** — `acled`, `air-quality`, `aurora`,
`cyber`, `disease-outbreaks`, `displacement`, `gdacs`, `internet-outages`,
`launches`, `prediction`, `satellites`, `weather-alerts`. That part of the
handoff's claim is true. What is missing is everything else the map's mounted
components reach for.

## None of them were "never built". All 25 were deleted

| commit | date | what |
|---|---|---|
| `fef3655` | 2026-09-06 | `chore(delete): the Intel Map — 199 files, ~50,000 lines` — 23 of the 25 |
| `caef4d3` | 2026-09-06 | `chore(pr9): cadences, the country-page straggler…` — `earthquakes`, `webcam-catalog` |

The front end came back; these did not.

## What breaks, by feature

Failure mode read from each call site. Where it says **VISIBLE** I read the
rendering path and confirmed a message reaches the screen.

### Map data layers that will render empty

`earthquakes` · `fires` · `flights` · `ships` · `gdelt` · `crypto` · `stocks` ·
`energy` · `trade-flows` · `dark-vessels` · `v2/prediction-divergence`

Every one is **silent**. The layer toggle appears in the drawer, the user
switches it on, and nothing is drawn. No message, no disabled state.

`earthquakes` is the sharpest case: `CLAUDE.md` still advertises
"Earthquakes (USGS, 1min)" as a headline layer, `src/services/earthquakes.ts`
fetches `/api/earthquakes`, and the CSP added by this PR does **not** allow
`earthquake.usgs.gov` in `connect-src`, so the layer cannot be repointed at the
source without another CSP change.

### Panels that fail visibly — these are the well-behaved ones

| feature | endpoint | what the user sees |
|---|---|---|
| CCTV panel | `webcam-catalog` | "Catalog failed to load. **Try again**" |
| News view | `news`, `news-feed` | "Unable to load news feed. Try again or check /#/status." |
| Sidebar feeds | `osint-feed` | message shown |
| Timeline scrubber | `v1/timeline-data` | "History unavailable" |
| Timeline bar | `v1/timeline-data` | message shown |
| Alert builder | `parse-alert` | message shown |

### Panels that fail silently

| feature | endpoint | failure |
|---|---|---|
| AI terminal | `ai-analyst`, `sitrep` | swallowed — command returns nothing |
| Cinema narration | `cinema-narrate` | swallowed |
| Crisis playbook | `crisis/active` | returns an empty result |
| News ticker | `osint-feed`, `v1/data-lake` | swallowed / unguarded |
| CII sparklines | `v1/cii-sparklines` | swallowed — blank sparkline |
| Crisis replay | `v1/timeline-data` | unguarded |
| Landing accuracy stats | `accuracy/stats` | unguarded, in `main.ts` |
| Data-source registry | `v1/aggregation` | unguarded |

**Caveat on method.** The silent/visible split was produced by a script reading
each call site, then spot-checked by hand. The script was wrong about
`webcam-catalog` — it reported silent; the panel does render an error, from a
different method than the one that fetches. Treat "silent" as *probably silent,
confirmed only where this table says VISIBLE*.

## What I did not find

- **No CSP regression.** Codex blocked #53 on `img-src` narrowing from `https:`
  to two named hosts. There are no dynamic image sources anywhere on the branch
  — no `new Image()`, no `.src =` — and every static image is same-origin or
  NASA GIBS. The change is a tightening. Refuted.
- **The map itself works.** MapLibre initialises, canvas 1120×796, 47 layer
  toggles. My earlier "the map does not load" was an instrument fault: headless
  Chrome with `--disable-gpu` has no WebGL at all. With SwiftShader it renders.

## The choice

1. **Restore the layer endpoints worth having** and strip the rest. The eleven
   dead layers are the ones that make the map look broken, because they fail
   silently behind a toggle that promises data.
2. **Strip the panels from the deleted product** — cinema narration, crisis
   replay, dark vessels, data lake. `docs/OWNER-ACTIONS-2026-09-12.md` §5
   already recommends deleting this category.
3. **Merge as-is and fix forward** — a visible map with 25 dead paths, on a
   product whose entire asset is a checkable record.

My recommendation is 1 + 2, as a PR stacked on #53, before either merges.
Nothing on screen should promise data that cannot arrive.

## Owner decision needed

Which of the 25 are worth an endpoint, and which are features to strip.
