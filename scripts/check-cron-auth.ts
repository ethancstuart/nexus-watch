/**
 * Every scheduled endpoint must authenticate — derived from the schedule
 * itself, never from a list someone remembered to update.
 *
 * WHY. An audit on 2026-08-28 found 53 cron handlers using four different
 * authorization idioms, two of which PASS when CRON_SECRET is unset (because
 * `token !== process.env.CRON_SECRET` compares undefined to undefined), and
 * ~20 with no check at all. Nine of those were the marketing dispatchers,
 * which reach a paid Claude generation and a paid voice evaluation — while
 * MARKETING_AUTOMATION_ENABLED was verified `'true'` in production.
 *
 * THE DERIVATION IS THE POINT (rule 5). The set of things that must be
 * authenticated is read from `vercel.json`'s cron manifest, so a cron added
 * tomorrow is in scope the moment it is scheduled, and a cron deleted stops
 * being checked. A hand-kept list of "the protected ones" is out of date the
 * day someone adds the next handler.
 *
 * An endpoint may opt out only with an explicit, reasoned marker:
 *     // cron-auth-exempt: <why this is safe unauthenticated>
 *
 * Usage: npx tsx scripts/check-cron-auth.ts
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const EXEMPT_RE = /\/\/\s*cron-auth-exempt:\s*(.+)/;

interface Cron {
  path: string;
}

const manifest = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as { crons?: Cron[] };
const crons = manifest.crons ?? [];
if (crons.length === 0) {
  console.error('[check-cron-auth] no crons found in vercel.json — the derivation is broken, not the code');
  process.exit(1);
}

/** Blank out comments and string/template bodies so a word in prose is not code. */
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""');
}

/**
 * Does a CRON_SECRET comparison actually GATE anything?
 *
 * A handler can mention CRON_SECRET and still be wide open. compute-cii did
 * exactly that for months:
 *
 *     if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && ...) {
 *       // Allow without auth for now (cron secret optional)
 *     }
 *
 * The comparison ran, its result was discarded, and execution continued into
 * the production writes. An unauthenticated GET returned HTTP 200 in
 * production on 2026-09-12. This guard cleared it as "legacy idiom,
 * authenticated in practice" because the file CONTAINED the string — the same
 * presence-not-use mistake this file's own docstring says it exists to avoid.
 *
 * So the property is not "the secret is mentioned". It is "the branch that
 * tests the secret ends the request". We find each `if` whose condition
 * mentions CRON_SECRET and require a `return` inside its block.
 */
