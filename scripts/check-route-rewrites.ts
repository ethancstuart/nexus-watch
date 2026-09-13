/**
 * Every SPA route a reader can type is served when they type it.
 *
 * WHY. A single-page route only exists in the browser. Arriving at it
 * directly — from a link, a bookmark, a search result, a shared URL — hits
 * Vercel, which knows nothing about the client router unless vercel.json
 * rewrites the path to index.html. Two routes had no rewrite and answered a
 * bare 404 in production: `/api` (the API documentation page) and `/welcome`.
 * A third rewrite, `/api-docs`, pointed at a path the router has never served,
 * so it rendered the 404 page with a 200.
 *
 * Three separate lanes of the 2026-09-12 audit each ended by proposing this
 * guard and none of them wrote it.
 *
 * THE DERIVATION. The route table is read from src/main.ts and the rewrite
 * table from vercel.json, and the two are compared. A route added tomorrow is
 * in scope the moment it is registered; a rewrite for a route that does not
 * exist is reported too, because that is how /api-docs survived. Parameterised
 * routes (`/brief/:date`) are matched against a rewrite whose source carries a
 * pattern for the same prefix.
 *
 * Usage: npx tsx scripts/check-route-rewrites.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();

const main = readFileSync(join(ROOT, 'src/main.ts'), 'utf8');
const routes = [...main.matchAll(/\.on\('(\/[^']*)'/g)].map((m) => m[1] as string);
if (routes.length === 0) {
  console.error('[check-route-rewrites] no routes found in src/main.ts — the derivation is broken, not the code');
  process.exit(1);
}

const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
  rewrites?: Array<{ source: string; destination: string }>;
};
const rewrites = vercel.rewrites ?? [];

/** The literal prefix of a rewrite source, before any pattern. */
function prefixOf(source: string): string {
  return (source.split('/:')[0] as string) || '/';
}

const unserved: string[] = [];
for (const route of routes) {
  if (route === '/') continue; // the root is served by the static index
  const isParam = route.includes('/:');
  const hit = rewrites.some((r) => (isParam ? prefixOf(r.source) === prefixOf(route) : r.source === route));
  if (!hit) unserved.push(route);
}

// And the reverse: a rewrite to index.html for a path the router will not serve
// renders the 404 page with a 200, which is worse than a 404.
const orphanRewrites = rewrites
  .filter((r) => r.destination === '/index.html')
  .map((r) => r.source)
  .filter((s) => !routes.includes(s));

if (unserved.length > 0 || orphanRewrites.length > 0) {
  console.error('\n[check-route-rewrites] FAILED\n');
  for (const r of unserved) console.error(`  ${r} — a route with no rewrite. Typing it returns a bare 404.`);
  for (const s of orphanRewrites)
    console.error(`  ${s} — rewrites to index.html, but the router has no such route. Renders 404 with a 200.`);
  console.error(`
Add to vercel.json "rewrites":

    { "source": "<path>", "destination": "/index.html" }

or remove the route from src/main.ts.
`);
  process.exit(1);
}

console.log(`[check-route-rewrites] OK — ${routes.length} route(s), every one served when typed`);
