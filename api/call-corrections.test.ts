import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A CORRECTED CALL SAYS SO ON ITS OWN PAGE (independent review, 22 Nov 2026, M3).
 *
 * 54 censorship calls were published as misses that the evidence records as
 * hits (call_corrections, issued 2026-09-13; ledger-snapshots/2026-11-22.json).
 * /ledger showed the correction; /call/:id did not, and the uncapped sitemap
 * now submits all 54 to search engines. The page now shows the dated
 * correction beside the published verdict, which stays exactly as published.
 * Synthetic rows only; the note's wording is the shape of the real ones.
 */

const CORRECTED = {
  id: 1346,
  made_on: '2026-08-29',
  kind: 'censorship_event',
  country_code: 'XX',
  claim: 'OONI records at least 1 confirmed website or app blocking event in XX within 14 days.',
  probability: 0.4,
  horizon_days: 14,
  resolves_on: '2026-09-12',
  resolver: 'OONI',
  threshold: 1,
  threshold_pct: null,
  reference_value: null,
  base_rate: 0.4,
  status: 'miss',
  evidence_count: 0,
  resolved_at: '2026-09-12 09:45:40.497846+00',
  void_reason: null,
};

const NOTE =
  'The evidence rows for this window held one hour of each day rather than the whole day. ' +
  'Re-fetched at day grain, the window shows 1 blocked day(s) across 15 observed day(s), against a threshold of 1.';

let callRow: Record<string, unknown> = CORRECTED;
let correctionRows: Record<string, unknown>[] = [];
let historyRows: Record<string, unknown>[] = [];
let failCorrections = false;
const queries: string[] = [];

function fakeSql(strings: TemplateStringsArray): unknown[] {
  const q = strings.join(' ').replace(/\s+/g, ' ');
  queries.push(q);
  if (q.includes('FROM call_corrections WHERE call_id =')) {
    if (failCorrections) throw new Error('synthetic outage');
    return correctionRows;
  }
  if (q.includes('FROM calls WHERE id =')) return [callRow];
  if (q.includes('WHERE country_code =')) return historyRows;
  return [];
}
vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));

async function render(): Promise<{ status: number; body: string }> {
  const { default: handler } = await import('./call.js');
  const state = { status: 200, body: '' };
  const res = {
    setHeader: () => res,
    status: (n: number) => {
      state.status = n;
      return res;
    },
    send: (b: string) => {
      state.body = b;
      return res;
    },
  };
  await handler({ method: 'GET', query: { id: String(callRow.id) } } as never, res as never);
  return state;
}

const description = (html: string) =>
  ((html.match(/<meta name="description" content="([^"]*)">/) ?? [])[1] ?? '').replace(/&#39;/g, "'");

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  callRow = CORRECTED;
  correctionRows = [];
  historyRows = [];
  failCorrections = false;
  queries.length = 0;
  vi.restoreAllMocks();
});

describe('/call/:id shows its correction', () => {
  it('a dated block above the verdict: published MISS, the evidence says HIT, with the note', async () => {
    correctionRows = [{ issued_on: '2026-09-13', corrected_status: 'hit', evidence_note: NOTE }];
    const { status, body } = await render();
    expect(status).toBe(200);
    expect(body).toContain('<div class="kicker">Correction · issued 2026-09-13</div>');
    expect(body).toContain('<h2>Published MISS; the evidence says HIT</h2>');
    expect(body).toContain(`<p class="lede">${NOTE}</p>`);
    expect(body).toContain(
      'The verdict below is what we published and we have not rewritten it — the corrected reading sits beside it.',
    );
    expect(body).toContain(
      'Every field on this page was frozen when the call was made, except the dated correction below.',
    );
    // Above the record it corrects.
    expect(body.indexOf('Correction · issued')).toBeLessThan(body.indexOf('<div class="grid">'));
  });

  it('the published verdict is unchanged: the status block still says MISS', async () => {
    const before = (await render()).body;
    correctionRows = [{ issued_on: '2026-09-13', corrected_status: 'hit', evidence_note: NOTE }];
    const after = (await render()).body;
    const grid = (html: string) => html.slice(html.indexOf('<div class="grid">'), html.indexOf('The criterion'));
    expect(grid(after)).toBe(grid(before));
    expect(grid(after)).toContain('MISS</div>');
  });

  it('the search description keeps the result and adds the correction', async () => {
    correctionRows = [{ issued_on: '2026-09-13', corrected_status: 'hit', evidence_note: NOTE }];
    expect(description((await render()).body)).toBe(
      'NexusWatch said 40% on 2026-08-29, resolving 2026-09-12 against OONI. Result: MISS. ' +
        'Corrected 2026-09-13: the evidence says HIT.',
    );
  });

  it('an uncorrected call is exactly as before: no block, no exception, no added sentence', async () => {
    const { body } = await render();
    expect(body).not.toContain('Correction');
    expect(body).not.toContain('CORRECTED');
    expect(body).toContain('Every field on this page was frozen when the call was made.</p>');
    expect(description(body)).toBe(
      'NexusWatch said 40% on 2026-08-29, resolving 2026-09-12 against OONI. Result: MISS.',
    );
  });

  it('a correction row that agrees with the published verdict changes nothing and is not shown', async () => {
    correctionRows = [{ issued_on: '2026-09-13', corrected_status: 'miss', evidence_note: NOTE }];
    const { body } = await render();
    expect(body).not.toContain('Correction · issued');
    expect(description(body)).toMatch(/Result: MISS\.$/);
  });

  it('escapes the note', async () => {
    correctionRows = [{ issued_on: '2026-09-13', corrected_status: 'hit', evidence_note: '<script>x</script> & y' }];
    const { body } = await render();
    expect(body).toContain('&lt;script&gt;x&lt;/script&gt; &amp; y');
    expect(body).not.toContain('<script>x</script>');
  });

  it('if the corrections cannot be read, the page fails rather than show the verdict alone', async () => {
    failCorrections = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { status, body } = await render();
    expect(status).toBe(500);
    expect(body).not.toContain('MISS');
  });

  it("a sibling call in the history carries the ledger's CORRECTED marker", async () => {
    historyRows = [
      {
        id: 1300,
        made_on: '2026-08-28',
        probability: 0.4,
        status: 'miss',
        resolves_on: '2026-09-11',
        corrected_status: 'hit',
      },
      {
        id: 1200,
        made_on: '2026-08-27',
        probability: 0.4,
        status: 'miss',
        resolves_on: '2026-09-10',
        corrected_status: null,
      },
    ];
    const { body } = await render();
    expect(body).toMatch(
      /call #1300<\/span><span class="trail">said 40% · <span class="mark" aria-hidden="true">□<\/span>MISS · CORRECTED</,
    );
    expect(body).toMatch(
      /call #1200<\/span><span class="trail">said 40% · <span class="mark" aria-hidden="true">□<\/span>MISS</,
    );
    expect(body).not.toMatch(/call #1200<\/span><span class="trail">[^<]*<span[^>]*>[^<]*<\/span>MISS · CORRECTED/);
    // The history reads one correction per call, as the ledger scores it.
    expect(queries.some((q) => q.includes('DISTINCT ON (call_id)') && q.includes('WHERE country_code ='))).toBe(true);
  });
});
