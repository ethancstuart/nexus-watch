import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { CORRECTION_NOTES, CORRECTIONS_PAGE_INTRO } from './_lib/corrections-data.js';
import { approvedIntro, approvedNotes, briefDateKey, pageParagraphText } from './_lib/corrections.js';
import { amendmentLine, CORRECTIONS_HEADING, formatCorrectionDate, fullNote } from './_lib/correction-words.js';
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
 * sha256 of the title, each amendment line as it reads ("Amended 23 Nov 2026:
 * …") and every paragraph of the page, joined by a blank line, and of every
 * note as `date|classification|text`, joined the same way, in date order. The
 * same digests are recorded with the final reader text the owner's decision of
 * 23 Nov 2026 covers; change the text there and here together. The page digest
 * is of the WORDS: each paragraph with its list and lead-in markers removed
 * (pageParagraphText).
 *
 * History: 9e4832f0… as published on 23 Nov 2026; a303c756… after the lead's
 * amendment of the same day (the opening's "record" sentences, and the
 * amendment line that says so).
 */
const PAGE_DIGEST = 'a303c756c13eb98c69e44a7f2103a2c8ee228e80eaeda76e912f7c73fb1e449f';
const NOTES_DIGEST = 'd801389b4ebbef978db04a1571dcc09e57a0ab8435d42501bc34534be950f413';
/**
 * sha256 of everything a reader sees on /corrections below the masthead, as
 * visibleText() reads it: the kicker, title, dated line and amendment lines,
 * the page text, then each note under its link. It equals the final reader
 * text recorded with the owner's decision (every block, whitespace
 * normalised). Markup may change; this may not, unless the words do.
 *
 * History: 90d6ba60… as published on 23 Nov 2026, unchanged by the lists and
 * bold lead-ins; f36edf33… after the lead's amendment of the same day.
 */
const VISIBLE_TEXT_DIGEST = 'f36edf332beca630349906d16effdc35ecde1b3c355bd2d572fbc54184c85cbe';

/**
 * THE AMENDMENT OF 23 NOV 2026, a lead decision under the owner's delegation.
 * The opening said "Most said that censorship in Russia and Iran had reached a
 * “record”. It had not." Record claims were the most common kind of false
 * claim (114 of 296 false statements), not most of the wrong claims, and 9 of
 * the 142 record statements were true. The two sentences became one, and the
 * page says so under its dated line.
 */
const OPENING_NOW = 'The most common false claim was that censorship in Russia or Iran had reached a “record”.';
const OPENING_BEFORE = 'Most said that censorship in Russia and Iran had reached a “record”. It had not.';
const AMENDMENT = {
  on: '2026-11-23',
  text:
    'this page first said that most of the wrong claims were “record” claims and that none was true. ' +
    'Record claims were the most common kind of false claim (114 of 296), and 9 of the 142 record claims were true.',
};
const AMENDMENT_LINE =
  'Amended 23 Nov 2026: this page first said that most of the wrong claims were “record” claims and that none ' +
  'was true. Record claims were the most common kind of false claim (114 of 296), and 9 of the 142 record claims ' +
  'were true.';
/** The page's words in reading order: title, amendment lines, then each paragraph without its markers. */
const pageWords = () => [
  CORRECTIONS_PAGE_INTRO.title,
  ...(CORRECTIONS_PAGE_INTRO.amendments ?? []).map(amendmentLine),
  ...CORRECTIONS_PAGE_INTRO.paragraphs.map(pageParagraphText),
];

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
/**
 * The reader blocks of a page, in order: every `<p class="lede">` and every list
 * item, the dated line excluded, with the bold of a lead-in removed. An item
 * that holds a nested list ends where that list begins.
 */
const ledes = (html: string) =>
  [...html.matchAll(/<p class="lede">([\s\S]*?)<\/p>|<li>([\s\S]*?)(?=<ul>|<\/li>)/g)].map((m) =>
    (m[1] ?? m[2]).replace(/<\/?strong>/g, ''),
  );
const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };
/**
 * What a reader sees of a server page below its masthead: every tag removed (a
 * block tag reads as a break, an inline tag, <strong> or <a>, as nothing), the
 * five escapes esc() makes undone, and all whitespace collapsed to one space.
 */
function visibleText(html: string): string {
  const from = html.indexOf('</nav>');
  const to = html.lastIndexOf('</div></body>');
  expect(from).toBeGreaterThan(0);
  expect(to).toBeGreaterThan(from);
  return html
    .slice(from + '</nav>'.length, to)
    .replace(/<[^>]*>/g, (tag) => (/^<\/?(?:strong|a)\b/.test(tag) ? '' : ' '))
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])
    .replace(/\s+/g, ' ')
    .trim();
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
});

