import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  snapshotSql,
  fakeRes,
  fixtureFaults,
  withExtraOpenCalls,
  CALL_BY_ID,
  SNAPSHOT,
  type SnapCall,
} from './_lib/snapshot-sql-fixture.js';

/**
 * AN APPROVED NOTE RENDERS ON EVERY SURFACE, ESCAPED, AND MOVES NO VERDICT,
 * COUNT OR SCORE.
 *
 * The notes' data and keys are replaced here so this file does not depend on
 * what is approved today:
 *  - 'approved': the REAL entries of call-notes-data.ts, each set to approved
 *    on 2026-11-23, with every id in the key. The texts on every surface are
 *    checked word for word against the approved wording (FX-WORDING.md §6).
 *  - 'none': the same entries with an empty key, so the gate passes nothing.
 *  - 'planted': hostile text, to prove every surface escapes it.
 * Every other module is real. The database is ledger-snapshots/2026-11-22.json
 * (api/_lib/snapshot-sql-fixture.ts), the book the wording was computed on.
 *
 * Unapproved notes are covered by call-notes-drafts.test.ts, on the real data
 * and keys with nothing mocked but the database.
 */

const h = vi.hoisted(() => ({
  keys: [] as string[],
  planted: null as null | { CALL_NOTES: unknown[]; LEDGER_SECTIONS: unknown[]; METHODOLOGY_NOTES: unknown[] },
}));

vi.mock('./_lib/call-notes-approvals.js', () => ({
  get APPROVED_NOTE_IDS() {
    return h.keys;
  },
}));
vi.mock('./_lib/call-notes-data.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/call-notes-data.js')>();
  const approve = <T extends object>(n: T) => ({ ...n, status: 'approved' as const, issuedOn: '2026-11-23' });
  return {
    get CALL_NOTES() {
      return h.planted?.CALL_NOTES ?? real.CALL_NOTES.map(approve);
    },
    get LEDGER_SECTIONS() {
      return h.planted?.LEDGER_SECTIONS ?? real.LEDGER_SECTIONS.map(approve);
    },
    get LEDGER_FX_THRESHOLD_LINE() {
      return approve(real.LEDGER_FX_THRESHOLD_LINE);
    },
    get METHODOLOGY_NOTES() {
      return h.planted?.METHODOLOGY_NOTES ?? real.METHODOLOGY_NOTES.map(approve);
    },
  };
});
vi.mock('@neondatabase/serverless', () => ({ neon: () => snapshotSql }));
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

const ALL_IDS = [
  'fx-2026-11-21-resolved-miss',
  'fx-2026-11-21-resolved-hit',
  'fx-2026-11-21-made',
  'fx-zw-zwl-label',
  'ledger-fx-2026-11-21',
  'ledger-fx-threshold-line',
  'methodology-fx-threshold',
];

// ── The approved wording, word for word (lanes8/FX-WORDING.md §6), dated 23 Nov 2026. ──
const R1A_HEAD =
  "Note added 23 Nov 2026. This call's window ended on 21 Nov 2026. When that day's calls were issued, the newest " +
  'exchange rate we held for each of the 65 currencies we issue calls on was still the 20 Nov rate; all 65 changed ' +
  "on 22 Nov. This call's score is the one the rates from 7 to 20 Nov give.";
const R1A_MISS =
  `${R1A_HEAD} A missing day can turn a hit into a miss, never a miss into a hit. We do not know whether a 21 Nov ` +
  'rate would have made this call a hit. The published verdict is unchanged. Source: our stored daily exchange rates.';
const R1A_HIT =
  `${R1A_HEAD} A missing day can only turn a hit into a miss, so a 21 Nov rate could not have changed this hit. ` +
  'The published verdict is unchanged. Source: our stored daily exchange rates.';
const r1b = (reference: string) =>
  `Note added 23 Nov 2026. This call was made on 21 Nov 2026. The reference rate it states, ${reference}, is the ` +
  '20 Nov rate: no newer rate had reached us when the call was made. Rates changed again on 22 Nov. The claim, ' +
  'threshold and reference are unchanged. Source: our stored daily exchange rates.';
const R2 =
  'Note added 23 Nov 2026. This call names the currency ZWL, the code under which our rates source publishes this ' +
  'rate. On 16 and 22 Nov 2026 the source published the same rate under ZWG, the code of the ZiG: 26.5861 and ' +
  '26.5872. We have not compared the two codes on any other day. The rate, threshold and verdict are unchanged. ' +
  "Source: our rates source's published quotes, 16 and 22 Nov 2026.";
