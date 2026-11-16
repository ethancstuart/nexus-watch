import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  brierScore,
  formatLedgerSummary,
  toLedgerSummaryRow,
  describeCorrections,
  type ScoredCall,
} from '../_lib/calls.js';
import { assembleByKind, type ScoredRow } from '../_lib/ledger-by-kind.js';
import { buildFallbackText, formatResolvedCallLines, spliceLedgerLine, type BriefData } from './daily-brief.js';

/**
 * THE BRIEF MUST SAY WHAT /ledger SAYS.
 *
 * Every daily brief opened with "OONI Brier 0.058 over 263", a figure scored on
 * 54 verdicts the register has since recorded as wrong (`call_corrections`,
 * owner decision of 12 Sep 2026: annotate, never re-resolve). /ledger prints
 * the corrected reading beside the published one and withholds the corrected
 * skill; the brief printed only the first. These tests pin the brief to the
 * page's policy using the same rows, no database.
 */

/** A DB-shaped row, as the brief's query returns it. */
interface DbRow {
  kind: string;
  country_code: string;
  probability: number;
  base_rate: number | null;
  status: string;
  resolved_at: string | null;
  corrected_status: string | null;
}

const DATES = ['2026-09-05', '2026-09-19', '2026-10-03'];

/**
 * 263 censorship rows shaped like the live book: 54 published MISS that the
 * evidence records as HIT, the rest scored cleanly. Three resolution batches,
 * so a skill figure is publishable for the published reading.
 */
function censorshipBook(): DbRow[] {
  const rows: DbRow[] = [];
  const push = (n: number, p: number, b: number, status: string, corrected: string | null) => {
    for (let i = 0; i < n; i++) {
      rows.push({
        kind: 'censorship_event',
        country_code: `C${rows.length % 40}`,
        probability: p,
        base_rate: b,
        status,
        resolved_at: `${DATES[rows.length % 3]}T10:00:00Z`,
        corrected_status: corrected,
      });
    }
  };
  push(190, 0.1, 0.1, 'miss', null);
  push(19, 0.3, 0.3, 'hit', null);
  push(54, 0.275, 0.265, 'miss', 'hit'); // the 54
  return rows;
}

const line = (rows: DbRow[], extra: Partial<Parameters<typeof formatLedgerSummary>[0]> = {}) =>
  formatLedgerSummary({ resolvedToday: [], scored: rows.map(toLedgerSummaryRow), openCount: 0, ...extra });

