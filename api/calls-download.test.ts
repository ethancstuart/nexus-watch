import { describe, it, expect, vi, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildDownloadRecords,
  citationLine,
  csvField,
  toCsv,
  toJson,
  COLUMN_NAMES,
  DOWNLOAD_CACHE_CONTROL,
  DOWNLOAD_COLUMNS,
  SCHEMA_VERSION,
  type CorrectionSourceRow,
  type DownloadSourceRow,
} from './_lib/calls-download.js';
import { notesForCall } from './_lib/call-notes.js';
import { standingCorrection } from './_lib/call-correction.js';
import { ALL_CALLS, CALL_BY_ID, callPageRow, fakeRes } from './_lib/snapshot-sql-fixture.js';

/**
 * /data/calls.csv AND /data/calls.json: every call, the same rows in the same
 * order, under a pinned header.
 *
 * The database is replaced by `fakeSql` below; everything else is real,
 * including the notes gate and the correction rule. Two books: synthetic rows
 * that carry every status and every quoting hazard, and the public book of
 * ledger-snapshots/2026-11-22.json (6,481 calls, 54 corrections) through
 * api/_lib/snapshot-sql-fixture.ts.
 */

const h = vi.hoisted(() => ({
  calls: [] as unknown[],
  corrections: [] as unknown[],
  fail: false,
  queries: [] as string[],
}));

vi.mock('@neondatabase/serverless', () => ({
  neon: () => (strings: TemplateStringsArray) => {
    const q = strings.join('?').replace(/\s+/g, ' ');
    h.queries.push(q);
    if (h.fail) return Promise.reject(new Error('synthetic outage'));
    if (q.includes('FROM call_corrections')) return Promise.resolve(h.corrections);
    if (q.includes('FROM calls')) return Promise.resolve(h.calls);
    return Promise.reject(new Error(`unrecognised query: ${q.slice(0, 120)}`));
  },
}));

const { default: download, SIZE_WARNING_BYTES } = await import('./calls/download.js');
const { default: dataPage } = await import('./data.js');

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

type Res = ReturnType<typeof fakeRes>;
async function get(format: unknown, method = 'GET'): Promise<Res['state']> {
  const res = fakeRes();
  await download({ method, query: format === undefined ? {} : { format } } as never, res as never);
  return res.state;
}

// ── An independent RFC 4180 reader ───────────────────────────────────────────
//
// Written here rather than imported, so the writer is checked against a reader
// it does not share code with. Strict: a quote inside an unquoted field, a bare
// CR or LF outside quotes, or an unterminated quote throws. An unquoted empty
// field is null; a quoted one ("") is the empty string.
function parseCsv(text: string): (string | null)[][] {
  const rows: (string | null)[][] = [];
  let row: (string | null)[] = [];
  let field = '';
  let quoted = false;
  let inQuotes = false;
  const endField = () => {
    row.push(field === '' && !quoted ? null : field);
    field = '';
    quoted = false;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch !== '"') field += ch;
      else if (text[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        inQuotes = false;
        const next = text[i + 1];
        if (next !== undefined && next !== ',' && next !== '\r') throw new Error(`text after a closing quote at ${i}`);
      }
      continue;
    }
    if (ch === '"') {
      if (field !== '') throw new Error(`quote inside an unquoted field at ${i}`);
      inQuotes = true;
      quoted = true;
    } else if (ch === ',') endField();
    else if (ch === '\r' && text[i + 1] === '\n') {
      endField();
      rows.push(row);
      row = [];
      i++;
    } else if (ch === '\r' || ch === '\n') throw new Error(`bare line break outside quotes at ${i}`);
    else field += ch;
  }
  if (inQuotes) throw new Error('unterminated quote');
  if (field !== '' || quoted || row.length > 0) {
    endField();
    rows.push(row);
  }
  return rows;
}

/** A JSON cell as the CSV must print it. */
const asCsvCell = (v: unknown): string | null => (v === null ? null : String(v));

interface JsonFile {
  meta: { schema_version: number; generated_at: string; row_count: number; citation: string; documentation: string };
  columns: string[];
  rows: unknown[][];
}

// ── Synthetic book: every status, every quoting hazard ───────────────────────

