import { describe, it, expect } from 'vitest';
import {
  approvedCallNotes,
  approvedLedgerSections,
  approvedMethodologyNotes,
  callNotesBlockHtml,
  callNotesCardLine,
  methodologyPayload,
  notesForCall,
  thresholdGroup,
  thresholdLineApproved,
  thresholdLineHtml,
  type ThresholdRow,
} from './call-notes.js';
import { skillOneDecimal, thresholdLineLead, type CallNote, type PageNote } from './call-note-words.js';

/**
 * The gate, on synthetic entries passed explicitly (never the repository's
 * data): two keys or nothing, fail closed on anything malformed, and the
 * threshold line's rule exactly as worded.
 */

const note = (over: Partial<CallNote> & { id: string }): CallNote =>
  ({ status: 'approved', issuedOn: '2026-11-23', scope: { ids: [10, 11] }, text: 'Body.', ...over }) as CallNote;
const page = (over: Partial<PageNote> & { id: string }): PageNote =>
  ({ status: 'approved', issuedOn: '2026-11-23', heading: 'H', paragraphs: ['P.'], ...over }) as PageNote;

describe('the two-key gate', () => {
  it('passes an entry only when its status and the key agree', () => {
    const notes = [note({ id: 'a' }), note({ id: 'b', status: 'draft', issuedOn: undefined }), note({ id: 'c' })];
    expect(approvedCallNotes(notes, ['a', 'b']).map((n) => n.id)).toEqual(['a']);
    expect(approvedCallNotes(notes, []).map((n) => n.id)).toEqual([]);
    expect(approvedLedgerSections([page({ id: 's' })], [])).toEqual([]);
    expect(approvedLedgerSections([page({ id: 's' })], ['s'])).toHaveLength(1);
    expect(approvedMethodologyNotes([page({ id: 'm', status: 'draft' })], ['m'])).toEqual([]);
    expect(thresholdLineApproved({ id: 't', status: 'approved', issuedOn: '2026-11-23' }, ['t'])).toBe(true);
    expect(thresholdLineApproved({ id: 't', status: 'approved', issuedOn: '2026-11-23' }, [])).toBe(false);
    expect(thresholdLineApproved({ id: 't', status: 'draft' }, ['t'])).toBe(false);
  });

  it('fails closed on a malformed approved entry', () => {
    const keys = ['x'];
    for (const bad of [
      note({ id: 'x', issuedOn: '2026-02-30' }),
      note({ id: 'x', text: '  ' }),
      note({ id: 'x', scope: { ids: [0] } }),
      note({ id: 'x', scope: { ids: [1.5] } }),
      note({ id: 'x', text: 'Needs {reference}.' }),
    ]) {
      expect(approvedCallNotes([bad], keys)).toEqual([]);
    }
    for (const bad of [
      page({ id: 'x', heading: '' }),
      page({ id: 'x', paragraphs: [] }),
      page({ id: 'x', paragraphs: ['ok', ''] }),
      page({ id: 'x', kicker: ' ' }),
    ]) {
      expect(approvedLedgerSections([bad], keys)).toEqual([]);
    }
  });
});

describe('notes on a call', () => {
  it('dated, in data order, for a call id given as a number or as the driver string', () => {
    const notes = [note({ id: 'a', text: 'First.' }), note({ id: 'b', text: 'Second.', scope: { ids: [11] } })];
    expect(notesForCall({ id: 10 }, notes, ['a', 'b']).map((n) => n.text)).toEqual(['Note added 23 Nov 2026. First.']);
    expect(notesForCall({ id: '11' }, notes, ['a', 'b']).map((n) => n.text)).toEqual([
      'Note added 23 Nov 2026. First.',
      'Note added 23 Nov 2026. Second.',
    ]);
    expect(notesForCall({ id: 12 }, notes, ['a', 'b'])).toEqual([]);
    expect(notesForCall({ id: 'x' }, notes, ['a', 'b'])).toEqual([]);
  });

  it('oldest first across dates', () => {
    const notes = [note({ id: 'late', issuedOn: '2026-12-01' }), note({ id: 'early', issuedOn: '2026-11-23' })];
    expect(notesForCall({ id: 10 }, notes, ['late', 'early']).map((n) => n.id)).toEqual(['early', 'late']);
  });

  it("fills the reference the call's claim states, and skips a call it has none for", () => {
    const n = note({ id: 'r', text: 'It states {reference}.', references: { 10: '1.81120e+6' } });
    expect(notesForCall({ id: 10 }, [n], ['r']).map((x) => x.text)).toEqual([
      'Note added 23 Nov 2026. It states 1.81120e+6.',
    ]);
    expect(notesForCall({ id: 11 }, [n], ['r'])).toEqual([]);
  });

  it('the block, the card line and the label', () => {
    const one = notesForCall({ id: 10 }, [note({ id: 'a', text: 'A & <b>.' })], ['a']);
    expect(callNotesBlockHtml([])).toBe('');
    expect(callNotesBlockHtml(one)).toBe(
      '<div class="rule"></div><div class="kicker">Note</div>\n' +
        '<p class="lede">Note added 23 Nov 2026. A &amp; &lt;b&gt;.</p>',
    );
    const two = notesForCall({ id: 10 }, [note({ id: 'a' }), note({ id: 'b', issuedOn: '2026-12-01' })], ['a', 'b']);
    expect(callNotesBlockHtml(two)).toContain('<div class="kicker">Notes</div>');
    expect(callNotesCardLine([])).toBeNull();
    expect(callNotesCardLine(one)).toBe('NOTE ADDED 23 NOV 2026 · SEE THE CALL PAGE');
    expect(callNotesCardLine(two)).toBe('NOTE ADDED 1 DEC 2026 · SEE THE CALL PAGE');
  });

  it('the /methodology payload opens its first paragraph with "Added <date>."', () => {
    const m = page({ id: 'm', paragraphs: ['One.', 'Two.'] }) as Extract<PageNote, { status: 'approved' }>;
    expect(methodologyPayload([m])).toEqual([
      { heading: 'H', added_on: '2026-11-23', paragraphs: ['Added 23 Nov 2026. One.', 'Two.'] },
    ]);
  });
});

