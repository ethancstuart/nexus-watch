import { standingCorrection } from './call-correction.js';
import { notesForCall, type NoteTarget, type RenderedCallNote } from './call-notes.js';

/**
 * THE DOWNLOAD OF EVERY CALL: /data/calls.csv and /data/calls.json, and the
 * schema /data documents. SERVER-ONLY: it reads the notes gate.
 *
 * ONE COLUMN LIST, READ BY ALL THREE. The CSV header, the JSON `columns` and
 * the schema table on /data all come from DOWNLOAD_COLUMNS, so the files and
 * the page that documents them cannot disagree about a column's name, order
 * or meaning. The order is pinned by a test (calls-download.test.ts): moving,
 * renaming, adding or removing a column, or changing what one holds, is a new
 * SCHEMA_VERSION, and /data says so.
 *
 * THE PUBLISHED VERDICT IS NEVER REWRITTEN HERE EITHER. `status` is the calls
 * row's status exactly. A correction rides beside it, by the call page's own
 * rule (standingCorrection, api/_lib/call-correction.ts), and a note by the
 * notes gate (notesForCall, api/_lib/call-notes.ts), so a row in the file says
 * what /call/:id says about the same call.
 *
 * The rows are the WHOLE table, ordered by id: no page, no LIMIT, no filter by
 * kind or status. Calibration-harness calls are included and labelled by
 * `kind`, as /call/:id shows them.
 */

/** Bumped whenever a column is added, removed, renamed or reordered, or what one holds changes. */
export const SCHEMA_VERSION = 1;

export const DATA_PAGE_URL = 'https://nexuswatch.dev/data';

/** Shared by both files. About an hour at the edge, as the brief asked: the rows change once a day. */
export const DOWNLOAD_CACHE_CONTROL = 'public, max-age=300, s-maxage=3600';

/** The citation line, with the date the reader retrieved the file (YYYY-MM-DD). */
export function citationLine(retrievedOn: string): string {
  return `NexusWatch forecast ledger, retrieved ${retrievedOn}, ${DATA_PAGE_URL}`;
}

/** One call, as both files carry it. Field order here is irrelevant; DOWNLOAD_COLUMNS orders them. */
export interface DownloadRecord {
  id: number;
  kind: string;
  country_code: string;
  claim: string;
  probability: number | null;
  base_rate: number | null;
  made_on: string;
  resolves_on: string;
  status: string;
  resolved_at: string | null;
  void_reason: string | null;
  resolver: string;
  threshold: number | null;
  threshold_pct: number | null;
  reference_value: number | null;
  evidence_count: number | null;
  has_correction: boolean;
  correction_status: string | null;
  correction_issued_on: string | null;
  has_note: boolean;
  note_added_on: string | null;
}

export type ColumnType = 'integer' | 'decimal' | 'text' | 'date' | 'timestamp' | 'boolean';

export interface DownloadColumn {
  name: keyof DownloadRecord;
  type: ColumnType;
  /** Reader-facing. Rendered on /data. */
  meaning: string;
}

/** What each type looks like in the files. Reader-facing. Rendered on /data. */
export const COLUMN_TYPES: ReadonlyArray<{ type: ColumnType; form: string }> = [
  { type: 'integer', form: 'A whole number.' },
  { type: 'decimal', form: 'A number, with a full stop as the decimal point.' },
  { type: 'text', form: 'Plain text.' },
  { type: 'date', form: 'YYYY-MM-DD.' },
  { type: 'timestamp', form: 'YYYY-MM-DDTHH:MM:SSZ, in UTC, to the second.' },
  { type: 'boolean', form: 'true or false.' },
];

/**
 * THE SCHEMA, IN FILE ORDER. Reader-facing: every `meaning` is rendered on
 * /data, and needs the owner's sign-off.
 */
