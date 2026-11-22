import { describe, it, expect } from 'vitest';
import {
  computeFailureStreaks,
  shouldAlert,
  channelsToAlert,
  formatAlertBody,
  RETIRED_CHANNELS,
  type DeliveryRow,
} from './delivery-health.js';

function row(channel: string, brief_date: string, status: string, error?: string): DeliveryRow {
  return { channel, brief_date, status, error: error ?? null };
}

/** N consecutive failed days for one channel, most recent last. */
function failedRun(channel: string, days: number, error = 'boom'): DeliveryRow[] {
  return Array.from({ length: days }, (_, i) =>
    row(channel, `2026-08-${String(i + 1).padStart(2, '0')}`, 'failed', error),
  );
}

describe('computeFailureStreaks', () => {
  it('counts consecutive failures back from the most recent date', () => {
    const [c] = computeFailureStreaks(failedRun('beehiiv', 4));
    expect(c.streak).toBe(4);
    expect(c.since).toBe('2026-08-01');
  });

  it('a success breaks the streak', () => {
    const rows = [...failedRun('buffer', 3), row('buffer', '2026-08-04', 'success')];
    expect(computeFailureStreaks(rows)[0].streak).toBe(0);
  });

  it('treats partial as NOT a failure — duplicates and plan-tier skips need no human', () => {
    const rows = [...failedRun('buffer', 3), row('buffer', '2026-08-04', 'partial')];
    expect(computeFailureStreaks(rows)[0].streak).toBe(0);
  });

  it('a success earlier in history does not shorten a current streak', () => {
    const rows = [row('beehiiv', '2026-07-01', 'success'), ...failedRun('beehiiv', 5)];
    expect(computeFailureStreaks(rows)[0].streak).toBe(5);
  });

  it('is order-independent', () => {
    const rows = failedRun('beehiiv', 5);
    const shuffled = [rows[3], rows[0], rows[4], rows[1], rows[2]];
    expect(computeFailureStreaks(shuffled)[0].streak).toBe(5);
  });

  it('a date with any success is not a failed date, even with a failed attempt', () => {
    const rows = [row('resend', '2026-08-01', 'failed', 'timeout'), row('resend', '2026-08-01', 'success')];
    expect(computeFailureStreaks(rows)[0].streak).toBe(0);
  });

  it('tracks channels independently and ranks the worst first', () => {
    const streaks = computeFailureStreaks([
      ...failedRun('beehiiv', 6),
      ...failedRun('buffer', 2),
      row('resend', '2026-08-06', 'success'),
    ]);
    expect(streaks.map((s) => [s.channel, s.streak])).toEqual([
      ['beehiiv', 6],
      ['buffer', 2],
      ['resend', 0],
    ]);
  });

  it('carries the most recent error for the alert body', () => {
    const rows = [
      row('beehiiv', '2026-08-01', 'failed', 'old error'),
      row('beehiiv', '2026-08-02', 'failed', 'newest error'),
    ];
    expect(computeFailureStreaks(rows)[0].lastError).toBe('newest error');
  });
});

describe('shouldAlert', () => {
  it('stays silent below the threshold', () => {
    expect(shouldAlert(0)).toBe(false);
    expect(shouldAlert(2)).toBe(false);
  });

  it('fires exactly at the threshold', () => {
    expect(shouldAlert(3)).toBe(true);
  });

  it('does not fire every day thereafter', () => {
    expect(shouldAlert(4)).toBe(false);
    expect(shouldAlert(5)).toBe(false);
  });

  it('repeats every 7 failures', () => {
    expect(shouldAlert(10)).toBe(true);
    expect(shouldAlert(17)).toBe(true);
  });
});

describe('the beehiiv outage it was written for', () => {
  it('would have alerted on day 3, not day 26', () => {
    const firstAlertDay = Array.from({ length: 26 }, (_, i) => i + 1).find((d) => shouldAlert(d));
    expect(firstAlertDay).toBe(3);
  });

  it('sends ~4 emails across a 26-day outage, not 26', () => {
    const alerts = Array.from({ length: 26 }, (_, i) => i + 1).filter((d) => shouldAlert(d));
    expect(alerts).toEqual([3, 10, 17, 24]);
  });

  it('selects only the broken channel out of a real mixed run', () => {
    const rows = [
      ...failedRun('notion', 3, 'notion page create 401: unauthorized'),
      row('resend', '2026-08-03', 'success'),
      row('archive', '2026-08-03', 'success'),
      row('buffer', '2026-08-03', 'partial'),
    ];
    expect(channelsToAlert(rows).map((c) => c.channel)).toEqual(['notion']);
  });

  it('is silent when everything is healthy', () => {
    const rows = ['resend', 'notion', 'archive', 'buffer'].map((c) => row(c, '2026-08-03', 'success'));
    expect(channelsToAlert(rows)).toEqual([]);
  });
});

