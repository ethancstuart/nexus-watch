import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A CORRECTED CALL SAYS SO ON ITS SHARE CARD (independent review, 22 Nov 2026, R1).
 *
 * /api/og?type=call is the og:image of every call page. For the 54 censorship
 * calls the evidence now records as hits it printed MISS and nothing else, so
 * every unfurl contradicted the page it linked to. The card now reads the
 * corrections with the page's own rule (standingCorrection) and states the
 * correction beside the published verdict. A failed read serves the neutral
 * site card, uncached: never the verdict alone. Synthetic rows only.
 *
 * The image library is replaced by a stub that keeps the card's markup, so
 * the test reads what would be drawn; fonts are stubbed the same way.
 */

vi.mock('@vercel/og', () => ({
  ImageResponse: class {
    headers = new Headers();
    element: unknown;
    constructor(element: unknown) {
      this.element = element;
    }
  },
}));
vi.mock('./_lib/satori-html.js', () => ({ htmlToSatori: (html: string) => html }));

const CALL = {
  id: 1346,
  country_code: 'XX',
  claim: 'OONI records at least 1 confirmed website or app blocking event in XX within 14 days.',
  probability: 0.4,
  resolves_on: '2026-09-12',
  made_on: '2026-08-29',
  status: 'miss',
};

let callRows: Record<string, unknown>[] = [CALL];
let correctionRows: Record<string, unknown>[] = [];
let fail: 'none' | 'call' | 'corrections' = 'none';
function fakeSql(strings: TemplateStringsArray): unknown[] {
  const q = strings.join(' ').replace(/\s+/g, ' ');
  if (q.includes('FROM call_corrections WHERE call_id =')) {
    if (fail === 'corrections') throw new Error('synthetic outage');
    return correctionRows;
  }
  if (q.includes('FROM calls WHERE id =')) {
    if (fail === 'call') throw new Error('synthetic outage');
    return callRows;
  }
  return [];
}
vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));

async function card(id = '1346'): Promise<{ html: string; cache: string | null }> {
  const { default: handler } = await import('./og.js');
  const res = (await handler({ url: `/api/og?type=call&id=${id}` } as never)) as unknown as {
    element: string;
    headers: Headers;
  };
  return { html: res.element, cache: res.headers.get('Cache-Control') };
}

const SITE_CARD = 'Every call we make, on the record.';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  callRows = [CALL];
  correctionRows = [];
  fail = 'none';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(0) })),
  );
});

describe('the call share card shows the correction its page shows', () => {
  it('a corrected call: the published MISS stays, and the dated correction is stated beside it', async () => {
    correctionRows = [{ issued_on: '2026-09-13', corrected_status: 'hit' }];
    const { html, cache } = await card();
    expect(html).toContain('NEXUSWATCH · CALL #1346');
    expect(html).toMatch(/>MISS<\/span>/);
    expect(html).toContain('CORRECTED 2026-09-13 · THE EVIDENCE SAYS HIT');
    expect(cache).toBe('public, max-age=3600, s-maxage=86400');
  });

  it('an uncorrected call: no correction line', async () => {
    const { html } = await card();
    expect(html).toMatch(/>MISS<\/span>/);
    expect(html).not.toContain('CORRECTED');
  });

  it("the card follows the page's rule: latest row only, scored verdicts only", async () => {
    correctionRows = [
      { issued_on: '2026-10-01', corrected_status: 'miss' },
      { issued_on: '2026-09-13', corrected_status: 'hit' },
    ];
    expect((await card()).html).not.toContain('CORRECTED');
    correctionRows = [{ issued_on: '2026-09-13', corrected_status: 'unresolvable' }];
    expect((await card()).html).not.toContain('CORRECTED');
  });

  it('a failed corrections read: the neutral site card, no verdict, not cached', async () => {
    correctionRows = [{ issued_on: '2026-09-13', corrected_status: 'hit' }];
    fail = 'corrections';
    const { html, cache } = await card();
    expect(html).toContain(SITE_CARD);
    expect(html).not.toMatch(/\b(MISS|HIT)\b/);
    expect(html).not.toContain('CALL #');
    expect(cache).toBe('no-store');
  });

  it('a failed call read, or no database: the neutral card, not cached', async () => {
    fail = 'call';
    let r = await card();
    expect(r.html).toContain(SITE_CARD);
    expect(r.cache).toBe('no-store');
    fail = 'none';
    delete process.env.DATABASE_URL;
    r = await card();
    expect(r.html).toContain(SITE_CARD);
    expect(r.cache).toBe('no-store');
  });

  it('no such call, or a malformed id: the neutral card, cached as before', async () => {
    callRows = [];
    let r = await card();
    expect(r.html).toContain(SITE_CARD);
    expect(r.cache).toBe('public, max-age=3600, s-maxage=86400');
    r = await card('12abc');
    expect(r.html).toContain(SITE_CARD);
    expect(r.cache).toBe('public, max-age=3600, s-maxage=86400');
  });

  it('escapes what it prints', async () => {
    const { renderCallCard } = await import('./og.js');
    const html = renderCallCard({
      id: 1,
      countryCode: 'XX',
      claim: 'x',
      probability: 0.5,
      resolvesOn: '2026-09-12',
      madeOn: '2026-08-29',
      status: 'miss',
      correction: { issuedOn: '<b>', correctedStatus: '</span><span>' },
    });
    expect(html).toContain('CORRECTED &lt;b&gt; · THE EVIDENCE SAYS &lt;/SPAN&gt;&lt;SPAN&gt;');
    expect(html).not.toContain('</SPAN><SPAN>');
  });
});