const FX = {
  kind: 'fx_devaluation',
  country_code: 'XX',
  probability: 0.25,
  base_rate: 0.26,
  made_on: '2026-10-01',
  resolves_on: '2026-10-15',
  resolver: 'fx_rates (daily USD reference rates)',
  threshold: 1,
  threshold_pct: 1.17,
  reference_value: 4.08,
};
const OONI = {
  kind: 'censorship_event',
  country_code: 'YY',
  probability: 0.4,
  base_rate: 0.4,
  made_on: '2026-08-29',
  resolves_on: '2026-09-12',
  resolver: 'OONI (ooni.org) confirmed_blocked > 0',
  threshold: 1,
  threshold_pct: null,
  reference_value: null,
};

/** Ids arrive out of order and as strings (bigint), as the driver hands them over. */
const SYNTH: DownloadSourceRow[] = [
  {
    ...FX,
    id: '105',
    claim: 'XXX depreciates 1.17% or more against USD at any point within 14 days, from 4.08.',
    status: 'pending',
    resolved_at: null,
    void_reason: null,
    evidence_count: null,
  },
  {
    ...FX,
    id: '102',
    claim: 'A claim with "quotes", a comma, and a line\nbreak',
    status: 'hit',
    resolved_at: '2026-10-15T09:45:39Z',
    void_reason: null,
    evidence_count: 112,
  },
  {
    ...OONI,
    id: '103',
    claim: 'A claim with a CRLF\r\ninside, and "a quote" at the end "',
    status: 'miss',
    resolved_at: '2026-09-12T09:45:40Z',
    void_reason: null,
    evidence_count: 0,
  },
  {
    ...FX,
    id: '104',
    claim: '  leading and trailing space  ',
    status: 'void',
    resolved_at: null,
    void_reason: 'threshold calibrated on endpoint moves, resolved on the peak',
    evidence_count: null,
  },
  {
    ...OONI,
    id: '101',
    claim: '',
    status: 'unresolvable',
    resolved_at: '2026-09-19T09:45:38Z',
    void_reason: 'resolver coverage 3/7 days, 120/350 measurements in [2026-08-29, 2026-09-12]',
    evidence_count: null,
  },
];

const SYNTH_CORRECTIONS: CorrectionSourceRow[] = [
  // The miss the evidence records as a hit: a correction.
  { id: 1, call_id: 103, issued_on: '2026-09-13', corrected_status: 'hit' },
  // A "correction" agreeing with the published hit: not one.
  { id: 2, call_id: 102, issued_on: '2026-09-13', corrected_status: 'hit' },
  // On a call published unresolvable: the ledger applies corrections to scored calls only.
  { id: 3, call_id: '101', issued_on: '2026-09-13', corrected_status: 'hit' },
];

const STATUSES = ['pending', 'hit', 'miss', 'void', 'unresolvable'];

/** The pinned schema: the header row, character for character. Changing it is a new SCHEMA_VERSION. */
const PINNED_COLUMNS = [
  'id',
  'kind',
  'country_code',
  'claim',
  'probability',
  'base_rate',
  'made_on',
  'resolves_on',
  'status',
  'resolved_at',
  'void_reason',
  'resolver',
  'threshold',
  'threshold_pct',
  'reference_value',
  'evidence_count',
  'has_correction',
  'correction_status',
  'correction_issued_on',
  'has_note',
  'note_added_on',
];
const PINNED_HEADER =
  'id,kind,country_code,claim,probability,base_rate,made_on,resolves_on,status,resolved_at,void_reason,resolver,' +
  'threshold,threshold_pct,reference_value,evidence_count,has_correction,correction_status,correction_issued_on,' +
  'has_note,note_added_on\r\n';

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  h.calls = SYNTH;
  h.corrections = SYNTH_CORRECTIONS;
  h.fail = false;
  h.queries.length = 0;
});

async function bothFiles() {
  const csv = await get('csv');
  const json = await get('json');
  expect(csv.status).toBe(200);
  expect(json.status).toBe(200);
  return { csv: csv.body, json: JSON.parse(json.body) as JsonFile };
}

/** Both files hold the same rows, in the same order, under the same header. */
function expectSameRows(csvText: string, json: JsonFile) {
  const [header, ...csvRows] = parseCsv(csvText);
  expect(header).toEqual(json.columns);
  expect(csvRows).toHaveLength(json.rows.length);
  expect(json.meta.row_count).toBe(json.rows.length);
  csvRows.forEach((r, i) => {
    expect(r, `row ${i}`).toEqual((json.rows[i] as unknown[]).map(asCsvCell));
  });
}

