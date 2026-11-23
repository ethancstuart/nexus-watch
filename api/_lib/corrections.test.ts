import { describe, it, expect } from 'vitest';
import {
  approvedIntro,
  approvedNoteFor,
  approvedNotes,
  briefDateKey,
  correctionBlockHtml,
  correctionPayload,
  correctionsNewestFirst,
  pageParagraphText,
  pageTextHtml,
  renderCorrectionsPage,
  type ApprovalKeys,
} from './corrections.js';
import {
  correctionAdded,
  formatCorrectionDate,
  fullNote,
  isIsoDate,
  openingSentence,
  type CorrectionNote,
} from './correction-words.js';

/** The gate and the words, on synthetic notes. The repository's own data is checked in corrections-data.test.ts. */

const draft = (date: string, text = `On ${formatCorrectionDate(date)} we wrote “x”.`): CorrectionNote => ({
  date,
  status: 'draft',
  classification: 'false',
  text,
});
const approved = (date: string, correctedOn: string, extra: Partial<CorrectionNote> = {}): CorrectionNote =>
  ({
    date,
    status: 'approved',
    correctedOn,
    classification: 'false',
    text: `On ${formatCorrectionDate(date)} we wrote “x”.`,
    ...extra,
  }) as CorrectionNote;

describe('the words', () => {
  it('formats a date the way the notes already write edition dates', () => {
    expect(formatCorrectionDate('2026-12-01')).toBe('1 Dec 2026');
    expect(formatCorrectionDate('2026-09-08')).toBe('8 Sep 2026');
    expect(() => formatCorrectionDate('2026-02-30')).toThrow();
  });

  it('accepts only real YYYY-MM-DD dates', () => {
    expect(isIsoDate('2026-11-22')).toBe(true);
    for (const bad of ['2026-13-01', '2026-02-30', '26-11-22', '2026-11-22T00:00:00Z', '', undefined, 20261122]) {
      expect(isIsoDate(bad), String(bad)).toBe(false);
    }
  });

  it('renders the opening sentence from correctedOn and classification', () => {
    expect(openingSentence('2026-12-01', 'false')).toBe(
      'Correction added 1 Dec 2026. This edition contained false statements.',
    );
    expect(openingSentence('2026-12-01', 'false-and-misleading')).toBe(
      'Correction added 1 Dec 2026. This edition contained false and misleading statements.',
    );
    expect(openingSentence('2026-12-01', 'misleading')).toBe(
      'Correction added 1 Dec 2026. This edition contained misleading statements.',
    );
    expect(correctionAdded('2026-12-01')).toBe('Correction added 1 Dec 2026.');
  });

  it('a full note is the opening sentence, one space, then the stored text unchanged', () => {
    const n = approved('2026-09-08', '2026-12-01') as Extract<CorrectionNote, { status: 'approved' }>;
    expect(fullNote(n)).toBe(`Correction added 1 Dec 2026. This edition contained false statements. ${n.text}`);
  });
});

/** The second key listing every given note's date: only the status then decides. */
const allKeys = (notes: CorrectionNote[], introduction = false): ApprovalKeys => ({
  noteDates: notes.map((n) => n.date),
  introduction,
});

