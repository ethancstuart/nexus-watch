/**
 * The built site contains the files it will ask for at run time.
 *
 * WHY. MapLibre v6 loads its tile-parsing worker from a SEPARATE file,
 * resolved at run time from its own module URL:
 *
 *   let t = import.meta.url.endsWith('-dev.mjs') ? 'maplibre-gl-worker-dev.mjs'
 *                                                : 'maplibre-gl-worker.mjs';
 *   return new URL(`./${t}`, import.meta.url).href
 *
 * Vite's worker detection needs a STATIC `new URL('./worker.js',
 * import.meta.url)`. This builds the name from a variable, so Vite emitted no
 * worker and the computed URL — /assets/maplibre-gl-worker.mjs — was a 404 in
 * production for the entire life of the restored map.
 *
 * WHAT THAT LOOKED LIKE, recorded because nothing pointed at the cause: the
 * map fetched style.json, the sprite and tiles.json, then stopped. Not one
 * vector tile was ever requested, because the worker that parses them never
 * started. MapLibre fires `load` only after the first VISUALLY COMPLETE
 * render, so `load` never fired, every map.on('load') handler was dead, no
 * layer initialised, every counter stayed at zero, and the globe rendered as a
 * bare grey sphere. No error anywhere — not in the console, not in the network
 * log, not in CI, which was green throughout.
 *
 * A typecheck cannot see this and a unit test cannot see this. It is a
 * property of the BUILD OUTPUT, so it is checked against the build output.
 *
 * Usage: node scripts/check-build-output.mjs   (runs as part of `npm run build`)
 */
import { existsSync, statSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = join(ROOT, 'dist', 'assets');

if (!existsSync(ASSETS)) {
  console.error('[check-build-output] FAILED — dist/assets does not exist; run the build first');
  process.exit(1);
}

/**
 * Derived from what the bundle actually references, not from a list. If the
 * emitted MapLibre chunk names a sibling .mjs, that sibling has to be there.
 */
const bundles = readdirSync(ASSETS).filter((f) => /^vendor-maplibre.*\.js$/.test(f));
if (bundles.length === 0) {
  console.log('[check-build-output] OK — no MapLibre chunk in this build, nothing to check');
  process.exit(0);
}

const failures = [];
for (const bundle of bundles) {
  const src = readFileSync(join(ASSETS, bundle), 'utf8');
  const referenced = [...new Set([...src.matchAll(/["'`](maplibre-gl-[a-z-]+\.mjs)["'`]/g)].map((m) => m[1]))]
    // The -dev variants are only reached from a dev build of MapLibre itself.
    .filter((f) => !f.includes('-dev'));
  for (const file of referenced) {
    const path = join(ASSETS, file);
    if (!existsSync(path) || statSync(path).size === 0) {
      failures.push(`${bundle} resolves "./${file}" at run time, but dist/assets/${file} is missing`);
    }
  }
}

if (failures.length > 0) {
  console.error('[check-build-output] FAILED — the build will 404 on its own runtime imports:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\n  MapLibre resolves its worker from its own module URL, so the file must sit\n' +
      '  beside the emitted chunk. vite.config.ts emits it; if this fails, that plugin\n' +
      '  is not running. A missing worker does not error — the map simply never renders.',
  );
  process.exit(1);
}

console.log('[check-build-output] OK — every sibling module the MapLibre chunk resolves at run time is present');
