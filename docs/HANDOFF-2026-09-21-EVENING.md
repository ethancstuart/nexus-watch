# Handoff — 2026-09-21, evening

Supersedes `docs/HANDOFF-2026-09-21.md`. Read this, then
`docs/SITUATION-ROOM-SPEC-2026-09-21.md` (the build order), then
`docs/OPERATIONAL-KNOWLEDGE.md`.

Work in `~/Projects/nexus-watch-sweep`, branch
`feat/restore-map-layer-endpoints`.

---

## The decision that governs everything

**Build the Situation Room.** The front door becomes a ranked feed of
situations; the map is demoted to an evidence view reached from one. Owner
decided 2026-09-21 and said "build it".

**Who it is for** (owner's answer, and it rules one reader OUT):
the curious smart outsider · the professional analyst · and it is a portfolio
piece. **NOT** the operator with positions at risk — so **no personalisation
anywhere**: nothing asks what you own, nothing infers exposure, nothing ranks
by "your" anything. That also removes the largest fabrication temptation in the
design.

The tension between outsider (clarity) and analyst (density) resolves as
**progressive disclosure**: plain language on the surface, every claim one
click from its evidence.

---

## Where the build actually is

The spec's build order has 10 steps. **Steps 1 and 2 are done.**

**Step 1 — DONE** (`0e7b305`). Server-side aggregates in
`api/_lib/ledger-by-kind.ts`, all model-free:
- **Per-kind calibration bands** (`bands`) — n, units, batches, predicted,
  observed, and `withheld_because`. Never pooled.
- **Per-batch records** (`batches_detail`) — one per `resolves_on`.
- **The counter-reading** — fires when hit rate and skill disagree.
- **The withheld rule gained its missing axis**: `MIN_INDEPENDENT_UNITS = 3`
  in `api/_lib/calls.ts`, enforced in `publishableSkill`. Batches alone were
  vacuous — Egypt has 16 overlapping windows and 1 unit.
- Verified by `api/_lib/ledger-bands.test.ts`: recomputes every band from
  `ledger-snapshots/2026-09-20.json` (1,302 real rows) with a second naive
  implementation sharing no code, and asserts exact agreement across all three
  kinds. 9 assertions.

**Step 2 — PARTLY DONE** (`34a8170`). Of the three deletions the council
ordered, only one premise survived checking:
- **DONE** — `chokepointStatusLayer.computeStatuses()` hardcoded six threat
  levels ("Suez Canal ELEVATED" came from source, not data). Removed;
  `unknown` is now a first-class status labelled `NO STATUS FEED`, rendered in
  tertiary grey so it cannot read as a mild reading.
- **NOT DONE, deliberately** — `api/acled.ts`. It does not call ACLED; it reads
  `cached_layer_data` (0 rows) and returns empty honestly. Not a fabrication.
- **NOT DONE, next task** — the pooled `scoring.calibration` figure in
  `src/pages/landing.ts:319`. It IS misleading and must go, but removing it
  leaves the hero empty. Replace it with the per-kind `bands` from step 1.

**NEXT: finish step 2 (the landing figure), then steps 3–10.** Step 4 (the
edition skeleton at `/`) is described in the spec as a shippable product on its
own, containing no generated text.

---

## Open questions the owner has NOT answered

From the spec's own list. Two matter before building further:

1. **The 54 corrections** — do they re-score into the kind's Brier, or stay
   alongside the published verdict? Changes the masthead figures.
2. **All 14 seismicity controls resolve 2026-09-22** — from then the live book
   is 100% one automated FX screen. Mint a new control batch, or say so?

Also open: whether `/map` keeps its own nav entry; whether the FX open calls
carry a marker for the 0.4→0.2 weight change; the masthead name.

---

## What is merged, open, and held

**Merged to main today:** #54 #55 #56 (dark register, fonts, handoff), #57
(corrected reading published beside the published one), #58 (FX weight 0.4→0.2),
#59 (vitest excludes `.codex-reviews`), #60 (SPA reads register palette), #62
(operational knowledge), #63 (CI runs on stacked PRs).

**Open:**
- **#61 → #53** — the map stack. All the Situation Room work is on this branch.
- **#64** — OONI probe timeout. Green, Codex blocker answered on the PR (it is
  a per-file artefact; measured refutation is in a PR comment).
- **#53** — held by owner. **#38** — held, and it drops `vessel_gaps` which
  `/api/dark-vessels` reads.

---

## Owner actions still outstanding

1. **Rotate the Mapbox token.** Oldest item, a live credential leak. Steps in
   `docs/OWNER-ACTIONS-2026-09-12.md` §1. Owner said "later" on 2026-09-21.
2. Four API keys, all degrade honestly without them: `NASA_FIRMS_KEY`,
   `EIA_API_KEY`, `FINNHUB_API_KEY`, `AISSTREAM_API_KEY`.
3. `/briefs` is still ivory while `/ledger` is dark — breaking that coupling to
   `email-tokens.ts` is the owner's call.
4. **ACLED is dead at DNS.** `api.acleddata.com` does not resolve (the parent
   does). `compute-cii.ts:251` records it. `liveConflict` is therefore
   structurally zero on a product whose top CII scores are YE SY SD SS AF.
   Needs a replacement feed decision.

---

## Things that cost hours today — do not rediscover them

- **The map's stuck boot screen was one missing file.** MapLibre v6 loads its
  tile-parsing worker from a SEPARATE file resolved at run time from
  `import.meta.url`. Vite cannot see that (the filename is built from a
  variable), so it emitted no worker and `/assets/maplibre-gl-worker.mjs` 404'd.
  No tiles → no visually-complete render → `load` never fires → every
  `map.on('load')` handler dead. No console error anywhere. `vite.config.ts`
  emits it now and `scripts/check-build-output.mjs` fails the build if it is
  ever missing again.
- **CSP `*.host` matches subdomains ONLY, never the bare host.** That blocked
  the basemap style. `check:csp-map-hosts` guards it.
- **Headless Chrome cannot verify a WebGL map.** `--disable-gpu` gives no WebGL
  at all; with SwiftShader it renders but `--screenshot` still cannot composite
  the canvas. The claude-in-chrome MCP tab is worse — it is a hidden tab, so
  `requestAnimationFrame` never fires. Use `--log-net-log` and count tile
  requests; that is the honest instrument.
- **The Codex reviewer reads ONE FILE AT A TIME.** Its commonest false blocker
  is "this change breaks callers" when the callers were updated in the same
  commit, in a file it was not shown. Refute with `grep -rn <symbol>`,
  `npm run typecheck`, and package.json `private`/`main`/`exports`.
- `npm run validate` trips on untracked scratch (tree-wide `format:check`). Use
  typecheck + vitest + guards + lint.
- The git index.lock races against the pre-push hook. Stage and commit in
  SEPARATE Bash calls.

---

## Standing rules

Measure every claim before acting on it, including a council's or a reviewer's.
Plant-test every guard both ways and read exit codes unpiped. Never let the
email go dark. Never rewrite a resolved call. Nothing is ever fabricated — an
empty layer is a fact. Ask before anything destructive. Owner tasks one step
at a time.