describe('the header and column order are pinned', () => {
  it('DOWNLOAD_COLUMNS is exactly the pinned list, in order, at schema version 1', () => {
    expect(COLUMN_NAMES).toEqual(PINNED_COLUMNS);
    expect(SCHEMA_VERSION).toBe(1);
  });

  it('the CSV opens with the pinned header row, and the JSON names the same columns', async () => {
    const { csv, json } = await bothFiles();
    expect(csv.startsWith(PINNED_HEADER)).toBe(true);
    expect(json.columns).toEqual(PINNED_COLUMNS);
  });

  it('every column is documented, once, with a type and a meaning', () => {
    expect(new Set(COLUMN_NAMES).size).toBe(COLUMN_NAMES.length);
    for (const c of DOWNLOAD_COLUMNS) {
      expect(c.meaning.trim().length, c.name).toBeGreaterThan(10);
      expect(['integer', 'decimal', 'text', 'date', 'timestamp', 'boolean']).toContain(c.type);
    }
  });

  it('a record carries every column and nothing else', () => {
    const [r] = buildDownloadRecords([SYNTH[0] as DownloadSourceRow], []);
    expect(Object.keys(r as object).sort()).toEqual([...PINNED_COLUMNS].sort());
  });
});

describe('CSV and JSON hold the same rows in the same order', () => {
  it('on every status and every quoting hazard', async () => {
    const { csv, json } = await bothFiles();
    expectSameRows(csv, json);
    // Ordered by id, whatever order the rows arrived in; ids are integers, not bigint strings.
    expect(json.rows.map((r) => r[0])).toEqual([101, 102, 103, 104, 105]);
  });

  it('on the public book of 22 Nov 2026: 6,481 calls, 54 corrections, every note the call pages show', async () => {
    h.calls = ALL_CALLS.map((c) => ({
      ...(callPageRow(Number(c.id)) as object),
      void_reason: null,
      resolved_at: c.resolved_at ? `${c.resolved_at.slice(0, 19).replace(' ', 'T')}Z` : null,
    }));
    h.corrections = ALL_CALLS.filter((c) => c.correction).map((c, i) => ({
      id: i + 1,
      call_id: c.id,
      issued_on: c.correction?.issued_on,
      corrected_status: c.correction?.corrected_status,
    }));
    const { csv, json } = await bothFiles();
    expectSameRows(csv, json);
    expect(json.rows).toHaveLength(6481);
    const ids = json.rows.map((r) => r[0] as number);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);

    const col = (name: string) => COLUMN_NAMES.indexOf(name);
    expect(json.rows.filter((r) => r[col('has_correction')] === true)).toHaveLength(54);
    // A row says what /call/:id says: the same notes gate, call by call.
    for (const r of json.rows) {
      const call = CALL_BY_ID.get(r[0] as number);
      expect(r[col('has_note')], `call ${r[0]}`).toBe(notesForCall(call as never).length > 0);
    }

    // WHY THE evidence_count MEANING SAYS WHAT IT SAYS (review F2). A currency
    // call is decided on the unrounded fall and stored rounded to whole basis
    // points, so a miss can carry evidence equal to its threshold; a corrected
    // row keeps the reading the correction overturned; an unresolvable row has
    // none.
    const at = (r: unknown[], name: string) => r[col(name)];
    const fxEqualMisses = json.rows.filter(
      (r) =>
        at(r, 'kind') === 'fx_devaluation' &&
        at(r, 'status') === 'miss' &&
        at(r, 'evidence_count') === Math.round((at(r, 'threshold_pct') as number) * 100),
    );
    expect(fxEqualMisses.length).toBeGreaterThan(0);
    const corrected = json.rows.filter((r) => at(r, 'has_correction') === true);
    for (const r of corrected) {
      expect(at(r, 'evidence_count')).toBe(CALL_BY_ID.get(r[0] as number)?.evidence_count);
    }
    const unresolvable = json.rows.filter((r) => at(r, 'status') === 'unresolvable');
    expect(unresolvable.length).toBeGreaterThan(0);
    for (const r of unresolvable) expect(at(r, 'evidence_count')).toBeNull();

    // FORMULA-INJECTION TRIPWIRE (review F6). No text cell may open with a
    // character a spreadsheet reads as a formula. Nothing is escaped: every
    // text cell comes from code templates or enums, and escaping would alter
    // the data a re-scorer reads. If this ever fails, decide then.
    const textCols = DOWNLOAD_COLUMNS.filter((c) => c.type === 'text').map((c) => COLUMN_NAMES.indexOf(c.name));
    for (const r of json.rows) for (const i of textCols) expect(String(r[i] ?? '')).not.toMatch(/^[=+\-@\t\r]/);

    // SIZE. A Vercel Function response is limited to 4.5 MB. Rows as arrays
    // keep the JSON within a quarter of the CSV; rows as objects were about
    // two and a half times it, and would cross the limit near 8,800 calls.
    const jsonBytes = Buffer.byteLength(JSON.stringify(json));
    const csvBytes = Buffer.byteLength(csv);
    expect(jsonBytes).toBeLessThan(csvBytes * 1.25);
    expect(Math.max(jsonBytes, csvBytes)).toBeLessThan(4_500_000);
  });
});

