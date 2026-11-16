import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shell } from './_lib/ssr-shell.js';

/**
 * Craft defects on the two server-rendered pages, asserted on the HTML.
 *
 *  - /ledger: the first two statistics ran together into "1454/4963104". The
 *    fraction is nine mono characters at up to 96px, about 520px, in a column
 *    of about 280px when three stats share the row.
 *  - /call/:id: HIT/MISS carried a colour hook (`style="color:var(--up|down)"`)
 *    and no shape mark, against the rule that outcomes are word plus shape and
 *    never hue (src/styles/register-tokens.ts `outcomeMarks`).
 *
 * Synthetic rows only.
 */

const RESOLVED_MISS = {
  id: 4592,
  made_on: '2026-10-16',
  kind: 'fx_devaluation',
  country_code: 'XX',
  claim: 'Synthetic currency depreciates 1.17% or more against USD within 14 days.',
  probability: 0.23,
  horizon_days: 14,
  resolves_on: '2026-10-30',
  resolver: 'FX_RATES',
  threshold: null,
  threshold_pct: 1.17,
  reference_value: 4.08,
  base_rate: 0.25,
  status: 'miss',
  evidence_count: 16,
  resolved_at: '2026-10-30T12:00:00Z',
  void_reason: null,
};

const HISTORY = [
  { id: 4600, made_on: '2026-10-20', probability: 0.21, status: 'pending', resolves_on: '2026-11-03' },
  { id: 4580, made_on: '2026-10-12', probability: 0.3, status: 'hit', resolves_on: '2026-10-26' },
  { id: 4570, made_on: '2026-10-10', probability: 0.22, status: 'miss', resolves_on: '2026-10-24' },
];

let callRow: Record<string, unknown> = RESOLVED_MISS;
let historyRows: Record<string, unknown>[] = HISTORY;
function fakeSql(strings: TemplateStringsArray): unknown[] {
  const q = strings.join(' ').replace(/\s+/g, ' ');
  if (q.includes('COUNT(*) FILTER')) {
    return [{ open: 928, resolved: 4963, hits: 1454, next_resolves: '2026-11-16', first_call: '2026-08-22' }];
  }
  if (q.includes('FROM calls WHERE id =')) return [callRow];
  if (q.includes('WHERE country_code =')) return historyRows;
  return [];
}
vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));

function fakeRes() {
  const state = { status: 200, body: '', headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => {
      state.headers[k] = v;
    },
    status: (n: number) => {
      state.status = n;
      return res;
    },
    send: (b: string) => {
      state.body = b;
      return res;
    },
    state,
  };
  return res;
}

async function renderCall(row: Record<string, unknown>): Promise<string> {
  callRow = row;
  const { default: handler } = await import('./call.js');
  const res = fakeRes();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await handler({ method: 'GET', query: { id: String(row.id) } } as any, res as any);
  expect(res.state.status).toBe(200);
  return res.state.body;
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  historyRows = HISTORY;
});

/** The page without its <style> blocks, whose comments legitimately name MISS and HIT. */
const withoutStyle = (html: string) => html.replace(/<style[\s\S]*?<\/style>/g, '');