export const DOWNLOAD_COLUMNS: readonly DownloadColumn[] = [
  {
    name: 'id',
    type: 'integer',
    meaning: 'The call’s number. The call’s own page is nexuswatch.dev/call/ followed by this number.',
  },
  {
    name: 'kind',
    type: 'text',
    meaning:
      'What decides the call: censorship_event (OONI network-interference measurements), fx_devaluation ' +
      '(daily exchange rates against the US dollar) or seismicity_window (USGS earthquake counts, a ' +
      'calibration harness left out of the ledger’s headline counts).',
  },
  {
    name: 'country_code',
    type: 'text',
    meaning:
      'The two-letter country code for censorship and currency calls; a region name, such as MEXICO, for seismicity calls.',
  },
  { name: 'claim', type: 'text', meaning: 'The claim, worded as it was published when the call was made.' },
  {
    name: 'probability',
    type: 'decimal',
    meaning: 'The probability we stated that the claim would come true, from 0 to 1, fixed when the call was made.',
  },
  {
    name: 'base_rate',
    type: 'decimal',
    meaning:
      'How often the event happened anyway, from 0 to 1, from that country’s or region’s own history when the ' +
      'call was made. Skill is measured against it. Empty where none was stored.',
  },
  { name: 'made_on', type: 'date', meaning: 'The day the call was made.' },
  {
    name: 'resolves_on',
    type: 'date',
    meaning: 'The last day of the call’s window. The call is resolved on or after this day.',
  },
  {
    name: 'status',
    type: 'text',
    meaning:
      'The verdict as we published it, never rewritten: pending (not yet resolved), hit (published as having ' +
      'come true), miss (published as not having come true), void (withdrawn because our own criterion was ' +
      'unsound) or unresolvable (the source did not observe enough to judge either way). Only hit and miss are ' +
      'scored. Where has_correction is true, later evidence supports correction_status instead.',
  },
  { name: 'resolved_at', type: 'timestamp', meaning: 'When the call was settled. Empty while it is pending.' },
  { name: 'void_reason', type: 'text', meaning: 'Why a void or unresolvable call was not scored. Empty otherwise.' },
  { name: 'resolver', type: 'text', meaning: 'The external source that decides the call, named when it was made.' },
  {
    name: 'threshold',
    type: 'integer',
    meaning:
      'For censorship and seismicity calls, the count evidence_count must reach for a hit, in the same units ' +
      '(days with a confirmed block; qualifying earthquakes). Currency calls store 1 here and use threshold_pct.',
  },
  {
    name: 'threshold_pct',
    type: 'decimal',
    meaning:
      'For currency calls, how far the currency must fall against the US dollar, in percent, at any point in ' +
      'the window, for a hit. Empty for other kinds.',
  },
  {
    name: 'reference_value',
    type: 'decimal',
    meaning:
      'For currency calls, the exchange rate, in units of the currency per US dollar, that the fall is measured ' +
      'from. Empty for other kinds.',
  },
  {
    name: 'evidence_count',
    type: 'integer',
    meaning:
      'What the resolver recorded when it settled the call, in units that depend on kind: days with a confirmed ' +
      'block for censorship calls; the largest fall in the window for currency calls, in basis points rounded to ' +
      'the nearest whole one (112 means 1.12%); qualifying earthquakes for seismicity calls. It is the reading the ' +
      'published status was decided on and is never updated: where has_correction is true it is the reading the ' +
      'correction overturned, and the corrected evidence is on the call’s own page. A currency call was decided ' +
      'on the unrounded fall, so one whose evidence_count equals its threshold_pct in basis points can be a miss. ' +
      'Empty while the call is pending, and for unresolvable calls.',
  },
  {
    name: 'has_correction',
    type: 'boolean',
    meaning:
      'true when a correction issued after publication says the evidence supports the other verdict: a ' +
      'published miss the evidence records as a hit, or the reverse. status still shows the published verdict.',
  },
  {
    name: 'correction_status',
    type: 'text',
    meaning: 'Where has_correction is true, the verdict the evidence supports. Empty otherwise.',
  },
  {
    name: 'correction_issued_on',
    type: 'date',
    meaning: 'Where has_correction is true, the day the correction was issued. Empty otherwise.',
  },
  {
    name: 'has_note',
    type: 'boolean',
    meaning:
      'true when a dated note sits on the call. A note records something a reader should know, such as a day ' +
      'without new exchange rates, and changes no verdict.',
  },
  {
    name: 'note_added_on',
    type: 'date',
    meaning: 'Where has_note is true, the date of the most recent note. Empty otherwise.',
  },
];

export const COLUMN_NAMES: readonly string[] = DOWNLOAD_COLUMNS.map((c) => c.name);

/** A calls row as the download query returns it. `id` may arrive as a string: the column is bigint. */
export interface DownloadSourceRow {
  id: number | string;
  kind: string;
  country_code: string;
  claim: string;
  probability: number | string | null;
  base_rate: number | string | null;
  made_on: string;
  resolves_on: string;
  status: string;
  resolved_at: string | null;
  void_reason: string | null;
  resolver: string;
  threshold: number | string | null;
  threshold_pct: number | string | null;
  reference_value: number | string | null;
  evidence_count: number | string | null;
}

/** A call_corrections row as the download query returns it. */
export interface CorrectionSourceRow {
  id: number | string;
  call_id: number | string;
  issued_on: string;
  corrected_status: string;
}

/**
 * A finite number, or null. Both files print the same value: JSON would turn a
 * NaN into null while the CSV printed "NaN", so it is null here, before either.
 */
function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Newest first, by the call page's order (`issued_on DESC, id DESC`), whatever order the rows arrived in. */
function newestFirst(rows: CorrectionSourceRow[]): CorrectionSourceRow[] {
  return [...rows].sort((a, b) =>
    a.issued_on !== b.issued_on ? b.issued_on.localeCompare(a.issued_on) : Number(b.id) - Number(a.id),
  );
}

