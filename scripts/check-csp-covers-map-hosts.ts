/**
 * Every remote host the map fetches is actually covered by the CSP.
 *
 * WHY. PR #53's CSP allowed `https://*.basemaps.cartocdn.com` while
 * `src/map/MapStyleToggle.ts` fetches its style from the BARE host,
 * `https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json`.
 *
 * In CSP a host-source of `*.example.com` matches SUBDOMAINS ONLY. It does not
 * match `example.com`. So the basemap style was blocked, `map.on('load')`
 * never fired, and because the overlay's own safety timeout is nested INSIDE
 * that handler, the Intel Map sat on "Computing instability scores..." for
 * ever. Chrome said so plainly in the console and nothing was reading it:
 *
 *   Connecting to 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/
 *   style.json' violates the following Content Security Policy directive:
 *   "connect-src 'self' https://*.basemaps.cartocdn.com ...". The action has
 *   been blocked.
 *
 * An independent review DID flag this CSP, for a different reason — that
 * narrowing `img-src` from `https:` would break remote images. That was
 * refuted correctly; there are no dynamic image sources. But the refutation
 * checked whether hosts were LISTED, not whether the patterns MATCHED, and
 * this defect sat underneath it. Listing a host is not covering it.
 *
 * THE DERIVATION. Hosts come from the map's own source, read at run time, not
 * from a list here. A new tile server, style or geocoder added tomorrow is in
 * scope the day someone types its URL.
 *
 * Usage: npx tsx scripts/check-csp-covers-map-hosts.ts
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const MAP_DIR = join(ROOT, 'src', 'map');

/**
 * ATTRIBUTION IS NOT A FETCH.
 *
 * The first run of this guard reported eight hosts — sipri.org, acleddata.com,
 * attack.mitre.org, unhcr.org and others — every one of them the value of a
 * `sourceUrl:` field in a layer's provenance metadata. Those are links a
 * reader clicks, governed by no fetch directive at all. The repo's own rule:
 * a new guard reporting findings on its first run has probably found itself,
 * so fix the guard rather than the code.
 */
const ATTRIBUTION_FIELDS = /(sourceUrl|attribution|href|link|docsUrl|homepage)\s*:\s*$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * CSP host-source matching, as the spec defines it and as browsers implement
 * it. The `*.` case is the whole reason this file exists: it is a SUBDOMAIN
 * wildcard and it does not cover the registrable host itself.
 */
function sourceCovers(source: string, host: string): boolean {
  const s = source
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
  const h = host.toLowerCase();
  if (s === '*') return true;
  if (s.startsWith('*.')) return h.endsWith(s.slice(1)) && h !== s.slice(2);
  return s === h;
}

const csp = (() => {
  const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
    headers?: Array<{ headers: Array<{ key: string; value: string }> }>;
  };
  for (const block of vercel.headers ?? []) {
    for (const h of block.headers) {
      if (h.key.toLowerCase() === 'content-security-policy') return h.value;
    }
  }
  return '';
})();

if (!csp) {
  console.error('[check-csp-covers-map-hosts] FAILED — no Content-Security-Policy in vercel.json');
  process.exit(1);
}

const directiveSources = new Map<string, string[]>();
for (const part of csp.split(';')) {
  const [name, ...sources] = part.trim().split(/\s+/);
  if (name) directiveSources.set(name.toLowerCase(), sources);
}

if (!existsSync(MAP_DIR)) {
  console.log('[check-csp-covers-map-hosts] OK — no src/map on this branch, nothing to cover');
  process.exit(0);
}

/**
 * Remote hosts the map actually REQUESTS, and which directive governs each.
 *
 * `connect-src` covers a style document, a vector tile, a glyph range and any
 * fetch(). `img-src` additionally covers a RASTER tile, because the renderer
 * loads those as images — which is why a raster host needs both.
 */
interface Requested {
  file: string;
  raster: boolean;
}
const hosts = new Map<string, Requested>();

for (const file of walk(MAP_DIR)) {
  const src = stripComments(readFileSync(file, 'utf8'));
  for (const m of src.matchAll(/https:\/\/([a-z0-9.-]+)[^'"`\s]*/gi)) {
    const host = m[1].toLowerCase();
    if (host.endsWith('nexuswatch.dev')) continue; // same-origin, covered by 'self'

    // Skip a URL that is the value of an attribution-style field.
    const lineStart = src.lastIndexOf('\n', m.index) + 1;
    const before = src.slice(lineStart, m.index).replace(/['"`]\s*$/, '');
    if (ATTRIBUTION_FIELDS.test(before)) continue;

    // A raster tile template carries {z}/{x}/{y} (or {y}/{x}) and an image
    // extension; those are fetched by the renderer as images.
    const raster = /\{z\}/.test(m[0]) && /\.(png|jpe?g|webp)/i.test(m[0]);
    const seen = hosts.get(host);
    if (!seen) hosts.set(host, { file: relative(ROOT, file), raster });
    else if (raster) seen.raster = true;
  }
}

const failures: string[] = [];
for (const [host, info] of hosts) {
  const needed = info.raster ? (['connect-src', 'img-src'] as const) : (['connect-src'] as const);
  for (const directive of needed) {
    const sources = directiveSources.get(directive) ?? [];
    if (!sources.some((s) => sourceCovers(s, host))) {
      failures.push(`${directive} does not cover ${host}  (${info.file})`);
    }
  }
}

if (failures.length > 0) {
  console.error('[check-csp-covers-map-hosts] FAILED — the map fetches hosts the CSP blocks:\n');
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    '\n  Remember `*.example.com` matches SUBDOMAINS ONLY and never example.com itself.\n' +
      '  A blocked style fetch means map.on("load") never fires, and the loading\n' +
      '  overlay never lifts — with no error on screen.',
  );
  process.exit(1);
}

console.log(
  `[check-csp-covers-map-hosts] OK — ${hosts.size} requested host(s) from src/map, ` +
    `each covered (raster hosts checked against img-src too)`,
);