describe('/call/:id never asserts an outcome it does not have', () => {
  const UNRESOLVABLE = {
    ...RESOLVED_MISS,
    status: 'unresolvable',
    evidence_count: null,
    void_reason: 'Synthetic coverage: observed on 2 of 14 days, below the line.',
  };

  it('an unresolvable call says so: the word, the reason, not scored, and no hit or miss', async () => {
    historyRows = [];
    const html = await renderCall(UNRESOLVABLE);
    expect(html).toContain('<div class="v wide">UNRESOLVABLE</div>');
    expect(html).toContain('Synthetic coverage: observed on 2 of 14 days, below the line.');
    expect(html).toContain('not scored');
    expect(withoutStyle(html)).not.toMatch(/\bMISS\b/);
    expect(withoutStyle(html)).not.toMatch(/\bHIT\b/);
    expect(html).not.toMatch(/class="mark"/);
    expect(html).not.toMatch(/[□■]/);
  });

  it('an unresolvable call with no recorded reason says that rather than inventing one', async () => {
    historyRows = [];
    const html = await renderCall({ ...UNRESOLVABLE, void_reason: null });
    expect(html).toContain('no reason recorded');
  });

  it('the meta description does not call an unresolvable call a result', async () => {
    historyRows = [];
    const html = await renderCall(UNRESOLVABLE);
    const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(description).toContain('not scored');
    expect(description).not.toMatch(/MISS|HIT|UNRESOLVABLE/);
  });

  it('a status this page does not know asserts no outcome', async () => {
    historyRows = [];
    const html = await renderCall({ ...RESOLVED_MISS, status: 'cancelled' });
    expect(html).toContain('NO OUTCOME RECORDED');
    expect(withoutStyle(html)).not.toMatch(/\bMISS\b/);
    expect(withoutStyle(html)).not.toMatch(/\bHIT\b/);
    expect(html).not.toMatch(/[□■]/);
    const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
    expect(description).not.toMatch(/MISS|HIT|CANCELLED/);
  });

  it('history rows for unresolvable and unknown statuses carry no outcome word or mark', async () => {
    historyRows = [
      { id: 4601, made_on: '2026-10-21', probability: 0.4, status: 'unresolvable', resolves_on: '2026-11-04' },
      { id: 4602, made_on: '2026-10-22', probability: 0.5, status: 'cancelled', resolves_on: '2026-11-05' },
    ];
    const html = await renderCall({ ...RESOLVED_MISS, status: 'pending' });
    expect(html).toMatch(/call #4601<\/span><span class="trail">UNRESOLVABLE</);
    expect(html).toMatch(/call #4602<\/span><span class="trail">NO OUTCOME RECORDED</);
    expect(html).not.toMatch(/CANCELLED/);
    expect(html).not.toMatch(/[□■]/);
  });

  it('hit and miss are unchanged beside the new statuses', async () => {
    const miss = await renderCall(RESOLVED_MISS);
    expect(miss).toContain('<div class="v"><span class="mark" aria-hidden="true">□</span>MISS</div>');
    const hit = await renderCall({ ...RESOLVED_MISS, status: 'hit' });
    expect(hit).toContain('<div class="v"><span class="mark" aria-hidden="true">■</span>HIT</div>');
  });
});

describe('/call/:id outcomes are word plus shape, never hue', () => {
  it('a missed call shows the hollow mark beside MISS, with no colour hook', async () => {
    const html = await renderCall(RESOLVED_MISS);
    expect(html).toContain('<div class="v"><span class="mark" aria-hidden="true">□</span>MISS</div>');
    expect(html).not.toMatch(/var\(--(up|down)\)/);
    expect(html).not.toMatch(/<div class="v" style=/);
  });

  it('a hit shows the filled mark beside HIT', async () => {
    const html = await renderCall({ ...RESOLVED_MISS, status: 'hit' });
    expect(html).toContain('<div class="v"><span class="mark" aria-hidden="true">■</span>HIT</div>');
    expect(html).not.toMatch(/var\(--(up|down)\)/);
  });

  it('history rows carry the mark for resolved calls and none for open ones', async () => {
    const html = await renderCall(RESOLVED_MISS);
    expect(html).toMatch(
      /call #4580<\/span><span class="trail">said 30% · <span class="mark" aria-hidden="true">■<\/span>HIT</,
    );
    expect(html).toMatch(
      /call #4570<\/span><span class="trail">said 22% · <span class="mark" aria-hidden="true">□<\/span>MISS</,
    );
    expect(html).toMatch(/call #4600<\/span><span class="trail">21% · resolves 2026-11-03</);
  });

  it('provenance names the base rate in words, not as a column name', async () => {
    const html = await renderCall(RESOLVED_MISS);
    expect(html).not.toContain('base_rate');
  });
});

describe('/ledger stat figures fit their column', () => {
  // The shell's stylesheet is the same for every page; read it from a render.
  const css = shell('<p>x</p>', { title: 't', description: 'd', canonicalPath: '/ledger' });

  // Geometry, not taste. A mono face sets about 0.6em per character. At the
  // 940px wrap (892px of content, 32px gaps) three stats get about 276px each.
  it('a wide figure is sized from its own column, to fit eleven characters', () => {
    expect(css).toMatch(/\.stat \{ container-type:inline-size; \}/);
    const m = css.match(/\.stat \.v\.wide \{[^}]*font-size:clamp\((\d+)px,(\d+(?:\.\d+)?)cqi,(\d+)px\)/);
    expect(m, 'a .stat .v.wide font-size in cqi').not.toBeNull();
    const [min, cqi] = [Number(m?.[1]), Number(m?.[2])];
    expect(11 * 0.6 * (cqi / 100)).toBeLessThanOrEqual(1); // "14540/49630" fits any column
    expect(11 * 0.6 * min).toBeLessThanOrEqual(200); // ...including the grid's 200px minimum
  });

  it('without container units, the fallback fits nine characters in three columns', () => {
    const m = css.match(/\.stat \.v\.wide \{ font-size:clamp\((\d+)px,[\d.]+vw,(\d+)px\);/);
    expect(m, 'a vw fallback declared first').not.toBeNull();
    expect(9 * 0.6 * Number(m?.[2])).toBeLessThanOrEqual(276);
  });

  it('the ledger marks its hits/resolved figure as wide', async () => {
    const { default: handler } = await import('./ledger.js');
    const res = fakeRes();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await handler({ method: 'GET', query: {} } as any, res as any);
    expect(res.state.status).toBe(200);
    expect(res.state.body).toContain('<div class="v wide">1454/4963</div><div class="l">calls that landed</div>');
  });
});