function secretCheckGates(src: string): boolean {
  // The condition may not name the env var at all. Five handlers bind it to a
  // local first — `const cronSecret = process.env.CRON_SECRET;` — and then
  // test `authHeader !== \`Bearer ${cronSecret}\``. So derive the names that
  // hold the secret rather than looking for one spelling of it.
  const names = new Set(['CRON_SECRET']);
  const aliasRe = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*process\.env\.CRON_SECRET/g;
  for (let m = aliasRe.exec(src); m !== null; m = aliasRe.exec(src)) names.add(m[1] as string);

  const mentionsSecret = (text: string): boolean => {
    for (const n of names) {
      // Whole-identifier match, so `cronSecretUnset` is not `cronSecret`.
      if (new RegExp(`(?<![\\w$])${n}(?![\\w$])`).test(text)) return true;
    }
    return false;
  };

  for (let i = src.indexOf('if ('); i !== -1; i = src.indexOf('if (', i + 1)) {
    // Walk the condition's parentheses to their close.
    let depth = 0;
    let j = i + 3;
    for (; j < src.length; j++) {
      if (src[j] === '(') depth++;
      else if (src[j] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const condition = src.slice(i, j + 1);
    if (!mentionsSecret(condition)) continue;

    // What follows the condition is either a braced block or ONE statement.
    // Decide on the first non-whitespace character and nothing else: an
    // earlier version compared the offsets of the next `{` and the next `;`,
    // which misreads the repo's actual idiom
    //     if (token !== process.env.CRON_SECRET) return res.status(401).json({ ... });
    // because the object literal's brace precedes the semicolon. That bug made
    // this guard flag all thirteen correctly-gated handlers.
    let p = j + 1;
    while (p < src.length && /\s/.test(src[p] as string)) p++;

    if (src[p] !== '{') {
      // Single statement: it gates only if that statement is a return.
      const stmt = stripCommentsAndStrings(src.slice(p, p + 12));
      if (/^\s*(?:return|throw)\b/.test(stmt)) return true;
      continue;
    }

    // Braced body: walk to its matching close and look for a return.
    let bdepth = 0;
    let end = p;
    for (let k = p; k < src.length; k++) {
      if (src[k] === '{') bdepth++;
      else if (src[k] === '}') {
        bdepth--;
        if (bdepth === 0) {
          end = k;
          break;
        }
      }
    }
    // STRIP COMMENTS AND STRINGS FIRST. A review of this guard pointed out
    // that the word "return" anywhere in the block satisfied it — including
    // inside the very comment a decorative check would carry ("we do not
    // return here for now"). The word only counts as a gate when it is code.
    if (/\b(?:return|throw)\b/.test(stripCommentsAndStrings(src.slice(p, end)))) return true;
  }
  return false;
}

const violations: string[] = [];
const exempt: Array<{ path: string; reason: string }> = [];
const missing: string[] = [];
const legacy: string[] = [];
let checked = 0;

for (const cron of crons) {
  // "/api/cron/foo" -> "api/cron/foo.ts"
  const rel = `${cron.path.replace(/^\//, '')}.ts`;
  const file = join(ROOT, rel);
  if (!existsSync(file)) {
    missing.push(`${cron.path} -> ${rel} (scheduled but the handler does not exist)`);
    continue;
  }
  checked++;
  const src = readFileSync(file, 'utf8');

  const exemption = src.match(EXEMPT_RE);
  if (exemption) {
    exempt.push({ path: cron.path, reason: exemption[1].trim() });
    continue;
  }

  // The property: the handler must CALL the shared fail-closed check. Merely
  // importing it is not enough — that is the mistake check-llm-spend.ts made
  // by testing for the presence of a string rather than its use.
  if (/requireCron\s*\(/.test(src)) continue;

  // TWO CLASSES, and conflating them would make this guard a liar. On its
  // first run it reported 24 endpoints as "do not authenticate" — but most of
  // them DO, using an older idiom. A guard whose message is false is one
  // nobody trusts the second time.
  //
  //  - No mention of CRON_SECRET at all: genuinely open to the internet today.
  //    That FAILS.
  //  - A legacy idiom: authenticated in practice, because CRON_SECRET is set
  //    in production — but it accepts the secret via ?token= (logged in Vercel
  //    access logs and leaked in Referer headers) and it passes when the
  //    secret is UNSET, because `undefined !== undefined` is false. That is a
  //    migration WARNING, not a build break.
  if (!src.includes('CRON_SECRET')) {
    violations.push(`${cron.path}  (${rel})  — no authentication at all`);
  } else if (!secretCheckGates(src)) {
    // Mentions the secret but no branch testing it returns: the comparison is
    // decorative and the endpoint is open. That is a FAILURE, not a warning.
    violations.push(`${cron.path}  (${rel})  — tests CRON_SECRET but the branch does not return`);
  } else {
    legacy.push(cron.path);
  }
}

if (missing.length > 0) {
  console.error(`\n[check-cron-auth] ${missing.length} scheduled path(s) have no handler:\n`);
  for (const m of missing) console.error(`  ${m}`);
}

if (violations.length > 0) {
  console.error(`\n[check-cron-auth] FAILED — ${violations.length} scheduled endpoint(s) do not authenticate:\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error(`
Every scheduled endpoint is a PUBLIC URL. Vercel calls it on a timer; so can
anyone else. Add as the first statement of the handler:

    import { requireCron } from '../_cron-utils.js';
    ...
    if (!requireCron(req, res)) return;

Or, if it is genuinely safe to call unauthenticated, say why in the file:

    // cron-auth-exempt: <reason>
`);
  process.exit(1);
}

if (legacy.length > 0) {
  console.warn(
    `\n[check-cron-auth] ${legacy.length} endpoint(s) still use the legacy idiom. They authenticate ` +
      `today only because CRON_SECRET is set; they accept the secret as a query parameter and they ` +
      `PASS when it is unset. Migrate to requireCron():\n`,
  );
  for (const l of legacy) console.warn(`  ${l}`);
}

console.log(
  `[check-cron-auth] OK — ${checked} scheduled endpoint(s) authenticate` +
    (legacy.length ? ` (${legacy.length} via the legacy idiom — migrate)` : '') +
    (exempt.length ? `, ${exempt.length} exempt with a recorded reason` : '') +
    (missing.length ? `, ${missing.length} scheduled path(s) missing a handler` : ''),
);
for (const e of exempt) console.log(`  exempt: ${e.path} — ${e.reason}`);
if (missing.length > 0) process.exit(1);
