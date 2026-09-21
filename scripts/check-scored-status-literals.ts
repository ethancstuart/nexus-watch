/**
 * Nothing enumerates the scored statuses except the place that defines them.
 *
 * WHY. `SCORED_STATUSES` exists so a new verdict has to prove itself in scope
 * rather than be scored by omission — its own docstring says so. Then six
 * queries across four files spelled the set out by hand anyway:
 *
 *   api/ledger.ts          the SSR register's scored-row query and its count
 *   api/calls/ledger.ts    `resolved` and `calibration_resolved`
 *   api/og.ts              the share card's `resolved`
 *   api/cron/daily-brief.ts  four, including the daily email's headline
 *
 * The failure is not hypothetical and it is not one number. Add a scored
 * status tomorrow and `by_kind.resolved` (derived) counts it while
 * `counts.resolved` (literal) does not — the API contradicting itself inside
 * one response — and the register, the OG card and the email each publish a
 * different total. This product's entire asset is a checkable record; four
 * surfaces disagreeing about how many calls it has resolved is the worst
 * available failure.
 *
 * THE DERIVATION. Scope is "a scored-status set written out in a SQL filter or
 * a scope test", found by reading every API source file, not a list of the six
 * that had it. A seventh written tomorrow is in scope the day it is written.
 *
 * NOT flagged: `status === 'hit' ? 1 : 0`. That maps a verdict to an outcome
 * and every scoring path in the repo does it; it does not decide what is in
 * scope, which is what this guard is about.
 *
 * Usage: npx tsx scripts/check-scored-status-literals.ts
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
/** The one file allowed to say what the scored statuses are. */
const DEFINITION = join('api', '_lib', 'calls.ts');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(full);
  }
  return out;
}

/** A SQL set membership over the scored statuses, in either order. */
const SQL_SET = /IN\s*\(\s*'(hit|miss)'\s*,\s*'(hit|miss)'\s*\)/i;
/** A TypeScript scope test spelling the same set out. */
const TS_OR = /===\s*'(hit|miss)'\s*\|\|\s*[\w.?\s]*===\s*'(hit|miss)'/;

const offenders: string[] = [];

for (const file of walk(join(ROOT, 'api'))) {
  const rel = relative(ROOT, file);
  if (rel === DEFINITION) continue;
  const lines = readFileSync(file, 'utf8').split('\n');
  lines.forEach((line, i) => {
    // A comment explaining the history is not an enumeration.
    const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '');
    for (const [label, re] of [
      ['SQL', SQL_SET],
      ['scope test', TS_OR],
    ] as Array<[string, RegExp]>) {
      const m = code.match(re);
      if (m && m[1] !== m[2]) {
        offenders.push(`${rel}:${i + 1}  ${label}: ${line.trim().slice(0, 100)}`);
      }
    }
  });
}

if (offenders.length > 0) {
  console.error(
    '[check-scored-status-literals] FAILED — the scored statuses are enumerated outside their definition:\n',
  );
  for (const o of offenders) console.error(`  - ${o}`);
  console.error(
    '\n  Use SCORED_STATUSES from api/_lib/calls.ts:\n' +
      '    SQL:  WHERE status = ANY(${[...SCORED_STATUSES]})\n' +
      '    TS:   isScored(status)\n' +
      '  A new verdict must be in scope by construction, not because someone extended a literal.',
  );
  process.exit(1);
}

console.log('[check-scored-status-literals] OK — SCORED_STATUSES is enumerated only where it is defined');
