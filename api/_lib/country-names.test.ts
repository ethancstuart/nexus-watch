import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { COUNTRY_NAMES, countryName } from './country-names.js';

/**
 * The record-only edition's country names come from the repository, so every
 * run has them, with or without a model key or a working index read. They must
 * be the index's own names where the index has the country, and cover every
 * country the call book holds. Read from files in the repository; no database.
 */

const ROOT = process.cwd();

/** The names api/cron/compute-cii.ts writes into country_cii_history, read from its source. */
function indexNames(): Map<string, string> {
  const src = readFileSync(join(ROOT, 'api/cron/compute-cii.ts'), 'utf8');
  const block = src.slice(src.indexOf('const COUNTRIES'), src.indexOf('];', src.indexOf('const COUNTRIES')));
  const pairs = [...block.matchAll(/\{ code: '([A-Z]{2})', name: '((?:[^'\\]|\\.)*)'/g)].map((m) => [m[1], m[2]]);
  return new Map(pairs as Array<[string, string]>);
}

describe('country names for the record-only edition', () => {
  it('every index country has the index’s own name, so the edition and the index never differ', () => {
    const index = indexNames();
    expect(index.size).toBeGreaterThan(80);
    for (const [code, name] of index) expect(COUNTRY_NAMES[code], code).toBe(name);
  });

  it('every country in the committed ledger snapshot has a name', () => {
    const snap = JSON.parse(readFileSync(join(ROOT, 'ledger-snapshots/2026-11-22.json'), 'utf8')) as {
      open: Array<{ kind: string; country_code: string }>;
      resolved: Array<{ kind: string; country_code: string }>;
    };
    const codes = new Set(
      [...snap.open, ...snap.resolved].filter((r) => r.kind !== 'seismicity_window').map((r) => r.country_code),
    );
    expect(codes.size).toBeGreaterThan(70);
    for (const code of codes) expect(countryName(code), code).not.toBeNull();
    // The seven currency countries the index does not hold (the reason this map exists).
    for (const code of ['BY', 'CH', 'CZ', 'HU', 'KW', 'NO', 'SE']) {
      expect(indexNames().has(code)).toBe(false);
      expect(countryName(code)).toBeTruthy();
    }
  });

  it('no name is empty, a code, or markup; an unknown code (or an object key) has none', () => {
    for (const [code, name] of Object.entries(COUNTRY_NAMES)) {
      expect(code).toMatch(/^[A-Z]{2}$/);
      expect(name.trim()).toBe(name);
      expect(name.length).toBeGreaterThan(2);
      expect(name).not.toMatch(/[<>*[\]`]/);
    }
    for (const code of ['XK', 'QQ', '', 'constructor', '__proto__', 'toString']) expect(countryName(code)).toBeNull();
  });
});
