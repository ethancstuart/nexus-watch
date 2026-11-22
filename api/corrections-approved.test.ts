import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CorrectionNote, CorrectionsPageIntro } from './_lib/correction-words.js';
import { markdownToHtml } from './_lib/markdown.js';

/**
 * What a reader sees once the owner approves a note, on every surface, with
 * the data module and the approval keys replaced by synthetic ones (the
 * repository's own notes are all draft and its key lists empty; see
 * corrections-drafts.test.ts). Synthetic brief rows only.
 */

const data = vi.hoisted(() => ({
  notes: [] as CorrectionNote[],
  intro: { status: 'draft', title: 'Synthetic intro title', paragraphs: ['Synthetic intro paragraph.'] } as
    | CorrectionsPageIntro
    | undefined,
  /** The second key: corrections-approvals.ts. */
  keyDates: [] as string[],
  keyIntro: false,
}));
vi.mock('./_lib/corrections-data.js', () => ({
  get CORRECTION_NOTES() {
    return data.notes;
  },
  get CORRECTIONS_PAGE_INTRO() {
    return data.intro;
  },
}));
vi.mock('./_lib/corrections-approvals.js', () => ({
  get APPROVED_NOTE_DATES() {
    return data.keyDates;
  },
  get INTRODUCTION_APPROVED() {
    return data.keyIntro;
  },
}));

const A = '2026-09-08'; // approved
const B = '2026-10-21'; // approved, corrected later
const C = '2026-10-01'; // approved, corrected the same day as A
const D = '2026-09-09'; // draft
const textFor = (date: string, mark: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1];
  return `On ${d} ${mon} ${y} we wrote “synthetic ${mark}”. Original text unchanged. Source: OONI daily totals.`;
};
const APPROVED: CorrectionNote[] = [
  { date: A, status: 'approved', correctedOn: '2026-12-01', classification: 'false', text: textFor(A, 'alpha') },
  {
    date: B,
    status: 'approved',
    correctedOn: '2026-12-03',
    classification: 'misleading',
    text: textFor(B, 'bravo'),
  },
  {
    date: C,
    status: 'approved',
    correctedOn: '2026-12-01',
    classification: 'false-and-misleading',
    text: textFor(C, 'charlie'),
  },
  { date: D, status: 'draft', classification: 'false', text: textFor(D, 'delta-draft') },
];

const briefText = (date: string) =>
  `## ☕ Good Morning\n\nSynthetic edition for ${date} & <friends>.\n\n## The Ledger\n\n- one call settled`;
const asDriverDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

let failDb = false;
let latestDate = B;
function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): unknown[] {
  if (failDb) throw new Error('synthetic outage');
  const q = strings.join(' ').replace(/\s+/g, ' ');
  const date = typeof values[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(values[0]) ? values[0] : latestDate;
  if (q.includes('substring(summary from 1 for 8000)')) {
    return [B, C, D, A].map((d) => ({
      brief_date: asDriverDate(d),
      head: `<p>${d}</p>`,
      subject_json: null,
      generated_at: null,
    }));
  }
  const content = JSON.stringify({ briefText: briefText(date), topRiskCountries: [{ name: 'Synthland' }] });
  return [{ brief_date: asDriverDate(date), summary: `<p>${date}</p>`, content, generated_at: null }];
}
vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));

function fakeRes() {
  const state = { status: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => {
      state.headers[k] = v;
      return res;
    },
    status: (n: number) => {
      state.status = n;
      return res;
    },
    send: (b: unknown) => {
      state.body = b;
      return res;
    },
    json: (b: unknown) => {
      state.body = b;
      return res;
    },
    state,
  };
  return res;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Handler = (req: any, res: any) => unknown;
async function call(mod: string, query: Record<string, string> = {}) {
  const { default: handler } = (await import(mod)) as { default: Handler };
  const res = fakeRes();
  await handler({ method: 'GET', query }, res);
  return res.state;
}
const page = async (date: string) => (await call('./brief/og.js', { date })).body as string;
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
const briefBody = (html: string) => /<div class="brief">[\s\S]*?<\/div>\n/.exec(html)?.[0] ?? '';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  data.notes = APPROVED;
  data.intro = { status: 'draft', title: 'Synthetic intro title', paragraphs: ['Synthetic intro paragraph.'] };
  data.keyDates = [A, B, C];
  data.keyIntro = false;
  failDb = false;
  latestDate = B;
  vi.restoreAllMocks();
});

