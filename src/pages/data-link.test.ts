import { describe, it, expect } from 'vitest';
import { renderMethodology } from './methodology.ts';

/**
 * /methodology sends a reader who wants the whole book to /data, in one
 * sentence of its Trust Layer paragraph, and no longer to the capped
 * /api/calls/ledger (which shows 200 open calls and 100 resolved unless asked
 * for all). The link is a plain path, not a hash route: /data is
 * server-rendered (vercel.json rewrites it to api/data.ts) and the SPA router
 * has no such route, so the browser must load it in full.
 */
describe('/methodology links /data for the whole book', () => {
  it('in one sentence, as a full-load link, and nowhere promises the whole book at the capped view', () => {
    const root = document.createElement('div');
    renderMethodology(root);
    const links = [...root.querySelectorAll('a')].filter((a) => a.getAttribute('href') === '/data');
    expect(links).toHaveLength(1);
    const paragraph = links[0]?.closest('p')?.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(paragraph).toContain(
      'Every call carries the criterion it was issued with, the source that resolves it and the evidence that ' +
        'source returned, and the whole book is downloadable as CSV or JSON from /data.',
    );
    expect(root.textContent).not.toContain('/api/calls/ledger');
  });
});
