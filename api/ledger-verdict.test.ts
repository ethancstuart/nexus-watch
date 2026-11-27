import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  snapshotSql,
  fakeRes,
  withExtraOpenCalls,
  SNAPSHOT,
  ALL_CALLS,
  type SnapCall,
} from './_lib/snapshot-sql-fixture.js';
import { verdictHtml } from './_lib/verdict-html.js';
import type { Verdict } from './_lib/verdict-words.js';

/**
 * /ledger OPENS WITH A PLAIN, DATED VERDICT, IN THE SERVER-RENDERED HTML.
 *
 * Crawlers and no-JS readers get it, because /ledger rewrites to api/ledger.ts.
 * Every number in it comes from the page's own queries and scoring functions
 * at request time, and is checked here against figures computed independently
 * from the book. The database is ledger-snapshots/2026-11-22.json
 * (api/_lib/snapshot-sql-fixture.ts); nothing else is mocked except, in one
 * block, whether /corrections is live.
 */

const h = vi.hoisted(() => ({ noCorrectionsPage: false }));
vi.mock('@neondatabase/serverless', () => ({ neon: () => snapshotSql }));
vi.mock('./_lib/corrections.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/corrections.js')>();
  return {
    ...real,
    correctionsNewestFirst: () => (h.noCorrectionsPage ? [] : real.correctionsNewestFirst()),
  };
});

const MINUS = '−';

async function ledgerPage(): Promise<string> {
  const { default: handler } = await import('./ledger.js');
  const res = fakeRes();
  await handler({ method: 'GET', query: {} } as never, res as never);
  return res.state.body;
}

/** The verdict paragraph, or null. */
const verdictOf = (html: string) => html.match(/<p class="lede" id="verdict">.*?<\/p>/)?.[0] ?? null;
/** Its text, tags dropped, entities left as served. */
const plain = (p: string) => p.replace(/<[^>]+>/g, '');

/** The figures, computed here from the book itself rather than from the page. */
function bookFigures() {
  const all = [...SNAPSHOT.open, ...SNAPSHOT.resolved];
  const claims = all.filter((c) => c.kind !== 'seismicity_window');
  const scoredStatus = (s: string) => s === 'hit' || s === 'miss';
  const fx = SNAPSHOT.resolved.filter((c) => c.kind === 'fx_devaluation' && scoredStatus(c.status));
  const o = (c: SnapCall) => (c.status === 'hit' ? 1 : 0);
  const brier = fx.reduce((a, c) => a + (c.probability - o(c)) ** 2, 0) / fx.length;
  const ref = fx.reduce((a, c) => a + ((c.base_rate as number) - o(c)) ** 2, 0) / fx.length;
  return {
    scored: claims.filter((c) => scoredStatus(c.status)).length,
    open: claims.filter((c) => c.status === 'pending').length,
    fxSkill: 1 - brier / ref,
  };
}
const grouped = (n: number) => n.toLocaleString('en-US');
const points = (v: number) => {
  const r = Math.round(v * 100);
  return r === 0 ? '0%' : `${r > 0 ? '+' : MINUS}${Math.abs(r)}%`;
};

/** Adds scored calls to the book for the length of `fn`. */
async function withExtraResolvedCalls<T>(calls: SnapCall[], fn: () => Promise<T>): Promise<T> {
  SNAPSHOT.resolved.push(...calls);
  ALL_CALLS.push(...calls);
  try {
    return await fn();
  } finally {
    for (const c of calls) {
      SNAPSHOT.resolved.splice(SNAPSHOT.resolved.indexOf(c), 1);
      ALL_CALLS.splice(ALL_CALLS.indexOf(c), 1);
    }
  }
}
const fxCall = (id: number, over: Partial<SnapCall>): SnapCall => ({
  id: String(id),
  kind: 'fx_devaluation',
  country_code: 'ZZ',
  claim: 'ZZZ depreciates 1.00% or more against USD at any point within 14 days, from 1.0.',
  probability: 0.25,
  base_rate: 0.25,
  made_on: '2026-11-23',
  resolves_on: '2026-12-07',
  status: 'pending',
  evidence_count: null,
  resolved_at: null,
  correction: null,
  ...over,
});

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  h.noCorrectionsPage = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(SNAPSHOT.generated_at));
});
afterEach(() => {
  vi.useRealTimers();
});

