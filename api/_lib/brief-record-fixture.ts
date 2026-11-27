/**
 * Test fixtures for the record-only edition (api/_lib/brief-record.ts). Not
 * imported by any runtime code.
 *
 * Synthetic rows shaped like the live book: FX calls issued daily across many
 * currencies, resolving 14 days later, about a quarter of them hits at stated
 * probabilities of 20-40% against base rates near 25% (ledger-snapshots/
 * 2026-11-22.json holds the real public rows they imitate). No row is a real
 * call; ids are in a range the live book has not reached.
 */
import type { BriefRecord, RecordCall } from './brief-record.js';

/** One FX call, resolved as a miss, unless overridden. */
export function recordCall(over: Partial<RecordCall> = {}): RecordCall {
  return {
    id: 90_001,
    kind: 'fx_devaluation',
    country_code: 'UG',
    name: 'Uganda',
    claim: 'UGX depreciates 2.67% or more against USD at any point within 14 days, from 3987.66.',
    probability: 0.371,
    base_rate: 0.254,
    threshold: 1,
    threshold_pct: 2.674,
    made_on: '2026-11-13',
    resolves_on: '2026-11-27',
    status: 'miss',
    evidence_count: 112,
    corrected_status: null,
    ...over,
  };
}

const CURRENCIES: Array<[string, string, string]> = [
  ['UG', 'Uganda', 'UGX'],
  ['MX', 'Mexico', 'MXN'],
  ['BD', 'Bangladesh', 'BDT'],
  ['IQ', 'Iraq', 'IQD'],
  ['AO', 'Angola', 'AOA'],
  ['TW', 'Taiwan', 'TWD'],
  ['TN', 'Tunisia', 'TND'],
  ['ZW', 'Zimbabwe', 'ZWG'],
  ['EG', 'Egypt', 'EGP'],
  ['CD', 'DR Congo', 'CDF'],
  ['KE', 'Kenya', 'KES'],
  ['AZ', 'Azerbaijan', 'AZN'],
  ['GH', 'Ghana', 'GHS'],
  ['NG', 'Nigeria', 'NGN'],
];

function fxCall(i: number, over: Partial<RecordCall>): RecordCall {
  const [code, name, ccy] = CURRENCIES[i % CURRENCIES.length];
  const t = Math.round((0.4 + i * 0.17) * 1000) / 1000;
  return recordCall({
    id: 90_100 + i,
    country_code: code,
    name,
    claim: `${ccy} depreciates ${t.toFixed(2)}% or more against USD at any point within 14 days, from ${(100 + i * 7.31).toFixed(2)}.`,
    // Spread around the base rate so the "most informative" order is well defined.
    probability: Math.round((0.2 + ((i * 37) % 21) / 100) * 1000) / 1000,
    base_rate: 0.25,
    threshold_pct: t,
    ...over,
  });
}

/**
 * A resolution day: 14 calls settled today (more than the list shows), 6 hits;
 * 789 open, 16 of them held past their date, the next five due tomorrow.
 */
export function recordDay(): BriefRecord {
  const resolved = Array.from({ length: 14 }, (_, i) =>
    fxCall(i, { status: i % 7 < 3 ? 'hit' : 'miss', made_on: '2026-11-13', resolves_on: '2026-11-27' }),
  );
  const next = Array.from({ length: 5 }, (_, i) =>
    fxCall(i + 20, { status: 'pending', made_on: '2026-11-14', resolves_on: '2026-11-28', evidence_count: null }),
  );
  return {
    resolved: {
      read: true,
      total: resolved.length,
      hits: resolved.filter((c) => c.status === 'hit').length,
      corrections: [],
      calls: resolved,
    },
    open: { read: true, total: 789, held: 16, next },
    correctionsPage: true,
  };
}
