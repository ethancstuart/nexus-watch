import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CorrectionNote, CorrectionsPageIntro } from './_lib/correction-words.js';
import { amendmentLine, fullNote } from './_lib/correction-words.js';
import { esc } from './_lib/ssr-shell.js';
import { briefDateKey, pageParagraphText } from './_lib/corrections.js';

/**
 * HOLDING ONE NOTE BACK FROM A FULL PUBLICATION. The real 67 notes and the real
 * page text, with the approval state replaced: everything approved for
 * 2026-11-23, except the held notes, which are un-approved by the documented
 * edit (status back to 'draft', no correctedOn, the date off the key list).
 *
 * A held note must show nowhere, every other note must still show, and the
 * page text must come down: it counts and lists all 67, so it would claim the
 * held note. Both forms of the edit are tried: the notes only (the gate alone
 * withholds the page text), and the notes plus the page's own approval (the
 * form the integrity test requires). Synthetic brief rows only.
 */

const GO_LIVE = '2026-11-23';
/** The two notes whose pre-publication checks (22 Nov ranks, 6 Sep share record) closed last, and the first. */
const HELD_CASES = [['2026-11-22'], ['2026-09-06'], ['2026-08-23'], ['2026-09-06', '2026-11-22']];

const state = vi.hoisted(() => ({
  notes: null as CorrectionNote[] | null,
  intro: null as CorrectionsPageIntro | null,
  keyDates: [] as string[],
  keyIntro: false,
}));
vi.mock('./_lib/corrections-data.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('./_lib/corrections-data.js')>();
  return {
    get CORRECTION_NOTES() {
      return state.notes ?? real.CORRECTION_NOTES;
    },
    get CORRECTIONS_PAGE_INTRO() {
      return state.intro ?? real.CORRECTIONS_PAGE_INTRO;
    },
  };
});
vi.mock('./_lib/corrections-approvals.js', () => ({
  get APPROVED_NOTE_DATES() {
    return state.keyDates;
  },
  get INTRODUCTION_APPROVED() {
    return state.keyIntro;
  },
}));

const real = await vi.importActual<typeof import('./_lib/corrections-data.js')>('./_lib/corrections-data.js');
const REAL_NOTES = real.CORRECTION_NOTES;
const REAL_INTRO = real.CORRECTIONS_PAGE_INTRO;

/** The approval state of a full publication, minus `held`, by the documented edit. */
function publishAllBut(held: readonly string[], alsoUnapproveIntro: boolean) {
  state.notes = REAL_NOTES.map(
    (n): CorrectionNote =>
      held.includes(n.date)
        ? { date: n.date, status: 'draft', classification: n.classification, text: n.text }
        : { date: n.date, status: 'approved', correctedOn: GO_LIVE, classification: n.classification, text: n.text },
  );
  const pageDown = alsoUnapproveIntro && held.length > 0;
  state.intro = pageDown
    ? { status: 'draft', title: REAL_INTRO.title, paragraphs: REAL_INTRO.paragraphs, amendments: REAL_INTRO.amendments }
    : {
        status: 'approved',
        publishedOn: GO_LIVE,
        title: REAL_INTRO.title,
        paragraphs: REAL_INTRO.paragraphs,
        amendments: REAL_INTRO.amendments,
      };
  state.keyDates = REAL_NOTES.map((n) => n.date).filter((d) => !held.includes(d));
  state.keyIntro = !pageDown;
}

const fullFor = (n: CorrectionNote) =>
  fullNote({ ...n, status: 'approved', correctedOn: GO_LIVE } as Extract<CorrectionNote, { status: 'approved' }>);

const briefText = (date: string) =>
  `## ☕ Good Morning\n\nSynthetic edition for ${date}.\n\n## The Ledger\n\n- one call settled`;
const asDriverDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};
function fakeSql(strings: TemplateStringsArray, ...values: unknown[]): unknown[] {
  const q = strings.join(' ').replace(/\s+/g, ' ');
  const date = typeof values[0] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(values[0]) ? values[0] : '2026-11-22';
  if (q.includes('substring(summary from 1 for 8000)')) {
    return REAL_NOTES.map((n) => ({
      brief_date: asDriverDate(n.date),
      head: `<p>${n.date}</p>`,
      subject_json: null,
      generated_at: null,
    }));
  }
  const content = JSON.stringify({ briefText: briefText(date), topRiskCountries: [{ name: 'Synthland' }] });
  return [{ brief_date: asDriverDate(date), summary: `<p>${date}</p>`, content, generated_at: null }];
}
vi.mock('@neondatabase/serverless', () => ({ neon: () => fakeSql }));

