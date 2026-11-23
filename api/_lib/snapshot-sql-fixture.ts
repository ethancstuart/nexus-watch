import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * TEST FIXTURE, imported only by tests. A stand-in for `neon(url)` that answers
 * the queries of /call/:id, the call share card, /ledger and /api/calls/ledger
 * from ledger-snapshots/2026-11-22.json: the public book the currency notes
 * were worded on, including its 54 censorship corrections. Read-only. No
 * database, no network.
 *
 * Fields the snapshot does not carry (a call's horizon, resolver, threshold and
 * reference) are filled from the call's own claim text.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');

export interface SnapCall {
  id: string;
  kind: string;
  country_code: string;
  claim: string;
  probability: number;
  base_rate: number | null;
  made_on: string;
  resolves_on: string;
  status: string;
  evidence_count: number | null;
  resolved_at: string | null;
  correction?: { cause: string; corrected_status: string; note: string; issued_on: string } | null;
}

export const SNAPSHOT = JSON.parse(readFileSync(join(ROOT, 'ledger-snapshots/2026-11-22.json'), 'utf8')) as {
  generated_at: string;
  open: SnapCall[];
  resolved: SnapCall[];
};
export const ALL_CALLS: SnapCall[] = [...SNAPSHOT.open, ...SNAPSHOT.resolved];
export const CALL_BY_ID = new Map(ALL_CALLS.map((c) => [Number(c.id), c]));

const SCORED = new Set(['hit', 'miss']);
const CALIBRATION = 'seismicity_window';
const fxRef = (claim: string) => claim.match(/, from ([0-9.]+(?:e\+[0-9]+)?)\.$/)?.[1];
const fxPct = (claim: string) => claim.match(/ depreciates ([0-9.]+)% /)?.[1];

/** The calls row /call/:id reads, as the driver returns it (id as a string: the column is bigint). */
export function callPageRow(id: number): Record<string, unknown> | null {
  const c = CALL_BY_ID.get(id);
  if (!c) return null;
  const fx = c.kind === 'fx_devaluation';
  return {
    id: c.id,
    made_on: c.made_on,
    kind: c.kind,
    country_code: c.country_code,
    claim: c.claim,
    probability: c.probability,
    horizon_days: 14,
    resolves_on: c.resolves_on,
    resolver: fx ? 'FX_RATES' : 'OONI',
    threshold: 1,
    threshold_pct: fx ? Number(fxPct(c.claim)) : null,
    reference_value: fx ? Number(fxRef(c.claim)) : null,
    base_rate: c.base_rate,
    status: c.status,
    evidence_count: c.evidence_count,
    resolved_at: c.resolved_at,
    void_reason: null,
  };
}

const withCorrectionColumns = (c: SnapCall) => {
  const { correction, ...rest } = c;
  return {
    ...rest,
    correction_cause: correction?.cause ?? null,
    correction_status: correction?.corrected_status ?? null,
    correction_note: correction?.note ?? null,
    correction_issued_on: correction?.issued_on ?? null,
  };
};
const withoutCorrection = (c: SnapCall) => {
  const { correction: _c, ...rest } = c;
  return rest;
};

/** Switches a test may flip to make one read fail. */
export const fixtureFaults = { codes: false };

const byResolvedDesc = (a: SnapCall, b: SnapCall) => (b.resolved_at ?? '').localeCompare(a.resolved_at ?? '');
const corrected = SNAPSHOT.resolved.filter((c) => c.correction);

