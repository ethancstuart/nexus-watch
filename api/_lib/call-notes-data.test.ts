import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CALL_NOTES, LEDGER_FX_THRESHOLD_LINE, LEDGER_SECTIONS, METHODOLOGY_NOTES } from './call-notes-data.js';
import { APPROVED_NOTE_IDS } from './call-notes-approvals.js';
import {
  approvedCallNotes,
  approvedLedgerSections,
  approvedMethodologyNotes,
  notesForCall,
  thresholdLineApproved,
} from './call-notes.js';
import { REFERENCE_SLOT, type CallNote } from './call-note-words.js';
import { isIsoDate } from './correction-words.js';

/**
 * The call notes are data, and this is their integrity check.
 *
 * THE TEST-SIDE PIN. Publication is decided at runtime by the gate, which
 * needs two keys in source: the entry's status (call-notes-data.ts) and its id
 * in APPROVED_NOTE_IDS (call-notes-approvals.ts); a disagreement shows nothing
 * anywhere. APPROVED_IDS below is a further check that runs only where the
 * tests run. The approval and withdrawal steps are in call-notes-approvals.ts.
 *
 * THE LISTS ARE RE-DERIVED HERE from ledger-snapshots/2026-11-22.json, the
 * public snapshot the approved wording (FX-WORDING.md) was computed on, by the
 * rule each note states. A list edited by hand away from its rule fails.
 */
const APPROVED_IDS: string[] = [
  'fx-2026-11-21-resolved-miss',
  'fx-2026-11-21-resolved-hit',
  'fx-2026-11-21-made',
  'fx-zw-zwl-label',
  'ledger-fx-2026-11-21',
  'ledger-fx-threshold-line',
  'methodology-fx-threshold',
];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

interface SnapshotCall {
  id: string;
  kind: string;
  country_code: string;
  claim: string;
  made_on: string;
  resolves_on: string;
  status: string;
  resolved_at: string | null;
}
const snapshot = JSON.parse(readFileSync(join(ROOT, 'ledger-snapshots/2026-11-22.json'), 'utf8')) as {
  generated_at: string;
  open: SnapshotCall[];
  resolved: SnapshotCall[];
};
const fx = [...snapshot.open, ...snapshot.resolved].filter((c) => c.kind === 'fx_devaluation');
const ids = (cs: SnapshotCall[]) => cs.map((c) => Number(c.id)).sort((a, b) => a - b);
/** "… from 1545.40." or "… from 1.81120e+6.": the reference figure as the claim prints it. */
const statedReference = (claim: string) => (claim.match(/, from ([0-9.]+(?:e\+[0-9]+)?)\.$/) ?? [])[1];

const note = (id: string): CallNote => {
  const n = CALL_NOTES.find((x) => x.id === id);
  if (!n) throw new Error(`no note ${id}`);
  return n;
};
const sorted = (xs: readonly number[]) => [...xs].sort((a, b) => a - b);

/** AZN per USD as stored on 17-23 Nov 2026 (production read, 23 Nov; see the test that uses it). */
const AZN_STORED: Readonly<Record<string, number>> = {
  '2026-11-17': 1.699413,
  '2026-11-18': 1.700728,
  '2026-11-19': 1.699248,
  '2026-11-20': 1.699783,
  '2026-11-21': 1.699783,
  '2026-11-22': 1.700099,
};

/** The 65 currencies whose 21 Nov calls state the same reference as their 20 Nov calls (FX-WORDING F2). */
function repeatingCurrencies(): Set<string> {
  const ref = new Map(fx.map((c) => [`${c.made_on}|${c.country_code}`, statedReference(c.claim)]));
  const on21 = fx.filter((c) => c.made_on === '2026-11-21').map((c) => c.country_code);
  return new Set(on21.filter((cc) => ref.get(`2026-11-20|${cc}`) === ref.get(`2026-11-21|${cc}`)));
}

