/**
 * Every key spliced into an Upstash REST path is encoded.
 *
 * WHY. `api/admin/_auth.ts` built `${kvUrl}/get/session:${sessionId}` from a
 * raw cookie. '/' and '%' are legal RFC 6265 cookie octets, so a cookie of
 * `a/../../flushall` resolved to `/flushall` on the KV host — with
 * KV_REST_API_TOKEN in the Authorization header. An anonymous caller could
 * run arbitrary Upstash commands: wipe the store, or `/set` a session object
 * of its own choosing and read it back as an administrator. Found by
 * independent review on 2026-09-12 and verified against the real
 * KV_REST_API_URL, whose path is bare '/'.
 *
 * Every other caller — kvCache.ts, apiAuth.ts — already wrapped its key in
 * encodeURIComponent. One exception was enough.
 *
 * THE DERIVATION. The scope is "every interpolation into an Upstash REST
 * path", found by reading the files, not a list of the files that had the bug.
 * A new caller written tomorrow is in scope the moment it builds such a URL.
 *
 * Usage: npx tsx scripts/check-kv-key-encoding.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Strip comments so a file DOCUMENTING the pattern is not flagged for it. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

// A template literal segment that puts something after an Upstash REST verb.
// The verbs come from the REST API's own command grammar, not from the call
// sites this repo happens to have today.
const VERBS = ['get', 'set', 'del', 'incr', 'decr', 'expire', 'exists', 'ttl', 'setex', 'hget', 'hset'];
const PATH_RE = new RegExp(`/(?:${VERBS.join('|')})/([^\`]*?)\\$\\{([^}]*)\\}`, 'g');

const violations: string[] = [];
let inspected = 0;

for (const file of walk(join(ROOT, 'api'))) {
  const src = stripComments(readFileSync(file, 'utf8'));
  if (!/upstash|KV_REST_API_URL|kvUrl|KV_URL/i.test(src)) continue;
  for (let m = PATH_RE.exec(src); m !== null; m = PATH_RE.exec(src)) {
    inspected++;
    const expression = m[2] ?? '';
    if (expression.includes('encodeURIComponent')) continue;
    const line = src.slice(0, m.index).split('\n').length;
    violations.push(`${relative(ROOT, file)}:${line}  \${${expression.trim()}}`);
  }
}

if (violations.length > 0) {
  console.error(`\n[check-kv-key-encoding] FAILED — ${violations.length} unencoded key(s) in an Upstash REST path:\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error(`
A key spliced raw into the path is not a key, it is a path. A caller-supplied
'/' walks out of the command and into another one, carrying KV_REST_API_TOKEN.
Wrap it:

    \`\${kvUrl}/get/\${encodeURIComponent(key)}\`

and validate the shape of anything that came from a request before you get here.
`);
  process.exit(1);
}

console.log(`[check-kv-key-encoding] OK — ${inspected} Upstash REST key interpolation(s), all encoded`);