const R1C_KICKER = 'Exchange rates, 21 November 2026';
const R1C_HEADING = 'One day without new rates';
const R1C =
  "On 21 Nov 2026, when that day's calls were issued, the newest exchange rate we held for each of the 65 " +
  'currencies we issue calls on was still the 20 Nov rate. All 65 changed on 22 Nov. We do not know whether our ' +
  'collector or our source missed the day. Of the 66 calls that resolved on 21 Nov, the 65 in these currencies were ' +
  'scored that morning. Each score is the one the rates from 7 to 20 Nov give: 27 were published as hits and 38 as ' +
  'misses. A missing day can only turn a hit into a miss, so the 27 hits stand; we do not know whether any of the 38 ' +
  'misses would differ. 21 Nov also falls inside the windows of 65 of the 66 calls that resolved on 22 Nov, whose ' +
  'scores are the ones the rates of 8 to 20 Nov and 22 Nov give. As of 22 Nov 2026, it also fell inside the windows ' +
  'of 780 open calls in these currencies, which had not yet been scored. We have not yet checked our calls on ' +
  'Azerbaijan (AZN), the ' +
  'last of which was made on 17 Nov. The 65 calls made on 21 Nov state the 20 Nov rate as their reference. We have ' +
  'changed no verdict. On 22 Nov 2026 our FX skill was −3.0% with the 66 calls resolved on 21 Nov and −3.1% ' +
  'without them; every figure on this page counts them as published.';
const R3A_HEADING = 'How a currency threshold is set, and what it does to the score';
const R3A =
  "Added 23 Nov 2026. A currency call's threshold is the 75th percentile of that currency's 14-day peak " +
  'depreciation over all the history we hold. So it is reached in about one window in four, and the base rate we ' +
  'score against is about 25%. Our probability gives one fifth of its weight to the 42 most recent complete windows. ' +
  'When a currency reaches its threshold less often than it used to, our probability falls below the base rate, and ' +
  'each miss scores better than the base rate. On 22 Nov 2026 four currencies were priced below their base rate on ' +
  'every resolved call and hit at most once: Sri Lanka (LKR), Venezuela (VES), Zimbabwe (the ZiG, which our source ' +
  'labels ZWL) and Ethiopia (ETB). Their 312 resolved calls include 1 hit. Five more currencies were priced below ' +
  'base rate on every call but hit 5 to 7 times each. Our FX skill on 22 Nov 2026 was −3.0% on 5,166 resolved ' +
  'calls, and −3.7% on the 4,854 calls outside the four. Measured fortnight by fortnight (five fortnights from ' +
  "23 Aug, then the eight days to 8 Nov), the average fortnight's skill has a 95% interval of −7.2% to +4.0% for " +
  'all calls and −8.0% to +3.4% without the four. Both include zero: neither figure shows skill. No call has been ' +
  'removed from any figure.';
/** R3b as the wording gives it for 22 Nov, up to its link. */
const R3B_LEAD =
  'Includes 312 calls in 4 currencies that we priced below their base rate on every resolved call and that hit at ' +
  'most once (ETB, LKR, VES, ZWL); 1 of the 312 hit. Without them, skill is −3.7% (−3.0% with them). ' +
  'How thresholds are set: ';

/** What the server's esc() does to plain text. */
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

async function callPage(id: number): Promise<string> {
  const { default: handler } = await import('./call.js');
  const res = fakeRes();
  await handler({ method: 'GET', query: { id: String(id) } } as never, res as never);
  expect(res.state.status).toBe(200);
  return res.state.body;
}
async function card(id: number): Promise<string> {
  const { default: handler } = await import('./og.js');
  const r = (await handler({ url: `/api/og?type=call&id=${id}` } as never)) as unknown as { element: string };
  return r.element;
}
async function ledgerPage(): Promise<string> {
  const { default: handler } = await import('./ledger.js');
  const res = fakeRes();
  await handler({ method: 'GET', query: {} } as never, res as never);
  return res.state.body;
}
async function ledgerJson(): Promise<Record<string, unknown>> {
  const { default: handler } = await import('./calls/ledger.js');
  const res = fakeRes();
  await handler({ method: 'GET', query: { all: '1' } } as never, res as never);
  expect(res.state.status).toBe(200);
  const j = res.state.json as Record<string, unknown>;
  delete j.generated_at;
  return JSON.parse(JSON.stringify(j)) as Record<string, unknown>;
}
async function methodNotes(): Promise<{ notes: Array<{ heading: string; added_on: string; paragraphs: string[] }> }> {
  const { default: handler } = await import('./method-notes.js');
  const res = fakeRes();
  handler({ method: 'GET', query: {} } as never, res as never);
  return res.state.json as { notes: Array<{ heading: string; added_on: string; paragraphs: string[] }> };
}