describe('the ledger line carries the corrected reading', () => {
  it('with no corrections the line is exactly what it was', () => {
    const clean = censorshipBook().map((r) => ({ ...r, corrected_status: null }));
    const out = line(clean);
    expect(out).toMatch(/^OONI Brier 0\.\d{3} over 263, [+-]?\d+% vs base rate$/);
    expect(out).not.toContain('corrected');
    expect(out).not.toContain('as published');
  });

  it('a correction that agrees with the published verdict is not a correction', () => {
    const agree = censorshipBook().map((r) => ({ ...r, corrected_status: r.status }));
    expect(line(agree)).not.toContain('corrected');
  });

  it('prints the published and the corrected reading side by side', () => {
    const out = line(censorshipBook());
    expect(out).toContain('OONI Brier 0.058 over 263 as published');
    expect(out).toContain('on corrected evidence Brier 0.151');
    expect(out).toContain('54 calls published MISS that the evidence records as HIT');
  });

  it('matches the figures /ledger and /api/calls/ledger publish for the same rows', () => {
    const rows = censorshipBook();

    // The JSON endpoint's path: assembleByKind over ScoredRow with the same
    // correctedOutcome rule it applies.
    const scored: ScoredRow[] = rows.map((r) => {
      const s = toLedgerSummaryRow(r);
      return {
        kind: s.kind,
        countryCode: r.country_code,
        probability: s.probability,
        baseRate: s.baseRate,
        outcome: s.outcome,
        resolvedOn: s.resolvedOn,
        correctedOutcome: s.correctedOutcome,
      };
    });
    const k = assembleByKind(
      [{ kind: 'censorship_event', open: 0, resolved: 263, hits: 19, unscored: 0 }],
      scored,
    ).censorship_event;
    expect(k.corrected).not.toBeNull();

    // The SSR page's path, transcribed from api/ledger.ts: effective status is
    // the corrected one where it is scored, Brier over every row.
    const pageCs: ScoredCall[] = rows.map((r) => ({
      probability: r.probability,
      outcome: ((r.corrected_status ?? r.status) === 'hit' ? 1 : 0) as 0 | 1,
    }));
    const pageBrier = brierScore(pageCs);
    const pageDesc = describeCorrections(
      rows.filter((r) => r.corrected_status !== null && r.corrected_status !== r.status) as Array<
        DbRow & { corrected_status: string }
      >,
    );

    const out = line(rows);
    expect(k.corrected!.brier!.toFixed(3)).toBe(pageBrier.toFixed(3));
    expect(out).toContain(`on corrected evidence Brier ${k.corrected!.brier!.toFixed(3)}`);
    expect(out).toContain(pageDesc);
    expect(k.corrected!.corrections_applied).toBe(54);
    expect(out).toContain(`Brier ${k.brier!.toFixed(3)} over 263 as published`);
  });

  it('withholds the corrected skill, exactly as the page does', () => {
    const out = line(censorshipBook());
    const corrected = out.slice(out.indexOf('on corrected evidence'));
    expect(corrected).toContain('skill withheld');
    expect(corrected).not.toContain('vs base rate');
    expect(corrected).not.toMatch(/[+-]\d+%/);
  });

  it('a kind whose published skill the page withholds is withheld in the brief too', () => {
    // One batch only: publishableSkill refuses, and so must the brief — with
    // corrections present, the published reading still carries its refusal.
    const oneBatch = censorshipBook().map((r) => ({ ...r, resolved_at: '2026-09-05T10:00:00Z' }));
    const out = line(oneBatch);
    expect(out).toContain('skill withheld (1 of 3 batches)');
    expect(out).not.toContain('vs base rate');
    expect(out).toContain('on corrected evidence Brier 0.151');
  });

  it('corrections on one kind never leak into another', () => {
    const fx: DbRow[] = [0, 1, 2].map((i) => ({
      kind: 'fx_devaluation',
      country_code: `F${i}`,
      probability: 0.2,
      base_rate: 0.25,
      status: i === 0 ? 'hit' : 'miss',
      resolved_at: `${DATES[i]}T10:00:00Z`,
      corrected_status: null,
    }));
    const out = line([...censorshipBook(), ...fx]);
    const fxPart = out.split(' · ').find((p) => p.startsWith('FX'))!;
    expect(fxPart).toBeDefined();
    expect(fxPart).not.toContain('corrected');
    expect(out.match(/on corrected evidence/g)?.length).toBe(1);
  });

  it('the climatology branch keeps its words and still carries the correction', () => {
    const rows: DbRow[] = DATES.map((d, i) => ({
      kind: 'censorship_event',
      country_code: `C${i}`,
      probability: 0.1,
      base_rate: 0.1,
      status: 'miss',
      resolved_at: `${d}T10:00:00Z`,
      corrected_status: i === 0 ? 'hit' : null,
    }));
    const out = line(rows);
    expect(out).toContain('stated at climatology — not a forecast');
    expect(out).toContain('on corrected evidence');
    expect(out).toContain('1 call published MISS that the evidence records as HIT');
  });

  it('the line keeps its open-book tail and today count unchanged', () => {
    const out = line(censorshipBook(), { openCount: 12, nextResolvesOn: '2026-11-20' });
    expect(out.endsWith(' · 12 open, next resolves 2026-11-20')).toBe(true);
  });
});