describe('the gate', () => {
  it('passes approved notes only', () => {
    const notes = [draft('2026-09-08'), approved('2026-09-09', '2026-12-01'), draft('2026-09-13')];
    const k = allKeys(notes);
    expect(approvedNotes(notes, k).map((n) => n.date)).toEqual(['2026-09-09']);
    expect(approvedNoteFor('2026-09-08', notes, k)).toBeNull();
    expect(approvedNoteFor('2026-09-09', notes, k)?.correctedOn).toBe('2026-12-01');
    expect(approvedNoteFor('2026-09-10', notes, k)).toBeNull();
  });

  it('needs both keys: an approval typed on the wrong entry publishes nothing', () => {
    // The owner approves 8 Sep in the key list but sets the status on 9 Sep.
    const notes = [draft('2026-09-08'), approved('2026-09-09', '2026-12-01')];
    const keys: ApprovalKeys = { noteDates: ['2026-09-08'], introduction: false };
    expect(approvedNotes(notes, keys)).toEqual([]);
    expect(approvedNoteFor('2026-09-08', notes, keys)).toBeNull();
    expect(approvedNoteFor('2026-09-09', notes, keys)).toBeNull();
    expect(correctionsNewestFirst(notes, keys)).toEqual([]);
    // Status alone, or the list alone, is never enough.
    expect(approvedNotes([approved('2026-09-09', '2026-12-01')], { noteDates: [], introduction: false })).toEqual([]);
    expect(approvedNotes([draft('2026-09-08')], { noteDates: ['2026-09-08'], introduction: false })).toEqual([]);
  });

  it('with the repository keys, an approved entry whose date is not listed does not pass', () => {
    // 1 Aug names no note, so it can never be on the repository's key list
    // (corrections-data.test.ts requires every listed date to name a note).
    expect(approvedNotes([approved('2026-08-01', '2026-12-01')])).toEqual([]);
  });

  it('fails closed on an approved entry it cannot render truthfully', () => {
    const notes: CorrectionNote[] = [
      approved('2026-09-08', '2026-12-32'),
      approved('2026-09-09', ''),
      { date: 'not-a-date', status: 'approved', correctedOn: '2026-12-01', classification: 'false', text: 'x' },
      approved('2026-09-13', '2026-12-01', { text: '   ' }),
      approved('2026-09-14', '2026-12-01', { classification: 'wrong' as never }),
      // An approved entry missing correctedOn cannot be written in TypeScript; data from elsewhere can.
      { date: '2026-09-15', status: 'approved', classification: 'false', text: 'x' } as unknown as CorrectionNote,
    ];
    expect(approvedNotes(notes, allKeys(notes))).toEqual([]);
  });

  it('the type refuses an approved note without correctedOn (tsc fails if this line ever compiles)', () => {
    // @ts-expect-error approved requires correctedOn
    const n: CorrectionNote = { date: '2026-09-08', status: 'approved', classification: 'false', text: 'x' };
    expect(approvedNotes([n], allKeys([n]))).toEqual([]);
  });

  it('lists newest correction first, then the latest edition among same-day corrections', () => {
    const notes = [
      approved('2026-09-08', '2026-12-01'),
      approved('2026-10-01', '2026-12-01'),
      approved('2026-09-20', '2026-12-05'),
      draft('2026-11-05'),
    ];
    expect(correctionsNewestFirst(notes, allKeys(notes)).map((n) => n.date)).toEqual([
      '2026-09-20',
      '2026-10-01',
      '2026-09-08',
    ]);
  });

  describe('the introduction', () => {
    const base = { title: 'T', paragraphs: ['P'] };
    const ok = { ...base, status: 'approved' as const, publishedOn: '2026-12-01' };
    const all = [approved('2026-09-08', '2026-12-01'), approved('2026-09-09', '2026-12-01')];

    it('passes with its key, its own approval and every note approved by both keys', () => {
      expect(approvedIntro(ok, all, allKeys(all, true))?.title).toBe('T');
    });

    it('fails closed on anything less', () => {
      expect(approvedIntro({ ...base, status: 'draft' }, all, allKeys(all, true))).toBeNull();
      expect(approvedIntro({ ...ok, publishedOn: 'soon' }, all, allKeys(all, true))).toBeNull();
      expect(approvedIntro(ok, all, allKeys(all, false))).toBeNull(); // no introduction key
      // One note still draft, or approved by its status but missing from the key list.
      expect(approvedIntro(ok, [all[0], draft('2026-09-13')], allKeys(all, true))).toBeNull();
      expect(approvedIntro(ok, all, { noteDates: ['2026-09-08'], introduction: true })).toBeNull();
      expect(approvedIntro(ok, [], { noteDates: [], introduction: true })).toBeNull();
      // With the repository's keys, notes whose dates can never be listed keep it down.
      const unlisted = [approved('2026-08-01', '2026-12-01')];
      expect(approvedIntro(ok, unlisted)).toBeNull();
    });
  });
});

describe('brief dates as the driver returns them', () => {
  it('normalises strings and local-midnight Dates without reading UTC', () => {
    expect(briefDateKey('2026-09-08')).toBe('2026-09-08');
    expect(briefDateKey('2026-09-08T00:00:00.000Z')).toBe('2026-09-08');
    expect(briefDateKey(new Date(2026, 8, 8))).toBe('2026-09-08');
    for (const bad of [null, undefined, 'yesterday', new Date('nope'), 42]) expect(briefDateKey(bad)).toBe('');
  });
});

describe('rendering escapes every string', () => {
  const hostile = approved('2026-09-08', '2026-12-01', {
    text: `On 8 Sep 2026 we wrote “<script>alert(1)</script>” & <img src=x onerror=y> "q" 'a'.`,
  }) as Extract<CorrectionNote, { status: 'approved' }>;

  it('in the brief-page block', () => {
    const html = correctionBlockHtml(hostile);
    expect(html).not.toMatch(/<script|<img/);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&amp; &lt;img src=x onerror=y&gt; &quot;q&quot; &#39;a&#39;');
    expect(html).toContain('Correction added 1 Dec 2026. This edition contained false statements.');
    expect(html).toContain('<a href="/corrections">All corrections</a>');
    expect(html).not.toMatch(/style=/);
  });

  it('in the JSON payload the note stays plain text for the client to escape', () => {
    expect(correctionPayload(hostile)).toEqual({
      correctedOn: '2026-12-01',
      classification: 'false',
      note: `Correction added 1 Dec 2026. This edition contained false statements. ${hostile.text}`,
    });
  });
});

/**
 * THE PAGE TEXT'S ONLY MARKUP. A stored paragraph of the /corrections page may
 * start with "- " (a list item) or "  - " (an item inside the item before it),
 * and then with a lead-in in double asterisks. Nothing else is read as markup,
 * every word is escaped, and the words a reader sees are the paragraph with
 * those markers removed.
 */
