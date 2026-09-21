import { defineConfig, type Plugin } from 'vitest/config';
import { visualizer } from 'rollup-plugin-visualizer';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

/**
 * Emit MapLibre v6's worker, which nothing else will.
 *
 * MAPLIBRE v6 MOVED ITS WORKER OUT OF THE BUNDLE. v5 inlined it as a blob; v6
 * ships `maplibre-gl-worker.mjs` as a separate ESM file and resolves it at run
 * time from its own module URL:
 *
 *   function(){ let e = import.meta.url;
 *     let t = e.endsWith('-dev.mjs') ? 'maplibre-gl-worker-dev.mjs' : 'maplibre-gl-worker.mjs';
 *     return new URL(`./${t}`, e).href }
 *
 * Vite cannot see that. Its worker detection needs a STATIC
 * `new URL('./worker.js', import.meta.url)`; this builds the filename from a
 * variable, so no worker chunk is emitted and the computed URL —
 * `/assets/maplibre-gl-worker.mjs` — is a 404 in production.
 *
 * WHAT THAT LOOKS LIKE, because it took a long time to find: the map fetches
 * style.json, the sprite and tiles.json, and then stops. No vector tile is
 * ever requested, because the worker that parses them never starts. MapLibre
 * fires `load` only after the first VISUALLY COMPLETE render, which never
 * happens, so every `map.on('load')` handler is dead — layers never
 * initialise, counters stay at zero, and the globe renders as a bare grey
 * sphere. There is no error in the console. Measured on the PR #61 preview
 * 2026-09-21: `/assets/maplibre-gl-worker.mjs` -> HTTP 404.
 *
 * The worker imports `./maplibre-gl-shared.mjs`, so both are emitted, side by
 * side, where the computed URL expects them. The build FAILS if either is
 * missing from the installed package rather than shipping a broken map.
 */
function maplibreWorkerPlugin(): Plugin {
  const NEEDED = ['maplibre-gl-worker.mjs', 'maplibre-gl-shared.mjs'] as const;
  return {
    name: 'nexuswatch:maplibre-worker',
    apply: 'build',
    generateBundle() {
      const require = createRequire(import.meta.url);
      let distDir: string;
      try {
        distDir = require.resolve('maplibre-gl/dist/maplibre-gl.mjs').replace(/maplibre-gl\.mjs$/, '');
      } catch (err) {
        this.error(`maplibre-gl not resolvable — cannot emit its worker: ${String(err)}`);
        return;
      }
      for (const file of NEEDED) {
        let source: string;
        try {
          source = readFileSync(distDir + file, 'utf8');
        } catch {
          this.error(
            `maplibre-gl/dist/${file} is missing. MapLibre v6 loads its tile-parsing worker ` +
              `from this file at run time; without it the map fetches its style and then ` +
              `silently never renders. Refusing to build a map that cannot load.`,
          );
          return;
        }
        // The path must match what MapLibre computes: `./<file>` relative to
        // the emitted vendor chunk, which Vite puts under assets/.
        this.emitFile({ type: 'asset', fileName: `assets/${file}`, source });
      }
    },
  };
}

// Bundle analyzer is opt-in via env var to avoid slowing routine builds.
// Run with: ANALYZE=1 npm run build
const ANALYZE = process.env.ANALYZE === '1' || process.env.ANALYZE === 'true';

export default defineConfig({
  build: {
    manifest: true,
    chunkSizeWarningLimit: 1100, // MapLibre is ~1MB, expected
    rollupOptions: {
      output: {
        // Vendor chunk strategy:
        //   - vendor-maplibre: MapLibre GL is the heaviest dep (~1MB).
        //     Isolating it lets the dashboard chunk be cached independently
        //     and lets non-map routes skip downloading it entirely.
        //   - vendor-d3: d3 is only used by a handful of UI modules
        //     (sparklines, charts). Splitting prevents accidental inclusion
        //     in the landing chunk.
        //   - vendor-satellite: satellite.js is only used by the satellite
        //     map layer (lazy-loaded).
        //   - vendor-sentry: pulled in at boot but cleanly separable so
        //     parsing the main app chunk is faster.
        //   - vendor-neon: server-side data lib, tiny but split for clarity.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('maplibre-gl')) return 'vendor-maplibre';
          if (id.includes('@sentry')) return 'vendor-sentry';
          if (id.includes('satellite.js')) return 'vendor-satellite';
          if (id.includes('/d3-') || id.includes('node_modules/d3/')) return 'vendor-d3';
          if (id.includes('@neondatabase')) return 'vendor-neon';
          // Other vendor code falls into the default per-entry chunk.
          return undefined;
        },
      },
    },
  },
  // The MapLibre worker emitter is UNCONDITIONAL — it is correctness, not
  // tooling. It briefly lived in a second `plugins:` key added above this one,
  // which is a duplicate property in an object literal: the later key silently
  // won, the plugin never ran, and the build looked fine while emitting no
  // worker at all. Exactly the defect being fixed, reintroduced by the fix.
  plugins: [
    maplibreWorkerPlugin(),
    ...(ANALYZE
      ? [
          visualizer({
            filename: `docs/perf/bundle-${new Date().toISOString().slice(0, 10)}.html`,
            gzipSize: true,
            brotliSize: true,
            template: 'treemap',
            open: false,
          }),
        ]
      : []),
  ],
  test: {
    environment: 'happy-dom',
    // EXCLUDE EVERY IN-REPO COPY OF THE REPO. Two directories sit INSIDE the
    // tree and hold whole checkouts of other commits, and vitest will happily
    // run their tests as if they were this branch's.
    //
    //   `.claude/worktrees/`  — a running agent's checkout doubled the suite
    //     (429 -> 868 on 2026-08-28) and every test count taken during that
    //     window was measuring the wrong thing.
    //
    //   `.codex-reviews/`     — the MR reviewer materialises each reviewed
    //     branch with `git archive` so Codex can follow imports into the
    //     branch's own tree rather than into whatever is checked out. Those
    //     snapshots are never cleaned up, so they accumulate: on 2026-09-21
    //     eighteen of them held 436 test files against the working tree's 44,
    //     and `npx vitest run` reported "5461 tests passed" for a suite of
    //     498. Ninety percent of every local verification was other branches.
    //
    // The failure mode is the same for both and it is worse than a wrong
    // number. `.codex-reviews/` is gitignored, so CI never sees it: CI ran 44
    // files while local ran 480, and the two disagreed about what "the tests"
    // means. A stale snapshot pinned to an older commit can also fail the
    // suite for code this branch does not contain, or pass and pad the count
    // so a shrinking real suite looks healthy.
    //
    // Default excludes are restated because supplying `exclude` replaces them
    // rather than extending them.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/worktrees/**', '**/.codex-reviews/**', '**/.git/**'],
  },
});
