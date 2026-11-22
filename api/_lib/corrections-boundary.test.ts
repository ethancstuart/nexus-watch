import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const DATA = join(ROOT, 'api/_lib/corrections-data.ts');
const GATE = join(ROOT, 'api/_lib/corrections.ts');
const WORDS = join(ROOT, 'api/_lib/correction-words.ts');
const KEYS = join(ROOT, 'api/_lib/corrections-approvals.ts');

/**
 * THE DRAFTS NEVER REACH A BROWSER, AND NOTHING BYPASSES THE GATE.
 *
 * 1. Whatever src/ imports, Vite bundles into the public JavaScript, served to
 *    every visitor whether or not a note is approved. So no module reachable
 *    from src/ may be corrections-data.ts (the drafts) or corrections.ts (which
 *    imports them). The SPA gets an approved note only from the server's JSON.
 *    The walk is DERIVED: every import of every src/ module, followed through
 *    api/, so a new import path is in scope the moment it is written.
 *
 * 2. On the server, only corrections.ts reads the data module and the approval
 *    keys. Every handler goes through its two-key gate rather than reading
 *    either itself.
 */

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'worktrees' || name === '.git') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(p) && !/\.test\.tsx?$/.test(p)) acc.push(p);
  }
  return acc;
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Runtime specifiers: static import/export ... from (newline-tolerant), side-effect and dynamic imports. */
function specifiers(file: string): string[] {
  const src = stripComments(readFileSync(file, 'utf8'));
  const out: string[] = [];
  for (const m of src.matchAll(
    /\b(import|export)\b((?:(?!\b(?:import|export)\b|;)[\s\S])*?)\bfrom\s*['"]([^'"]+)['"]/g,
  )) {
    if (/^\s*type\b/.test(m[2] ?? '')) continue; // `import type` is erased
    out.push(m[3]);
  }
  for (const m of src.matchAll(/(?:^|[;\n])\s*import\s*['"]([^'"]+)['"]/g)) out.push(m[1]);
  for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g)) out.push(m[1]);
  return out;
}

function resolveRelative(from: string, spec: string): string | null {
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
  const base = resolve(dirname(from), spec);
  const exts = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
  const candidates = [
    base,
    ...exts.map((e) => base.replace(/\.(js|mjs|cjs)$/, e)),
    ...exts.map((e) => `${base}${e}`),
    ...exts.map((e) => join(base, `index${e}`)),
  ];
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

describe('the correction drafts stay on the server', () => {
  it('no module reachable from src/ is the data or the gate', () => {
    const seen = new Set<string>();
    const stack = walk(join(ROOT, 'src'));
    while (stack.length > 0) {
      const f = stack.pop() as string;
      if (seen.has(f)) continue;
      seen.add(f);
      for (const s of specifiers(f)) {
        const t = resolveRelative(f, s);
        if (t && !seen.has(t)) stack.push(t);
      }
    }
    // The walk does reach api/: the SPA really imports the words module.
    expect(seen.has(WORDS)).toBe(true);
    expect(seen.has(DATA), 'src/ reaches corrections-data.ts: the drafts would ship in the bundle').toBe(false);
    expect(seen.has(GATE), 'src/ reaches corrections.ts, which imports the drafts').toBe(false);
  });

  it('the words module imports nothing at runtime', () => {
    expect(specifiers(WORDS)).toEqual([]);
  });

  it('on the server, only the gate imports the data and the approval keys', () => {
    for (const target of [DATA, KEYS]) {
      const importers = walk(join(ROOT, 'api'))
        .filter((f) => specifiers(f).some((s) => resolveRelative(f, s) === target))
        .map((f) => relative(ROOT, f));
      expect(importers, relative(ROOT, target)).toEqual(['api/_lib/corrections.ts']);
    }
  });

  it('the approval keys import nothing at runtime', () => {
    expect(specifiers(KEYS)).toEqual([]);
  });
});