describe('the stored text is the signed-off final reader text', () => {
  it('the page text matches, by digest', () => {
    expect(sha256(pageWords().join('\n\n'))).toBe(PAGE_DIGEST);
  });

  it('the amendment of 23 Nov 2026: the opening sentence replaced, and the page says so', () => {
    const opening = pageParagraphText(CORRECTIONS_PAGE_INTRO.paragraphs[0]);
    expect(opening).toContain(` were wrong. ${OPENING_NOW} We checked every model-written edition`);
    expect(opening).not.toContain(OPENING_BEFORE);
    for (const p of pageWords()) {
      expect(p).not.toContain('Most said');
      expect(p).not.toContain('It had not.');
    }
    expect(CORRECTIONS_PAGE_INTRO.amendments).toEqual([AMENDMENT]);
    expect(amendmentLine(AMENDMENT)).toBe(AMENDMENT_LINE);
  });

  it('the 67 note texts and their classifications match, by digest', () => {
    expect(CORRECTION_NOTES).toHaveLength(67);
    expect(sha256(CORRECTION_NOTES.map((n) => `${n.date}|${n.classification}|${n.text}`).join('\n\n'))).toBe(
      NOTES_DIGEST,
    );
  });

  it('the page text is plain reader text: no drafting marks, owner notes or sources', () => {
    for (const p of pageWords()) {
      expect(p).toBe(p.trim());
      expect(p).not.toMatch(
        /\[|\]|\*|`|OWNER|[Nn]ot for publication|[Bb]efore publication|publication date|Sources,|CSV|lanes\d|\.md\b/,
      );
    }
  });

  it('the only markup stored is a list marker and a bold lead-in, and a nested item always follows an item', () => {
    const ps = CORRECTIONS_PAGE_INTRO.paragraphs;
    ps.forEach((p, i) => {
      const nested = p.startsWith('  - ');
      const item = nested || p.startsWith('- ');
      const body = p.slice(nested ? 4 : item ? 2 : 0);
      expect(body, p).toBe(body.trim());
      // At most one lead-in, at the start; pageParagraphText leaves no asterisk.
      expect(body.replace(/^\*\*[^*]+\*\*/, ''), p).not.toContain('*');
      if (nested) expect(i > 0 && (ps[i - 1].startsWith('- ') || ps[i - 1].startsWith('  - ')), p).toBe(true);
    });
  });
});

/**
 * THE GO-LIVE DATE IS PINNED. The owner's decision publishes on 23 Nov 2026:
 * every approved note opens "Correction added 23 Nov 2026." and the page says
 * "Published 23 Nov 2026.". The tests below take the date from the data, so a
 * changed correctedOn or publishedOn would pass them (and the clock check in
 * corrections-data.test.ts stops catching a later date once that date has
 * come). This one fails on any other date. To re-date the publication, change
 * these two constants together with the approval commit.
 */
const GO_LIVE = '2026-11-23';
const GO_LIVE_READER = '23 Nov 2026';

describe('the go-live date is 23 Nov 2026', () => {
  it('every approved note in the data, and the page once approved, carry it', () => {
    for (const n of CORRECTION_NOTES) if (n.status === 'approved') expect(n.correctedOn, n.date).toBe(GO_LIVE);
    if (CORRECTIONS_PAGE_INTRO.status === 'approved') expect(CORRECTIONS_PAGE_INTRO.publishedOn).toBe(GO_LIVE);
  });

  it('readers see "Correction added 23 Nov 2026." on every approved note and "Published 23 Nov 2026." on the page', async () => {
    const approved = approvedNotes();
    for (const n of approved) {
      const html = (await call('./brief/og.js', { date: n.date })).body as string;
      expect(html, n.date).toContain(`<p>Correction added ${GO_LIVE_READER}. This edition contained `);
    }
    const { status, body } = await call('./corrections.js');
    if (approved.length === 0) {
      expect(status).toBe(404);
      return;
    }
    const html = body as string;
    expect(count(html, `Correction added ${GO_LIVE_READER}. This edition contained `)).toBe(approved.length);
    expect(count(html, 'Correction added ')).toBe(approved.length);
    if (approvedIntro()) {
      // The amendment line sits directly after the dated line, as its own paragraph.
      expect(html).toContain(
        `<p class="lede dated">Published ${GO_LIVE_READER}.</p><p class="lede dated">${esc(AMENDMENT_LINE)}</p>`,
      );
      expect(count(html, 'Amended ')).toBe(1);
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
    const expected = [...(intro ? intro.paragraphs.map(pageParagraphText) : []), ...notes.map((n) => fullNote(n))].map(
      esc,
    );
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
      const lastWords = esc(pageParagraphText(intro.paragraphs[intro.paragraphs.length - 1]).slice(-60));
      expect(html.indexOf(lastWords)).toBeGreaterThan(0);
      expect(html.indexOf(lastWords)).toBeLessThan(html.indexOf('<section class="corr"'));
    } else {
      expect(html).toContain('<h1>Corrections</h1>');
      expect(html).not.toContain('lede dated');
    }
  });
});

/**
 * THE WORDS ARE THE PUBLISHED WORDS; ONLY THE LAYOUT IS NEW. The page text
 * carries two markers, a list item and a bold lead-in, which restore the
 * draft's lists and bold lead-ins. What a reader sees, tags stripped and
 * whitespace normalised, must equal the published text exactly.
 */
describe('/corrections: the published words, laid out as the draft laid them out', () => {
  const newestFirst = () =>
    [...approvedNotes()].sort((a, b) =>
      a.correctedOn === b.correctedOn ? (a.date < b.date ? 1 : -1) : a.correctedOn < b.correctedOn ? 1 : -1,
    );

  it('the visible text, tags stripped and whitespace normalised, equals the published text exactly', async () => {
    const { status, body } = await call('./corrections.js');
    if (approvedNotes().length === 0) {
      expect(status).toBe(404);
      return;
    }
    const seen = visibleText(body as string);
    const intro = approvedIntro();
    const published = [
      ...(intro
        ? [
            CORRECTIONS_HEADING,
            intro.title,
            `Published ${formatCorrectionDate(intro.publishedOn)}.`,
            ...(intro.amendments ?? []).map(amendmentLine),
            ...intro.paragraphs.map(pageParagraphText),
          ]
        : [CORRECTIONS_HEADING]),
      ...newestFirst().flatMap((n) => [`Situation Brief · ${n.date}`, fullNote(n)]),
    ]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    // Against the stored words, whose digests are pinned above.
    expect(seen).toBe(published);
    // Against the final reader text itself, by digest.
    if (intro) expect(sha256(seen)).toBe(VISIBLE_TEXT_DIGEST);
  });

  it("restores the draft's lists and bold lead-ins, and nothing else", async () => {
    const html = (await call('./corrections.js')).body as string;
    const intro = approvedIntro();
    if (!intro) {
      expect(html).not.toMatch(/<(?:ul|li|strong)[\s>]/);
      return;
    }
    const page = html.slice(html.indexOf('</nav>'), html.indexOf('<section class="corr"'));
    const strip = (s: string) => s.replace(/<[^>]*>/g, '');
    // The bold lead-ins, in reading order.
    expect([...page.matchAll(/<strong>([^<]*)<\/strong>/g)].map((m) => m[1])).toEqual([
      'What was wrong.',
      'Records.',
      'Trends.',
      'Counts.',
      'The unit.',
      'Motives and services.',
      'Claims we could not check.',
      'Blocking we said OONI had not recorded.',
      'Subject lines.',
      'The 67 editions with a note, one line each.',
      'Wording only (8 editions, no note).',
      'What we did not check.',
      'Method and data.',
    ]);
    // Three lists: by kind, the 67 one-line entries, and what we did not check.
    const lists = [...page.matchAll(/<ul class="lede">\n([\s\S]*?)\n<\/ul>(?=\n<p|$)/g)].map((m) => m[1]);
    expect(lists).toHaveLength(3);
    expect(count(page, '<ul class="lede">')).toBe(3);
    const [byKind, entries, unchecked] = lists;
    // By kind: eight items, and "Counts." holds its two sub-items.
    const kinds = [...byKind.matchAll(/^<li><strong>([^<]*)<\/strong>/gm)].map((m) => m[1]);
    expect(kinds).toEqual([
      'Records.',
      'Trends.',
      'Counts.',
      'The unit.',
      'Motives and services.',
      'Claims we could not check.',
      'Blocking we said OONI had not recorded.',
      'Subject lines.',
    ]);
    const counts = byKind.slice(
      byKind.indexOf('<li><strong>Counts.</strong>'),
      byKind.indexOf('<li><strong>The unit.'),
    );
    expect(counts).toMatch(/^<li><strong>Counts\.<\/strong> 210 of 313 quoted counts were right\.<ul>\n/);
    expect([...counts.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1].slice(0, 22))).toEqual([
      '90 were false: 86 prin',
      '13 were misleading: a ',
    ]);
    expect(counts.trimEnd().endsWith('</ul></li>')).toBe(true);
    // The 67 entries: one item per note, in edition order, each opening with its date.
    const entryItems = [...entries.matchAll(/<li>([^<]*)<\/li>/g)].map((m) => m[1]);
    const byDate = [...approvedNotes()].sort((a, b) => a.date.localeCompare(b.date));
    expect(entryItems).toHaveLength(byDate.length);
    entryItems.forEach((item, i) =>
      expect(item.startsWith(`${formatCorrectionDate(byDate[i].date).replace(/ \d{4}$/, '')}: `), item).toBe(true),
    );
    // What we did not check: seven items, none bold.
    expect([...unchecked.matchAll(/<li>/g)]).toHaveLength(7);
    expect(unchecked).not.toContain('<strong>');
    // Each list sits straight after its lead-in paragraph.
    for (const [leadEnd, list] of [
      ['By kind:</p>', byKind],
      ['unless marked seven-day.</p>', entries],
      ['<strong>What we did not check.</strong></p>', unchecked],
    ] as const) {
      const before = page.slice(0, page.indexOf(`<ul class="lede">\n${list}`));
      expect(before.endsWith(`${leadEnd}\n`), leadEnd).toBe(true);
    }
    // Every other block of the page text is a lede paragraph: 93 blocks in all.
    expect(count(page, '<p class="lede">') + count(page, '<li>')).toBe(intro.paragraphs.length);
    expect(intro.paragraphs).toHaveLength(93);
    expect(strip(page)).not.toContain('**');
  });
});
