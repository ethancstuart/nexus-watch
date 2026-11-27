import { describe, it, expect } from 'vitest';
import { renderMethodology } from './methodology.ts';

/**
 * /methodology points to /data, the documented download of every call, in one
 * sentence of its Trust Layer list. The link is a plain path, not a hash
 * route: /data is server-rendered (vercel.json rewrites it to api/data.ts) and
 * the SPA router has no such route, so the browser must load it in full.
 */
describe('/methodology links /data', () => {
  it('in one sentence, as a full-load link', () => {
    const root = document.createElement('div');
    renderMethodology(root);
    const links = [...root.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/data');
    expect(links).toHaveLength(1);
    expect(links[0]?.closest('li')?.textContent?.replace(/\s+/g, ' ').trim()).toBe(
      'The data — every call, open and resolved, as CSV or JSON with a documented schema, at /data',
    );
  });
});