const grid = (html: string) => html.slice(html.indexOf('<div class="grid">'), html.indexOf('The criterion'));
const paragraphs = (html: string) => [...html.matchAll(/<p class="lede">([^<]*)<\/p>/g)].map((m) => m[1]);

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  h.keys = [...ALL_IDS];
  h.planted = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(0) })),
  );
});

describe('/call/:id: a block above the grid, the verdict unchanged', () => {
  it('a MISS resolved 21 Nov (AR 6047): the MISS note, word for word', async () => {
    const html = await callPage(6047);
    expect(html).toContain('<div class="rule"></div><div class="kicker">Note</div>');
    expect(paragraphs(html)).toContain(esc(R1A_MISS));
    expect(html.indexOf('Note added')).toBeLessThan(html.indexOf('<div class="grid">'));
    expect(html).toContain('Every field on this page was frozen when the call was made, except the dated note below.');
  });

  it('a HIT resolved 21 Nov: the HIT note, never the MISS one', async () => {
    const hitId = 6048;
    expect(CALL_BY_ID.get(hitId)?.status).toBe('hit');
    const html = await callPage(hitId);
    expect(paragraphs(html)).toContain(esc(R1A_HIT));
    expect(html).not.toContain(esc('We do not know whether a 21 Nov rate would have made this call a hit.'));
  });

  it('a call made 21 Nov: the reference its claim states, even in exponent form (IR 7002)', async () => {
    expect(CALL_BY_ID.get(7002)?.claim).toMatch(/from 1\.81120e\+6\.$/);
    expect(paragraphs(await callPage(7002))).toContain(esc(r1b('1.81120e+6')));
    expect(CALL_BY_ID.get(6982)?.claim).toMatch(/from 1562\.99\.$/);
    expect(paragraphs(await callPage(6982))).toContain(esc(r1b('1562.99')));
  });

  it('a ZW call in a 21 Nov set carries both notes, under "Notes", the 21 Nov note first', async () => {
    for (const [id, first] of [
      [6110, R1A_MISS],
      [7044, r1b('26.5698')],
    ] as const) {
      expect(CALL_BY_ID.get(id)?.country_code).toBe('ZW');
      const html = await callPage(id);
      expect(html).toContain('<div class="kicker">Notes</div>');
      const ps = paragraphs(html);
      expect(ps.indexOf(esc(first))).toBeGreaterThanOrEqual(0);
      expect(ps.indexOf(esc(R2))).toBe(ps.indexOf(esc(first)) + 1);
      expect(html).toContain('except the dated notes below.');
    }
  });

  it('an open ZW call carries the label note', async () => {
    expect(paragraphs(await callPage(7109))).toContain(esc(R2));
  });

  it('the grid, the criterion and the description are what they were; an unnoted call is unchanged', async () => {
    for (const id of [6047, 6048, 7002, 6110, 7109, 6049, 6115, 1346]) {
      h.keys = [...ALL_IDS];
      const on = await callPage(id);
      h.keys = [];
      const off = await callPage(id);
      expect(grid(on), String(id)).toBe(grid(off));
      expect(on.slice(on.indexOf('The criterion')), String(id)).toBe(off.slice(off.indexOf('The criterion')));
      expect(on.match(/<head>[\s\S]*<\/head>/)?.[0]).toBe(off.match(/<head>[\s\S]*<\/head>/)?.[0]);
      if (id === 6049 || id === 6115 || id === 1346) expect(on, String(id)).toBe(off);
    }
  });

  it('a corrected call that also had a note would name both exceptions (synthetic: note planted on 1346)', async () => {
    h.planted = {
      CALL_NOTES: [{ id: 'p', status: 'approved', issuedOn: '2026-11-23', scope: { ids: [1346] }, text: 'Plain.' }],
      LEDGER_SECTIONS: [],
      METHODOLOGY_NOTES: [],
    };
    h.keys = ['p'];
    const html = await callPage(1346);
    expect(html).toContain('except the dated correction and note below.');
    expect(html.indexOf('Correction · issued')).toBeLessThan(html.indexOf('Note added 23 Nov 2026. Plain.'));
    expect(html).toContain('Published MISS; the evidence says HIT');
  });
});

