/**
 * Every write to the `calls` table declares itself.
 *
 * WHY. "A resolved call is never rewritten" is the register's founding
 * promise — the thing that makes a dated forecast worth reading. It has never
 * been enforced by anything but memory. On 2026-09-12 the owner chose to
 * ANNOTATE 54 wrong verdicts rather than re-resolve them, which makes the
 * promise load-bearing in public: the ledger now says, in as many words, that
 * the verdicts you see are the ones we published. A future edit that quietly
 * UPDATEs a status would make that sentence false.
 *
 * THE DERIVATION. Scope is "every file that writes to the calls table", found
 * by reading the files, not by listing the writers we know about. A new writer
 * is in scope the moment it is written, and fails by default. It passes only
 * by saying why:
 *
 *     // calls-write: <what this writes and why it is allowed to>
 *
 * That marker is not a rubber stamp — it is a sentence a reviewer reads. The
 * point is that adding a write to `calls` cannot happen silently.
 *
 * Usage: npx tsx scripts/check-calls-writes.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const MARKER = /\/\/\s*calls-write:\s*(.+)/;

function walk(dir: string, out: string[] = []): string[] {
  if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mjs)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * Blank COMMENTS ONLY.
 *
 * Not strings, and emphatically not template literals: every piece of SQL in
 * this repo lives inside a tagged template, so a stripper that blanked those
 * would blank exactly the thing being looked for. The first version of this
 * guard did, and reported zero writers against a codebase with two.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/** A write is any of these verbs against the bare table name. */
const WRITE_RE = /\b(?:UPDATE\s+calls\b|DELETE\s+FROM\s+calls\b|INSERT\s+INTO\s+calls\b)/i;

const undeclared: string[] = [];
const declared: Array<{ file: string; reason: string }> = [];

for (const file of [...walk(join(ROOT, 'api')), ...walk(join(ROOT, 'scripts')), ...walk(join(ROOT, 'src'))]) {
  const raw = readFileSync(file, 'utf8');
  // A file that only TALKS about the pattern — this guard, a docstring — has
  // the verb inside a comment, and nothing outside one.
  if (!WRITE_RE.test(stripComments(raw))) continue;
  const m = raw.match(MARKER);
  if (m) declared.push({ file: relative(ROOT, file), reason: (m[1] ?? '').trim() });
  else undeclared.push(relative(ROOT, file));
}

if (undeclared.length > 0) {
  console.error(`\n[check-calls-writes] FAILED — ${undeclared.length} undeclared write(s) to the calls table:\n`);
  for (const f of undeclared) console.error(`  ${f}`);
  console.error(`
A resolved call is never rewritten. That is the register's founding promise and
/ledger now states it to readers in as many words.

If this write is legitimate, say so in the file:

    // calls-write: <what this writes and why it is allowed to>

If you are correcting a published verdict, do not. Record the correction in
call_corrections beside the call — see docs/migrations/2026-09-12-call-corrections.sql.
`);
  process.exit(1);
}

console.log(`[check-calls-writes] OK — ${declared.length} declared writer(s) to the calls table`);
for (const d of declared) console.log(`  ${d.file} — ${d.reason}`);