describe('/brief/:date with an approved note', () => {
  it('renders one dated, labelled block above the brief, linking to the corrections page', async () => {
    const html = await page(A);
    expect(count(html, '<aside class="correction"')).toBe(1);
    expect(count(html, 'Correction added 1 Dec 2026. This edition contained false statements.')).toBe(1);
    expect(html).toContain(`<div class="kicker">Correction</div>`);
    expect(html).toContain('<a href="/corrections">All corrections</a>');
    expect(html.indexOf('<aside class="correction"')).toBeLessThan(html.indexOf('<div class="brief">'));
    expect(html.indexOf('<h1>')).toBeLessThan(html.indexOf('<aside class="correction"'));
    // Its CSS rides with it, once, and there is no style attribute.
    expect(count(html, '.correction {')).toBe(1);
    expect(html).not.toMatch(/\sstyle=/);
  });

  it('leaves the original brief byte for byte unchanged', async () => {
    const withNote = await page(A);
    data.notes = APPROVED.map((n) => (n.date === A ? { ...n, status: 'draft', correctedOn: undefined } : n));
    const without = await page(A);
    expect(without).not.toContain('class="correction"');
    expect(briefBody(withNote)).not.toBe('');
    expect(briefBody(withNote)).toBe(briefBody(without));
    expect(briefBody(withNote)).toBe(`<div class="brief">${markdownToHtml(briefText(A))}</div>\n`);
    // Removing the block and its CSS gives back the page exactly as it is without a note.
    const stripped = withNote
      .replace(/<aside class="correction"[\s\S]*?<\/aside>\n {4}/, '')
      .replace(/ {4}\.correction \{[^\n]*\n {4}\.correction p[^\n]*\n {4}\.correction \.correction-more[^\n]*\n/, '');
    expect(stripped).toBe(without);
  });

  it('shows nothing for a draft or unnoted edition beside approved ones', async () => {
    for (const date of [D, '2026-09-18']) {
      const html = await page(date);
      expect(html).not.toMatch(/class="correction"|Correction added|\/corrections|\.correction \{/);
      expect(html).not.toContain('delta-draft');
    }
  });

  it('keeps the note when the database is missing or down', async () => {
    delete process.env.DATABASE_URL;
    expect(count(await page(A), '<aside class="correction"')).toBe(1);
    process.env.DATABASE_URL = 'postgres://stub';
    failDb = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(count(await page(A), '<aside class="correction"')).toBe(1);
  });

  it('escapes every string in the note', async () => {
    data.notes = [
      {
        date: A,
        status: 'approved',
        correctedOn: '2026-12-01',
        classification: 'false',
        text: `On 8 Sep 2026 we wrote “</p><script>alert(1)</script>” & <img src=x onerror=y> "q" 'a'.`,
      },
    ];
    const html = await page(A);
    expect(html).not.toMatch(/<script>alert|<img src=x/);
    expect(html).toContain('&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;” &amp; &lt;img src=x onerror=y&gt;');
    expect(html).toContain('&quot;q&quot; &#39;a&#39;');
  });
});

describe('/corrections with approved notes', () => {
  it('lists approved notes only, newest correction first, each linking to its brief', async () => {
    const { status, body, headers } = await call('./corrections.js');
    expect(status).toBe(200);
    expect(headers['Content-Type']).toBe('text/html; charset=utf-8');
    const html = body as string;
    const order = [...html.matchAll(/<a href="\/brief\/(\d{4}-\d{2}-\d{2})">Situation Brief · \1<\/a>/g)].map(
      (m) => m[1],
    );
    expect(order).toEqual([B, C, A]);
    expect(html).toContain('Correction added 3 Dec 2026. This edition contained misleading statements.');
    expect(html).toContain('Correction added 1 Dec 2026. This edition contained false and misleading statements.');
    expect(count(html, 'Correction added')).toBe(3);
    expect(html).not.toContain('delta-draft');
    expect(html).toContain('<link rel="canonical" href="https://nexuswatch.dev/corrections">');
    expect(html).not.toMatch(/\sstyle=/);
  });

  it('without an approved introduction, carries no word of it', async () => {
    const html = (await call('./corrections.js')).body as string;
    expect(html).toContain('<h1>Corrections</h1>');
    expect(html).toContain('<title>Corrections</title>');
    expect(html).not.toMatch(/Synthetic intro|Published /);
  });

  const INTRO: CorrectionsPageIntro = {
    status: 'approved',
    publishedOn: '2026-12-01',
    title: 'Synthetic intro <title>',
    paragraphs: ['First & only paragraph.'],
  };

  it('with an approved introduction and every note approved, shows it dated, with the latest correction as the update', async () => {
    data.notes = APPROVED.filter((n) => n.status === 'approved');
    data.intro = INTRO;
    data.keyIntro = true;
    const html = (await call('./corrections.js')).body as string;
    expect(html).toContain('<div class="kicker">Corrections</div><h1>Synthetic intro &lt;title&gt;</h1>');
    expect(html).toContain('<p class="lede dated">Published 1 Dec 2026. Updated 3 Dec 2026.</p>');
    expect(html).toContain('<p class="lede">First &amp; only paragraph.</p>');
  });

  it('withholds an approved introduction while any note is unpublished, or without its key', async () => {
    const allApproved = APPROVED.filter((n) => n.status === 'approved');
    for (const [notes, keyDates, keyIntro] of [
      [APPROVED, [A, B, C], true], // D is still a draft
      [allApproved, [A, B], true], // C approved by status, missing from the key list
      [allApproved, [A, B, C], false], // every note published, introduction key not set
    ] as const) {
      data.notes = [...notes];
      data.keyDates = [...keyDates];
      data.keyIntro = keyIntro;
      data.intro = INTRO;
      const html = (await call('./corrections.js')).body as string;
      expect(html).toContain('<h1>Corrections</h1>');
      expect(html).not.toMatch(/Synthetic intro|First &amp; only|Published /);
    }
  });

  it('is 404 again after the full withdrawal: status draft, no correctedOn, dates off the key list', async () => {
    data.notes = APPROVED.map((n) => ({ ...n, status: 'draft', correctedOn: undefined }) as CorrectionNote);
    data.keyDates = [];
    const { status, body } = await call('./corrections.js');
    expect(status).toBe(404);
    expect(body).toBe('not_found');
  });

  it('escapes the note text', async () => {
    data.notes = [{ ...APPROVED[0], text: `On 8 Sep 2026 we wrote <b onclick=x>"hi"</b>.` } as CorrectionNote];
    const html = (await call('./corrections.js')).body as string;
    expect(html).not.toContain('<b onclick');
    expect(html).toContain('&lt;b onclick=x&gt;&quot;hi&quot;&lt;/b&gt;');
  });
});

/**
 * THE TWO KEYS, ON EVERY SURFACE. The reviewer's plant: the owner lists 8 Sep
 * as approved but sets the status on 9 Sep. Neither note may appear anywhere,
 * whether or not any test runs before the deploy.
 */
describe('a mismatched approval shows nothing on any surface', () => {
  const MIS = '2026-09-09';
  beforeEach(() => {
    data.notes = [
      { date: A, status: 'draft', classification: 'false', text: textFor(A, 'alpha-draft') },
      { date: MIS, status: 'approved', correctedOn: '2026-12-01', classification: 'false', text: textFor(MIS, 'mis') },
    ];
    data.keyDates = [A];
  });

  it('on /brief/:date, /corrections, /api/v1/brief and /api/briefs', async () => {
    for (const date of [A, MIS]) {
      const html = await page(date);
      expect(html).not.toMatch(/class="correction"|Correction added|\/corrections|alpha-draft|synthetic mis/);
      const v1 = (await call('./v1/brief.js', { date })).body as object;
      expect('correction' in v1).toBe(false);
      const one = (await call('./briefs.js', { date })).body as object;
      expect('correctedOn' in one).toBe(false);
    }
    const list = (await call('./briefs.js')).body as { briefs: object[] };
    for (const b of list.briefs) expect('correctedOn' in b).toBe(false);
    const corrections = await call('./corrections.js');
    expect(corrections.status).toBe(404);
  });

  it('and only the key list, without the status, publishes nothing either', async () => {
    data.notes = [{ date: A, status: 'draft', classification: 'false', text: textFor(A, 'alpha-draft') }];
    data.keyDates = [A];
    expect(await page(A)).not.toMatch(/class="correction"|alpha-draft/);
    expect((await call('./corrections.js')).status).toBe(404);
  });
});

describe('the JSON a reader’s browser and agents receive', () => {
  it('/api/v1/brief carries the correction for an approved edition only', async () => {
    const a = (await call('./v1/brief.js', { date: A })).body as Record<string, unknown>;
    expect(a.correction).toEqual({
      correctedOn: '2026-12-01',
      classification: 'false',
      note: `Correction added 1 Dec 2026. This edition contained false statements. ${textFor(A, 'alpha')}`,
    });
    expect(JSON.parse(a.content as string).briefText).toBe(briefText(A)); // the brief itself untouched
    const d = (await call('./v1/brief.js', { date: D })).body as Record<string, unknown>;
    expect(Object.keys(d).sort()).toEqual(['brief_date', 'content', 'generated_at', 'summary']);
    latestDate = B;
    const latest = (await call('./v1/brief.js')).body as { correction?: { correctedOn: string } };
    expect(latest.correction?.correctedOn).toBe('2026-12-03');
  });

  it('/api/briefs marks approved editions only, in the archive list and by date', async () => {
    const list = (await call('./briefs.js')).body as { briefs: Array<{ correctedOn?: string }> };
    expect(list.briefs.map((b) => b.correctedOn ?? null)).toEqual(['2026-12-03', '2026-12-01', null, '2026-12-01']);
    expect('correctedOn' in list.briefs[2]).toBe(false);
    const one = (await call('./briefs.js', { date: B })).body as { correctedOn?: string };
    expect(one.correctedOn).toBe('2026-12-03');
    const draft = (await call('./briefs.js', { date: D })).body as object;
    expect('correctedOn' in draft).toBe(false);
  });
});