function fakeRes() {
  const s = { status: 200, body: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => {
      s.headers[k] = v;
      return res;
    },
    status: (n: number) => {
      s.status = n;
      return res;
    },
    send: (b: unknown) => {
      s.body = b;
      return res;
    },
    json: (b: unknown) => {
      s.body = b;
      return res;
    },
    end: () => res,
    state: s,
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
/** Every `<p class="lede">` and list item, in order, the bold of a lead-in removed (as in corrections-published). */
const ledes = (html: string) =>
  [...html.matchAll(/<p class="lede">([\s\S]*?)<\/p>|<li>([\s\S]*?)(?=<ul>|<\/li>)/g)].map((m) =>
    (m[1] ?? m[2]).replace(/<\/?strong>/g, ''),
  );
/** The page text as a reader reads it: each paragraph with its list and lead-in markers removed. */
const INTRO_WORDS = () => REAL_INTRO.paragraphs.map(pageParagraphText);
/** Newest first, as the page orders notes added the same day: the latest edition first. */
const newestFirst = (notes: readonly CorrectionNote[]) => [...notes].sort((a, b) => b.date.localeCompare(a.date));

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  state.notes = null;
  state.intro = null;
  state.keyDates = [];
  state.keyIntro = false;
});

describe('the harness: a full publication shows the page text and all 67 notes', () => {
  it('so a held note is absent because it was held, not because nothing renders', async () => {
    publishAllBut([], true);
    const { status, body } = await call('./corrections.js');
    expect(status).toBe(200);
    const html = body as string;
    expect(html).toContain(`<h1>${esc(REAL_INTRO.title)}</h1>`);
    expect(html).toContain('<p class="lede dated">Published 23 Nov 2026.</p>');
    expect(ledes(html)).toEqual([...INTRO_WORDS(), ...newestFirst(REAL_NOTES).map(fullFor)].map(esc));
    expect(REAL_INTRO.amendments?.length).toBeGreaterThan(0);
    for (const a of REAL_INTRO.amendments ?? [])
      expect(html).toContain(`<p class="lede dated">${esc(amendmentLine(a))}</p>`);
  });
});

describe.each(HELD_CASES.map((h) => [h.join(' and '), h] as const))('holding %s back', (_name, held) => {
  for (const alsoUnapproveIntro of [false, true]) {
    const form = alsoUnapproveIntro ? 'notes and page approval undone' : 'notes only undone';

    it(`shows the held note nowhere (${form})`, async () => {
      publishAllBut(held, alsoUnapproveIntro);
      for (const date of held) {
        const n = REAL_NOTES.find((x) => x.date === date) as CorrectionNote;
        const page = (await call('./brief/og.js', { date })).body as string;
        expect(page).not.toMatch(/class="correction"|Correction added|All corrections|\.correction \{/);
        expect(page).not.toContain(esc(n.text.slice(20, 80)));
        const v1 = (await call('./v1/brief.js', { date })).body as object;
        expect('correction' in v1).toBe(false);
        const one = (await call('./briefs.js', { date })).body as object;
        expect('correctedOn' in one).toBe(false);
      }
      const list = (await call('./briefs.js')).body as { briefs: Array<{ date: unknown; correctedOn?: string }> };
      expect(list.briefs).toHaveLength(67);
      for (const b of list.briefs) {
        const d = briefDateKey(b.date);
        expect(b.correctedOn ?? null, d).toBe(held.includes(d) ? null : GO_LIVE);
      }
    });

    it(`keeps every other note on its brief page (${form})`, async () => {
      publishAllBut(held, alsoUnapproveIntro);
      for (const n of REAL_NOTES.filter((x) => !held.includes(x.date))) {
        const page = (await call('./brief/og.js', { date: n.date })).body as string;
        expect(page.split(`<p>${esc(fullFor(n))}</p>`).length - 1, n.date).toBe(1);
      }
    });

    it(`/corrections: the other notes only, and none of the page text that counts and lists all 67 (${form})`, async () => {
      publishAllBut(held, alsoUnapproveIntro);
      const { status, body } = await call('./corrections.js');
      expect(status).toBe(200);
      const html = body as string;
      const shown = newestFirst(REAL_NOTES.filter((n) => !held.includes(n.date)));
      expect(shown).toHaveLength(67 - held.length);
      expect(ledes(html)).toEqual(shown.map(fullFor).map(esc));
      expect(html).toContain('<h1>Corrections</h1>');
      expect(html).toContain('<title>Corrections</title>');
      expect(html).not.toContain(esc(REAL_INTRO.title));
      expect(html).not.toContain('lede dated');
      for (const p of INTRO_WORDS()) expect(html).not.toContain(esc(p));
      for (const a of REAL_INTRO.amendments ?? []) expect(html).not.toContain(esc(a.text));
      expect(html).not.toContain('Amended ');
      expect(html).not.toMatch(/<(?:ul|li|strong)[\s>]/);
      for (const date of held) expect(html).not.toContain(`/brief/${date}`);
    });
  }
});
