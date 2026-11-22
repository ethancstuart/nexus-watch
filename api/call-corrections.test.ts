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

async function render(): Promise<{ status: number; body: string; headers: Record<string, string> }> {
  const { default: handler } = await import('./call.js');
  const state = { status: 200, body: '', headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => {
      state.headers[k] = v;
      return res;
    },
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
    const { status, body, headers } = await render();
    expect(status).toBe(500);
    expect(body).not.toContain('MISS');
    // Review R2: the resolved call's day-long cache header is set before this
    // read; the failure must not inherit it.
    expect(headers['Cache-Control']).toBe('no-store');
  });

  it('a 500 for a missing database is not cached either', async () => {
    delete process.env.DATABASE_URL;
    const { status, headers } = await render();
    expect(status).toBe(500);
    expect(headers['Cache-Control']).toBe('no-store');
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

/**
 * WHETHER A CORRECTION SHOWS IS THE LEDGER'S RULE (review R3): the latest
 * call_corrections row only (the ledger's DISTINCT ON … issued_on DESC), and
 * only when correctedOutcomeOf says it changes a scored verdict. The query
 * returns rows newest first, so the fake does too.
 */
describe("/call/:id applies the ledger's correction rule", () => {
  it('reads the rows newest first', async () => {
    await render();
    expect(
      queries.some((q) => q.includes('FROM call_corrections WHERE call_id =') && q.includes('issued_on DESC')),
    ).toBe(true);
  });

  it('a corrected status that is not scored changes nothing: no block, no added sentence', async () => {
    for (const corrected_status of ['unresolvable', 'void']) {
      correctionRows = [{ issued_on: '2026-09-13', corrected_status, evidence_note: NOTE }];
      const { body } = await render();
      expect(body, corrected_status).not.toContain('Correction · issued');
      expect(description(body)).toMatch(/Result: MISS\.$/);
    }
  });

  it('an earlier change followed by a later row that agrees with the published verdict is no correction', async () => {
    correctionRows = [
      {
        issued_on: '2026-10-01',
        corrected_status: 'miss',
        evidence_note: 'Later reading agrees with the published miss.',
      },
      { issued_on: '2026-09-13', corrected_status: 'hit', evidence_note: NOTE },
    ];
    const { body } = await render();
    expect(body).not.toContain('Correction · issued');
    expect(body).not.toContain(NOTE);
    expect(description(body)).toMatch(/Result: MISS\.$/);
  });

  it('a later change after an earlier agreeing row is shown, dated by the later row', async () => {
    correctionRows = [
      { issued_on: '2026-10-01', corrected_status: 'hit', evidence_note: NOTE },
      { issued_on: '2026-09-13', corrected_status: 'miss', evidence_note: 'An earlier reading that agreed.' },
    ];
    const { body } = await render();
    expect(body).toContain('<div class="kicker">Correction · issued 2026-10-01</div>');
    expect(body).not.toContain('An earlier reading that agreed.');
    expect(description(body)).toMatch(/Corrected 2026-10-01: the evidence says HIT\.$/);
  });

  it('two causes reaching the same verdict: one heading, both notes, oldest first', async () => {
    correctionRows = [
      { issued_on: '2026-09-13', corrected_status: 'hit', evidence_note: 'Second cause note.' },
      { issued_on: '2026-09-13', corrected_status: 'hit', evidence_note: 'First cause note.' },
    ];
    const { body } = await render();
    expect(body.match(/<h2>Published MISS; the evidence says HIT<\/h2>/g)).toHaveLength(1);
    expect(body.indexOf('First cause note.')).toBeLessThan(body.indexOf('Second cause note.'));
  });

  it('a call that was not scored shows no correction, as the ledger scores only scored calls', async () => {
    callRow = { ...CORRECTED, status: 'unresolvable', void_reason: 'too few observed days' };
    correctionRows = [{ issued_on: '2026-09-13', corrected_status: 'hit', evidence_note: NOTE }];
    const { body } = await render();
    expect(body).not.toContain('Correction · issued');
  });

  it('a sibling whose latest reading is not scored carries no CORRECTED marker', async () => {
    historyRows = [
      {
        id: 1300,
        made_on: '2026-08-28',
        probability: 0.4,
        status: 'miss',
        resolves_on: '2026-09-11',
        corrected_status: 'unresolvable',
      },
    ];
    const { body } = await render();
    expect(body).toMatch(
      /call #1300<\/span><span class="trail">said 40% · <span class="mark" aria-hidden="true">□<\/span>MISS</,
    );
    expect(body).not.toContain('CORRECTED');
  });
});
