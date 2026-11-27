import { fonts } from '../../src/styles/email-tokens.js';
import { MIN_RESOLUTION_BATCHES } from './calls.js';
import { COLUMN_TYPES, DATA_PAGE_URL, DOWNLOAD_COLUMNS, SCHEMA_VERSION } from './calls-download.js';
import { CORRECTIONS_PATH } from './correction-words.js';
import { esc } from './ssr-shell.js';

/**
 * The words and markup of /data (api/data.ts): what the two files are, the
 * schema, how a call is scored, the corrections caveat, the licence and the
 * citation. Every reader-facing string on the page is in this file or in
 * DOWNLOAD_COLUMNS / COLUMN_TYPES (api/_lib/calls-download.ts), so the owner
 * signs off one list (lanes12/DOWNLOAD.md).
 *
 * The schema table is RENDERED FROM DOWNLOAD_COLUMNS, the list the files
 * themselves are written from, so the page cannot document a column the files
 * do not have, or in another order.
 *
 * It reads no database. The page explains the files; it does not depend on
 * them, so an outage cannot take the documentation down with the data.
 */

export const DATA_PATH = '/data';
export const CSV_PATH = '/data/calls.csv';
export const JSON_PATH = '/data/calls.json';
export const METHODOLOGY_PATH = '/methodology';

const SNAPSHOTS_URL = 'https://github.com/ethancstuart/nexus-watch/tree/main/ledger-snapshots';
const LICENSE_URL = 'https://github.com/ethancstuart/nexus-watch/blob/main/LICENSE';

/** Shorter than the files': the page changes only on deploy. */
export const DATA_PAGE_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600';

export const DATA_PAGE_TITLE = 'The data — every NexusWatch call, as CSV and JSON';
export const DATA_PAGE_DESCRIPTION =
  'Every dated call NexusWatch has made, open and resolved, as one CSV or JSON file with a documented schema: ' +
  'the claim, the probability we stated, the verdict as published, and any correction or note since.';

/**
 * The licence line. The repository's LICENSE is the MIT License (copyright
 * 2026 Ethan Stuart), written for "the Software"; whether the owner wants it,
 * or a data licence, to govern this file is his decision (lanes12/DOWNLOAD.md).
 * Set to null to leave the line off the page.
 */
export const LICENCE_HTML: string | null =
  `Licence: the <a href="${LICENSE_URL}">MIT License</a>, the licence of the NexusWatch repository.`;

/** The citation as printed on the page, with the date left for the reader. */
export const CITATION_TEMPLATE = `NexusWatch forecast ledger, retrieved <date>, ${DATA_PAGE_URL}`;

export const DATA_PAGE_CSS =
  '  .schema-wrap { overflow-x:auto; margin:24px 0 0; }\n' +
  '  table.schema { border-collapse:collapse; width:100%; min-width:560px; font-size:14px; line-height:1.5; }\n' +
  `  table.schema th { font-family:${fonts.mono}; font-size:11px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--ink3); text-align:left; padding:8px 16px 8px 0; border-bottom:2px solid var(--rule); }\n` +
  '  table.schema td { vertical-align:top; text-align:left; padding:10px 16px 10px 0; border-bottom:1px solid var(--rule); color:var(--ink2); }\n' +
  `  table.schema td.col, table.schema td.type { font-family:${fonts.mono}; white-space:nowrap; }\n` +
  '  table.schema td.col { color:var(--ink); }\n' +
  `  .cite { font-family:${fonts.mono}; font-size:15px; color:var(--ink); background:var(--card); border:1px solid var(--rule); padding:14px 16px; margin:16px 0 0; overflow-wrap:anywhere; }\n` +
  `  .lede code { font-family:${fonts.mono}; font-size:.9em; color:var(--ink); }\n`;

const section = (kicker: string, heading: string) =>
  `<div class="rule"></div><div class="kicker">${esc(kicker)}</div><h2>${esc(heading)}</h2>`;

function schemaTableHtml(): string {
  const rows = DOWNLOAD_COLUMNS.map(
    (c) => `<tr><td class="col">${esc(c.name)}</td><td class="type">${esc(c.type)}</td><td>${esc(c.meaning)}</td></tr>`,
  );
  return (
    '<div class="schema-wrap"><table class="schema">' +
    '<thead><tr><th scope="col">Column</th><th scope="col">Type</th><th scope="col">What it holds</th></tr></thead>' +
    `<tbody>${rows.join('')}</tbody></table></div>`
  );
}

function typesHtml(): string {
  return (
    '<p class="lede">' + COLUMN_TYPES.map((t) => `<strong>${esc(t.type)}</strong>: ${esc(t.form)}`).join(' ') + '</p>'
  );
}

export interface DataPageOptions {
  /** Whether /corrections is live (it answers 404 until a note is approved). */
  correctionsPageLive: boolean;
}

