import { CORRECTION_NOTES, CORRECTIONS_PAGE_INTRO } from './corrections-data.js';
import {
  ALL_CORRECTIONS_LINK,
  CORRECTION_LABEL,
  CORRECTIONS_HEADING,
  CORRECTIONS_PATH,
  formatCorrectionDate,
  fullNote,
  isIsoDate,
  type ApprovedCorrectionNote,
  type CorrectionNote,
  type CorrectionPayload,
  type CorrectionsPageIntro,
} from './correction-words.js';
import { esc } from './ssr-shell.js';

/**
 * The one gate between the correction notes and every page, feed and JSON
 * response that could show them. SERVER-ONLY: it imports the drafts.
 *
 * THE RULE IS ANNOTATE, NEVER REWRITE. A note is rendered BESIDE the brief it
 * corrects; nothing here touches the brief's own text.
 *
 * THE SAFETY PROPERTY. Only an entry whose status is 'approved' leaves this
 * module, so merging the data publishes nothing until the owner approves each
 * note. The gate fails closed: an approved entry with a malformed date,
 * correctedOn, classification or empty text is treated as not approved rather
 * than rendered with a guess. corrections-data.test.ts makes such an entry
 * fail CI as well, so it cannot sit there silently.
 */

const CLASSIFICATIONS = new Set(['false', 'false-and-misleading', 'misleading']);

function isPublishable(n: CorrectionNote): n is ApprovedCorrectionNote {
  return (
    n.status === 'approved' &&
    isIsoDate(n.date) &&
    isIsoDate(n.correctedOn) &&
    CLASSIFICATIONS.has(n.classification) &&
    typeof n.text === 'string' &&
    n.text.trim() !== ''
  );
}

/** Approved, well-formed notes only. Defaults to the repository's data. */
export function approvedNotes(notes: readonly CorrectionNote[] = CORRECTION_NOTES): ApprovedCorrectionNote[] {
  return notes.filter(isPublishable);
}

/** The approved note for one edition date, or null. */
export function approvedNoteFor(
  date: string,
  notes: readonly CorrectionNote[] = CORRECTION_NOTES,
): ApprovedCorrectionNote | null {
  return approvedNotes(notes).find((n) => n.date === date) ?? null;
}

/**
 * Newest first: the most recently added correction at the top, and among
 * notes added the same day, the latest edition first.
 */
export function correctionsNewestFirst(notes: readonly CorrectionNote[] = CORRECTION_NOTES): ApprovedCorrectionNote[] {
  return [...approvedNotes(notes)].sort((a, b) =>
    a.correctedOn !== b.correctedOn ? b.correctedOn.localeCompare(a.correctedOn) : b.date.localeCompare(a.date),
  );
}

/** The page introduction when approved and well-formed, else null. */
export function approvedIntro(
  intro: CorrectionsPageIntro = CORRECTIONS_PAGE_INTRO,
): Extract<CorrectionsPageIntro, { status: 'approved' }> | null {
  if (intro.status !== 'approved' || !isIsoDate(intro.publishedOn) || intro.title.trim() === '') return null;
  return intro;
}

/**
 * A brief's date as the database driver hands it over, normalised to
 * YYYY-MM-DD for the lookup above. `@neondatabase/serverless` returns a `date`
 * column as a JS Date at LOCAL midnight unless the query casts it to text, so
 * a Date is read through its local parts, never toISOString() (see the same
 * rule in api/sitemap.ts). Anything unreadable yields '' and so matches no note.
 */
export function briefDateKey(v: unknown): string {
  if (typeof v === 'string') return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '';
  if (v instanceof Date && !Number.isNaN(v.getTime())) {
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return `${v.getFullYear()}-${m}-${d}`;
  }
  return '';
}

/** The JSON a corrected brief carries on /api/v1/brief. Absent for every other brief. */
export function correctionPayload(n: ApprovedCorrectionNote): CorrectionPayload {
  return { correctedOn: n.correctedOn, classification: n.classification, note: fullNote(n) };
}

