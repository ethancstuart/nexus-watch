import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CORRECTION_NOTES, CORRECTIONS_PAGE_INTRO } from './_lib/corrections-data.js';
import { markdownToHtml } from './_lib/markdown.js';

/**
 * WITH TODAY'S DATA, NOTHING APPEARS ANYWHERE. Every correction note in the
 * repository is a draft, and this renders every surface that could show one,
 * for every noted edition, against the real data module (nothing mocked but
 * the database), and finds no trace: no block, no label, no link, no marker,
 * no JSON field, no sentence of any note, no word of the page draft.
 *
 * When the owner approves a note this file still holds for every note that is
 * still a draft; the approved-note behaviour is pinned in
 * corrections-approved.test.ts and the approval itself in
 * _lib/corrections-data.test.ts.
 *
 * Synthetic brief rows only.
 */

const DRAFTS = CORRECTION_NOTES.filter((n) => n.status === 'draft');
const NOTED = DRAFTS.map((n) => n.date);
/** Two dates with no note: a wording-only edition and a mechanical one. */
const UNNOTED = ['2026-09-18', '2026-11-07'];

const briefText = (date: string) =>
  `## ☕ Good Morning\n\nSynthetic edition for ${date}. Iran and Russia, by the numbers.\n\n## The Ledger\n\n- one call settled\n- another opened`;

/** Driver-shaped: a `date` column comes back as a Date at local midnight. */
const asDriverDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

let latestDate = '2026-11-05';
let failDb = false;
function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): unknown[] {
  if (failDb) throw new Error('synthetic outage');
  const q = strings.join(' ').replace(/\s+/g, ' ');
  const date = typeof values[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(values[0]) ? values[0] : latestDate;
  const content = JSON.stringify({ briefText: briefText(date), topRiskCountries: [{ name: 'Synthland' }] });
  if (q.includes('substring(summary from 1 for 8000)')) {
    // /api/briefs archive list: every noted edition plus the unnoted ones.
    return [...NOTED, ...UNNOTED].map((d) => ({
      brief_date: asDriverDate(d),
      head: `<p>Synthetic preview ${d}</p>`,
      subject_json: null,
      generated_at: null,
    }));
  }
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
    end: () => res,
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

/** Text no surface may carry while every note is a draft. */
const FORBIDDEN: string[] = [
  'Correction added',
  'This edition contained',
  'All corrections',
  '/corrections',
  'class="correction"',
  'dossier-correction',
  'correctedOn',
  '"correction"',
  CORRECTIONS_PAGE_INTRO.title,
  ...CORRECTIONS_PAGE_INTRO.paragraphs.map((p) => p.slice(0, 60)),
  // A distinctive stretch from the middle of every note, past its date.
  ...DRAFTS.map((n) => n.text.slice(20, 80)),
];

function expectNoTrace(surface: string, out: unknown) {
  const text = typeof out === 'string' ? out : JSON.stringify(out);
  for (const f of FORBIDDEN) expect(text.includes(f), `${surface} carries "${f}"`).toBe(false);
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  latestDate = '2026-11-05';
  failDb = false;
  vi.restoreAllMocks();
});

describe('with every note a draft, no surface shows a correction', () => {
  it('the data really is all draft today', () => {
    expect(DRAFTS).toHaveLength(CORRECTION_NOTES.length);
    expect(CORRECTIONS_PAGE_INTRO.status).toBe('draft');
  });

  it('/brief/:date, for every noted edition and two unnoted ones', async () => {
    for (const date of [...NOTED, ...UNNOTED]) {
      const { status, body } = await call('./brief/og.js', { date });
      expect(status).toBe(200);
      expectNoTrace(`/brief/${date}`, body);
      // The brief is rendered exactly as its markdown renders, and nothing sits in front of it.
      expect(body as string).toContain(`<h1>NexusWatch · Synthland · ${date}</h1>\n    <div class="brief">`);
      expect(body as string).toContain(`<div class="brief">${markdownToHtml(briefText(date))}</div>`);
    }
  });

  it('/brief/:date without a database and when the database fails', async () => {
    delete process.env.DATABASE_URL;
    const noDb = await call('./brief/og.js', { date: NOTED[0] });
    expectNoTrace('/brief (no db)', noDb.body);
    process.env.DATABASE_URL = 'postgres://stub';
    failDb = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const down = await call('./brief/og.js', { date: NOTED[0] });
    expect(down.status).toBe(200);
    expectNoTrace('/brief (db down)', down.body);
  });

  it('/corrections does not exist: 404, uncached, no page', async () => {
    const { status, body, headers } = await call('./corrections.js');
    expect(status).toBe(404);
    expect(headers['Cache-Control']).toBe('no-store');
    expect(body).toBe('not_found');
  });

  it('/api/briefs: no archive entry carries a marker', async () => {
    const list = await call('./briefs.js');
    expect(list.status).toBe(200);
    const briefs = (list.body as { briefs: Array<Record<string, unknown>> }).briefs;
    expect(briefs).toHaveLength(NOTED.length + UNNOTED.length);
    for (const b of briefs) expect(Object.keys(b).sort()).toEqual(['date', 'generatedAt', 'preview', 'subject']);
    expectNoTrace('/api/briefs', list.body);

    for (const date of NOTED) {
      const one = await call('./briefs.js', { date });
      expect(Object.keys(one.body as object).sort()).toEqual(['date', 'generatedAt', 'summary']);
      expectNoTrace(`/api/briefs?date=${date}`, one.body);
    }
  });

  it('/api/v1/brief: the response is the stored row and nothing more, by date and latest', async () => {
    for (const date of NOTED) {
      const { status, body } = await call('./v1/brief.js', { date });
      expect(status).toBe(200);
      expect(Object.keys(body as object).sort()).toEqual(['brief_date', 'content', 'generated_at', 'summary']);
      expectNoTrace(`/api/v1/brief?date=${date}`, body);
    }
    latestDate = NOTED[NOTED.length - 1];
    const latest = await call('./v1/brief.js');
    expect(Object.keys(latest.body as object).sort()).toEqual(['brief_date', 'content', 'generated_at', 'summary']);
    expectNoTrace('/api/v1/brief (latest)', latest.body);
  });
});