/** The page body, for ssr-shell. */
export function renderDataPageBody(opts: DataPageOptions): string {
  const parts: string[] = [];

  parts.push('<div class="rule"></div><div class="kicker">The data</div>');
  parts.push('<h1>Every call we have made, in one file.</h1>');
  parts.push(
    '<p class="lede">One row per call, open and resolved: the claim, the probability we stated, the source that ' +
      'decides it, the verdict as we published it, and any correction or note recorded since. Use it to check our ' +
      'scores, or to score the record yourself.</p>',
  );

  parts.push(section('The files', 'Two formats, the same rows'));
  parts.push(
    `<p class="lede"><a href="${CSV_PATH}">calls.csv</a>: comma-separated, UTF-8, a header row first, fields ` +
      'quoted as RFC 4180 specifies.</p>',
  );
  parts.push(
    `<p class="lede"><a href="${JSON_PATH}">calls.json</a>: the same rows in the same order, after a ` +
      '<code>meta</code> block that gives the schema version, when the file was generated, the row count and a ' +
      'citation line. <code>columns</code> names the fields, and each entry in <code>rows</code> is one call, its ' +
      'values in that order.</p>',
  );
  parts.push(
    '<p class="lede">Rows are ordered by call number, oldest first. An empty field in the CSV, or null in the ' +
      'JSON, means no value. The files hold no personal data: every call is about a country or a region.</p>',
  );
  parts.push(
    '<p class="lede">Both files are built from our calls table when you request them, and may be up to an hour ' +
      'old. New calls are recorded at 09:30 UTC each day and calls that have come due are resolved at 09:45 UTC, ' +
      'so on most days the files change once, shortly after that. They show the book as it stands now; for the ' +
      `book as it stood on an earlier day, use the daily snapshots in <a href="${SNAPSHOTS_URL}">ledger-snapshots/</a>, ` +
      'which carry GitHub’s timestamps.</p>',
  );

  parts.push(section(`Schema version ${SCHEMA_VERSION}`, 'What each column holds'));
  parts.push(schemaTableHtml());
  parts.push(typesHtml());
  parts.push(
    '<p class="lede">The column order is fixed. If a column is added, removed, renamed or moved, or what one ' +
      'holds changes, the schema version goes up and this page says what changed.</p>',
  );

  parts.push(section('How a call is scored', 'Hit or miss, decided by someone else'));
  parts.push(
    '<p class="lede">Each call names an external source, a threshold and a resolution date before the outcome is ' +
      'known. When its window closes, the source decides it: a <strong>hit</strong> if the threshold was met, a ' +
      '<strong>miss</strong> if not. A call is <strong>void</strong> if our own criterion was unsound, and ' +
      '<strong>unresolvable</strong> if the source did not observe enough to judge either way. Both stay in the ' +
      'file, and neither is ever scored.</p>',
  );
  parts.push(
    '<p class="lede">The ledger scores hits and misses with the Brier score: the mean of (probability − ' +
      'outcome)², where the outcome is 1 for a hit and 0 for a miss. It scores each kind separately, never pooled, ' +
      `and withholds skill against the base rate until a kind has resolved in at least ${MIN_RESOLUTION_BATCHES} ` +
      'independent batches. Seismicity calls are a calibration harness and are left out of the headline counts. ' +
      'The full method, including how much evidence a call needs before it can be scored a miss, is on ' +
      `<a href="${METHODOLOGY_PATH}">${METHODOLOGY_PATH}</a>.</p>`,
  );

  parts.push(section('Corrections and notes', 'What we published stays as published'));
  parts.push(
    '<p class="lede">The <code>status</code> column is the verdict as we published it, and we do not change it. ' +
      'When later evidence shows a published verdict was wrong, we record a correction beside the call: ' +
      '<code>has_correction</code> is true, <code>correction_status</code> gives the verdict the evidence ' +
      'supports, and <code>correction_issued_on</code> the day we issued it. A note is different: it records ' +
      'something a reader should know about a call, such as a day without new exchange rates, and changes no ' +
      'verdict. Each call’s own page carries the correction’s evidence or the note’s full text.</p>',
  );
  parts.push(
    '<p class="lede">The ledger’s published scores count every call as it was published, and print the reading on ' +
      'corrected evidence beside them.' +
      (opts.correctionsPageLive
        ? ' Corrections to what our daily brief said, rather than to the calls, are listed on ' +
          `<a href="${CORRECTIONS_PATH}">${CORRECTIONS_PATH}</a>.`
        : '') +
      '</p>',
  );

  parts.push(section('Using the data', 'Licence and citation'));
  if (LICENCE_HTML) parts.push(`<p class="lede">${LICENCE_HTML}</p>`);
  parts.push('<p class="lede">Cite it as:</p>');
  parts.push(`<p class="cite">${esc(CITATION_TEMPLATE)}</p>`);
  parts.push(
    '<p class="lede">with the date you downloaded the file. calls.json carries this line in its <code>meta</code> ' +
      'block, with the date it was generated filled in.</p>',
  );

  return parts.join('\n');
}
