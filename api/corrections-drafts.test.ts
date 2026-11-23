import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CORRECTION_NOTES, CORRECTIONS_PAGE_INTRO } from './_lib/corrections-data.js';
import { approvedIntro, approvedNotes, pageParagraphText } from './_lib/corrections.js';
import { markdownToHtml } from './_lib/markdown.js';

/**
 * AN UNPUBLISHED NOTE NEVER SHOWS, ON ANY SURFACE. This renders every
 * surface that could show a note, for every edition whose note the gate
 * withholds (a draft, or an approval the second key does not confirm), against
 * the real data and keys (nothing mocked but the database), and finds no
 * trace: no block, no label, no link, no marker, no JSON field, no sentence of
 * any such note, no word of an unpublished page introduction.
 *
 * WITH NOTHING APPROVED THAT IS ALL 67, SO NOTHING APPEARS ANYWHERE and
 * /corrections is a 404. _lib/corrections-data.test.ts pins what is approved.
 * This file derives its scope from the gate, so approving or withdrawing a
 * note needs no edit here: it keeps holding for every note still unpublished,
 * and with every note approved it still probes two unnoted dates. What an
 * approved note looks like is pinned in corrections-approved.test.ts (synthetic
 * notes) and corrections-published.test.ts (the real ones); a note held back
 * from a full publication, in corrections-holdback.test.ts.
 *
 * Synthetic brief rows only.
 */

const PUBLISHED = new Set(approvedNotes().map((n) => n.date));
const DRAFTS = CORRECTION_NOTES.filter((n) => !PUBLISHED.has(n.date));
const NOTED = DRAFTS.map((n) => n.date);
const NONE_APPROVED = PUBLISHED.size === 0;
/** Two dates with no note: a wording-only edition and a mechanical one. */
const UNNOTED = ['2026-09-18', '2026-11-07'];
/**
 * The single date the no-database, database-down and latest-brief checks use:
 * the latest unpublished noted edition while one exists. ONCE EVERY NOTE IS
 * APPROVED (the state the introduction needs) none is left, so they use an
 * edition that has no note at all, explicitly, rather than an undefined date
 * that would test the generic shell or an error response by accident.
 */
const PROBE_DATE = NOTED.length > 0 ? NOTED[NOTED.length - 1] : UNNOTED[0];
/** Every date whose surfaces must show no correction: never empty. */
const NO_NOTE_DATES = [...NOTED, ...UNNOTED];

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

/**
 * A 60-character stretch of an unpublished note, past its date, that no other
 * note contains. Many notes quote the same headline ("Russia and Iran hit
 * record censorship in the same week"), so a fixed slice of a held note can
 * sit in a published one; this stretch cannot.
 */
function distinctiveStretch(n: (typeof CORRECTION_NOTES)[number]): string {
  const others = CORRECTION_NOTES.filter((o) => o.date !== n.date).map((o) => o.text);
  for (let i = 20; i + 60 <= n.text.length; i += 5) {
    const s = n.text.slice(i, i + 60);
    if (!others.some((t) => t.includes(s))) return s;
  }
  throw new Error(`${n.date}: every stretch of this note is in another note`);
}

/** Words of an unpublished note or introduction: no surface may carry them. */
const DRAFT_WORDS: string[] = [
  // A distinctive stretch from every unpublished note, past its date.
  ...DRAFTS.map(distinctiveStretch),
  ...(approvedIntro() === null
    ? [CORRECTIONS_PAGE_INTRO.title, ...CORRECTIONS_PAGE_INTRO.paragraphs.map((p) => pageParagraphText(p).slice(0, 60))]
    : []),
];

/** What a correction looks like on a page or in JSON: absent for a draft or unnoted edition. */
const MARKERS = [
  'Correction added',
  'This edition contained',
  'All corrections',
  '/corrections',
  'class="correction"',
  '.correction {',
  'dossier-correction',
  'correctedOn',
  '"correction"',
];

const asText = (out: unknown) => (typeof out === 'string' ? out : JSON.stringify(out));
function expectNoDraftWords(surface: string, out: unknown) {
  for (const f of DRAFT_WORDS) expect(asText(out).includes(f), `${surface} carries "${f}"`).toBe(false);
}
function expectNoTrace(surface: string, out: unknown) {
  expectNoDraftWords(surface, out);
  for (const f of MARKERS) expect(asText(out).includes(f), `${surface} carries "${f}"`).toBe(false);
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  latestDate = '2026-11-05';
  failDb = false;
  vi.restoreAllMocks();
});

