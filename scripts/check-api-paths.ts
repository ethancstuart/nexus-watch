/**
 * Every `/api/…` path the client fetches is served by something.
 *
 * WHY. PR #53 restored the Intel Map's front end — 146 files — and shipped
 * with TWENTY-FIVE endpoints its mounted components fetch that production does
 * not serve. Eleven of them were map layers that fail SILENTLY: the toggle
 * appears in the drawer, the reader switches it on, nothing is drawn, and
 * nothing says why. The endpoints had all been deleted on 2026-09-06 with the
 * old product; the UI came back and they did not.
 *
 * Nothing caught it. CI was green, the typecheck was green, and the preview
 * deployed. A 404 from a fetch is not a type error and not a test failure — it
 * is a runtime fact about two directories that nothing compared.
 *
 * THE DERIVATION. Scope is "every /api/ path referenced by client source",
 * read out of src/ rather than listed here, and checked against what api/
 * actually contains plus vercel.json's rewrites. A path added tomorrow is in
 * scope the day it is written.
 *
 * COMMENTS ARE STRIPPED FIRST. The first run of this reported `/api/country/`,
 * which appears once, in a sentence, in src/utils/seo.ts. That is the same
 * grep-matches-prose trap the PR-10 table derivation and the Intel Map
 * reachability sweep both hit. A guard reporting findings on its first run has
 * usually found itself.
 *
 * THE EXCEPTIONS ARE DATED AND REASONED, and they are the point rather than a
 * weakness. Thirteen paths are still unserved because the features behind them
 * are awaiting an owner decision — restore the endpoint, or strip the feature.
 * Listing them here makes that debt visible and reviewable, and anything NOT
 * on the list fails by default. Delete an entry when its decision lands.
 *
 * Usage: npx tsx scripts/check-api-paths.ts
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/**
 * Unserved on purpose, pending an owner decision. Each entry says which
 * feature it belongs to and what decision it waits on.
 *
 * Recorded 2026-09-21 from the PR #53 audit
 * (docs/PR53-ENDPOINT-AUDIT-2026-09-21.md). All were deleted on 2026-09-06.
 */
const PENDING_DECISION: Record<string, string> = {
  'webcam-catalog': 'CCTV panel — fails visibly. Restore endpoint or strip panel.',
  news: 'News view — fails visibly. OWNER-ACTIONS §5 recommends deleting /api/news.',
  'news-feed': 'News view — fails visibly. Restore or strip with the news panel.',
  'osint-feed': 'OSINT ticker + sidebar feeds — sidebar fails visibly, ticker silently.',
  'v1/timeline-data': 'Timeline scrubber/bar/replay — scrubber and bar fail visibly.',
  'crisis/active': 'Crisis playbook — returns an empty result, silently.',
  'cinema-narrate': 'Cinema narration — swallowed. Billed an Anthropic key when live.',
  'ai-analyst': 'AI terminal — swallowed. Billed an Anthropic key when live.',
  sitrep: 'AI sitreps — swallowed. Billed an Anthropic key when live.',
  'parse-alert': 'Alert builder — fails visibly. Billed an Anthropic key when live.',
  'v1/cii-sparklines': 'CII sparklines — swallowed, renders blank.',
  'v1/data-lake': 'News ticker — unguarded. `data_lake` is dropped by PR #38.',
  // public/sw.js only NAMES these, in a cache-exclusion predicate: "never
  // cache auth or chat API routes". They are not fetch targets, so nothing
  // breaks while they are absent — the predicate simply never matches. Dead
  // config left by the 2026-09-06 deletion, worth removing, not urgent.
  auth: 'Service-worker cache predicate only, not a fetch. Dead config from the 2026-09-06 deletion.',
  chat: 'Service-worker cache predicate only, not a fetch. Dead config from the 2026-09-06 deletion.',
  // NOT listed: accuracy/stats. It appears once, in a comment in src/main.ts
  // recording that the page module and the endpoint were both deleted on
  // 2026-08-31. Comment-stripping removes it, which is the correct result —
  // it was in an earlier draft of this list because the first scan read prose.
};

/**
 * CLIENT SOURCE IS NOT ONLY `src/**.ts`.
 *
 * The first version of this walked src/ for .ts files alone, and an
 * independent review was right that a non-TypeScript caller would pass by
 * omission — the exact shape the guard exists to forbid. index.html carries
 * three /api/ references and public/sw.js two, none of which were checked.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|mjs|jsx|html)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Block and line comments removed, so prose cannot be mistaken for a fetch. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const vercelJson = readFileSync(join(ROOT, 'vercel.json'), 'utf8');
const referenced = new Map<string, string>();

const CLIENT_SOURCES = [...walk(join(ROOT, 'src')), ...walk(join(ROOT, 'public')), join(ROOT, 'index.html')];

for (const file of CLIENT_SOURCES) {
  const src = stripComments(readFileSync(file, 'utf8'));
  for (const m of src.matchAll(/\/api\/[A-Za-z0-9/_-]+/g)) {
    // A path immediately preceded by another host is part of that URL.
    const before = src.slice(Math.max(0, m.index - 60), m.index);
    if (/https?:\/\/[A-Za-z0-9.-]+$/.test(before)) continue;
    const path = m[0].slice('/api/'.length).replace(/\/$/, '');
    if (path && !referenced.has(path)) referenced.set(path, relative(ROOT, file));
  }
}

function isServed(path: string): boolean {
  if (existsSync(join(ROOT, 'api', `${path}.ts`))) return true;
  if (existsSync(join(ROOT, 'api', path, 'index.ts'))) return true;
  return vercelJson.includes(`"/api/${path}"`);
  // NO PARENT-DIRECTORY FALLBACK. The first version of this walked up a level
  // so a templated suffix would resolve to its parent handler — and nothing in
  // the tree needs that: every referenced path resolves directly or through a
  // rewrite, measured. What the fallback DID do was hide a real miss, because
  // `accuracy/stats` resolved to a non-existent `api/accuracy.ts` check and
  // then to nothing, while a path like `foo/bar` would have passed on the mere
  // existence of `api/foo.ts`. A permissive branch no caller needs is a hole,
  // not a convenience.
}

const unserved = [...referenced.entries()].filter(([p]) => !isServed(p));
const unexpected = unserved.filter(([p]) => !(p in PENDING_DECISION));
const known = unserved.filter(([p]) => p in PENDING_DECISION);

if (unexpected.length > 0) {
  console.error('[check-api-paths] FAILED — the client fetches paths nothing serves:\n');
  for (const [p, f] of unexpected) console.error(`  - /api/${p}   (${f})`);
  console.error(
    '\n  A fetch to a path with no handler is a 404 at runtime: no type error, no test\n' +
      '  failure, and on a map layer no visible symptom at all. Add the endpoint, remove\n' +
      '  the caller, or — if it is deliberate and awaiting a decision — record it in\n' +
      '  PENDING_DECISION in this file with the reason.',
  );
  process.exit(1);
}

console.log(
  `[check-api-paths] OK — ${referenced.size} client path(s) checked, ` +
    `${known.length} unserved by recorded decision, 0 unaccounted for`,
);
if (known.length > 0) {
  for (const [p] of known) console.log(`    pending: /api/${p} — ${PENDING_DECISION[p]}`);
}