describe('the share card: one line, the verdict unchanged', () => {
  it('a noted call: NOTE ADDED 23 NOV 2026 · SEE THE CALL PAGE, once, under the badge it had', async () => {
    for (const id of [6047, 6048, 7002, 6110, 7109]) {
      h.keys = [...ALL_IDS];
      const on = await card(id);
      h.keys = [];
      const off = await card(id);
      expect(on.split('NOTE ADDED 23 NOV 2026 · SEE THE CALL PAGE')).toHaveLength(2);
      // Everything else on the card is exactly as it was.
      expect(on.replace(/\n\s*<span[^>]*>NOTE ADDED[^<]*<\/span>/, '')).toBe(off);
    }
  });

  it('an unnoted call: no line', async () => {
    for (const id of [6049, 6115, 1346]) expect(await card(id)).not.toContain('NOTE ADDED');
  });
});

describe('/api/calls/ledger: a notes field on the noted calls, and nothing else moves', () => {
  it('notes on exactly the 27 + 38 + 65 + 92 noted calls (2 overlap), word for word', async () => {
    const j = await ledgerJson();
    const rows = [...(j.open as Array<Record<string, unknown>>), ...(j.resolved as Array<Record<string, unknown>>)];
    const noted = rows.filter((r) => 'notes' in r);
    expect(noted).toHaveLength(27 + 38 + 65 + 92 - 2);
    const notesOf = (id: number) =>
      (rows.find((r) => Number(r.id) === id)?.notes as Array<{ issued_on: string; note: string }>) ?? [];
    expect(notesOf(6047)).toEqual([{ issued_on: '2026-11-23', note: R1A_MISS }]);
    expect(notesOf(6048)).toEqual([{ issued_on: '2026-11-23', note: R1A_HIT }]);
    expect(notesOf(7002)).toEqual([{ issued_on: '2026-11-23', note: r1b('1.81120e+6') }]);
    expect(notesOf(6110).map((n) => n.note)).toEqual([R1A_MISS, R2]);
    expect(notesOf(6049)).toEqual([]);
  });

  it('every count, score, verdict and correction is identical with and without the notes', async () => {
    h.keys = [...ALL_IDS];
    const on = await ledgerJson();
    h.keys = [];
    const off = await ledgerJson();
    for (const list of ['open', 'resolved'] as const) {
      for (const r of on[list] as Array<Record<string, unknown>>) delete r.notes;
    }
    expect(on).toEqual(off);
    expect(JSON.stringify(on)).toBe(JSON.stringify(off));
    const fx = (off.by_kind as Record<string, Record<string, unknown>>).fx_devaluation;
    expect([fx.resolved, fx.hits]).toEqual([5166, 1560]);
  });
});

