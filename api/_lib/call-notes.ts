import { CALL_NOTES, LEDGER_FX_THRESHOLD_LINE, LEDGER_SECTIONS, METHODOLOGY_NOTES } from './call-notes-data.js';
import { APPROVED_NOTE_IDS } from './call-notes-approvals.js';
import { isIsoDate } from './correction-words.js';
import {
  METHODOLOGY_PATH,
  NOTE_LABEL,
  NOTES_LABEL,
  REFERENCE_SLOT,
  cardNoteLine,
  methodNoteAdded,
  noteAdded,
  thresholdLineLead,
  type ApprovedCallNote,
  type ApprovedPageNote,
  type CallNote,
  type CallNotePayload,
  type ComputedNote,
  type MethodNotePayload,
  type PageNote,
} from './call-note-words.js';
import { publishableSkill, resolutionBatches, type ScoredCall } from './calls.js';
import { esc } from './ssr-shell.js';

/**
 * The one gate between the call notes and every page, card and JSON response
 * that could show them. SERVER-ONLY: it imports the drafts.
 *
 * A NOTE LEAVES EVERY VERDICT, COUNT AND SCORE AS IT WAS. Nothing here reads
 * or writes call_corrections, a call's status, or any figure /ledger or the
 * JSON publishes. The only figures it computes are the threshold line's, from
 * rows the caller has already scored, with the same publishableSkill.
 *
 * THE SAFETY PROPERTY, ENFORCED HERE AT RUNTIME. An entry leaves this module
 * only when two keys agree: it is `status: 'approved'` with a real issuedOn
 * and well-formed (call-notes-data.ts), and its id is in APPROVED_NOTE_IDS
 * (call-notes-approvals.ts). These checks run on every request of every
 * deployment, previews included. Anything that disagrees or is malformed is
 * treated as not approved and shown nowhere. A note that needs a call's
 * reference figure and has none for that call is not shown on that call.
 */

/** The approval key kept in source. Parameters below default to it; tests pass their own. */
export type NoteKeys = readonly string[];
const sourceKeys = (): NoteKeys => APPROVED_NOTE_IDS;

type Gated = { id: string; status: string; issuedOn?: string };

function bothKeys(n: Gated, keys: NoteKeys): boolean {
  return n.status === 'approved' && keys.includes(n.id) && isIsoDate(n.issuedOn);
}

const nonEmpty = (s: unknown): s is string => typeof s === 'string' && s.trim() !== '';

function isPublishableCallNote(n: CallNote, keys: NoteKeys): n is ApprovedCallNote {
  return (
    bothKeys(n, keys) &&
    nonEmpty(n.text) &&
    Array.isArray(n.scope?.ids) &&
    n.scope.ids.every((id) => Number.isInteger(id) && id > 0) &&
    (!n.text.includes(REFERENCE_SLOT) || (typeof n.references === 'object' && n.references !== null))
  );
}

function isPublishablePageNote(n: PageNote, keys: NoteKeys): n is ApprovedPageNote {
  return (
    bothKeys(n, keys) &&
    nonEmpty(n.heading) &&
    (n.kicker === undefined || nonEmpty(n.kicker)) &&
    Array.isArray(n.paragraphs) &&
    n.paragraphs.length > 0 &&
    n.paragraphs.every(nonEmpty)
  );
}

/** Call notes approved by both keys and well-formed. Defaults to the repository's data and keys. */
export function approvedCallNotes(
  notes: readonly CallNote[] = CALL_NOTES,
  keys: NoteKeys = sourceKeys(),
): ApprovedCallNote[] {
  return notes.filter((n): n is ApprovedCallNote => isPublishableCallNote(n, keys));
}

/** /ledger sections approved by both keys and well-formed. */
export function approvedLedgerSections(
  sections: readonly PageNote[] = LEDGER_SECTIONS,
  keys: NoteKeys = sourceKeys(),
): ApprovedPageNote[] {
  return sections.filter((n): n is ApprovedPageNote => isPublishablePageNote(n, keys));
}