/**
 * Every call as both files carry it, ordered by id. `notesOf` defaults to the
 * notes gate; tests pass their own.
 */
export function buildDownloadRecords(
  calls: readonly DownloadSourceRow[],
  corrections: readonly CorrectionSourceRow[],
  notesOf: (call: NoteTarget) => RenderedCallNote[] = (call) => notesForCall(call),
): DownloadRecord[] {
  const byCall = new Map<number, CorrectionSourceRow[]>();
  for (const c of corrections) {
    const key = Number(c.call_id);
    const list = byCall.get(key);
    if (list) list.push(c);
    else byCall.set(key, [c]);
  }

  return [...calls]
    .sort((a, b) => Number(a.id) - Number(b.id))
    .map((c) => {
      const id = Number(c.id);
      const standing = standingCorrection(c.status, newestFirst(byCall.get(id) ?? []));
      const notes = notesOf(c);
      const latestNote = notes.reduce<string | null>(
        (max, n) => (max === null || n.issuedOn > max ? n.issuedOn : max),
        null,
      );
      return {
        id,
        kind: c.kind,
        country_code: c.country_code,
        claim: c.claim,
        probability: num(c.probability),
        base_rate: num(c.base_rate),
        made_on: c.made_on,
        resolves_on: c.resolves_on,
        status: c.status,
        resolved_at: c.resolved_at ?? null,
        void_reason: c.void_reason ?? null,
        resolver: c.resolver,
        threshold: num(c.threshold),
        threshold_pct: num(c.threshold_pct),
        reference_value: num(c.reference_value),
        evidence_count: num(c.evidence_count),
        has_correction: standing !== null,
        correction_status: standing?.corrected_status ?? null,
        correction_issued_on: standing?.issued_on ?? null,
        has_note: notes.length > 0,
        note_added_on: latestNote,
      };
    });
}

type Cell = string | number | boolean | null;

/** One record's values, in DOWNLOAD_COLUMNS order. */
export function cellsOf(r: DownloadRecord): Cell[] {
  return DOWNLOAD_COLUMNS.map((c) => r[c.name]);
}

/**
 * One CSV field, RFC 4180: quoted when it holds a comma, a double quote, a CR
 * or an LF, with each double quote doubled. Also quoted when it has leading or
 * trailing space, which some readers would otherwise trim, and when it is an
 * empty string, so an empty text stays distinguishable from no value (null,
 * written as nothing at all).
 */
export function csvField(v: Cell): string {
  if (v === null) return '';
  const s = String(v);
  if (s === '' || /[",\r\n]/.test(s) || s !== s.trim()) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const CRLF = '\r\n';

/** The whole CSV: the header row, then one row per call, every line ending CRLF (RFC 4180). */
export function toCsv(records: readonly DownloadRecord[]): string {
  const lines = [COLUMN_NAMES.map(csvField).join(',')];
  for (const r of records) lines.push(cellsOf(r).map(csvField).join(','));
  return lines.join(CRLF) + CRLF;
}

/** The metadata block at the head of calls.json. */
export interface DownloadMeta {
  schema_version: number;
  generated_at: string;
  row_count: number;
  citation: string;
  documentation: string;
}

export function downloadMeta(rowCount: number, generatedAt: Date): DownloadMeta {
  const iso = generatedAt.toISOString();
  return {
    schema_version: SCHEMA_VERSION,
    generated_at: iso,
    row_count: rowCount,
    citation: citationLine(iso.slice(0, 10)),
    documentation: DATA_PAGE_URL,
  };
}

/**
 * The whole JSON: `meta`, then `columns`, then `rows`, each row an array in
 * `columns` order, one row per line.
 *
 * ARRAYS, NOT OBJECTS, FOR SIZE. A Vercel Function response is limited to
 * 4.5 MB (as remembered; not re-checked, see api/sitemap.ts). Measured on
 * ledger-snapshots/2026-11-22.json (6,481 calls), rows as objects were about
 * 513 bytes each, a ceiling of about 8,800 calls: about five weeks of growth
 * at 65 calls a day. As arrays they are about the size of the CSV row. One
 * row per line keeps the file readable and greppable for one byte a row.
 */
export function toJson(records: readonly DownloadRecord[], generatedAt: Date): string {
  const head = JSON.stringify({ meta: downloadMeta(records.length, generatedAt), columns: COLUMN_NAMES });
  const rows = records.map((r) => JSON.stringify(cellsOf(r)));
  // `head` ends with "]}": reopen the object to append `rows`.
  return `${head.slice(0, -1)},\n"rows":[\n${rows.join(',\n')}\n]}\n`;
}