describe('every status value appears correctly', () => {
  it('each of the five statuses is in both files exactly as stored, on its own call', async () => {
    const { csv, json } = await bothFiles();
    const status = COLUMN_NAMES.indexOf('status');
    expect(json.rows.map((r) => r[status])).toEqual(['unresolvable', 'hit', 'miss', 'void', 'pending']);
    const csvStatuses = parseCsv(csv)
      .slice(1)
      .map((r) => r[status]);
    expect(csvStatuses).toEqual(['unresolvable', 'hit', 'miss', 'void', 'pending']);
    expect([...new Set(csvStatuses)].sort()).toEqual([...STATUSES].sort());
  });

  it('void and unresolvable carry their reason; pending carries no settlement and no evidence', async () => {
    const { json } = await bothFiles();
    const byId = new Map(json.rows.map((r) => [r[0], Object.fromEntries(COLUMN_NAMES.map((n, i) => [n, r[i]]))]));
    expect(byId.get(104)?.void_reason).toBe('threshold calibrated on endpoint moves, resolved on the peak');
    expect(byId.get(101)?.void_reason).toBe(
      'resolver coverage 3/7 days, 120/350 measurements in [2026-08-29, 2026-09-12]',
    );
    expect(byId.get(105)).toMatchObject({ resolved_at: null, evidence_count: null, void_reason: null });
    expect(byId.get(102)).toMatchObject({ resolved_at: '2026-10-15T09:45:39Z', evidence_count: 112 });
  });

  it('a correction is shown by the call page’s rule: only where it changes a published hit or miss', async () => {
    const { json } = await bothFiles();
    const at = (id: number, name: string) => json.rows.find((r) => r[0] === id)?.[COLUMN_NAMES.indexOf(name)];
    // The miss the evidence records as a hit. Its status is still what was published.
    expect([at(103, 'status'), at(103, 'has_correction'), at(103, 'correction_status')]).toEqual(['miss', true, 'hit']);
    expect(at(103, 'correction_issued_on')).toBe('2026-09-13');
    // Agreeing with the published verdict, or on an unscored call: no correction.
    for (const id of [101, 102, 104, 105]) {
      expect([at(id, 'has_correction'), at(id, 'correction_status'), at(id, 'correction_issued_on')]).toEqual([
        false,
        null,
        null,
      ]);
    }
    // The same answer standingCorrection gives /call/:id, row by row.
    for (const c of SYNTH) {
      const rows = SYNTH_CORRECTIONS.filter((k) => Number(k.call_id) === Number(c.id));
      expect(at(Number(c.id), 'has_correction')).toBe(standingCorrection(c.status, rows) !== null);
    }
  });

  it('the latest correction row stands, whatever order the rows arrive in', () => {
    const call = { ...(SYNTH[2] as DownloadSourceRow) }; // published miss
    const rows: CorrectionSourceRow[] = [
      { id: 1, call_id: 103, issued_on: '2026-09-13', corrected_status: 'hit' },
      { id: 2, call_id: 103, issued_on: '2026-10-01', corrected_status: 'miss' },
    ];
    // The later row agrees with the published miss, so the call stands uncorrected.
    expect(buildDownloadRecords([call], rows)[0]?.has_correction).toBe(false);
    expect(buildDownloadRecords([call], [...rows].reverse())[0]?.has_correction).toBe(false);
    // Same day: the higher id is the later row.
    const sameDay: CorrectionSourceRow[] = [
      { id: 7, call_id: 103, issued_on: '2026-09-13', corrected_status: 'hit' },
      { id: 6, call_id: 103, issued_on: '2026-09-13', corrected_status: 'miss' },
    ];
    expect(buildDownloadRecords([call], sameDay)[0]?.correction_status).toBe('hit');
    expect(buildDownloadRecords([call], [...sameDay].reverse())[0]?.correction_status).toBe('hit');
  });

  it('a note marks the call and dates it by its most recent note', () => {
    const notes = [
      { id: 'a', issuedOn: '2026-11-23', text: 'Note added 23 Nov 2026. First.' },
      { id: 'b', issuedOn: '2026-11-25', text: 'Note added 25 Nov 2026. Second.' },
    ];
    // Ordered by id: 102 first, then 105.
    const [plain, noted] = buildDownloadRecords(SYNTH.slice(0, 2), [], (c) => (Number(c.id) === 105 ? notes : []));
    expect([plain?.id, plain?.has_note, plain?.note_added_on]).toEqual([102, false, null]);
    expect([noted?.id, noted?.has_note, noted?.note_added_on]).toEqual([105, true, '2026-11-25']);
    // A note moves no verdict and no correction.
    expect(noted?.status).toBe('pending');
    expect(noted?.has_correction).toBe(false);
  });
});

