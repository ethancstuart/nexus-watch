/**
 * The fixed words of a call note, and the shape of the data that fills them.
 * Every reader-facing string the note display adds is here or in
 * call-notes-data.ts, so the owner signs off one list.
 *
 * A NOTE NEVER CHANGES A VERDICT. It is not a correction: nothing here or in
 * the gate (call-notes.ts) reads or writes call_corrections, a status, a count
 * or a score. A correction says the evidence now disagrees with a published
 * verdict, and /ledger counts it as a call we were wrong about. A note says
 * something a reader should know about a call whose verdict stands.
 *
 * Imports only correction-words.ts, for the shared date format, so a note and a
 * correction added the same day read the same date the same way.
 */
import { formatCorrectionDate, type PageAmendment } from './correction-words.js';

/**
 * A dated amendment to a note's published text: "Amended D Mon YYYY: <text>",
 * the same form as /corrections (correction-words.ts, amendmentLine), so a
 * reader sees that the published words changed, when, and what they first
 * said. The date is rendered from `on`, never typed into the prose.
 */
export type NoteAmendment = PageAmendment;

/**
 * Which calls carry a note: an explicit list of call ids, generated and
 * reviewed, and optionally a rule for calls made after that list was drawn.
 */
export interface CallNoteScope {
  readonly ids: readonly number[];
  readonly rule?: CallNoteRule;
}

/**
 * A call made AFTER `madeAfter` carries the note when it is of `kind`, in
 * `countryCode`, and the first word of its claim is `claimCode` (the currency
 * code the claim names). It reaches no call of another country or kind. Such a
 * note is dated the later of its issuedOn and the call's made_on, so it never
 * reads as added before the call existed. It goes through the same two keys as
 * the note it belongs to: no key per call.
 */
export interface CallNoteRule {
  readonly kind: string;
  readonly countryCode: string;
  readonly claimCode: string;
  /** YYYY-MM-DD. Calls made on or before it are covered by the id list, or not at all. */
  readonly madeAfter: string;
}

interface CallNoteFields {
  /** Stable key. The second approval key (call-notes-approvals.ts) lists it. */
  id: string;
  scope: CallNoteScope;
  /**
   * The note after its opening sentence, "Note added <date>.", which is
   * rendered from issuedOn and never stored. Plain text; escaped wherever it is
   * rendered. May hold REFERENCE_SLOT.
   */
  text: string;
  /** For a text holding REFERENCE_SLOT: the reference figure each call's claim states, by call id. */
  references?: Readonly<Record<number, string>>;
  /** Amendments to this note's published text, oldest first, each appended after the text. */
  amendments?: readonly NoteAmendment[];
}

/** A draft is never shown. An approved note must say when it went live. */
export type CallNote =
  | (CallNoteFields & { status: 'draft'; issuedOn?: string })
  | (CallNoteFields & { status: 'approved'; issuedOn: string });

export type ApprovedCallNote = Extract<CallNote, { status: 'approved' }>;

interface PageNoteFields {
  id: string;
  /** The small capitals line above the heading, where the wording gives one. */
  kicker?: string;
  heading: string;
  /** Plain-text paragraphs, in order. */
  paragraphs: readonly string[];
  /** Amendments to this section's published text, oldest first, each its own last paragraph. */
  amendments?: readonly NoteAmendment[];
}

/** A dated section of a page: /ledger, or /methodology. */
export type PageNote =
  | (PageNoteFields & { status: 'draft'; issuedOn?: string })
  | (PageNoteFields & { status: 'approved'; issuedOn: string });

export type ApprovedPageNote = Extract<PageNote, { status: 'approved' }>;

/** A line whose words are fixed below and whose figures are computed per request. Only its approval is data. */
export type ComputedNote =
  | { id: string; status: 'draft'; issuedOn?: string }
  | { id: string; status: 'approved'; issuedOn: string };

/** What a call carries in the JSON (/api/calls/ledger) when an approved note is on it. Absent otherwise. */
export interface CallNotePayload {
  issued_on: string;
  /** The whole note as a reader sees it: opening sentence, then the text. */
  note: string;
}

/** What /api/method-notes returns for each approved /methodology section. */
export interface MethodNotePayload {
  heading: string;
  added_on: string;
  /** Plain text; the first paragraph opens with "Added <date>.". */
  paragraphs: string[];
}

// ── The fixed words. Each needs the owner's sign-off. ─────────────────────────

/** The label above one note on a call page. */
export const NOTE_LABEL = 'Note';
/** The label above two or more notes on a call page. */
export const NOTES_LABEL = 'Notes';
/** Where a note's text takes the reference figure its call's claim states. */
export const REFERENCE_SLOT = '{reference}';
export const METHODOLOGY_PATH = '/methodology';

/** "Note added 23 Nov 2026." The opening sentence of every call note. */
export function noteAdded(issuedOn: string): string {
  return `Note added ${formatCorrectionDate(issuedOn)}.`;
}

/** "Added 23 Nov 2026." The opening sentence of a /methodology note. */
export function methodNoteAdded(issuedOn: string): string {
  return `Added ${formatCorrectionDate(issuedOn)}.`;
}

/** "NOTE ADDED 23 NOV 2026 · SEE THE CALL PAGE". The share card's one line. */
export function cardNoteLine(issuedOn: string): string {
  return `NOTE ADDED ${formatCorrectionDate(issuedOn).toUpperCase()} · SEE THE CALL PAGE`;
}

/**
 * A skill as /ledger's threshold line prints it: one decimal, a true minus
 * sign, a plus for a positive figure. Whole-percent rounding would print the
 * −3.73% without the group as "-4%" (FX-WORDING §5, 3C).
 */
export function skillOneDecimal(skill: number): string {
  const s = (Math.abs(skill) * 100).toFixed(1);
  if (s === '0.0') return '0.0%';
  return `${skill < 0 ? '−' : '+'}${s}%`;
}

/** The figures of /ledger's threshold line (FX-WORDING R3b), computed per request. */
export interface ThresholdLineFigures {
  calls: number;
  /** Currency codes as the calls' claims name them, sorted. */
  codes: readonly string[];
  hits: number;
  skillWithout: number;
  skillWith: number;
}

/**
 * The words of the threshold line up to its link, plain text. On 22 Nov 2026:
 * "Includes 312 calls in 4 currencies that we priced below their base rate on
 * every resolved call and that hit at most once (ETB, LKR, VES, ZWL); 1 of the
 * 312 hit. Without them, skill is −3.7% (−3.0% with them). How thresholds are
 * set: " — followed by the link METHODOLOGY_PATH and a full stop.
 */
export function thresholdLineLead(f: ThresholdLineFigures): string {
  const k = f.codes.length;
  return (
    `Includes ${f.calls} call${f.calls === 1 ? '' : 's'} in ${k} currenc${k === 1 ? 'y' : 'ies'} ` +
    'that we priced below their base rate on every resolved call and that hit at most once ' +
    `(${f.codes.join(', ')}); ${f.hits} of the ${f.calls} hit. ` +
    `Without them, skill is ${skillOneDecimal(f.skillWithout)} (${skillOneDecimal(f.skillWith)} with them). ` +
    'How thresholds are set: '
  );
}