describe('the mechanical edition uses the same line', () => {
  it('the splice carries the corrected reading into the fallback body', () => {
    const base = '## Good Morning\n\nbody\n';
    const out = spliceLedgerLine(base, line(censorshipBook()));
    expect(out).toContain('**The Ledger** — OONI Brier 0.058 over 263 as published');
    expect(out).toContain('on corrected evidence Brier 0.151');
  });
});

describe('the model is given the corrected reading', () => {
  const row = (over: Record<string, unknown>) => ({
    kind: 'censorship_event',
    country_code: 'KZ',
    probability: 0.27,
    base_rate: 0.1,
    status: 'miss',
    resolves_on: '2026-11-12',
    evidence_count: 0,
    corrected_status: null as string | null,
    ...over,
  });

  it('a corrected call is never stated as a bare MISS', () => {
    const lines = formatResolvedCallLines([row({ corrected_status: 'hit' })], 0, undefined, {
      total: 1,
      hits: 0,
      corrections: [{ status: 'miss', corrected_status: 'hit' }],
    });
    const call = lines.find((l) => l.includes('KZ'))!;
    expect(call).toContain('MISS as published');
    expect(call).toContain('MISS as published, the evidence records as HIT');
    expect(call).not.toMatch(/KZ\): MISS —/);
  });

  it('the aggregate names the corrections in the page’s words', () => {
    const lines = formatResolvedCallLines([row({ corrected_status: 'hit' })], 0, undefined, {
      total: 3,
      hits: 1,
      corrections: [{ status: 'miss', corrected_status: 'hit' }],
    });
    expect(lines[0]).toContain('3 calls settled');
    expect(lines[0]).toContain('1 call published MISS that the evidence records as HIT');
  });

  it('with no corrections the lines are byte-identical to before', () => {
    const plain = formatResolvedCallLines([row({})], 0, undefined, { total: 1, hits: 0 });
    const withEmpty = formatResolvedCallLines([row({})], 0, undefined, { total: 1, hits: 0, corrections: [] });
    expect(withEmpty).toEqual(plain);
    expect(plain[0]).toBe('1 calls settled against external ground truth: 0 hit, 1 miss.');
    expect(plain[1]).toMatch(/KZ\): MISS — we said 27%/);
  });

  it('the fallback edition quotes the aggregate it is handed, corrections included', () => {
    const lines = formatResolvedCallLines([row({ corrected_status: 'hit' })], 0, undefined, {
      total: 1,
      hits: 0,
      corrections: [{ status: 'miss', corrected_status: 'hit' }],
    });
    const data = { ...fallbackBase(), resolvedCallLines: lines };
    expect(buildFallbackText(data)).toContain('1 call published MISS that the evidence records as HIT');
  });
});

describe('the brief reads corrections from the same place the page does', () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'daily-brief.ts'), 'utf8');

  it('both ledger queries join call_corrections, one correction per call', () => {
    // Without DISTINCT ON a call that ever acquired a second cause would count
    // twice and move a published number (api/ledger.ts, api/calls/ledger.ts).
    const joins = src.match(/SELECT DISTINCT ON \(call_id\) call_id, corrected_status\s+FROM call_corrections/g) ?? [];
    expect(joins.length).toBeGreaterThanOrEqual(2);
  });

  it('the summary rows go through the shared mapper, not a local one', () => {
    expect(src).toContain('toLedgerSummaryRow');
  });
});

/** An empty day: nothing but the resolved-call lines the test hands in. */
function fallbackBase(): BriefData {
  return {
    date: '2026-11-15',
    utcTime: '10:00 UTC',
    topRiskCountries: [],
    totalCountries: 0,
    earthquakeCount: 0,
    significantQuakes: [],
    diseaseCount: 0,
    recentOutbreaks: [],
    conflictHeadlines: [],
    markets: [],
    yesterdayEqCount: null,
    weeklyTrends: [],
    correlations: [],
    newsHeadlines: [],
    openCallLines: [],
    resolvedCallLines: [],
  };
}