/**
 * The block above a corrected brief on /brief/:date (api/brief/og.ts). Every
 * string is escaped; the class names are styled by CORRECTION_BLOCK_CSS, which
 * that page emits only when it renders a block.
 */
export function correctionBlockHtml(n: ApprovedCorrectionNote): string {
  return (
    `<aside class="correction" aria-label="${esc(CORRECTION_LABEL)}">` +
    `<div class="kicker">${esc(CORRECTION_LABEL)}</div>` +
    `<p>${esc(fullNote(n))}</p>` +
    `<p class="correction-more"><a href="${esc(CORRECTIONS_PATH)}">${esc(ALL_CORRECTIONS_LINK)}</a></p>` +
    `</aside>`
  );
}

/** Static CSS for the block, in the brief page's own palette. No interpolation. */
export const CORRECTION_BLOCK_CSS =
  '    .correction { margin: 0 0 40px; padding: 18px 22px; background: #f2efe6; border: 1px solid #c9c3b4; border-left: 3px solid #9a1b1b; }\n' +
  '    .correction p { font-size: 15px; line-height: 1.6; color: #12161c; margin: 0 0 16px 0; }\n' +
  '    .correction .correction-more { margin: 0; }\n';

type ApprovedIntro = Extract<CorrectionsPageIntro, { status: 'approved' }>;

/**
 * The /corrections page body, title and description. The caller returns 404
 * instead when `notes` is empty, so the page does not exist publicly until a
 * note is approved. Without an approved introduction it carries only the
 * heading and the notes: no draft words. Each note links to its brief; the
 * link text is the brief page's own kicker.
 */
export function renderCorrectionsPage(
  notes: readonly ApprovedCorrectionNote[],
  intro: ApprovedIntro | null,
): { body: string; title: string; description: string } {
  const parts: string[] = ['<div class="rule"></div>'];
  if (intro) {
    const latest = notes.reduce((max, n) => (n.correctedOn > max ? n.correctedOn : max), intro.publishedOn);
    parts.push(
      `<div class="kicker">${esc(CORRECTIONS_HEADING)}</div><h1>${esc(intro.title)}</h1>` +
        `<p class="lede dated">Published ${esc(formatCorrectionDate(intro.publishedOn))}.` +
        (latest > intro.publishedOn ? ` Updated ${esc(formatCorrectionDate(latest))}.` : '') +
        '</p>',
    );
    for (const p of intro.paragraphs) parts.push(`<p class="lede">${esc(p)}</p>`);
  } else {
    parts.push(`<h1>${esc(CORRECTIONS_HEADING)}</h1>`);
  }
  for (const n of notes) {
    const href = `/brief/${n.date}`;
    parts.push(
      `<section class="corr" id="brief-${esc(n.date)}">` +
        `<div class="kicker"><a href="${esc(href)}">Situation Brief · ${esc(n.date)}</a></div>` +
        `<p class="lede">${esc(fullNote(n))}</p>` +
        '</section>',
    );
  }
  return {
    body: parts.join('\n'),
    title: intro ? intro.title : CORRECTIONS_HEADING,
    description: intro ? (intro.paragraphs[0] ?? intro.title) : CORRECTIONS_HEADING,
  };
}

/** Static CSS for the corrections page, on the register palette the shell defines. No interpolation. */
export const CORRECTIONS_PAGE_CSS =
  '  .corr { margin:40px 0 0; padding-top:20px; border-top:1px solid var(--rule); }\n' +
  '  .corr .kicker a { color:var(--accent); text-decoration:none; }\n' +
  '  .corr .kicker a:hover { text-decoration:underline; }\n' +
  '  .corr .lede { margin-top:8px; }\n' +
  '  .dated { font-size:14px; color:var(--ink3); }\n';
