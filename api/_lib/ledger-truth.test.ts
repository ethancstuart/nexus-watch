import { describe, it, expect } from 'vitest';
import {
  checkDateFor,
  ledgerTruthVerdict,
  PAST_GRACE_DAYS,
  RESOLVER_SETTLED_UTC_MINUTES,
  SILENT_KEY,
  OVERDUE_KEY,
} from './ledger-truth.js';
import { UNRESOLVABLE_GRACE_DAYS } from './calls.js';

/**
 * The week of 2026-09-07 is the fixture. Every number below was read from
 * production on 09-12: 45 censorship calls held under the grace rule (ML, SO,
 * TD, CF, SS, SD, NE — six or seven per day since 09-06), a resolver that
 * disposed of 97 to 113 calls every single day, and 23 CRITICAL emails saying
 * calls were overdue. A correct check finds NOTHING in that week.
 */
describe('the week the old check paged 23 times', () => {
  it('finds nothing wrong when held calls are the only pending-past-date rows', () => {
    // 09-12 at 14:00 UTC: 109 due today (102 FX + 7 held censorship), 102 disposed,
    // and no pending call more than 7 days past its date.
    expect(
      ledgerTruthVerdict({
        checkDate: '2026-09-12',
        dueOnCheckDate: 109,
        disposedOnCheckDate: 102,
        pastGrace: 0,
        oldestPastGrace: null,
      }),
    ).toEqual([]);
  });

  it('still finds nothing at 00:00, when the day has not yet been judged', () => {
    // Before 10:15 the reading is of YESTERDAY, which the resolver completed.
    expect(
      ledgerTruthVerdict({
        checkDate: '2026-09-11',
        dueOnCheckDate: 105,
        disposedOnCheckDate: 98,
        pastGrace: 0,
        oldestPastGrace: null,
      }),
    ).toEqual([]);
  });
});

describe('the two conditions that ARE worth a page', () => {
  it('a day with calls due and nothing disposed of is a silent resolver', () => {
    const v = ledgerTruthVerdict({
      checkDate: '2026-09-13',
      dueOnCheckDate: 72,
      disposedOnCheckDate: 0,
      pastGrace: 0,
      oldestPastGrace: null,
    });
    expect(v.map((a) => a.key)).toEqual([SILENT_KEY]);
    expect(v[0]?.severity).toBe('critical');
    expect(v[0]?.title).toContain('2026-09-13');
  });

  it('a day with nothing due is not silence — there was nothing to do', () => {
    expect(
      ledgerTruthVerdict({
        checkDate: '2026-09-13',
        dueOnCheckDate: 0,
        disposedOnCheckDate: 0,
        pastGrace: 0,
        oldestPastGrace: null,
      }),
    ).toEqual([]);
  });

  it('a pending call past the grace window is a skipped row', () => {
    const v = ledgerTruthVerdict({
      checkDate: '2026-09-13',
      dueOnCheckDate: 70,
      disposedOnCheckDate: 65,
      pastGrace: 3,
      oldestPastGrace: '2026-09-04',
    });
    expect(v.map((a) => a.key)).toEqual([OVERDUE_KEY]);
    expect(v[0]?.body).toContain('2026-09-04');
    expect(v[0]?.body).toContain(`${PAST_GRACE_DAYS} days`);
  });

  it('both at once are two alarms with two stable keys, not one with a number in it', () => {
    const v = ledgerTruthVerdict({
      checkDate: '2026-09-13',
      dueOnCheckDate: 70,
      disposedOnCheckDate: 0,
      pastGrace: 12,
      oldestPastGrace: '2026-09-01',
    });
    expect(v.map((a) => a.key)).toEqual([SILENT_KEY, OVERDUE_KEY]);
    // The old key was `ledger:overdue:${count}` — a new alarm every time the
    // number moved. Neither key may ever carry a count again.
    for (const a of v) expect(a.key).not.toMatch(/\d/);
  });
});

describe('the grace boundary matches the resolver exactly', () => {
  it('is the resolver’s own constant, not a copy of it', () => {
    expect(PAST_GRACE_DAYS).toBe(UNRESOLVABLE_GRACE_DAYS);
  });
});

describe('which day is being judged', () => {
  it('judges yesterday before the resolver has had time to run', () => {
    expect(checkDateFor(new Date('2026-09-12T00:00:23Z'))).toBe('2026-09-11');
    expect(checkDateFor(new Date('2026-09-12T09:45:00Z'))).toBe('2026-09-11');
    expect(checkDateFor(new Date('2026-09-12T10:14:59Z'))).toBe('2026-09-11');
  });

  it('judges today from the first tick after the resolver has settled', () => {
    expect(checkDateFor(new Date('2026-09-12T10:15:00Z'))).toBe('2026-09-12');
    expect(checkDateFor(new Date('2026-09-12T10:30:23Z'))).toBe('2026-09-12');
    expect(checkDateFor(new Date('2026-09-12T23:30:00Z'))).toBe('2026-09-12');
  });

  it('crosses a month boundary in UTC, not local time', () => {
    expect(checkDateFor(new Date('2026-10-01T03:00:00Z'))).toBe('2026-09-30');
  });

  it('the settle point sits after the 09:45 run with slack, before the 10:30 tick', () => {
    expect(RESOLVER_SETTLED_UTC_MINUTES).toBeGreaterThan(9 * 60 + 45);
    expect(RESOLVER_SETTLED_UTC_MINUTES).toBeLessThanOrEqual(10 * 60 + 30);
  });
});
