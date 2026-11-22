import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * beehiiv is retired (RETIRE-BEEHIIV). The handler tests prove no request is
 * sent on the paths they run (the brief, its dry run, every sign-up path).
 * This proves the rest: no shipped source anywhere names a beehiiv host, links
 * a reader to our beehiiv custom domain, or reads a BEEHIIV_ variable, so no
 * path a test does not run can reach it either. The variables may stay set in
 * Vercel until the owner deletes them; nothing reads them. Tests are skipped:
 * they may name beehiiv to prove it absent.
 */

const ROOT = process.cwd();
const DIRS = ['api', 'src', 'scripts', 'public', 'mcp', '.github'];
const ROOT_FILES = ['index.html', 'vercel.json', 'vite.config.ts'];
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|html|css|txt|xml|ya?ml)$/;
const SKIP_DIR = new Set(['node_modules', 'dist', '.git']);

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIR.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (TEXT.test(name) && !/\.test\.tsx?$/.test(name)) out.push(path);
  }
}

const files: string[] = [];
for (const d of DIRS) walk(join(ROOT, d), files);
for (const f of ROOT_FILES) files.push(join(ROOT, f));

const offenders = (re: RegExp) => files.filter((f) => re.test(readFileSync(f, 'utf8'))).map((f) => relative(ROOT, f));

describe('beehiiv is retired: nothing shipped can reach it', () => {
  it('scans the shipped sources', () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files.map((f) => relative(ROOT, f))).toContain(join('api', 'cron', 'daily-brief.ts'));
    expect(files.map((f) => relative(ROOT, f))).toContain(join('api', 'subscribe.ts'));
  });

  it('no source names a beehiiv host', () => {
    expect(offenders(/beehiiv\.com/i)).toEqual([]);
  });

  it('no source links to brief.nexuswatch.dev, our CNAME to beehiiv', () => {
    // The SUBSCRIBE links on /briefs/<date> and /methodology did, until the
    // link fix at the head of this branch; that host answered HTTP 403.
    expect(offenders(/brief\.nexuswatch\.dev/i)).toEqual([]);
  });

  it('no source reads a BEEHIIV_ variable', () => {
    expect(offenders(/\bBEEHIIV_[A-Z_]+/)).toEqual([]);
  });
});
