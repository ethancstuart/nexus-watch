import { describe, it, expect } from 'vitest';
import { standingCorrection } from './call-correction.js';
import { correctedOutcomeOf } from './calls.js';

const row = (corrected_status: string, issued_on = '2026-09-13') => ({ corrected_status, issued_on });

describe("standingCorrection: the ledger's rule, reused", () => {
  it('the latest row, when correctedOutcomeOf says it changes a scored verdict', () => {
    expect(standingCorrection('miss', [row('hit')])).toEqual(row('hit'));
    expect(standingCorrection('hit', [row('miss')])).toEqual(row('miss'));
  });

  it('agrees with correctedOutcomeOf on every published and corrected pair', () => {
    const statuses = ['hit', 'miss', 'unresolvable', 'void', 'pending'];
    for (const published of ['hit', 'miss']) {
      for (const corrected of statuses) {
        expect(standingCorrection(published, [row(corrected)]) !== null, `${published} → ${corrected}`).toBe(
          correctedOutcomeOf(published, corrected) !== undefined,
        );
      }
    }
  });

  it('only the latest row counts', () => {
    expect(standingCorrection('miss', [row('miss', '2026-10-01'), row('hit')])).toBeNull();
    expect(standingCorrection('miss', [row('hit', '2026-10-01'), row('miss')])).toEqual(row('hit', '2026-10-01'));
  });

  it('nothing for no rows, or for a call that was not scored', () => {
    expect(standingCorrection('miss', [])).toBeNull();
    for (const published of ['unresolvable', 'void', 'pending']) {
      expect(standingCorrection(published, [row('hit')]), published).toBeNull();
    }
  });
});