/** /methodology sections approved by both keys and well-formed. */
export function approvedMethodologyNotes(
  notes: readonly PageNote[] = METHODOLOGY_NOTES,
  keys: NoteKeys = sourceKeys(),
): ApprovedPageNote[] {
  return notes.filter((n): n is ApprovedPageNote => isPublishablePageNote(n, keys));
}

/** Whether /ledger may print the threshold line under its FX row. */
export function thresholdLineApproved(
  line: ComputedNote = LEDGER_FX_THRESHOLD_LINE,
  keys: NoteKeys = sourceKeys(),
): boolean {
  return bothKeys(line, keys);
}

// ── Call notes: /call/:id, the share card, the JSON ──────────────────────────

/** A call as every surface already reads it. The id may arrive as a string: the column is bigint. */
export interface NoteTarget {
  id: number | string;
}

/** One note as a reader sees it, for one call. */
export interface RenderedCallNote {
  id: string;
  issuedOn: string;
  /** The whole note, plain text: "Note added D Mon YYYY." and the text, reference filled. */
  text: string;
}

/**
 * The approved notes on one call, oldest first and in data order within a
 * day. Empty for every call no approved note names.
 */
export function notesForCall(
  call: NoteTarget,
  notes: readonly CallNote[] = CALL_NOTES,
  keys: NoteKeys = sourceKeys(),
): RenderedCallNote[] {
  const id = Number(call.id);
  if (!Number.isInteger(id) || id <= 0) return [];
  const out: RenderedCallNote[] = [];
  for (const n of approvedCallNotes(notes, keys)) {
    if (!n.scope.ids.includes(id)) continue;
    let body = n.text;
    if (body.includes(REFERENCE_SLOT)) {
      const ref = n.references?.[id];
      if (!nonEmpty(ref)) continue; // fail closed: never a note with a hole in it
      body = body.split(REFERENCE_SLOT).join(ref);
    }
    out.push({ id: n.id, issuedOn: n.issuedOn, text: `${noteAdded(n.issuedOn)} ${body}` });
  }
  // Array.prototype.sort is stable, so data order holds within a day.
  return out.sort((a, b) => a.issuedOn.localeCompare(b.issuedOn));
}

/**
 * The block above the grid on /call/:id. Empty string for no notes. Every
 * string is escaped.
 */
export function callNotesBlockHtml(notes: readonly RenderedCallNote[]): string {
  if (notes.length === 0) return '';
  return [
    `<div class="rule"></div><div class="kicker">${esc(notes.length === 1 ? NOTE_LABEL : NOTES_LABEL)}</div>`,
    ...notes.map((n) => `<p class="lede">${esc(n.text)}</p>`),
  ].join('\n');
}

/** The share card's one line, dated by the latest note, or null. Plain text: the card escapes it. */
export function callNotesCardLine(notes: readonly RenderedCallNote[]): string | null {
  if (notes.length === 0) return null;
  const latest = notes.reduce((max, n) => (n.issuedOn > max ? n.issuedOn : max), notes[0].issuedOn);
  return cardNoteLine(latest);
}

/** The `notes` field a call carries in the JSON. The caller omits the field when this is empty. */
export function callNotesPayload(notes: readonly RenderedCallNote[]): CallNotePayload[] {
  return notes.map((n) => ({ issued_on: n.issuedOn, note: n.text }));
}

// ── /ledger ───────────────────────────────────────────────────────────────────

/** The approved /ledger sections, each as rule, kicker, heading and paragraphs. Empty string for none. */
export function ledgerSectionsHtml(sections: readonly ApprovedPageNote[] = approvedLedgerSections()): string {
  return sections
    .map(
      (s) =>
        '<div class="rule"></div>' +
        (s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : '') +
        `<h2>${esc(s.heading)}</h2>` +
        s.paragraphs.map((p) => `<p class="lede">${esc(p)}</p>`).join(''),
    )
    .join('\n');
}

