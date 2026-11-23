import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { CORRECTION_NOTES, CORRECTIONS_PAGE_INTRO } from './_lib/corrections-data.js';
import { approvedIntro, approvedNotes, briefDateKey } from './_lib/corrections.js';
import { formatCorrectionDate, fullNote } from './_lib/correction-words.js';
import { esc } from './_lib/ssr-shell.js';

/**
 * THE PUBLISHED TEXT, AS READERS GET IT. Against the real data and the real
 * approval keys (only the database is faked), whatever is approved today:
 *
 *   - the stored page text and note texts are the signed-off final reader
 *     text, pinned by digest, so any edit to them is deliberate;
 *   - every approved note renders once on its own brief page and in its JSON;
 *   - /corrections carries exactly the page text (when its introduction is
 *     approved) and then every approved note once, newest first, and nothing
 *     else as reader text.
 *
 * What a withheld note does (nothing, anywhere) is in corrections-drafts.test.ts
 * and, for a note held back from a full publication, corrections-holdback.test.ts.
 * Synthetic brief rows only.
 */

/**
 * sha256 of the title and every paragraph of the page, joined by a blank line,
 * and of every note as `date|classification|text`, joined the same way, in
 * date order. The same digests are recorded with the final reader text the
 * owner's decision of 23 Nov 2026 covers; change the text there and here
 * together.
 */
const PAGE_DIGEST = '9e4832f0d0de05c933e4f9dfd26c2bb5b384c483e596f80202a92ef7e6020b84';
const NOTES_DIGEST = 'd801389b4ebbef978db04a1571dcc09e57a0ab8435d42501bc34534be950f413';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

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
    return CORRECTION_NOTES.map((n) => ({
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
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
/** The reader paragraphs of a page, in order: every `<p class="lede">`, the dated line excluded. */
const ledes = (html: string) => [...html.matchAll(/<p class="lede">([\s\S]*?)<\/p>/g)].map((m) => m[1]);

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
});

describe('the stored text is the signed-off final reader text', () => {
  it('the page text matches, by digest', () => {
    expect(sha256([CORRECTIONS_PAGE_INTRO.title, ...CORRECTIONS_PAGE_INTRO.paragraphs].join('\n\n'))).toBe(PAGE_DIGEST);
  });

  it('the 67 note texts and their classifications match, by digest', () => {
    expect(CORRECTION_NOTES).toHaveLength(67);
    expect(sha256(CORRECTION_NOTES.map((n) => `${n.date}|${n.classification}|${n.text}`).join('\n\n'))).toBe(
      NOTES_DIGEST,
    );
  });

  it('the page text is plain reader text: no drafting marks, owner notes or sources', () => {
    for (const p of [CORRECTIONS_PAGE_INTRO.title, ...CORRECTIONS_PAGE_INTRO.paragraphs]) {
      expect(p).toBe(p.trim());
      expect(p).not.toMatch(
        /\[|\]|\*|`|OWNER|[Nn]ot for publication|[Bb]efore publication|publication date|Sources,|CSV|lanes\d|\.md\b/,
      );
    }
  });
});

describe('every approved note renders, once, where it belongs', () => {
  const approved = approvedNotes();

  it('on its own brief page, above the brief, and on no other brief page', async () => {
    for (const n of approved) {
      const { status, body } = await call('./brief/og.js', { date: n.date });
      const html = body as string;
      expect(status).toBe(200);
      expect(count(html, '<aside class="correction"'), n.date).toBe(1);
      expect(count(html, `<p>${esc(fullNote(n))}</p>`), n.date).toBe(1);
      expect(count(html, 'Correction added'), n.date).toBe(1);
      expect(html.indexOf('<aside class="correction"')).toBeLessThan(html.indexOf('<div class="brief">'));
    }
  });

  it('in the brief JSON and the archive marker', async () => {
    for (const n of approved) {
      const v1 = (await call('./v1/brief.js', { date: n.date })).body as { correction?: unknown };
      expect(v1.correction, n.date).toEqual({
        correctedOn: n.correctedOn,
        classification: n.classification,
        note: fullNote(n),
      });
      const one = (await call('./briefs.js', { date: n.date })).body as { correctedOn?: string };
      expect(one.correctedOn, n.date).toBe(n.correctedOn);
    }
    const list = (await call('./briefs.js')).body as { briefs: Array<{ date: unknown; correctedOn?: string }> };
    expect(list.briefs).toHaveLength(CORRECTION_NOTES.length);
    const byDate = new Map(approved.map((n) => [n.date, n.correctedOn]));
    for (const b of list.briefs) {
      const d = briefDateKey(b.date);
      expect(b.correctedOn ?? null, d).toBe(byDate.get(d) ?? null);
    }
  });

  it('on /corrections: the page text, then every approved note once, newest first, and no other reader text', async () => {
    const { status, body } = await call('./corrections.js');
    if (approved.length === 0) {
      expect(status).toBe(404);
      return;
    }
    expect(status).toBe(200);
    const html = body as string;
    const intro = approvedIntro();
    // Newest correction first; among notes added the same day, the latest edition first. Sorted here, not by the
    // page's own function, so a wrong order on the page fails.
    const notes = [...approved].sort((a, b) =>
      a.correctedOn === b.correctedOn ? (a.date < b.date ? 1 : -1) : a.correctedOn < b.correctedOn ? 1 : -1,
    );
    const expected = [...(intro ? intro.paragraphs : []), ...notes.map((n) => fullNote(n))].map(esc);
    expect(ledes(html)).toEqual(expected);
    // Each note sits under the link to its own brief.
    const linked = [...html.matchAll(/<a href="\/brief\/(\d{4}-\d{2}-\d{2})">Situation Brief · \1<\/a>/g)];
    expect(linked.map((m) => m[1])).toEqual(notes.map((n) => n.date));
    if (intro) {
      expect(count(html, `<h1>${esc(intro.title)}</h1>`)).toBe(1);
      expect(html).toContain(`<title>${esc(intro.title)}</title>`);
      const latest = notes.reduce((max, n) => (n.correctedOn > max ? n.correctedOn : max), intro.publishedOn);
      const dated =
        `Published ${formatCorrectionDate(intro.publishedOn)}.` +
        (latest > intro.publishedOn ? ` Updated ${formatCorrectionDate(latest)}.` : '');
      expect(html).toContain(`<p class="lede dated">${dated}</p>`);
      // The page text comes before the first note.
      expect(html.indexOf(esc(intro.paragraphs[intro.paragraphs.length - 1]))).toBeLessThan(
        html.indexOf('<section class="corr"'),
      );
    } else {
      expect(html).toContain('<h1>Corrections</h1>');
      expect(html).not.toContain('lede dated');
    }
  });
});