describe('formatAlertBody', () => {
  it('names the channel, the streak, the date and the error', () => {
    const body = formatAlertBody(computeFailureStreaks(failedRun('beehiiv', 3, 'beehiiv 400: bad pub id')));
    expect(body).toContain('beehiiv');
    expect(body).toContain('3 consecutive failed briefs');
    expect(body).toContain('since 2026-08-01');
    expect(body).toContain('beehiiv 400: bad pub id');
  });

  it('says "brief" not "briefs" for a streak of one', () => {
    expect(formatAlertBody([{ channel: 'x', streak: 1, lastError: null, since: '2026-08-01' }])).toContain(
      '1 consecutive failed brief,',
    );
  });
});

/**
 * THE CLAMP TRAP. shouldAlert is boundary-sensitive by design: it fires at the
 * threshold and then once every repeatEvery failures. That is only a weekly
 * cadence if the streak it is handed is the TRUE streak. The caller's query
 * once looked back 45 days, so a channel broken for longer than that reported
 * a streak of exactly 45 every morning — and 45 is a boundary — so beehiiv
 * paged daily from 2026-09-10 until the window was removed. This pins the
 * arithmetic so the next person tempted to add a window sees why not.
 */
describe('a clamped streak defeats the cadence', () => {
  it('45 is a repeat boundary and 46 is not', () => {
    expect(shouldAlert(45)).toBe(true);
    expect(shouldAlert(46)).toBe(false);
    expect(shouldAlert(52)).toBe(true);
  });

  it('a streak frozen at a boundary re-alerts every day it is handed in', () => {
    const frozenByWindow = 45;
    const days = [1, 2, 3].map(() => shouldAlert(frozenByWindow));
    expect(days).toEqual([true, true, true]);
  });

  it('a streak that keeps counting reaches a boundary once per repeat interval', () => {
    const fired = [45, 46, 47, 48, 49, 50, 51, 52].filter((s) => shouldAlert(s));
    expect(fired).toEqual([45, 52]);
  });
});

/**
 * A RETIRED channel's streak is frozen: its old rows stay, and nothing new is
 * written. Frozen on a boundary, it would page daily forever, by the same
 * arithmetic as the clamp above. beehiiv was retired with an alert reporting
 * 199 consecutive failures, and 199 is a boundary.
 */
describe('a retired channel never alerts', () => {
  /** N consecutive failed days for one channel, ending on `last`. */
  const failedUntil = (channel: string, days: number, last: string, error = 'boom'): DeliveryRow[] =>
    Array.from({ length: days }, (_, i) => {
      const d = new Date(`${last}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - (days - 1 - i));
      return row(channel, d.toISOString().slice(0, 10), 'failed', error);
    });

  it('beehiiv is retired', () => {
    expect(RETIRED_CHANNELS.has('beehiiv')).toBe(true);
  });

  it("beehiiv's frozen 199-day streak sits on a boundary, and still raises nothing", () => {
    expect(shouldAlert(199)).toBe(true);
    const frozen = failedUntil('beehiiv', 199, '2026-11-22', 'beehiiv 400: publicationid pattern does not match');
    expect(computeFailureStreaks(frozen)[0].streak).toBe(199);
    expect(channelsToAlert(frozen)).toEqual([]);
  });

  it('on every later day, with the live channels healthy, nothing names beehiiv', () => {
    const frozen = failedUntil('beehiiv', 199, '2026-11-22');
    for (const day of ['2026-11-23', '2026-11-24', '2026-11-30', '2027-01-01']) {
      const rows = [...frozen, ...['archive', 'resend'].map((c) => row(c, day, 'success'))];
      expect(channelsToAlert(rows)).toEqual([]);
    }
  });

  it('whatever its frozen length, and whatever its last error said', () => {
    // Some old rows carry the `config_fault:` marker the retired publisher
    // wrote; some do not. Neither matters any more.
    for (let n = 1; n <= 400; n++) {
      const error = n % 2 ? `config_fault: day ${n}` : 'beehiiv 400: publicationid pattern does not match';
      expect(channelsToAlert(failedUntil('beehiiv', n, '2026-11-22', error)), `streak ${n}`).toEqual([]);
    }
  });

  it('a live channel failing beside it still alerts, alone', () => {
    const rows = [...failedUntil('beehiiv', 199, '2026-11-22'), ...failedUntil('notion', 3, '2026-11-25')];
    expect(channelsToAlert(rows).map((c) => c.channel)).toEqual(['notion']);
  });
});