describe('quoting handles commas, quotes and line breaks in the claim', () => {
  it('quotes exactly the fields RFC 4180 requires, doubling each quote', () => {
    expect(csvField('plain text')).toBe('plain text');
    expect(csvField('a, b')).toBe('"a, b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField('line\nbreak')).toBe('"line\nbreak"');
    expect(csvField('cr\r\nlf')).toBe('"cr\r\nlf"');
    expect(csvField('"')).toBe('""""');
    expect(csvField(' padded ')).toBe('" padded "');
    expect(csvField('')).toBe('""');
    expect(csvField(null)).toBe('');
    expect(csvField(0)).toBe('0');
    expect(csvField(0.217)).toBe('0.217');
    expect(csvField(false)).toBe('false');
  });

  it('every hazardous claim reads back exactly as stored', async () => {
    const { csv } = await bothFiles();
    const rows = parseCsv(csv).slice(1);
    const claim = COLUMN_NAMES.indexOf('claim');
    const stored = new Map(SYNTH.map((c) => [String(Number(c.id)), c.claim]));
    for (const r of rows) expect(r[claim], `call ${r[0]}`).toBe(stored.get(r[0] as string));
    // The raw bytes: a quoted claim with its quotes doubled, its line break inside the quotes.
    expect(csv).toContain(',"A claim with ""quotes"", a comma, and a line\nbreak",');
    expect(csv).toContain(',"A claim with a CRLF\r\ninside, and ""a quote"" at the end """,');
    // The empty claim is "", distinguishable from no value.
    expect(csv).toMatch(/\r\n101,censorship_event,YY,"",/);
    // A currency claim's comma is quoted.
    expect(csv).toContain(',"XXX depreciates 1.17% or more against USD at any point within 14 days, from 4.08.",');
  });

  it('every record ends CRLF, the file included', () => {
    const out = toCsv(buildDownloadRecords(SYNTH, []));
    expect(out.endsWith('\r\n')).toBe(true);
    expect(parseCsv(out)).toHaveLength(SYNTH.length + 1);
  });
});

describe('calls.json carries its metadata block', () => {
  it('schema version, generated-at time, row count and the citation, dated the day it was generated', () => {
    const at = new Date('2026-11-27T16:26:21.000Z');
    const json = JSON.parse(toJson(buildDownloadRecords(SYNTH, []), at)) as JsonFile;
    expect(json.meta).toEqual({
      schema_version: 1,
      generated_at: '2026-11-27T16:26:21.000Z',
      row_count: 5,
      citation: 'NexusWatch forecast ledger, retrieved 2026-11-27, https://nexuswatch.dev/data',
      documentation: 'https://nexuswatch.dev/data',
    });
    expect(citationLine('2026-12-01')).toBe(
      'NexusWatch forecast ledger, retrieved 2026-12-01, https://nexuswatch.dev/data',
    );
    expect(Object.keys(json)).toEqual(['meta', 'columns', 'rows']);
  });

  it('an empty book is still valid JSON with a row count of 0', () => {
    const json = JSON.parse(toJson([], new Date('2026-11-27T00:00:00Z'))) as JsonFile;
    expect(json.rows).toEqual([]);
    expect(json.meta.row_count).toBe(0);
    expect(toCsv([])).toBe(PINNED_HEADER);
  });

  it('one row per line, so the file can be read and searched line by line', async () => {
    const json = (await get('json')).body;
    const lines = json.trimEnd().split('\n');
    expect(lines).toHaveLength(SYNTH.length + 3); // meta and columns, then "rows":[, one line per call, then ]}
    expect(lines[2]?.startsWith('[101,')).toBe(true);
  });
});

describe('cache headers', () => {
  it('both files: about an hour at the edge, five minutes in the browser, readable cross-origin', async () => {
    for (const format of ['csv', 'json']) {
      const r = await get(format);
      expect(r.headers['Cache-Control']).toBe('public, max-age=300, s-maxage=3600');
      expect(r.headers['Cache-Control']).toBe(DOWNLOAD_CACHE_CONTROL);
      expect(r.headers['Access-Control-Allow-Origin']).toBe('*');
    }
    expect((await get('csv')).headers['Content-Type']).toBe('text/csv; charset=utf-8; header=present');
    expect((await get('json')).headers['Content-Type']).toBe('application/json; charset=utf-8');
  });

  it('a failure is never cached and never served as a file', async () => {
    h.fail = true;
    for (const format of ['csv', 'json']) {
      const r = await get(format);
      expect(r.status).toBe(500);
      expect(r.headers['Cache-Control']).toBe('no-store');
      expect(r.body).not.toContain('id,kind');
      expect(r.body).not.toContain('"rows"');
    }
    h.fail = false;
    delete process.env.DATABASE_URL;
    const r = await get('csv');
    expect([r.status, r.headers['Cache-Control']]).toEqual([503, 'no-store']);
  });

  it('every error carries the same CORS headers as the file itself (Bugbot, PR #70)', async () => {
    // The CORS headers a success sends, read from the response rather than typed
    // here, so a header added to the success path is required of every error too.
    const cors = (r: Res['state']) =>
      Object.fromEntries(Object.entries(r.headers).filter(([k]) => k.toLowerCase().startsWith('access-control-')));
    const success = cors(await get('csv'));
    expect(success).toEqual({ 'Access-Control-Allow-Origin': '*' });
    expect(cors(await get('json'))).toEqual(success);

    const errors: Array<[string, Res['state']]> = [];
    for (const format of ['csv', 'json']) {
      errors.push([`${format} POST`, await get(format, 'POST')]);
      h.fail = true;
      errors.push([`${format} outage`, await get(format)]);
      h.fail = false;
      delete process.env.DATABASE_URL;
      errors.push([`${format} no database`, await get(format)]);
      process.env.DATABASE_URL = 'postgres://stub';
    }
    errors.push(['unknown format', await get('xml')], ['no format', await get(undefined)]);
    errors.push(['unknown format POST', await get('xml', 'POST')]);

    expect(errors.map(([, r]) => r.status)).toEqual([405, 500, 503, 405, 500, 503, 404, 404, 405]);
    for (const [what, r] of errors) expect(cors(r), what).toEqual(success);
  });

  it('an unknown format is a 404 and a write is a 405, neither cached; HEAD is served', async () => {
    for (const f of ['xml', '', undefined, ['csv', 'json']]) {
      const r = await get(f);
      if (Array.isArray(f)) {
        // The first value wins, as on /call/:id.
        expect(r.status).toBe(200);
        continue;
      }
      expect([r.status, r.headers['Cache-Control']]).toEqual([404, 'no-store']);
    }
    const post = await get('csv', 'POST');
    expect([post.status, post.headers['Allow'], post.headers['Cache-Control']]).toEqual([405, 'GET, HEAD', 'no-store']);
    expect((await get('csv', 'HEAD')).status).toBe(200);
  });

  it('warns in the log when a file passes 3.5 MB, ahead of the 4.5 MB response limit (review F7)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await get('csv');
      expect(warn).not.toHaveBeenCalled();
      // 20,000 currency calls: over 3.5 MB in both formats.
      h.calls = Array.from({ length: 20_000 }, (_, i) => ({ ...(SYNTH[0] as DownloadSourceRow), id: String(i + 1) }));
      for (const format of ['csv', 'json']) {
        warn.mockClear();
        const r = await get(format);
        expect(r.status).toBe(200);
        expect(Buffer.byteLength(r.body)).toBeGreaterThan(SIZE_WARNING_BYTES);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]?.[0])).toMatch(
          new RegExp(`^\\[calls/download\\] ${format} body is \\d+ bytes; the 4\\.5 MB response limit is near`),
        );
      }
    } finally {
      warn.mockRestore();
    }
  });

  it('reads the whole table, by id, with no LIMIT, and the timestamp in UTC', async () => {
    await get('csv');
    const calls = h.queries.find((q) => q.includes('FROM calls'));
    expect(calls).toMatch(/ORDER BY id\s*$/);
    expect(calls).not.toMatch(/LIMIT|WHERE/i);
    expect(calls).toContain(`to_char(resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`);
  });
});