describe('an unpublished note never shows, on any surface', () => {
  it('covers every note the gate does not pass', () => {
    expect(DRAFTS.length + approvedNotes().length).toBe(CORRECTION_NOTES.length);
  });

  it('looks for words that no published note carries, so a hit means a leak', () => {
    const published = approvedNotes().map((n) => n.text);
    for (const w of DRAFT_WORDS)
      expect(
        published.some((t) => t.includes(w)),
        w,
      ).toBe(false);
  });

  it('probes a real date in every state, including every note approved', () => {
    if (NOTED.length === 0) expect(PROBE_DATE).toBe(UNNOTED[0]);
    else expect(PROBE_DATE).toBe(NOTED[NOTED.length - 1]);
    expect(PROBE_DATE).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('/brief/:date, for every unpublished edition and two unnoted ones', async () => {
    for (const date of NO_NOTE_DATES) {
      const { status, body } = await call('./brief/og.js', { date });
      expect(status).toBe(200);
      expectNoTrace(`/brief/${date}`, body);
      // The brief is rendered exactly as its markdown renders, and nothing sits in front of it.
      expect(body as string).toContain(`<h1>NexusWatch Situation Brief · ${date}</h1>\n    <div class="brief">`);
      expect(body as string).toContain(`<div class="brief">${markdownToHtml(briefText(date))}</div>`);
    }
  });

  it('/brief/:date without a database and when the database fails', async () => {
    delete process.env.DATABASE_URL;
    const noDb = await call('./brief/og.js', { date: PROBE_DATE });
    expect(noDb.body as string).toContain(`SITUATION BRIEF · ${PROBE_DATE}`);
    expectNoTrace('/brief (no db)', noDb.body);
    process.env.DATABASE_URL = 'postgres://stub';
    failDb = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const down = await call('./brief/og.js', { date: PROBE_DATE });
    expect(down.status).toBe(200);
    expect(down.body as string).toContain(`SITUATION BRIEF · ${PROBE_DATE}`);
    expectNoTrace('/brief (db down)', down.body);
  });

  it('/corrections: a 404 while nothing is approved, and never a draft word', async () => {
    const { status, body, headers } = await call('./corrections.js');
    if (NONE_APPROVED) {
      expect(status).toBe(404);
      expect(headers['Cache-Control']).toBe('no-store');
      expect(body).toBe('not_found');
    } else {
      expect(status).toBe(200);
      expectNoDraftWords('/corrections', body);
    }
  });

  it('/api/briefs: no draft or unnoted entry carries a marker', async () => {
    const list = await call('./briefs.js');
    expect(list.status).toBe(200);
    const briefs = (list.body as { briefs: Array<Record<string, unknown>> }).briefs;
    expect(briefs).toHaveLength(NOTED.length + UNNOTED.length);
    for (const b of briefs) {
      expect(Object.keys(b).sort()).toEqual(['date', 'generatedAt', 'preview', 'subject']);
      expectNoTrace('/api/briefs entry', b);
    }

    for (const date of NO_NOTE_DATES) {
      const one = await call('./briefs.js', { date });
      expect(Object.keys(one.body as object).sort()).toEqual(['date', 'generatedAt', 'summary']);
      expectNoTrace(`/api/briefs?date=${date}`, one.body);
    }
  });

  it('/api/v1/brief: the response is the stored row and nothing more, by date and latest', async () => {
    for (const date of NO_NOTE_DATES) {
      const { status, body } = await call('./v1/brief.js', { date });
      expect(status).toBe(200);
      expect(Object.keys(body as object).sort()).toEqual(['brief_date', 'content', 'generated_at', 'summary']);
      expectNoTrace(`/api/v1/brief?date=${date}`, body);
    }
    latestDate = PROBE_DATE;
    const latest = await call('./v1/brief.js');
    expect(latest.status).toBe(200);
    expect(Object.keys(latest.body as object).sort()).toEqual(['brief_date', 'content', 'generated_at', 'summary']);
    expectNoTrace('/api/v1/brief (latest)', latest.body);
  });
});
