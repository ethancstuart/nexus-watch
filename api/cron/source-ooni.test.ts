import { describe, it, expect } from 'vitest';
import { thinnestFirst, BACKFILL_DAYS, CONCURRENCY, COVERAGE_LOOKBACK_DAYS } from './source-ooni.js';

/**
 * The fixture is production on 2026-09-12: fourteen-day row counts for the
 * forty probe countries. The hand-ordered list had the thin ones at positions
 * 30 to 40, behind Iran, China and Russia; a slow day never reached them.
 */
const LIST = ['IR', 'CN', 'RU', 'SD', 'SS', 'ML', 'NE', 'TD', 'CF', 'SO', 'HT', 'LB', 'KP'] as const;
const COUNTS = new Map<string, number>([
  ['IR', 14],
  ['CN', 14],
  ['RU', 14],
  ['SD', 6],
  ['SS', 2],
  ['ML', 6],
  ['NE', 4],
  ['TD', 3],
  ['CF', 1],
  ['SO', 5],
  ['HT', 11],
  ['LB', 12],
  // KP: no rows at all, so absent from the counts entirely.
]);

describe('thinnestFirst — the order is derived from the table, not from the list', () => {
  it('puts the countries with the least evidence first, and a country with none first of all', () => {
    const order = thinnestFirst(LIST, COUNTS);
    expect(order.slice(0, 9)).toEqual(['KP', 'CF', 'SS', 'TD', 'NE', 'SO', 'SD', 'ML', 'HT']);
  });

  it('sends the well-covered countries to the tail, where a deadline can afford to skip them', () => {
    const order = thinnestFirst(LIST, COUNTS);
    expect(order.slice(-3)).toEqual(['IR', 'CN', 'RU']);
  });

  it('breaks ties by the list’s own order, so the sort is stable across runs', () => {
    const order = thinnestFirst(LIST, COUNTS);
    // SD and ML are both at 6; SD precedes ML in the list.
    expect(order.indexOf('SD')).toBeLessThan(order.indexOf('ML'));
    // The three at 14 keep IR, CN, RU.
    expect(order.slice(-3)).toEqual(['IR', 'CN', 'RU']);
  });

  it('does not lose or invent a country', () => {
    const order = thinnestFirst(LIST, COUNTS);
    expect([...order].sort()).toEqual([...LIST].sort());
  });

  it('with no counts at all, keeps the list order — a collector must never refuse to collect', () => {
    expect(thinnestFirst(LIST, new Map())).toEqual([...LIST]);
  });

  it('does not mutate its input', () => {
    const before = [...LIST];
    thinnestFirst(LIST, COUNTS);
    expect([...LIST]).toEqual(before);
  });
});

describe('the constants say what the docstring claims', () => {
  it('backfills more than one day, so a missed run is healed by the next', () => {
    expect(BACKFILL_DAYS).toBeGreaterThanOrEqual(2);
  });

  it('measures thinness over the resolver’s own fortnight', () => {
    expect(COVERAGE_LOOKBACK_DAYS).toBe(14);
  });

  it('keeps concurrency modest against a volunteer-funded API', () => {
    expect(CONCURRENCY).toBeGreaterThanOrEqual(2);
    expect(CONCURRENCY).toBeLessThanOrEqual(6);
  });
});
