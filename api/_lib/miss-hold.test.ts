import { describe, it, expect } from 'vitest';
import { missHoldReason, coverageRequirement } from './calls.js';

describe('missHoldReason — a miss is not published on evidence we do not have', () => {
  const req = coverageRequirement(14);

  it('holds when the window’s final day has never been seen, however good the rest is', () => {
    // The exact shape of the nine published misses: plenty of coverage across
    // the window, nothing at all for resolves_on, because OONI stores day D at
    // D+1 00:00 UTC and the resolver runs at 09:45 on day D.
    expect(missHoldReason({ finalDaySeen: false, coveredDays: 999, measurements: 9_999_999 }, req)).toBe(
      'final-day-unseen',
    );
  });

  it('publishes a miss once the final day is in and coverage is sufficient', () => {
    expect(
      missHoldReason({ finalDaySeen: true, coveredDays: req.minDays, measurements: req.minMeasurements }, req),
    ).toBeNull();
  });

  it('still holds thin coverage, and says which reason applies', () => {
    expect(missHoldReason({ finalDaySeen: true, coveredDays: req.minDays - 1, measurements: 10 ** 9 }, req)).toBe(
      'thin-coverage',
    );
    expect(
      missHoldReason({ finalDaySeen: true, coveredDays: 10 ** 6, measurements: req.minMeasurements - 1 }, req),
    ).toBe('thin-coverage');
  });

  it('reports the unseen final day FIRST, so the void_reason names the real cause', () => {
    expect(missHoldReason({ finalDaySeen: false, coveredDays: 0, measurements: 0 }, req)).toBe('final-day-unseen');
  });

  it('is the same rule at every horizon, derived from the window rather than a per-kind list', () => {
    for (const h of [7, 14, 30, 90]) {
      const r = coverageRequirement(h);
      expect(missHoldReason({ finalDaySeen: false, coveredDays: 10 ** 6, measurements: 10 ** 9 }, r)).toBe(
        'final-day-unseen',
      );
    }
  });
});