describe('/ledger: the section and the threshold line; the count of calls we were wrong about is unchanged', () => {
  it('the 21 Nov section, word for word, before the corrections and after the open calls', async () => {
    const html = await ledgerPage();
    const section =
      `<div class="rule"></div><div class="kicker">${esc(R1C_KICKER)}</div>` +
      `<h2>${esc(R1C_HEADING)}</h2><p class="lede">${esc(R1C)}</p>`;
    expect(html.split(section)).toHaveLength(2);
    expect(html.indexOf(section)).toBeGreaterThan(html.indexOf('What we are currently claiming'));
    expect(html.indexOf(section)).toBeLessThan(html.indexOf('calls we were wrong about'));
  });

  it('the threshold line under the FX row: the wording, computed from the book by the stated rule', async () => {
    const html = await ledgerPage();
    const line =
      '<div class="row unscored"><span class="lead">&nbsp;</span>' +
      `<span class="det">${esc(R3B_LEAD)}<a href="/methodology">/methodology</a>.</span></div>`;
    expect(html.split(line)).toHaveLength(2);
    const fxRow = html.indexOf('<span class="lead">FX</span>');
    expect(fxRow).toBeGreaterThan(0);
    expect(html.indexOf(line)).toBeGreaterThan(fxRow);
    expect(html.slice(fxRow, html.indexOf(line))).not.toContain('<div class="row');
  });

  it('54 calls we were wrong about, with and without the notes, and every other byte the same', async () => {
    h.keys = [...ALL_IDS];
    const on = await ledgerPage();
    h.keys = [];
    const off = await ledgerPage();
    expect(SNAPSHOT.resolved.filter((c) => c.correction)).toHaveLength(54);
    for (const html of [on, off]) {
      expect(html).toContain('<h2>54 calls we were wrong about</h2>');
      expect(html.match(/calls? we were wrong about/g)).toHaveLength(1);
      expect(html.match(/· CORRECTED</g)?.length ?? 0).toBe(off.match(/· CORRECTED</g)?.length ?? 0);
      expect(html).toContain('1560/5166 landed, Brier 0.220, 68 units, 78 batches');
      expect(html).toContain('<span class="trail">skill -3%</span>');
    }
    const withoutNotes = on
      .replace(/<div class="rule"><\/div><div class="kicker">Exchange rates, 21 November 2026<\/div>.*?<\/p>\n/, '')
      .replace(
        /<div class="row unscored"><span class="lead">&nbsp;<\/span><span class="det">Includes .*?<\/div>\n/,
        '',
      );
    expect(withoutNotes).not.toBe(on);
    expect(withoutNotes).toBe(off);
  });

  it('no line if the currency codes cannot be read; the page is otherwise the same', async () => {
    const withLine = await ledgerPage();
    fixtureFaults.codes = true;
    try {
      const html = await ledgerPage();
      expect(html).not.toContain('that hit at most once');
      expect(html).toContain('<h2>54 calls we were wrong about</h2>');
      expect(html).toBe(
        withLine.replace(
          /<div class="row unscored"><span class="lead">&nbsp;<\/span><span class="det">Includes .*?<\/div>\n/,
          '',
        ),
      );
    } finally {
      fixtureFaults.codes = false;
    }
  });
});

describe('/methodology: the dated section, served approved and rendered as text', () => {
  it('/api/method-notes returns the section, opening "Added 23 Nov 2026."', async () => {
    expect(await methodNotes()).toEqual({
      notes: [{ heading: R3A_HEADING, added_on: '2026-11-23', paragraphs: [R3A] }],
    });
  });

  it('none approved: an empty list', async () => {
    h.keys = [];
    expect(await methodNotes()).toEqual({ notes: [] });
  });
});

describe('every surface escapes a note', () => {
  const HOSTILE = `<script>alert("x")</script> & 'q' <img src=x onerror=alert(1)>`;
  beforeEach(() => {
    h.planted = {
      CALL_NOTES: [{ id: 'p', status: 'approved', issuedOn: '2026-11-23', scope: { ids: [6047] }, text: HOSTILE }],
      LEDGER_SECTIONS: [
        {
          id: 's',
          status: 'approved',
          issuedOn: '2026-11-23',
          kicker: HOSTILE,
          heading: HOSTILE,
          paragraphs: [HOSTILE],
        },
      ],
      METHODOLOGY_NOTES: [
        { id: 'm', status: 'approved', issuedOn: '2026-11-23', heading: HOSTILE, paragraphs: [HOSTILE] },
      ],
    };
    h.keys = ['p', 's', 'm'];
  });

  it('/call/:id and /ledger print it escaped, never as markup', async () => {
    for (const html of [await callPage(6047), await ledgerPage()]) {
      expect(html).toContain(esc(HOSTILE));
      expect(html).not.toContain('<script>alert');
      expect(html).not.toContain('<img src=x');
    }
  });

  it('the JSON carries it as data, the same string a reader sees', async () => {
    const j = await ledgerJson();
    const row = (j.resolved as Array<Record<string, unknown>>).find((r) => Number(r.id) === 6047);
    expect(row?.notes).toEqual([{ issued_on: '2026-11-23', note: `Note added 23 Nov 2026. ${HOSTILE}` }]);
  });

  it('the share card escapes its line', async () => {
    const { renderCallCard } = await import('./og.js');
    const html = renderCallCard({
      id: 1,
      countryCode: 'XX',
      claim: 'c',
      probability: 0.2,
      resolvesOn: '2026-11-21',
      madeOn: '2026-11-07',
      status: 'miss',
      noteLine: HOSTILE,
    });
    expect(html).toContain(esc(HOSTILE));
    expect(html).not.toContain('<script>');
  });
});

