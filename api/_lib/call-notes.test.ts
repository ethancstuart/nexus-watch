import { describe, it, expect } from 'vitest';
import {
  approvedCallNotes,
  approvedLedgerSections,
  approvedMethodologyNotes,
  callNotesBlockHtml,
  callNotesCardLine,
  ledgerSectionsHtml,
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

describe('a scope rule: later calls of one kind, country and currency code', () => {
  const rule = { kind: 'fx_devaluation', countryCode: 'ZW', claimCode: 'ZWL', madeAfter: '2026-11-22' };
  const zw = note({ id: 'zw', scope: { ids: [91], rule } });
  const call = (over: Record<string, unknown> = {}) => ({
    id: '7175',
    kind: 'fx_devaluation',
    country_code: 'ZW',
    claim: 'ZWL depreciates 0.85% or more against USD at any point within 14 days, from 26.5872.',
    made_on: '2026-11-23',
    ...over,
  });
  const texts = (c: Record<string, unknown>) =>
    notesForCall(c as never, [zw], ['zw']).map((n) => [n.issuedOn, n.text] as const);

  it('reaches a matching call made after its date, dated the later of issuedOn and made_on', () => {
    expect(texts(call())).toEqual([['2026-11-23', 'Note added 23 Nov 2026. Body.']]);
    expect(texts(call({ made_on: '2026-12-01' }))).toEqual([['2026-12-01', 'Note added 1 Dec 2026. Body.']]);
  });

  it('reaches nothing else: not on or before its date, another kind, country or code, or a call missing a field', () => {
    for (const over of [
      { made_on: '2026-11-22' },
      { made_on: '2026-11-01' },
      { kind: 'censorship_event' },
      { country_code: 'VE' },
      { claim: 'ZWG depreciates 0.85% or more against USD at any point within 14 days, from 26.5872.' },
      { claim: 'The ZWL depreciates.' },
      { made_on: undefined },
      { kind: undefined },
      { claim: undefined },
      { made_on: '2026-13-01' },
    ]) {
      expect(texts(call(over)), JSON.stringify(over)).toEqual([]);
    }
    // A listed call keeps the note's own date whatever its made_on.
    expect(texts(call({ id: 91, made_on: '2026-08-23' }))).toEqual([['2026-11-23', 'Note added 23 Nov 2026. Body.']]);
  });

  it('needs the same two keys as its note, and fails closed when malformed', () => {
    expect(notesForCall(call() as never, [zw], [])).toEqual([]);
    expect(notesForCall(call() as never, [{ ...zw, status: 'draft' } as CallNote], ['zw'])).toEqual([]);
    for (const bad of [
      { ...rule, madeAfter: '22 Nov' },
      { ...rule, countryCode: '' },
      { ...rule, claimCode: ' ' },
      { ...rule, kind: '' },
    ]) {
      const n = note({ id: 'zw', scope: { ids: [91], rule: bad } });
      expect(approvedCallNotes([n], ['zw']), JSON.stringify(bad)).toEqual([]);
    }
  });
});

describe('the threshold line escapes what it reads from the database', () => {
  it('a hostile currency code is printed as text', () => {
    const html = thresholdLineHtml(
      { countries: ['AA', 'ZW'], calls: 2, hits: 0, skillWith: -0.03, skillWithout: -0.04 },
      new Map([
        ['AA', '<img src=x onerror=alert(1)>'],
        ['ZW', 'Z&W"'],
      ]),
    );
    expect(html).toContain('(&lt;img src=x onerror=alert(1)&gt;, Z&amp;W&quot;)');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('Z&W"');
  });
});

describe('dated amendment lines: a changed published text says so, as 1588e52 does for /corrections', () => {
  const amended = { on: '2026-11-23', text: 'this note first counted the currencies whose rates were stale.' };

  it('a call note carries its amendment after its text, dated from data', () => {
    const n = note({ id: 'a', issuedOn: '2026-11-23', amendments: [amended] });
    expect(notesForCall({ id: 10 }, [n], ['a']).map((x) => x.text)).toEqual([
      'Note added 23 Nov 2026. Body. Amended 23 Nov 2026: this note first counted the currencies whose rates were stale.',
    ]);
    // Escaped on the page like the rest of the note.
    const html = callNotesBlockHtml(
      notesForCall({ id: 10 }, [note({ id: 'b', amendments: [{ on: '2026-11-24', text: '<i>x</i> & y' }] })], ['b']),
    );
    expect(html).toContain('Body. Amended 24 Nov 2026: &lt;i&gt;x&lt;/i&gt; &amp; y</p>');
  });

  it('a note without amendments reads exactly as before', () => {
    expect(notesForCall({ id: 10 }, [note({ id: 'a' })], ['a'])[0].text).toBe('Note added 23 Nov 2026. Body.');
  });

  it('fails closed on an amendment it cannot state truthfully: no real date, dated before the note, or empty', () => {
    for (const bad of [
      { on: '2026-02-30', text: 'x' },
      { on: '2026-11-22', text: 'x' },
      { on: '2026-11-23', text: ' ' },
    ]) {
      expect(approvedCallNotes([note({ id: 'a', amendments: [bad] })], ['a']), JSON.stringify(bad)).toEqual([]);
      expect(approvedLedgerSections([page({ id: 's', amendments: [bad] })], ['s']), JSON.stringify(bad)).toEqual([]);
    }
  });

  it('a call a scope rule reaches after the amendment never showed the first text, so it gets no amendment line', () => {
    const rule = { kind: 'fx_devaluation', countryCode: 'ZW', claimCode: 'ZWL', madeAfter: '2026-11-22' };
    const n = note({ id: 'z', scope: { ids: [91], rule }, amendments: [{ on: '2026-11-25', text: 'first said x.' }] });
    const later = (made: string) => ({
      id: 7300,
      kind: 'fx_devaluation',
      country_code: 'ZW',
      claim: 'ZWL depreciates 0.85% or more against USD at any point within 14 days, from 26.5872.',
      made_on: made,
    });
    expect(notesForCall(later('2026-11-24'), [n], ['z'])[0].text).toBe(
      'Note added 24 Nov 2026. Body. Amended 25 Nov 2026: first said x.',
    );
    expect(notesForCall(later('2026-11-26'), [n], ['z'])[0].text).toBe('Note added 26 Nov 2026. Body.');
    // A listed call always carries it.
    expect(notesForCall({ id: 91 }, [n], ['z'])[0].text).toContain('Amended 25 Nov 2026: first said x.');
  });

  it('a /ledger section ends with its amendment line, escaped; /methodology appends it as a paragraph', () => {
    const s = page({ id: 's', kicker: 'K', amendments: [{ on: '2026-11-23', text: 'this section first said <x>.' }] });
    const [approved] = approvedLedgerSections([s], ['s']);
    expect(ledgerSectionsHtml([approved])).toBe(
      '<div class="rule"></div><div class="kicker">K</div><h2>H</h2><p class="lede">P.</p>' +
        '<p class="lede">Amended 23 Nov 2026: this section first said &lt;x&gt;.</p>',
    );
    expect(ledgerSectionsHtml(approvedLedgerSections([page({ id: 't', kicker: 'K' })], ['t']))).toBe(
      '<div class="rule"></div><div class="kicker">K</div><h2>H</h2><p class="lede">P.</p>',
    );
    const [m] = approvedMethodologyNotes(
      [page({ id: 'm', amendments: [{ on: '2026-11-24', text: 'first said y.' }] })],
      ['m'],
    );
    expect(methodologyPayload([m])[0].paragraphs).toEqual([
      'Added 23 Nov 2026. P.',
      'Amended 24 Nov 2026: first said y.',
    ]);
  });
});
