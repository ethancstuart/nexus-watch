import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import handler from './data.js';
import {
  renderDataPageBody,
  DATA_PAGE_CACHE_CONTROL,
  LICENCE_HTML,
  REPOSITORY_LICENCE_HTML,
} from './_lib/data-page.js';
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
    // A published verdict, not a fact about the world, and a pointer to the correction (review F1).
    expect(status).toContain('miss (published as not having come true)');
    expect(status).toContain('Where has_correction is true, later evidence supports correction_status instead.');
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
    // How to score on corrected evidence, said where the caveat is (review F1).
    expect(text(live)).toContain(
      'To score the record on corrected evidence, take correction_status where has_correction is true and status ' +
        'everywhere else; status alone reproduces the scores as published.',
    );
    expect(live).toContain('<a href="/corrections">/corrections</a>');
    expect(dark).not.toContain('/corrections');
    // The served page follows the same gate /corrections itself answers by.
    expect(page().body.includes('href="/corrections"')).toBe(correctionsNewestFirst().length > 0);
  });

  it('claims no licence for the data until the owner chooses one (lead decision, 27 Nov 2026)', () => {
    const { body } = page();
    expect(LICENCE_HTML).toBeNull();
    expect(text(body)).not.toMatch(/Licence|License/);
    expect(body).not.toContain('LICENSE');
    expect(body).toContain('<h2>Citation</h2>');
  });

  it('keeps the licence path: a chosen line is printed, under "Licence and citation"', () => {
    const withLine = renderDataPageBody({ correctionsPageLive: true, licenceHtml: REPOSITORY_LICENCE_HTML });
    expect(withLine).toContain(
      '<p class="lede">Licence: the <a href="https://github.com/ethancstuart/nexus-watch/blob/main/LICENSE">MIT License</a>, the licence of the NexusWatch repository.</p>',
    );
    expect(withLine).toContain('<h2>Licence and citation</h2>');
    expect(renderDataPageBody({ correctionsPageLive: true, licenceHtml: null })).not.toContain('Licence');
  });

  it('carries the citation line', () => {
    expect(page().body).toContain(
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

describe('/ledger, /call/:id, the API docs and the sitemap point to /data', () => {
  it('/ledger carries one sentence linking /data', async () => {
    process.env.DATABASE_URL = 'postgres://stub';
    const { default: ledger } = await import('./ledger.js');
    const res = fakeRes();
    await ledger({ method: 'GET', query: {} } as never, res as never);
    expect(res.state.status).toBe(200);
    const links = res.state.body.match(/<a href="\/data">/g) ?? [];
    expect(links).toHaveLength(1);
    expect(text(res.state.body)).toContain(
      'Every call, open and resolved, can be downloaded as CSV or JSON, with a documented schema, from /data .',
    );
  });

  it('/call/:id sends a reader who wants every call to /data, not the capped /api/calls/ledger', async () => {
    process.env.DATABASE_URL = 'postgres://stub';
    const { default: call } = await import('./call.js');
    const res = fakeRes();
    await call({ method: 'GET', query: { id: '6176' } } as never, res as never);
    expect(res.state.status).toBe(200);
    expect(res.state.body).toContain(
      '<p class="foot"><a href="/ledger">← The full ledger</a> · <a href="/data">every call, as CSV or JSON</a></p>',
    );
    expect(res.state.body).not.toContain('href="/api/calls/ledger"');
  });

  it('the API docs keep /api/calls/ledger as the capped live view and send every-call readers to /data', async () => {
    const { default: docs } = await import('./v1/docs.js');
    let body: { alsoPublic: Record<string, string> } | undefined;
    const res = {
      setHeader: () => res,
      json: (b: typeof body) => {
        body = b;
        return res;
      },
    };
    docs({} as never, res as never);
    expect(body?.alsoPublic['GET /api/calls/ledger']).toBe(
      'The live ledger view, capped: counts and per-kind scores, up to 200 open calls (those furthest from their ' +
        'base rate) and the 100 most recently resolved, with corrections attached. Every call, as CSV or JSON: ' +
        'https://nexuswatch.dev/data',
    );
    // The caps the line states are the endpoint's own: 200 open, ordered by
    // distance from the base rate, and 100 resolved, unless ?all=1.
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'calls', 'ledger.ts'), 'utf8');
    expect(src).toContain('const openLimit = wantsAll ? 100000 : 200;');
    expect(src).toContain('ORDER BY ABS(probability - COALESCE(base_rate, probability)) DESC');
    expect(src).toContain('(wantsAll ? resolved : resolved.slice(0, 100))');
  });

  it('the sitemap lists /data', async () => {
    const { default: sitemap } = await import('./sitemap.js');
    const res = fakeRes();
    delete process.env.DATABASE_URL;
    await sitemap({ method: 'GET', query: {} } as never, res as never);
    expect(res.state.body).toContain('<loc>https://nexuswatch.dev/data</loc>');
  });
});