describe('call notes: the lists, re-derived from the 22 Nov 2026 snapshot', () => {
  it('reads the snapshot the wording was computed on', () => {
    expect(snapshot.generated_at).toBe('2026-11-22T17:52:03.866Z');
    expect(fx.every((c) => statedReference(c.claim) !== undefined)).toBe(true);
  });

  it('65 currencies repeated their 20 Nov rate on 21 Nov in the claims; Azerbaijan is not among them', () => {
    const cur = repeatingCurrencies();
    expect(cur.size).toBe(65);
    expect(fx.filter((c) => c.made_on === '2026-11-21')).toHaveLength(65);
    expect(cur.has('AZ')).toBe(false);
  });

  it("Azerbaijan repeated too: the production read shows AZN's 21 Nov rate equal to 20 Nov's, so 66 currencies", () => {
    // AZ calls stopped after 17 Nov, so no claim states an AZN rate after it. The rates come from an
    // owner-approved read-only query of fx_rates on 23 Nov (lead's file FX-21NOV-READ.md); the 22 Nov
    // value is also the source's own published quote that morning.
    expect(AZN_STORED['2026-11-21']).toBe(AZN_STORED['2026-11-20']);
    expect(AZN_STORED['2026-11-22']).not.toBe(AZN_STORED['2026-11-21']);
    expect(fx.filter((c) => c.country_code === 'AZ' && c.made_on > '2026-11-17')).toHaveLength(0);
    expect(new Set([...repeatingCurrencies(), 'AZ']).size).toBe(66);
  });

  it('27 HIT and 39 MISS resolved 21 Nov, every one in those 66 currencies: AZ 6049 is a MISS among them', () => {
    const cur = new Set([...repeatingCurrencies(), 'AZ']);
    const res21 = fx.filter((c) => c.resolves_on === '2026-11-21' && (c.status === 'hit' || c.status === 'miss'));
    expect(res21).toHaveLength(66);
    expect(res21.every((c) => cur.has(c.country_code))).toBe(true);
    const hits = res21.filter((c) => c.status === 'hit');
    const misses = res21.filter((c) => c.status === 'miss');
    expect([hits.length, misses.length]).toEqual([27, 39]);
    expect(misses.find((c) => c.country_code === 'AZ')?.id).toBe('6049');
    expect(sorted(note('fx-2026-11-21-resolved-hit').scope.ids)).toEqual(ids(hits));
    expect(sorted(note('fx-2026-11-21-resolved-miss').scope.ids)).toEqual(ids(misses));
  });

  it("6049's score is the one AZN's rates from 7 to 20 Nov give: the stored evidence is that peak", () => {
    const c = fx.find((x) => x.id === '6049') as SnapshotCall & { evidence_count: number };
    const series = new Map(
      fx.filter((x) => x.country_code === 'AZ').map((x) => [x.made_on, Number(statedReference(x.claim))]),
    );
    for (const [d, v] of Object.entries(AZN_STORED)) series.set(d, v);
    const days = Array.from({ length: 15 }, (_, i) => `2026-11-${String(7 + i).padStart(2, '0')}`);
    expect(days.every((d) => series.has(d))).toBe(true);
    const ref = Number(statedReference(c.claim));
    const peakBp = ((Math.max(...days.map((d) => series.get(d) as number)) - ref) / ref) * 10000;
    expect(Math.abs(peakBp - c.evidence_count)).toBeLessThanOrEqual(1);
  });

  it('65 made 21 Nov, each with the reference its claim states', () => {
    const made = fx.filter((c) => c.made_on === '2026-11-21');
    const n = note('fx-2026-11-21-made');
    expect(sorted(n.scope.ids)).toEqual(ids(made));
    expect(n.text.split(REFERENCE_SLOT)).toHaveLength(2);
    for (const c of made) expect(n.references?.[Number(c.id)], c.id).toBe(statedReference(c.claim));
    expect(Object.keys(n.references ?? {})).toHaveLength(65);
  });

  it('92 ZW calls, 78 resolved (0 hits) and 14 open, every claim naming ZWL', () => {
    const zw = fx.filter((c) => c.country_code === 'ZW');
    expect(zw).toHaveLength(92);
    expect(zw.filter((c) => c.status === 'pending')).toHaveLength(14);
    expect(zw.filter((c) => c.status === 'hit' || c.status === 'miss')).toHaveLength(78);
    expect(zw.filter((c) => c.status === 'hit')).toHaveLength(0);
    expect(zw.every((c) => c.claim.startsWith('ZWL '))).toBe(true);
    expect(sorted(note('fx-zw-zwl-label').scope.ids)).toEqual(ids(zw));
    // No call outside ZW names ZWL.
    expect(fx.filter((c) => c.claim.includes('ZWL') && c.country_code !== 'ZW')).toHaveLength(0);
  });

  it('the ZW note also reaches later ZW currency calls naming ZWL by rule, and no other call', () => {
    const n = note('fx-zw-zwl-label');
    expect(n.scope.rule).toEqual({
      kind: 'fx_devaluation',
      countryCode: 'ZW',
      claimCode: 'ZWL',
      madeAfter: '2026-11-22',
    });
    // Every call on the 22 Nov book was made on or before 22 Nov: the list, not the rule, covers them.
    expect(fx.every((c) => c.made_on <= '2026-11-22')).toBe(true);
    const keys = [n.id];
    const approved: CallNote = { ...n, status: 'approved', issuedOn: '2026-11-23' };
    // Moved to 1 Dec, as if made later, every call on the book: only the 92 ZW currency calls get the note.
    const all = [...snapshot.open, ...snapshot.resolved];
    const reached = all.filter(
      (c) => notesForCall({ ...c, id: 900000 + Number(c.id), made_on: '2026-12-01' }, [approved], keys).length > 0,
    );
    expect(reached).toHaveLength(92);
    expect(reached.every((c) => c.country_code === 'ZW' && c.kind === 'fx_devaluation')).toBe(true);
    // No other note has a rule.
    expect(CALL_NOTES.filter((x) => x.scope.rule).map((x) => x.id)).toEqual(['fx-zw-zwl-label']);
  });

  it('of the 65 Azerbaijan calls, only 6049 carries a note, and only the MISS note', () => {
    const az = new Set(ids(fx.filter((c) => c.country_code === 'AZ')));
    expect(az.size).toBe(65);
    const noted = CALL_NOTES.flatMap((n) => n.scope.ids.filter((id) => az.has(id)).map((id) => [n.id, id]));
    expect(noted).toEqual([['fx-2026-11-21-resolved-miss', 6049]]);
  });
});

