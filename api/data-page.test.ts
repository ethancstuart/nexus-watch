import { describe, it, expect, vi } from 'vitest';
import handler from './data.js';
import { renderDataPageBody, DATA_PAGE_CACHE_CONTROL, LICENCE_HTML } from './_lib/data-page.js';
import { DOWNLOAD_COLUMNS, COLUMN_TYPES } from './_lib/calls-download.js';
import { correctionsNewestFirst } from './_lib/corrections.js';
import { MIN_RESOLUTION_BATCHES } from './_lib/calls.js';
import { fakeRes, snapshotSql } from './_lib/snapshot-sql-fixture.js';

/**
 * /data, the documentation of the download, asserted on the served HTML; and
 * the one-sentence links to it from /ledger and the sitemap. (/methodology's
 * link is asserted in src/pages/data-link.test.ts, where the SPA page renders.)
 *
 * The schema table is checked against DOWNLOAD_COLUMNS, the list the files are
 * written from, never against a literal, so the page and the files cannot
 * drift apart without this failing.
 */

vi.mock('@neondatabase/serverless', () => ({ neon: () => snapshotSql }));

function page(method = 'GET') {
  const res = fakeRes();
  handler({ method, query: {} } as never, res as never);
  return res.state;
}

const text = (html: string) =>
  html
    .replace(/<style>[\s\S]*?<\/style>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ');

describe('/data documents the files', () => {
  it('is served as HTML, cached about an hour at the edge, canonical at /data', () => {
    const r = page();
    expect(r.status).toBe(200);
    expect(r.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(r.headers['Cache-Control']).toBe('public, max-age=300, s-maxage=3600');
    expect(r.headers['Cache-Control']).toBe(DATA_PAGE_CACHE_CONTROL);
    expect(r.body).toContain('<link rel="canonical" href="https://nexuswatch.dev/data">');
    expect(r.body).toContain('<title>The data — every NexusWatch call, as CSV and JSON</title>');
    expect(page('HEAD').status).toBe(200);
    expect(page('POST').status).toBe(405);
  });

  it('links both files', () => {
    const { body } = page();
    expect(body).toContain('<a href="/data/calls.csv">calls.csv</a>');
    expect(body).toContain('<a href="/data/calls.json">calls.json</a>');
  });

  it('the schema table lists every column the files carry, in file order, with its type and meaning', () => {
    const { body } = page();
    const rows = [
      ...body.matchAll(/<tr><td class="col">([^<]*)<\/td><td class="type">([^<]*)<\/td><td>([^<]*)<\/td><\/tr>/g),
    ];
    expect(rows.map((m) => m[1])).toEqual(DOWNLOAD_COLUMNS.map((c) => c.name));
    expect(rows.map((m) => m[2])).toEqual(DOWNLOAD_COLUMNS.map((c) => c.type));
    // Escaped as written: the meanings hold no markup, so the escaped text is the text.
    expect(rows.map((m) => text(m[3] as string).trim())).toEqual(DOWNLOAD_COLUMNS.map((c) => c.meaning));
    for (const t of COLUMN_TYPES) expect(body).toContain(`<strong>${t.type}</strong>: ${t.form}`);
    expect(text(body)).toContain('Schema version 1');
  });

  it('names every status, and says which are scored', () => {
    const status = DOWNLOAD_COLUMNS.find((c) => c.name === 'status')?.meaning ?? '';
    for (const s of ['pending', 'hit', 'miss', 'void', 'unresolvable']) expect(status).toContain(`${s} (`);
    expect(status).toContain('Only hit and miss are scored.');
  });

  it('says how a call is scored, with the batch rule read from the scoring module, and links /methodology', () => {
    const t = text(page().body);
    expect(t).toContain(
      'the Brier score: the mean of (probability − outcome)², where the outcome is 1 for a hit and 0 for a miss',
    );
    expect(t).toContain(`at least ${MIN_RESOLUTION_BATCHES} independent batches`);
    expect(page().body).toContain('<a href="/methodology">/methodology</a>');
  });

  it('states the corrections and notes caveat, and links /corrections only while it is live', () => {
    const live = renderDataPageBody({ correctionsPageLive: true });
    const dark = renderDataPageBody({ correctionsPageLive: false });
    expect(text(live)).toContain('The status column is the verdict as we published it, and we do not change it.');
    expect(text(live)).toContain('changes no verdict');
    expect(live).toContain('<a href="/corrections">/corrections</a>');
    expect(dark).not.toContain('/corrections');
    // The served page follows the same gate /corrections itself answers by.
    expect(page().body.includes('href="/corrections"')).toBe(correctionsNewestFirst().length > 0);
  });

  it('carries the licence line and the citation line', () => {
    const { body } = page();
    expect(LICENCE_HTML).not.toBeNull();
    expect(body).toContain(
      'Licence: the <a href="https://github.com/ethancstuart/nexus-watch/blob/main/LICENSE">MIT License</a>, the licence of the NexusWatch repository.',
    );
    expect(body).toContain(
      '<p class="cite">NexusWatch forecast ledger, retrieved &lt;date&gt;, https://nexuswatch.dev/data</p>',
    );
  });

  it('carries no style attribute and no colour literal: the palette is the shell’s', () => {
    const { body } = page();
    const own = body.slice(body.indexOf('</nav>'));
    expect(own).not.toMatch(/style="/);
    const css = body.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? '';
    const pageCss = css.slice(css.indexOf('.schema-wrap'));
    expect(pageCss).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
