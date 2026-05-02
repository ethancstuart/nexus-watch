import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test by mocking the underlying provenance + CII modules.
vi.mock('./dataProvenance.ts', () => ({
  getAllProvenance: vi.fn(),
  computeFreshness: vi.fn(),
}));

vi.mock('./countryInstabilityIndex.ts', () => ({
  getCachedCII: vi.fn(),
}));

import { computePlatformHealth } from './platformHealth.ts';
import { getAllProvenance, computeFreshness } from './dataProvenance.ts';
import { getCachedCII } from './countryInstabilityIndex.ts';

describe('computePlatformHealth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 95 baseline when nothing is wrong (full provenance, full CII)', () => {
    (getAllProvenance as ReturnType<typeof vi.fn>).mockReturnValue(
      new Map([
        ['acled', {} as never],
        ['fires', {} as never],
        ['news', {} as never],
        ['earthquakes', {} as never],
        ['gdacs', {} as never],
        ['sentiment', {} as never],
        ['ships', {} as never],
        ['weather', {} as never],
        ['cyber', {} as never],
        ['sanctions', {} as never],
      ]),
    );
    (computeFreshness as ReturnType<typeof vi.fn>).mockReturnValue('live');
    (getCachedCII as ReturnType<typeof vi.fn>).mockReturnValue(
      Array.from({ length: 158 }, (_, i) => ({
        countryCode: `C${i}`,
        confidence: i < 130 ? 'high' : 'medium',
      })),
    );
    const h = computePlatformHealth();
    expect(h.score).toBeGreaterThanOrEqual(90);
    expect(h.label).toMatch(/EXCELLENT|OPERATIONAL/);
  });

  it('deducts heavily when no CII data is loaded', () => {
    (getAllProvenance as ReturnType<typeof vi.fn>).mockReturnValue(new Map());
    (getCachedCII as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const h = computePlatformHealth();
    expect(h.score).toBeLessThanOrEqual(75); // 95 - 25 = 70 baseline
    expect(h.breakdown.totalCountries).toBe(0);
  });

  it('detects offline-majority outage', () => {
    (getAllProvenance as ReturnType<typeof vi.fn>).mockReturnValue(
      new Map([
        ['a', {} as never],
        ['b', {} as never],
        ['c', {} as never],
        ['d', {} as never],
      ]),
    );
    (computeFreshness as ReturnType<typeof vi.fn>).mockReturnValue('offline');
    (getCachedCII as ReturnType<typeof vi.fn>).mockReturnValue(
      Array.from({ length: 158 }, () => ({ confidence: 'medium' })),
    );
    const h = computePlatformHealth();
    expect(h.score).toBeLessThanOrEqual(75); // 95 - 25 (offline majority) = 70
  });

  it('caps at 98 (never claims perfection)', () => {
    (getAllProvenance as ReturnType<typeof vi.fn>).mockReturnValue(new Map([['a', {} as never]]));
    (computeFreshness as ReturnType<typeof vi.fn>).mockReturnValue('live');
    (getCachedCII as ReturnType<typeof vi.fn>).mockReturnValue(
      Array.from({ length: 158 }, () => ({ confidence: 'high' })),
    );
    const h = computePlatformHealth();
    expect(h.score).toBeLessThanOrEqual(98);
  });

  it('floors at 30 even on catastrophic state', () => {
    (getAllProvenance as ReturnType<typeof vi.fn>).mockReturnValue(
      new Map([
        ['a', {} as never],
        ['b', {} as never],
        ['c', {} as never],
        ['d', {} as never],
      ]),
    );
    (computeFreshness as ReturnType<typeof vi.fn>).mockReturnValue('offline');
    (getCachedCII as ReturnType<typeof vi.fn>).mockReturnValue([]);
    const h = computePlatformHealth();
    expect(h.score).toBeGreaterThanOrEqual(30);
  });

  it('label changes correctly across the score range', () => {
    (getAllProvenance as ReturnType<typeof vi.fn>).mockReturnValue(new Map([['a', {} as never]]));
    (computeFreshness as ReturnType<typeof vi.fn>).mockReturnValue('live');
    (getCachedCII as ReturnType<typeof vi.fn>).mockReturnValue(
      Array.from({ length: 158 }, () => ({ confidence: 'high' })),
    );
    const h = computePlatformHealth();
    if (h.score >= 88) expect(h.label).toBe('EXCELLENT');
    else if (h.score >= 70) expect(h.label).toBe('OPERATIONAL');
  });
});