/**
 * THE ROUTE REWRITE, as a reader reaches it. Applies vercel.json's rewrites in
 * order, first match wins, with the matcher api/sitemap.test.ts uses (literal
 * paths and `:name(regex)` parameters). It checks the config, not Vercel's own
 * matcher.
 */
const VERCEL = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) as {
  rewrites: Array<{ source: string; destination: string }>;
};

function rewrite(path: string): { destination: string; query: Record<string, string> } | null {
  for (const r of VERCEL.rewrites) {
    const names: string[] = [];
    const pattern = r.source
      .replace(/\./g, '\\.')
      .replace(/:([A-Za-z]+)\(((?:[^()]|\([^()]*\))+)\)/g, (_m, name: string, re: string) => {
        names.push(name);
        return `(${re})`;
      });
    const m = new RegExp(`^${pattern}$`).exec(path);
    if (!m) continue;
    let dest = r.destination;
    names.forEach((n, i) => {
      dest = dest.replace(`:${n}`, m[i + 1] as string);
    });
    const u = new URL(dest, 'https://nexuswatch.dev');
    return { destination: u.pathname, query: Object.fromEntries(u.searchParams) };
  }
  return null;
}

describe('the route rewrite works', () => {
  it('/data, /data/calls.csv and /data/calls.json reach their functions', () => {
    expect(rewrite('/data')).toEqual({ destination: '/api/data', query: {} });
    expect(rewrite('/data/calls.csv')).toEqual({ destination: '/api/calls/download', query: { format: 'csv' } });
    expect(rewrite('/data/calls.json')).toEqual({ destination: '/api/calls/download', query: { format: 'json' } });
    for (const p of ['/data/calls.xml', '/data/calls', '/data/callsXcsv', '/data/calls.csvx']) {
      expect(rewrite(p), p).toBeNull();
    }
  });

  it('each destination is a function in the repository', () => {
    expect(existsSync(join(ROOT, 'api/data.ts'))).toBe(true);
    expect(existsSync(join(ROOT, 'api/calls/download.ts'))).toBe(true);
  });

  it('the rewritten request gets the right file, end to end', async () => {
    for (const [path, type, start] of [
      ['/data/calls.csv', 'text/csv; charset=utf-8; header=present', 'id,kind,'],
      ['/data/calls.json', 'application/json; charset=utf-8', '{"meta":'],
    ] as const) {
      const r = rewrite(path);
      const res = fakeRes();
      await download({ method: 'GET', query: r?.query } as never, res as never);
      expect(res.state.status, path).toBe(200);
      expect(res.state.headers['Content-Type']).toBe(type);
      expect(res.state.body.startsWith(start)).toBe(true);
    }
    const page = fakeRes();
    dataPage({ method: 'GET', query: rewrite('/data')?.query } as never, page as never);
    expect(page.state.status).toBe(200);
    expect(page.state.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(page.state.body).toContain('<link rel="canonical" href="https://nexuswatch.dev/data">');
  });

  it('/data is server-rendered, not an SPA route, so the route-rewrites guard is untouched', () => {
    const main = readFileSync(join(ROOT, 'src/main.ts'), 'utf8');
    const routes = [...main.matchAll(/\.on\('(\/[^']*)'/g)].map((m) => m[1]);
    expect(routes.some((r) => r === '/data' || r?.startsWith('/data/'))).toBe(false);
    expect(VERCEL.rewrites.filter((r) => r.source.startsWith('/data')).map((r) => r.destination)).not.toContain(
      '/index.html',
    );
  });
});