describe('the threshold line: below base on every resolved call, and at most one hit', () => {
  const days = ['2026-09-05', '2026-09-19', '2026-10-03', '2026-10-17'];
  const rows = (cc: string, p: number, base: number | null, hits: number, n = 8): ThresholdRow[] =>
    Array.from({ length: n }, (_, i) => ({
      country_code: cc,
      probability: p,
      base_rate: base,
      status: i < hits ? 'hit' : 'miss',
      resolved_at: `${days[i % days.length]} 09:45:00+00`,
    }));

  it('selects by the rule, and only by it', () => {
    const book = [
      ...rows('AA', 0.15, 0.25, 0), // below base, 0 hits: in
      ...rows('BB', 0.15, 0.25, 1), // below base, 1 hit: in
      ...rows('CC', 0.15, 0.25, 2), // below base, 2 hits: out
      ...rows('DD', 0.3, 0.25, 0), // above base: out
      ...rows('FF', 0.25, 0.25, 0), // equal, not below: out
      ...rows('GG', 0.35, 0.25, 4),
    ];
    const g = thresholdGroup(book);
    expect(g?.countries).toEqual(['AA', 'BB']);
    expect([g?.calls, g?.hits]).toEqual([16, 1]);
    // One call priced at base rate on an otherwise-qualifying currency takes it out.
    const mixed = [...rows('AA', 0.15, 0.25, 0, 7), ...rows('AA', 0.25, 0.25, 0, 1), ...rows('GG', 0.35, 0.25, 4)];
    expect(thresholdGroup(mixed)).toBeNull();
  });

  it('no line when no currency qualifies, when every one does, or when skill is not publishable', () => {
    expect(thresholdGroup(rows('GG', 0.35, 0.25, 4))).toBeNull();
    expect(thresholdGroup(rows('AA', 0.15, 0.25, 0))).toBeNull();
    const oneBatch = [...rows('AA', 0.15, 0.25, 0), ...rows('GG', 0.35, 0.25, 4)].map((r) => ({
      ...r,
      resolved_at: '2026-09-05 09:45:00+00',
    }));
    expect(thresholdGroup(oneBatch)).toBeNull();
    // A row without a base rate makes skill unpublishable for the kind, so no line at all.
    expect(
      thresholdGroup([...rows('AA', 0.15, 0.25, 0), ...rows('EE', 0.15, null, 0), ...rows('GG', 0.35, 0.25, 4)]),
    ).toBeNull();
  });

  it('prints one decimal with a true minus sign, and agrees in number', () => {
    expect(skillOneDecimal(-0.029916605268436314)).toBe('−3.0%');
    expect(skillOneDecimal(-0.03729)).toBe('−3.7%');
    expect(skillOneDecimal(0.0123)).toBe('+1.2%');
    expect(skillOneDecimal(-0.0004)).toBe('0.0%');
    expect(thresholdLineLead({ calls: 1, codes: ['VES'], hits: 0, skillWith: -0.03, skillWithout: -0.037 })).toContain(
      'Includes 1 call in 1 currency that we priced',
    );
    const html = thresholdLineHtml(
      { countries: ['ZW', 'AA'], calls: 2, hits: 0, skillWith: -0.03, skillWithout: -0.04 },
      new Map([['ZW', 'ZWL']]),
    );
    // A country whose code could not be read is listed by its country code, never dropped.
    expect(html).toContain('(AA, ZWL)');
    expect(html).toContain('<a href="/methodology">/methodology</a>.</span></div>');
  });
});