describe('/ledger opens with the verdict', () => {
  it('directly under the H1, before the lede and every essay', async () => {
    const html = await ledgerPage();
    const p = verdictOf(html);
    expect(p).not.toBeNull();
    const h1End = html.indexOf('</h1>');
    expect(html.indexOf(p as string)).toBe(h1End + '</h1>\n'.length);
    expect(html.indexOf(p as string)).toBeLessThan(html.indexOf('<p class="lede">'));
    expect(html.indexOf(p as string)).toBeLessThan(html.indexOf('Read this before the first score'));
    expect(html.indexOf(p as string)).toBeLessThan(html.indexOf('<div class="grid">'));
    expect(html.match(/id="verdict"/g)).toHaveLength(1);
  });

  it('word for word on the 22 Nov 2026 book', async () => {
    expect(verdictOf(await ledgerPage())).toBe(
      '<p class="lede" id="verdict"><strong>As of 22 Nov 2026:</strong> 5,429 forecasts scored, 919 open. ' +
        `Currency forecasts score ${MINUS}3% against their base rate: no detectable skill. ` +
        'Corrections to our censorship reporting are published on <a href="/corrections">our corrections page</a>.</p>',
    );
  });

  it('every figure matches the book, computed independently', async () => {
    const f = bookFigures();
    const p = plain(verdictOf(await ledgerPage()) as string);
    expect(p).toContain(`${grouped(f.scored)} forecasts scored, ${grouped(f.open)} open.`);
    expect(p).toContain(`Currency forecasts score ${points(f.fxSkill)} against their base rate`);
  });

  it('the currency figure is the one the FX row below prints', async () => {
    const html = await ledgerPage();
    const row = html.match(/<span class="lead">FX<\/span>.*?<span class="trail">skill ([+-]?\d+)%<\/span>/)?.[1];
    expect(row).toBeDefined();
    const n = Number(row);
    const asVerdict = n === 0 ? '0%' : `${n > 0 ? '+' : MINUS}${Math.abs(n)}%`;
    expect(plain(verdictOf(html) as string)).toContain(`score ${asVerdict} against`);
  });

  it('one link, to /corrections, and no other', async () => {
    const p = verdictOf(await ledgerPage()) as string;
    expect([...p.matchAll(/<a /g)]).toHaveLength(1);
    expect(p).toContain('<a href="/corrections">our corrections page</a>');
  });
});

describe('the verdict is computed per request, never written down', () => {
  it('dated by the clock at request time', async () => {
    vi.setSystemTime(new Date('2026-12-01T08:00:00Z'));
    expect(plain(verdictOf(await ledgerPage()) as string)).toMatch(/^As of 1 Dec 2026: /);
  });

  it('more open calls on the book, a larger open count', async () => {
    const before = bookFigures().open;
    await withExtraOpenCalls([fxCall(990001, {}), fxCall(990002, {}), fxCall(990003, {})], async () => {
      expect(plain(verdictOf(await ledgerPage()) as string)).toContain(`scored, ${grouped(before + 3)} open.`);
    });
  });

  it('a different scored book, a different count and skill, and a positive estimate is not called skill', async () => {
    // 2,000 currency calls priced far below their base rate that did not happen:
    // each one scores better than the base rate, enough to turn the FX figure positive.
    const extra = Array.from({ length: 2000 }, (_, i) =>
      fxCall(980000 + i, {
        probability: 0.01,
        base_rate: 0.25,
        status: 'miss',
        resolves_on: '2026-11-23',
        resolved_at: '2026-11-23T09:45:00Z',
      }),
    );
    await withExtraResolvedCalls(extra, async () => {
      const f = bookFigures();
      expect(f.fxSkill).toBeGreaterThan(0);
      const p = plain(verdictOf(await ledgerPage()) as string);
      expect(p).toContain(`${grouped(f.scored)} forecasts scored`);
      expect(p).toContain(
        `Currency forecasts score ${points(f.fxSkill)} against their base rate. No interval is computed for that ` +
          'figure, so it does not show skill.',
      );
      expect(p).not.toMatch(/detectable skill/);
    });
  });
});

describe('the corrections link follows the corrections page', () => {
  it('no corrections page, no sentence and no link', async () => {
    h.noCorrectionsPage = true;
    const p = verdictOf(await ledgerPage()) as string;
    expect(p).not.toContain('<a ');
    expect(p).not.toContain('orrections');
    expect(p).toMatch(/no detectable skill\.<\/p>$/);
  });

  it('the landing links to /corrections unconditionally, so /corrections must be live', async () => {
    // src/pages/landing.ts cannot read the corrections data (it must not reach
    // the browser bundle), so it always shows the link. If every note is ever
    // withdrawn, this fails, and the landing's link must go with them.
    const real = await vi.importActual<typeof import('./_lib/corrections.js')>('./_lib/corrections.js');
    expect(real.correctionsNewestFirst().length).toBeGreaterThan(0);
  });
});

describe('no figures, no verdict', () => {
  it('without a database the page says so, and claims nothing', async () => {
    delete process.env.DATABASE_URL;
    const html = await ledgerPage();
    expect(html).toContain('Temporarily unavailable.');
    expect(verdictOf(html)).toBeNull();
    expect(html).not.toContain('As of');
  });
});

describe('escaping holds', () => {
  it('every piece of the verdict is escaped where it is rendered', () => {
    const hostile: Verdict = {
      dateline: 'As of <script>alert(1)</script>:',
      body: '5 forecasts scored, "1" open & <img src=x onerror=alert(1)>.',
      corrections: { before: "<b>'x'</b> ", link: '<i>link</i>', after: '</p><p>', href: '"><script>x</script>' },
      text: 'unused',
    };
    const html = verdictHtml(hostile);
    expect(html).not.toMatch(/<(script|img|b|i)\b/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&quot;1&quot; open &amp; &lt;img src=x onerror=alert(1)&gt;');
    expect(html).toContain('href="&quot;&gt;&lt;script&gt;x&lt;/script&gt;"');
    expect(html.match(/<\/p>/g)).toHaveLength(1);
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it('without a corrections sentence there is no anchor at all', () => {
    const html = verdictHtml({ dateline: 'As of 1 Dec 2026:', body: 'x.', corrections: null, text: 'unused' });
    expect(html).toBe('<p class="lede" id="verdict"><strong>As of 1 Dec 2026:</strong> x.</p>');
  });
});
