import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * THE HOME PAGE'S STRUCTURED DATA POINTS ONLY AT PAGES THAT EXIST.
 *
 * index.html declared a WebSite SearchAction whose target was
 * `/#/intel?q={search_term_string}`: the retired map, which answers 404, and a
 * search the site has never had (lanes2/GTM.md §1). The action is removed.
 * This reads the JSON-LD a crawler reads and checks that it parses and that
 * every `url` or `target` in it is a route src/main.ts serves.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HTML = readFileSync(join(ROOT, 'index.html'), 'utf8');
const ROUTES = [...readFileSync(join(ROOT, 'src/main.ts'), 'utf8').matchAll(/\.on\('(\/[^']*)'/g)].map(
  (m) => m[1] as string,
);

function jsonLd(): unknown[] {
  return [...HTML.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1] as string) as unknown,
  );
}

/** Every value under a `url` or `target` key, at any depth. */
function linkValues(node: unknown, out: string[] = []): string[] {
  if (Array.isArray(node)) for (const n of node) linkValues(n, out);
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if ((k === 'url' || k === 'target') && typeof v === 'string') out.push(v);
      else linkValues(v, out);
    }
  }
  return out;
}

describe('index.html JSON-LD', () => {
  it('parses, and names no /intel route and no site search', () => {
    const blocks = jsonLd();
    expect(blocks.length).toBeGreaterThan(0);
    const text = JSON.stringify(blocks);
    expect(text).not.toContain('/intel');
    expect(text).not.toContain('SearchAction');
    expect(ROUTES).not.toContain('/search');
  });

  it('every url and target is a route the router serves', () => {
    const urls = linkValues(jsonLd());
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      const u = new URL(url);
      expect(u.origin).toBe('https://nexuswatch.dev');
      expect(u.hash, `${url} carries a hash route`).toBe('');
      expect(u.pathname === '/' || ROUTES.includes(u.pathname), `${url} is not served`).toBe(true);
    }
  });
});
