/**
 * The fixed words of a correction note, and the shape of the data that fills
 * them. Every reader-facing string the correction display adds is here or in
 * corrections-data.ts, so the owner signs off one list.
 *
 * CLIENT-SAFE, AND IT MUST STAY THAT WAY. src/pages/briefs.ts imports this
 * module (check:client-safe-imports holds it to no package imports). It must
 * never import corrections-data.ts: anything the SPA imports is bundled into
 * the public JavaScript, so importing the data would publish every draft note
 * whether or not one is approved. The SPA receives an approved note only from
 * the server's JSON. api/_lib/corrections-boundary.test.ts proves the data
 * module is unreachable from src/.
 */

export type CorrectionClassification = 'false' | 'false-and-misleading' | 'misleading';

interface NoteFields {
  /** The edition's date, YYYY-MM-DD: the brief this note sits beside. */
  date: string;
  /** Which opening sentence the note gets. */
  classification: CorrectionClassification;
  /** The note after its opening sentence. Plain text; escaped wherever it is rendered. */
  text: string;
}

/**
 * A draft is never shown. An approved note must say when it went live, so the
 * type refuses `status: 'approved'` without `correctedOn`.
 */
export type CorrectionNote =
  | (NoteFields & { status: 'draft'; correctedOn?: string })
  | (NoteFields & { status: 'approved'; correctedOn: string });

export type ApprovedCorrectionNote = Extract<CorrectionNote, { status: 'approved' }>;

interface IntroFields {
  title: string;
  /**
   * Plain-text paragraphs, in order. A paragraph may start with a list marker
   * ("- ", or "  - " nested) and then a bold lead-in ("**Lead.**"); nothing
   * else is markup (api/_lib/corrections.ts, pageTextHtml).
   */
  paragraphs: readonly string[];
}

export type CorrectionsPageIntro =
  | (IntroFields & { status: 'draft'; publishedOn?: string })
  | (IntroFields & { status: 'approved'; publishedOn: string });

/** What a reader's browser receives for a corrected brief (/api/v1/brief). */
export interface CorrectionPayload {
  correctedOn: string;
  classification: CorrectionClassification;
  /** The whole note as a reader sees it: opening sentence, then the text. */
  note: string;
}

// ── The fixed words. Each needs the owner's sign-off. ─────────────────────────

/** The label on the block above a corrected brief. */
export const CORRECTION_LABEL = 'Correction';
/** The corrections page's heading when its introduction is not yet approved; its kicker otherwise. */
export const CORRECTIONS_HEADING = 'Corrections';
/** The link from a corrected brief to the corrections page. */
export const ALL_CORRECTIONS_LINK = 'All corrections';
export const CORRECTIONS_PATH = '/corrections';

const CONTAINED: Record<CorrectionClassification, string> = {
  false: 'false statements',
  'false-and-misleading': 'false and misleading statements',
  misleading: 'misleading statements',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A real calendar date written YYYY-MM-DD. 2026-02-30 is not one. */
export function isIsoDate(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/**
 * "2026-12-01" -> "1 Dec 2026", the form the notes already use for edition
 * dates ("On 8 Sep 2026 we wrote…"). Computed from the string's own parts, not
 * a locale or a clock, so it reads the same on every server and browser.
 */
export function formatCorrectionDate(iso: string): string {
  if (!isIsoDate(iso)) throw new Error(`not a date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "Correction added 1 Dec 2026." Also the archive card's marker. */
export function correctionAdded(correctedOn: string): string {
  return `Correction added ${formatCorrectionDate(correctedOn)}.`;
}

/** "Correction added 1 Dec 2026. This edition contained false statements." */
export function openingSentence(correctedOn: string, classification: CorrectionClassification): string {
  return `${correctionAdded(correctedOn)} This edition contained ${CONTAINED[classification]}.`;
}

/** The whole note, plain text: the rendered opening sentence, then the stored text. */
export function fullNote(n: ApprovedCorrectionNote): string {
  return `${openingSentence(n.correctedOn, n.classification)} ${n.text}`;
}