describe('a ZW call made after 22 Nov carries the ZWL note by rule; no other call does, and no count moves', () => {
  const zwl = (id: number, madeOn: string, over: Partial<SnapCall> = {}): SnapCall => ({
    id: String(id),
    kind: 'fx_devaluation',
    country_code: 'ZW',
    claim: 'ZWL depreciates 0.85% or more against USD at any point within 14 days, from 26.5872.',
    probability: 0.2,
    base_rate: 0.26,
    made_on: madeOn,
    resolves_on: '2026-12-08',
    status: 'pending',
    evidence_count: null,
    resolved_at: null,
    ...over,
  });
  /** Synthetic calls made after the snapshot. Only the first two are ZW currency calls naming ZWL. */
  const LATER = [
    zwl(7175, '2026-11-23'),
    zwl(7240, '2026-11-24'),
    zwl(7241, '2026-11-24', {
      kind: 'censorship_event',
      claim: 'OONI records at least 1 confirmed website or app blocking event in ZW within 14 days.',
    }),
    zwl(7242, '2026-11-24', {
      country_code: 'VE',
      claim: 'VES depreciates 7.12% or more against USD at any point within 14 days, from 301.442.',
    }),
    zwl(7243, '2026-11-24', {
      claim: 'ZWG depreciates 0.85% or more against USD at any point within 14 days, from 26.5872.',
    }),
    zwl(7244, '2026-11-24', { country_code: 'XX' }),
  ];
  const r2On = (date: string) => R2.replace('Note added 23 Nov 2026.', `Note added ${date}.`);

  it('/call/:id and the card: dated the later of 23 Nov and the day the call was made', async () => {
    await withExtraOpenCalls(LATER, async () => {
      expect(paragraphs(await callPage(7175))).toContain(esc(r2On('23 Nov 2026')));
      expect(paragraphs(await callPage(7240))).toContain(esc(r2On('24 Nov 2026')));
      expect(await card(7175)).toContain('NOTE ADDED 23 NOV 2026 · SEE THE CALL PAGE');
      expect(await card(7240)).toContain('NOTE ADDED 24 NOV 2026 · SEE THE CALL PAGE');
      for (const id of [7241, 7242, 7243, 7244]) {
        expect(await callPage(id), String(id)).not.toContain('Note added');
        expect(await card(id), String(id)).not.toContain('NOTE ADDED');
      }
    });
  });

  it('the JSON: notes on the two, none on the rest; every count and score identical on and off', async () => {
    await withExtraOpenCalls(LATER, async () => {
      h.keys = [...ALL_IDS];
      const on = await ledgerJson();
      h.keys = [];
      const off = await ledgerJson();
      const later = (j: Record<string, unknown>) =>
        (j.open as Array<Record<string, unknown>>).filter((r) => Number(r.id) >= 7175);
      expect(later(on).map((r) => [Number(r.id), r.notes ?? null])).toEqual([
        [7175, [{ issued_on: '2026-11-23', note: r2On('23 Nov 2026') }]],
        [7240, [{ issued_on: '2026-11-24', note: r2On('24 Nov 2026') }]],
        [7241, null],
        [7242, null],
        [7243, null],
        [7244, null],
      ]);
      for (const list of ['open', 'resolved'] as const) {
        for (const r of on[list] as Array<Record<string, unknown>>) delete r.notes;
      }
      expect(JSON.stringify(on)).toBe(JSON.stringify(off));
      expect((on.counts as Record<string, number>).open).toBe(SNAPSHOT.open.length - 14);
    });
  });

  it('/ledger: the same 54 calls we were wrong about, and the same bytes once the notes are removed', async () => {
    await withExtraOpenCalls(LATER, async () => {
      h.keys = [...ALL_IDS];
      const on = await ledgerPage();
      h.keys = [];
      const off = await ledgerPage();
      expect(on).toContain('<h2>54 calls we were wrong about</h2>');
      const stripped = on
        .replace(/<div class="rule"><\/div><div class="kicker">Exchange rates, 21 November 2026<\/div>.*?<\/p>\n/, '')
        .replace(
          /<div class="row unscored"><span class="lead">&nbsp;<\/span><span class="det">Includes .*?<\/div>\n/,
          '',
        );
      expect(stripped).toBe(off);
    });
  });
});