/** Answers each query the four surfaces make, keyed on text unique to it. Unknown queries throw. */
export function snapshotSql(strings: TemplateStringsArray, ...values: unknown[]): unknown[] {
  const q = strings.join(' ').replace(/\s+/g, ' ');
  if (q.includes('FROM calls WHERE id =')) {
    const row = callPageRow(Number(values[0]));
    if (!row) return [];
    // The card reads a subset; extra fields are harmless.
    return [row];
  }
  if (q.includes('FROM call_corrections WHERE call_id =')) {
    const c = CALL_BY_ID.get(Number(values[0]))?.correction;
    return c ? [{ issued_on: c.issued_on, corrected_status: c.corrected_status, evidence_note: c.note }] : [];
  }
  if (q.includes('WHERE country_code =') && q.includes('LIMIT 20')) return [];
  if (q.includes('split_part(claim')) {
    if (fixtureFaults.codes) throw new Error('synthetic outage');
    const [kind, countries] = values as [string, string[]];
    const latest = new Map<string, SnapCall>();
    for (const c of ALL_CALLS) {
      if (c.kind !== kind || !countries.includes(c.country_code)) continue;
      const prev = latest.get(c.country_code);
      if (!prev || c.made_on > prev.made_on) latest.set(c.country_code, c);
    }
    return [...latest.values()].map((c) => ({ country_code: c.country_code, code: c.claim.split(' ')[0] }));
  }
  if (q.includes("FROM calls WHERE status = 'pending'")) {
    const open = SNAPSHOT.open.map(withoutCorrection);
    return q.includes('LIMIT 40') ? open.slice(0, 40) : open;
  }
  if (q.includes('LEFT JOIN call_corrections cc ON cc.call_id = c.id')) {
    const rows = [...SNAPSHOT.resolved].sort(byResolvedDesc).map(withCorrectionColumns);
    return q.includes('LIMIT 40') ? rows.slice(0, 40) : rows;
  }
  if (q.includes('SELECT DISTINCT ON (call_id) call_id, corrected_status')) {
    return SNAPSHOT.resolved
      .filter((c) => SCORED.has(c.status) && (!q.includes("c.kind <> 'seismicity_window'") || c.kind !== CALIBRATION))
      .map((c) => ({
        kind: c.kind,
        country_code: c.country_code,
        probability: c.probability,
        base_rate: c.base_rate,
        status: c.status,
        resolved_at: c.resolved_at,
        corrected_status: c.correction?.corrected_status ?? null,
      }));
  }
  if (q.includes('SELECT COUNT(*)::int AS n FROM call_corrections') && !q.includes('JOIN')) {
    return [{ n: corrected.length }];
  }
  if (q.includes('FROM call_corrections cc JOIN calls c ON c.id = cc.call_id WHERE c.status <> ALL')) {
    return [{ n: 0 }];
  }
  if (q.includes('FROM call_corrections cc JOIN calls c ON c.id = cc.call_id ORDER BY')) {
    return [...corrected]
      .sort((a, b) => b.resolves_on.localeCompare(a.resolves_on) || Number(b.id) - Number(a.id))
      .slice(0, 25)
      .map((c) => ({
        id: c.id,
        country_code: c.country_code,
        claim: c.claim,
        status: c.status,
        correction_status: c.correction?.corrected_status,
        correction_cause: c.correction?.cause,
      }));
  }
  if (q.includes('ooni_measurements')) return [];
  if (q.includes('GROUP BY kind')) {
    const kinds = [...new Set(ALL_CALLS.map((c) => c.kind))];
    return kinds.map((kind) => {
      const ks = ALL_CALLS.filter((c) => c.kind === kind);
      return {
        kind,
        open: ks.filter((c) => c.status === 'pending').length,
        resolved: ks.filter((c) => SCORED.has(c.status)).length,
        hits: ks.filter((c) => c.status === 'hit').length,
        unscored: ks.filter((c) => c.status !== 'pending' && !SCORED.has(c.status)).length,
      };
    });
  }
  if (q.includes('COUNT(*) FILTER')) {
    const claims = ALL_CALLS.filter((c) => c.kind !== CALIBRATION);
    const harness = ALL_CALLS.filter((c) => c.kind === CALIBRATION);
    return [
      {
        open: claims.filter((c) => c.status === 'pending').length,
        resolved: claims.filter((c) => SCORED.has(c.status)).length,
        hits: claims.filter((c) => c.status === 'hit').length,
        calibration_open: harness.filter((c) => c.status === 'pending').length,
        calibration_resolved: harness.filter((c) => SCORED.has(c.status)).length,
        next_resolves: '2026-11-23',
        next_resolves_on: '2026-11-23',
        first_call: '2026-08-22',
        first_call_on: '2026-08-22',
      },
    ];
  }
  throw new Error(`snapshotSql: unrecognised query: ${q.slice(0, 160)}`);
}

/** A VercelResponse stand-in that records status, headers and the body sent or JSON returned. */
export function fakeRes() {
  const state = { status: 200, body: '' as string, json: undefined as unknown, headers: {} as Record<string, string> };
  const res = {
    setHeader: (k: string, v: string) => {
      state.headers[k] = v;
      return res;
    },
    status: (n: number) => {
      state.status = n;
      return res;
    },
    send: (b: string) => {
      state.body = b;
      return res;
    },
    json: (j: unknown) => {
      state.json = j;
      return res;
    },
    state,
  };
  return res;
}