describe('call notes: integrity', () => {
  it('four call notes, one /ledger section, one /ledger line, one /methodology section; ids unique', () => {
    expect(CALL_NOTES.map((n) => n.id)).toEqual([
      'fx-2026-11-21-resolved-miss',
      'fx-2026-11-21-resolved-hit',
      'fx-2026-11-21-made',
      'fx-zw-zwl-label',
    ]);
    const all = [
      ...CALL_NOTES.map((n) => n.id),
      ...LEDGER_SECTIONS.map((n) => n.id),
      LEDGER_FX_THRESHOLD_LINE.id,
      ...METHODOLOGY_NOTES.map((n) => n.id),
    ];
    expect(all).toHaveLength(7);
    expect(new Set(all).size).toBe(7);
    for (const n of CALL_NOTES) expect(new Set(n.scope.ids).size, n.id).toBe(n.scope.ids.length);
  });

  it('the cause of 21 Nov is stated, never left open: no text says we do not know whether collector or source missed it', () => {
    const texts = [
      ...CALL_NOTES.map((n) => n.text),
      ...LEDGER_SECTIONS.flatMap((s) => s.paragraphs),
      ...METHODOLOGY_NOTES.flatMap((s) => s.paragraphs),
    ];
    for (const t of texts) expect(t).not.toMatch(/collector or (our )?source|missed the day/);
    const r1c = LEDGER_SECTIONS.find((s) => s.id === 'ledger-fx-2026-11-21')?.paragraphs.join(' ') ?? '';
    expect(
      r1c.split(
        'Our collector ran as usual that morning; every rate our source returned for 21 Nov was identical to its 20 Nov rate.',
      ),
    ).toHaveLength(2);
  });

  it('each text is the note after its opening sentence: no typed date, no placeholder left', () => {
    for (const t of [
      ...CALL_NOTES.map((n) => n.text),
      ...LEDGER_SECTIONS.flatMap((s) => [s.heading, s.kicker ?? '', ...s.paragraphs]),
      ...METHODOLOGY_NOTES.flatMap((s) => [s.heading, ...s.paragraphs]),
    ]) {
      expect(t).toBe(t.trim());
      expect(t).not.toMatch(/Note added|^Added |<date>|<reference_value>|\[|\]|\*\*/);
    }
    for (const n of CALL_NOTES.filter((x) => x.id !== 'fx-2026-11-21-made')) expect(n.text).not.toContain('{');
  });

  it('approval is exactly what the owner pinned', () => {
    const approved = [CALL_NOTES, LEDGER_SECTIONS, [LEDGER_FX_THRESHOLD_LINE], METHODOLOGY_NOTES]
      .flat()
      .filter((n) => n.status === 'approved')
      .map((n) => n.id)
      .sort();
    expect(approved).toEqual([...APPROVED_IDS].sort());
  });

  it('every approved entry carries a real issuedOn, from 23 Nov 2026 and not in the future; a draft carries none', () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const n of [CALL_NOTES, LEDGER_SECTIONS, [LEDGER_FX_THRESHOLD_LINE], METHODOLOGY_NOTES].flat()) {
      if (n.status !== 'approved') {
        expect(n.issuedOn, n.id).toBeUndefined();
        continue;
      }
      expect(isIsoDate(n.issuedOn), n.id).toBe(true);
      expect(n.issuedOn >= '2026-11-23', n.id).toBe(true);
      expect(n.issuedOn <= today, n.id).toBe(true);
    }
    // Every approved entry passes the gate: none is silently dropped as malformed.
    const passed = [
      ...approvedCallNotes().map((n) => n.id),
      ...approvedLedgerSections().map((n) => n.id),
      ...(thresholdLineApproved() ? [LEDGER_FX_THRESHOLD_LINE.id] : []),
      ...approvedMethodologyNotes().map((n) => n.id),
    ].sort();
    expect(passed).toEqual([...APPROVED_IDS].sort());
  });

  it('the runtime key in source agrees with the test pin', () => {
    expect([...APPROVED_NOTE_IDS].sort()).toEqual([...APPROVED_IDS].sort());
    expect(new Set(APPROVED_NOTE_IDS).size).toBe(APPROVED_NOTE_IDS.length);
  });

  it('the type refuses an approved entry without issuedOn', () => {
    // @ts-expect-error status 'approved' requires issuedOn
    const bad: CallNote = { id: 'x', status: 'approved', scope: { ids: [1] }, text: 'x' };
    expect(bad.status).toBe('approved');
  });
});
