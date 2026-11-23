import { describe, it, expect, vi, beforeEach } from 'vitest';
import { snapshotSql, fakeRes, withExtraOpenCalls, ALL_CALLS } from './_lib/snapshot-sql-fixture.js';
import { CALL_NOTES, LEDGER_FX_THRESHOLD_LINE, LEDGER_SECTIONS, METHODOLOGY_NOTES } from './_lib/call-notes-data.js';
import {
  approvedCallNotes,
  approvedLedgerSections,
  approvedMethodologyNotes,
  thresholdLineApproved,
} from './_lib/call-notes.js';
import { REFERENCE_SLOT } from './_lib/call-note-words.js';

/**
 * AN UNPUBLISHED NOTE NEVER SHOWS, ON ANY SURFACE. This renders every surface
 * that could show a note (/call/:id, the call share card, /ledger,
 * /api/calls/ledger and /api/method-notes) against the REAL data and keys,
 * with nothing mocked but the database (ledger-snapshots/2026-11-22.json), and
 * finds no trace of any entry the gate withholds: no block, no label, no card
 * line, no `notes` field, no section, no line, no sentence.
 *
 * Its scope is DERIVED from the gate: every entry not approved by both keys.
 * Approving one needs no edit here. Once every entry is approved, the checks
 * fall back to calls and pages no note names, so none can run empty.
 */

vi.mock('@neondatabase/serverless', () => ({ neon: () => snapshotSql }));
vi.mock('@vercel/og', () => ({
  ImageResponse: class {
    headers = new Headers();
    element: unknown;
    constructor(element: unknown) {
      this.element = element;
    }
  },
}));
vi.mock('./_lib/satori-html.js', () => ({ htmlToSatori: (html: string) => html }));

const PUBLISHED_CALL = new Set(approvedCallNotes().map((n) => n.id));
const HELD_CALL = CALL_NOTES.filter((n) => !PUBLISHED_CALL.has(n.id));
const HELD_SECTIONS = LEDGER_SECTIONS.filter((s) => !approvedLedgerSections().some((a) => a.id === s.id));
const HELD_METHOD = METHODOLOGY_NOTES.filter((s) => !approvedMethodologyNotes().some((a) => a.id === s.id));
const LINE_HELD = !thresholdLineApproved();
/** Calls some approved note names: these may legitimately show "Note added". */
const NOTED_BY_PUBLISHED = new Set(approvedCallNotes().flatMap((n) => [...n.scope.ids]));
/** Calls no note names at all: AZ 6049 and 6115 (unchecked), and a corrected censorship call. */
const UNNOTED = [6049, 6115, 1346];
const HELD_IDS = [...new Set(HELD_CALL.flatMap((n) => [...n.scope.ids]))];

/** A stretch of each withheld text long enough to be unique, cut before any reference slot. */
const fragment = (t: string) => t.split(REFERENCE_SLOT)[0].slice(0, 60).replace(/'/g, '&#39;');
const HELD_FRAGMENTS = [
  ...HELD_CALL.map((n) => fragment(n.text)),
  ...HELD_SECTIONS.flatMap((s) => [s.kicker ?? s.heading, s.heading, ...s.paragraphs].map(fragment)),
  ...HELD_METHOD.flatMap((s) => [s.heading, ...s.paragraphs].map(fragment)),
];

async function callPage(id: number): Promise<string> {
  const { default: handler } = await import('./call.js');
  const res = fakeRes();
  await handler({ method: 'GET', query: { id: String(id) } } as never, res as never);
  expect(res.state.status).toBe(200);
  return res.state.body;
}
async function card(id: number): Promise<string> {
  const { default: handler } = await import('./og.js');
  return ((await handler({ url: `/api/og?type=call&id=${id}` } as never)) as unknown as { element: string }).element;
}

beforeEach(() => {
  process.env.DATABASE_URL = 'postgres://stub';
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(0) })),
  );
});