/** A scored row as /ledger's per-kind loop already holds it. */
export interface ThresholdRow {
  country_code: string;
  probability: number;
  base_rate: number | null;
  status: string;
  resolved_at: string | null;
}

export interface ThresholdGroup {
  /** Country codes in the group, sorted. */
  countries: string[];
  calls: number;
  hits: number;
  skillWith: number;
  skillWithout: number;
}

const scoredCall = (r: ThresholdRow): ScoredCall => ({
  probability: r.probability,
  outcome: (r.status === 'hit' ? 1 : 0) as 0 | 1,
  baseRate: r.base_rate ?? undefined,
});

/**
 * THE RULE OF THE THRESHOLD LINE (FX-WORDING R3b), exactly as worded: the
 * currencies we priced below their base rate on EVERY resolved call, and that
 * hit AT MOST ONCE. `rows` is one kind's published scored rows, as /ledger
 * scores them. Both skills are publishableSkill, the gate every published
 * skill goes through, so "with them" is the FX row's own figure. Null when the
 * group is empty, when every row would be in it, or when either skill is not
 * publishable: no line rather than a wrong one.
 */
export function thresholdGroup(rows: readonly ThresholdRow[]): ThresholdGroup | null {
  const byCountry = new Map<string, ThresholdRow[]>();
  for (const r of rows) {
    const arr = byCountry.get(r.country_code);
    if (arr) arr.push(r);
    else byCountry.set(r.country_code, [r]);
  }
  const countries = [...byCountry.entries()]
    .filter(
      ([, rs]) =>
        rs.every(
          (r) =>
            typeof r.base_rate === 'number' &&
            Number.isFinite(r.base_rate) &&
            Number.isFinite(r.probability) &&
            r.probability < r.base_rate,
        ) && rs.filter((r) => r.status === 'hit').length <= 1,
    )
    .map(([cc]) => cc)
    .sort();
  if (countries.length === 0) return null;
  const inGroup = new Set(countries);
  const group = rows.filter((r) => inGroup.has(r.country_code));
  const rest = rows.filter((r) => !inGroup.has(r.country_code));
  if (rest.length === 0) return null;
  const skill = (rs: readonly ThresholdRow[]) =>
    publishableSkill({
      calls: rs.map(scoredCall),
      batches: resolutionBatches(rs.map((r) => (r.resolved_at ?? '').slice(0, 10))),
    });
  const skillWith = skill(rows);
  const skillWithout = skill(rest);
  if (!Number.isFinite(skillWith) || !Number.isFinite(skillWithout)) return null;
  return {
    countries,
    calls: group.length,
    hits: group.filter((r) => r.status === 'hit').length,
    skillWith,
    skillWithout,
  };
}

/**
 * The line under the FX row. `codeOf` gives each country's currency code as
 * its calls' claims name it; a country without one is listed by its country
 * code rather than dropped, so the count and the list always agree.
 */
export function thresholdLineHtml(g: ThresholdGroup, codeOf: ReadonlyMap<string, string>): string {
  const codes = g.countries.map((cc) => codeOf.get(cc) ?? cc).sort();
  const lead = thresholdLineLead({
    calls: g.calls,
    codes,
    hits: g.hits,
    skillWith: g.skillWith,
    skillWithout: g.skillWithout,
  });
  return (
    '<div class="row unscored"><span class="lead">&nbsp;</span>' +
    `<span class="det">${esc(lead)}<a href="${esc(METHODOLOGY_PATH)}">${esc(METHODOLOGY_PATH)}</a>.</span></div>`
  );
}

// ── /methodology (via /api/method-notes) ─────────────────────────────────────

/** What /api/method-notes returns: the approved /methodology sections, in data order. */
export function methodologyPayload(
  notes: readonly ApprovedPageNote[] = approvedMethodologyNotes(),
): MethodNotePayload[] {
  return notes.map((n) => ({
    heading: n.heading,
    added_on: n.issuedOn,
    paragraphs: n.paragraphs.map((p, i) => (i === 0 ? `${methodNoteAdded(n.issuedOn)} ${p}` : p)),
  }));
}