describe('the page text: lists and bold lead-ins, nothing else', () => {
  it('a plain paragraph is a lede paragraph, as before', () => {
    expect(pageTextHtml(['One.', 'Two & three.'])).toBe(
      '<p class="lede">One.</p>\n<p class="lede">Two &amp; three.</p>',
    );
  });

  it('a leading **Lead.** is bold, on a paragraph and on a list item', () => {
    expect(pageTextHtml(['**What was wrong.** We checked.'])).toBe(
      '<p class="lede"><strong>What was wrong.</strong> We checked.</p>',
    );
    expect(pageTextHtml(['**What we did not check.**'])).toBe(
      '<p class="lede"><strong>What we did not check.</strong></p>',
    );
    expect(pageTextHtml(['- **Records.** 142 statements.'])).toBe(
      '<ul class="lede">\n<li><strong>Records.</strong> 142 statements.</li>\n</ul>',
    );
  });

  it('consecutive items make one list; a paragraph between them makes two', () => {
    expect(pageTextHtml(['Lead:', '- a', '- b', 'Between.', '- c'])).toBe(
      '<p class="lede">Lead:</p>\n' +
        '<ul class="lede">\n<li>a</li>\n<li>b</li>\n</ul>\n' +
        '<p class="lede">Between.</p>\n' +
        '<ul class="lede">\n<li>c</li>\n</ul>',
    );
  });

  it('"  - " items nest inside the item before them, one level', () => {
    expect(pageTextHtml(['- **Counts.** 210 right.', '  - 90 false.', '  - 13 misleading.', '- **The unit.** x'])).toBe(
      '<ul class="lede">\n' +
        '<li><strong>Counts.</strong> 210 right.<ul>\n<li>90 false.</li>\n<li>13 misleading.</li>\n</ul></li>\n' +
        '<li><strong>The unit.</strong> x</li>\n' +
        '</ul>',
    );
  });

  it('a nested item with no item before it opens the list as an item: nothing is dropped or left open', () => {
    expect(pageTextHtml(['Para.', '  - orphan', '- next'])).toBe(
      '<p class="lede">Para.</p>\n<ul class="lede">\n<li>orphan</li>\n<li>next</li>\n</ul>',
    );
  });

  it('nothing else is markup: other asterisks, hashes, links and dashes stay literal text', () => {
    for (const p of [
      'a **b** c',
      '**unclosed lead',
      '****',
      '* star item',
      '-no space',
      '# Heading',
      '[link](https://example.com)',
      '_under_ and `code`',
      ' - one space',
      '   - three spaces',
    ]) {
      expect(pageTextHtml([p]), p).toBe(`<p class="lede">${p.replace(/&/g, '&amp;')}</p>`);
      expect(pageParagraphText(p), p).toBe(p);
    }
  });

  it('escapes every word, inside items and lead-ins too', () => {
    const html = pageTextHtml([
      `**<script>alert(1)</script>** & "q" 'a'`,
      `- **<img src=x onerror=y>** <b>bold</b>`,
      `  - </li></ul><script>x</script>`,
    ]);
    expect(html).not.toMatch(/<script|<img|<b>/);
    expect(html).toContain('<strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong> &amp; &quot;q&quot; &#39;a&#39;');
    expect(html).toContain('<li><strong>&lt;img src=x onerror=y&gt;</strong> &lt;b&gt;bold&lt;/b&gt;<ul>');
    expect(html).toContain('<li>&lt;/li&gt;&lt;/ul&gt;&lt;script&gt;x&lt;/script&gt;</li>');
    expect(html).not.toMatch(/style=/);
  });

  it('the words a reader sees are the paragraph with the markers removed, and nothing else changed', () => {
    expect(pageParagraphText('Plain, unchanged.')).toBe('Plain, unchanged.');
    expect(pageParagraphText('**What was wrong.** We checked 1,003 statements.')).toBe(
      'What was wrong. We checked 1,003 statements.',
    );
    expect(pageParagraphText('**What we did not check.**')).toBe('What we did not check.');
    expect(pageParagraphText('- **Records.** 142 statements.')).toBe('Records. 142 statements.');
    expect(pageParagraphText('  - 90 were false.')).toBe('90 were false.');
    expect(pageParagraphText('- 23 Aug: not a record.')).toBe('23 Aug: not a record.');
  });

  it('the /corrections page renders its introduction through it; the meta description is plain words', () => {
    const intro = {
      status: 'approved' as const,
      publishedOn: '2026-12-01',
      title: 'T',
      paragraphs: ['**Opening.** First & only.', '- **Item.** one', '  - sub'],
    };
    const note = approved('2026-09-08', '2026-12-01') as Extract<CorrectionNote, { status: 'approved' }>;
    const page = renderCorrectionsPage([note], intro);
    expect(page.body).toContain(
      '<p class="lede"><strong>Opening.</strong> First &amp; only.</p>\n' +
        '<ul class="lede">\n<li><strong>Item.</strong> one<ul>\n<li>sub</li>\n</ul></li>\n</ul>',
    );
    expect(page.description).toBe('Opening. First & only.');
    // The notes keep their own rendering: one escaped paragraph each.
    expect(page.body).toContain(`<p class="lede">${fullNote(note)}</p>`);
  });
});