describe('unpublished notes show nowhere', () => {
  it('the scope is what the gate withholds, and the threshold line is in it while withheld', () => {
    const held = [
      ...HELD_CALL.map((n) => n.id),
      ...HELD_SECTIONS.map((n) => n.id),
      ...(LINE_HELD ? [LEDGER_FX_THRESHOLD_LINE.id] : []),
      ...HELD_METHOD.map((n) => n.id),
    ];
    const all = [CALL_NOTES, LEDGER_SECTIONS, [LEDGER_FX_THRESHOLD_LINE], METHODOLOGY_NOTES].flat();
    expect(held).toEqual(all.filter((n) => n.status !== 'approved').map((n) => n.id));
    // Probes no note names keep every check below from running empty.
    expect(UNNOTED.every((id) => !CALL_NOTES.some((n) => n.scope.ids.includes(id)))).toBe(true);
  });

  it('/call/:id: no note block, no label, no sentence, the lede as it was', async () => {
    for (const id of [...HELD_IDS, ...UNNOTED]) {
      const html = await callPage(id);
      for (const f of HELD_FRAGMENTS) expect(html, `${id}: ${f}`).not.toContain(f);
      if (NOTED_BY_PUBLISHED.has(id)) continue;
      expect(html, String(id)).not.toContain('Note added');
      expect(html, String(id)).not.toMatch(/<div class="kicker">Notes?<\/div>/);
      expect(html, String(id)).not.toMatch(/except the dated (correction and )?notes? below/);
    }
  });

  it('a ZW call made after 22 Nov, which only a scope rule reaches, shows no withheld note', async () => {
    const later = {
      id: '7175',
      kind: 'fx_devaluation',
      country_code: 'ZW',
      claim: 'ZWL depreciates 0.85% or more against USD at any point within 14 days, from 26.5872.',
      probability: 0.2,
      base_rate: 0.26,
      made_on: '2026-11-23',
      resolves_on: '2026-12-07',
      status: 'pending',
      evidence_count: null,
      resolved_at: null,
    };
    const ruled = HELD_CALL.filter((n) => n.scope.rule);
    await withExtraOpenCalls([later], async () => {
      const html = await callPage(7175);
      const cardHtml = await card(7175);
      for (const n of ruled) expect(html).not.toContain(fragment(n.text));
      if (!approvedCallNotes().some((n) => n.scope.rule)) {
        expect(html).not.toContain('Note added');
        expect(cardHtml).not.toContain('NOTE ADDED');
      }
    });
  });

  it('the share card: no note line', async () => {
    for (const id of [...HELD_IDS, ...UNNOTED]) {
      if (NOTED_BY_PUBLISHED.has(id)) continue;
      expect(await card(id), String(id)).not.toContain('NOTE ADDED');
    }
  });

  it('/api/calls/ledger: no notes field on any call no published note names', async () => {
    const { default: handler } = await import('./calls/ledger.js');
    const res = fakeRes();
    await handler({ method: 'GET', query: { all: '1' } } as never, res as never);
    const j = res.state.json as { open: Array<Record<string, unknown>>; resolved: Array<Record<string, unknown>> };
    const rows = [...j.open, ...j.resolved];
    expect(rows.length).toBe(ALL_CALLS.length);
    for (const r of rows)
      if (!NOTED_BY_PUBLISHED.has(Number(r.id))) expect(r, String(r.id)).not.toHaveProperty('notes');
    const body = JSON.stringify(j);
    for (const f of HELD_FRAGMENTS) expect(body).not.toContain(f.replace(/&#39;/g, "'"));
  });

  it('/ledger: no withheld section and, while it is withheld, no threshold line', async () => {
    const { default: handler } = await import('./ledger.js');
    const res = fakeRes();
    await handler({ method: 'GET', query: {} } as never, res as never);
    const html = res.state.body;
    expect(html).toContain('<h2>54 calls we were wrong about</h2>');
    for (const f of HELD_FRAGMENTS) expect(html, f).not.toContain(f);
    if (LINE_HELD) expect(html).not.toContain('that hit at most once');
    if (approvedLedgerSections().length === 0) expect(html).not.toContain('Exchange rates, 21 November 2026');
  });

  it('/api/method-notes: only approved sections; none while every one is withheld', async () => {
    const { default: handler } = await import('./method-notes.js');
    const res = fakeRes();
    handler({ method: 'GET', query: {} } as never, res as never);
    const j = res.state.json as { notes: Array<{ heading: string }> };
    expect(j.notes.map((n) => n.heading)).toEqual(approvedMethodologyNotes().map((n) => n.heading));
    for (const f of HELD_FRAGMENTS) expect(JSON.stringify(j)).not.toContain(f.replace(/&#39;/g, "'"));
  });
});
