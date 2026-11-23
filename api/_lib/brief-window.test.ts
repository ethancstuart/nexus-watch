import { describe, it, expect } from 'vitest';
import { briefDueAt, briefWindowCloses, deliveryTimeZone, isDueForBrief } from './brief-window.js';

/**
 * When is a subscriber due the brief for UTC date D?
 *
 * WHY THESE TESTS EXIST (16 Nov 2026). deliver-briefs matched subscribers whose
 * local hour was exactly 7 at the moment of the run, but the brief for UTC date
 * D only exists from ~10:00Z. Everyone whose 07:00 falls 00:00Z–09:59Z — the
 * UK, Europe, Africa, the Middle East, South Asia, and every row stored as
 * `UTC` — was matched only in hours when there was nothing to send, and so was
 * never sent anything. The admin copy went out regardless, which hid it.
 *
 * Synthetic data only: zones and instants, no database, no clock.
 */

const H = 3_600_000;
const at = (iso: string) => new Date(iso);
const utcHour = (date: string, h: number) => new Date(Date.parse(`${date}T00:00:00Z`) + h * H);
/** Run instants for UTC hours [from, to) of `date` (to may exceed 23). */
const hours = (date: string, from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => utcHour(date, from + i).getTime());

const DAY = '2026-11-16';
const BRIEF_READY_HOUR = 10; // daily-brief: cron `0 10 * * *`

/**
 * The first hourly run (UTC hour) that sends DAY's brief, given the brief is
 * renderable from 10:00Z. Derived by hand from each zone's offset on DAY:
 * 07:00 local before 10:00Z → 10; otherwise the hour of 07:00 local (rounded
 * up to the next run).
 */
const FIRST_SEND_HOUR: Record<string, number> = {
  'Europe/London': 10, //         +0     07:00 local = 07:00Z
  'Europe/Berlin': 10, //         +1     06:00Z
  'Africa/Lagos': 10, //          +1     06:00Z
  'Asia/Dubai': 10, //            +4     03:00Z
  'Asia/Kolkata': 10, //          +5:30  01:30Z
  'Asia/Kathmandu': 10, //        +5:45  01:15Z
  'Asia/Bangkok': 10, //          +7     00:00Z
  'Asia/Shanghai': 23, //         +8     23:00Z (07:00 on the 17th, local)
  'Asia/Tokyo': 22, //            +9     22:00Z
  'Australia/Sydney': 20, //      +11    20:00Z (DST)
  'Pacific/Kiritimati': 17, //    +14    17:00Z
  'Pacific/Auckland': 18, //      +13    18:00Z (DST)
  'America/Sao_Paulo': 10, //     -3     10:00Z — the old race hour
  'America/New_York': 12, //      -5     12:00Z
  'America/Chicago': 13, //       -6     13:00Z
  'America/Los_Angeles': 15, //   -8     15:00Z
  'Pacific/Honolulu': 17, //      -10    17:00Z
  'Etc/GMT+12': 19, //            -12    19:00Z
  UTC: 10, //                     +0     07:00Z
  'Not/A_Zone': 10, //            malformed → UTC
};
const ZONES = Object.keys(FIRST_SEND_HOUR);

/** The rule as deliver-briefs applies it: (a) brief exists, (b) not yet sent, (c) the window. */
type Rule = (zone: string, briefDate: string, now: Date) => boolean;
const newRule: Rule = isDueForBrief;

/** main @ 0ecaefb: `EXTRACT(HOUR FROM NOW() AT TIME ZONE COALESCE(z.name,'UTC')) = 7`. */
const oldRule: Rule = (zone, _briefDate, now) => {
  const z = deliveryTimeZone(zone);
  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: z, hour: '2-digit', hourCycle: 'h23' }).format(now));
  return hour === 7;
};

/**
 * Run the hourly cron across [fromDate, toDate] (UTC dates, inclusive), with
 * each day's brief renderable from `readyHour` on that UTC date. Returns every
 * send as { zone, briefDate, at }. Mirrors the handler: no brief → nothing;
 * the dedup table is keyed (subscriber, brief_date); `today` is the UTC date.
 */
function simulate(
  rule: Rule,
  zones: string[],
  fromDate: string,
  days: number,
  opts: { readyHour?: number; skipRuns?: number[]; missingBriefs?: string[]; carryOver?: boolean } = {},
) {
  const readyHour = opts.readyHour ?? BRIEF_READY_HOUR;
  const carryOver = opts.carryOver ?? true;
  const delivered = new Set<string>();
  const everSent = new Set<string>();
  const sends: Array<{ zone: string; briefDate: string; at: Date }> = [];
  const start = Date.parse(`${fromDate}T00:00:00Z`);
  const exists = (date: string, now: Date) =>
    !opts.missingBriefs?.includes(date) && (date < now.toISOString().slice(0, 10) || now.getUTCHours() >= readyHour);
  for (let h = 0; h < days * 24; h++) {
    const now = new Date(start + h * H);
    if (opts.skipRuns?.includes(now.getTime())) continue; // a failed or missed run
    const today = now.toISOString().slice(0, 10);
    const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 24 * H).toISOString().slice(0, 10);
    // (a) the latest renderable brief: today's once ready; before that (or if
    // today's never comes), yesterday's — as deliver-briefs serves them.
    let briefDate: string | null = null;
    if (exists(today, now)) briefDate = today;
    else if (carryOver && exists(yesterday, now)) briefDate = yesterday;
    if (!briefDate) continue;
    for (const zone of zones) {
      const key = `${zone}|${briefDate}`;
      if (delivered.has(key)) continue; // (b) dedup
      if (briefDate !== today && !everSent.has(zone)) continue; // a carried-over brief is never the first
      if (!rule(zone, briefDate, now)) continue; // (c)
      delivered.add(key);
      everSent.add(zone);
      sends.push({ zone, briefDate, at: now });
    }
  }
  return sends;
}

describe('who is due, hour by hour, on an ordinary day (brief ready 10:00Z)', () => {
  const sends = simulate(newRule, ZONES, DAY, 1);

  it.each(ZONES)('%s is sent exactly once, at the expected hour', (zone) => {
    const mine = sends.filter((s) => s.zone === zone);
    expect(mine).toHaveLength(1);
    expect(mine[0].at.getUTCHours()).toBe(FIRST_SEND_HOUR[zone]);
  });

  it('the full 24-hour table', () => {
    // Row per UTC hour: which zones the run sends to. Spelled out so a change
    // to the rule shows up as a readable diff, not a single boolean.
    const table: Record<number, string[]> = {};
    for (let h = 0; h < 24; h++) table[h] = sends.filter((s) => s.at.getUTCHours() === h).map((s) => s.zone);
    expect(table).toEqual({
      0: [],
      1: [],
      2: [],
      3: [],
      4: [],
      5: [],
      6: [],
      7: [],
      8: [],
      9: [],
      10: [
        'Europe/London',
        'Europe/Berlin',
        'Africa/Lagos',
        'Asia/Dubai',
        'Asia/Kolkata',
        'Asia/Kathmandu',
        'Asia/Bangkok',
        'America/Sao_Paulo',
        'UTC',
        'Not/A_Zone',
      ],
      11: [],
      12: ['America/New_York'],
      13: ['America/Chicago'],
      14: [],
      15: ['America/Los_Angeles'],
      16: [],
      17: ['Pacific/Kiritimati', 'Pacific/Honolulu'],
      18: ['Pacific/Auckland'],
      19: ['Etc/GMT+12'],
      20: ['Australia/Sydney'],
      21: [],
      22: ['Asia/Tokyo'],
      23: ['Asia/Shanghai'],
    });
  });

  it('nobody is sent before their own 07:00 local', () => {
    for (const s of sends) expect(s.at.getTime()).toBeGreaterThanOrEqual(briefDueAt(s.zone, s.briefDate).getTime());
  });
});

describe('the lost zones (fails on main)', () => {
  const LOST = [
    'Europe/London',
    'Europe/Berlin',
    'Africa/Lagos',
    'Asia/Dubai',
    'Asia/Kolkata',
    'Asia/Kathmandu',
    'Asia/Bangkok',
    'UTC',
    'Not/A_Zone',
  ];

  it('the old exact-hour rule never sends to them — this is the defect', () => {
    const old = simulate(oldRule, LOST, DAY, 7, { carryOver: false });
    expect(old).toEqual([]);
  });

  it('the new rule sends each of them once a day, every day for a week', () => {
    const sends = simulate(newRule, LOST, DAY, 7);
    expect(sends).toHaveLength(LOST.length * 7);
  });
});

describe('no one is due before the brief exists', () => {
  it('rule (c) alone can say "due" at 00:00Z, so the handler must gate on the brief — and the simulation does', () => {
    expect(isDueForBrief('Asia/Bangkok', DAY, utcHour(DAY, 0))).toBe(true);
    const sends = simulate(newRule, ZONES, DAY, 3);
    for (const s of sends) expect(s.at.getUTCHours()).toBeGreaterThanOrEqual(BRIEF_READY_HOUR);
  });

  it('a late brief (ready only from 14:00Z) is sent to everyone already due at the first run after it lands', () => {
    const sends = simulate(newRule, ZONES, DAY, 1, { readyHour: 14 });
    const at14 = sends.filter((s) => s.at.getUTCHours() === 14).map((s) => s.zone);
    expect(at14).toEqual(
      expect.arrayContaining(['Europe/London', 'America/Sao_Paulo', 'America/New_York', 'America/Chicago', 'UTC']),
    );
    expect(at14).not.toContain('America/Los_Angeles'); // its 07:00 is 15:00Z — not early
    expect(sends).toHaveLength(ZONES.length);
  });
});

describe('every subscriber is due at some hour of every UTC day', () => {
  // A full year of days, including every DST change in these zones.
  it.each(ZONES)('%s: exactly one send per UTC day for 365 days', (zone) => {
    const sends = simulate(newRule, [zone], '2026-01-01', 365);
    const perDay = new Map<string, number>();
    for (const s of sends) perDay.set(s.briefDate, (perDay.get(s.briefDate) ?? 0) + 1);
    expect(perDay.size).toBe(365);
    expect([...perDay.values()].every((n) => n === 1)).toBe(true);
  });

  it('every zone the runtime knows: its resolved 07:00 local lies inside each UTC day of 2026–2027 and reads 07:00', () => {
    // The rule says "their own 07:00 local that falls within UTC day D". For a
    // fixed offset there is always exactly one. A DST change could in principle
    // make it zero or two, but only for a zone whose offset straddles +7/+8;
    // the property is asserted against real tzdata, not assumed.
    const zones = Intl.supportedValuesOf('timeZone');
    // It also checks every resolved instant reads exactly 07:00 local, so a
    // zone whose change skipped or repeated 07:00 in this window would show
    // up here; none does.
    const bad: string[] = [];
    for (const zone of zones) {
      const local = new Intl.DateTimeFormat('en-GB', {
        timeZone: zone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
      for (let d = Date.parse('2026-01-01T00:00:00Z'); d < Date.parse('2028-01-01T00:00:00Z'); d += 24 * H) {
        const date = new Date(d).toISOString().slice(0, 10);
        const due = briefDueAt(zone, date).getTime();
        const hhmm = local.format(due);
        if (due < d || due >= d + 24 * H || hhmm !== '07:00') bad.push(`${zone} ${date} ${hhmm}`);
      }
    }
    expect(bad).toEqual([]);
  }, 60_000);
});

describe('catch-up and the date boundary', () => {
  it('a missed run is caught up by the next run in the same UTC day', () => {
    const missed = [utcHour(DAY, 15).getTime(), utcHour(DAY, 12).getTime()];
    const sends = simulate(newRule, ['America/Los_Angeles', 'America/New_York'], DAY, 1, { skipRuns: missed });
    expect(sends.map((s) => [s.zone, s.at.getUTCHours()])).toEqual([
      ['America/New_York', 13],
      ['America/Los_Angeles', 16],
    ]);
  });

  it("a brief's window closes at the end of the reader's own local day", () => {
    // Los Angeles: due 15:00Z, local midnight 08:00Z next day.
    expect(briefWindowCloses('America/Los_Angeles', DAY).toISOString()).toBe('2026-11-17T08:00:00.000Z');
    expect(isDueForBrief('America/Los_Angeles', DAY, at('2026-11-17T07:59:59Z'))).toBe(true);
    expect(isDueForBrief('America/Los_Angeles', DAY, at('2026-11-17T08:00:00Z'))).toBe(false);
    // Berlin: local midnight is 23:00Z, so no catch-up lands on the next local date.
    expect(briefWindowCloses('Europe/Berlin', DAY).toISOString()).toBe('2026-11-16T23:00:00.000Z');
    // Shanghai: due 23:00Z (07:00 on the 17th local), open until 16:00Z on the 17th.
    expect(briefWindowCloses('Asia/Shanghai', DAY).toISOString()).toBe('2026-11-17T16:00:00.000Z');
  });

  it('…but the handler stops serving it once the next brief is ready (the simulation serves the latest)', () => {
    // A day earlier first, so this reader has been sent before (carry-over is never a first brief).
    const sends = simulate(newRule, ['America/Los_Angeles'], '2026-11-15', 3, { skipRuns: hours(DAY, 15, 24) });
    // every run of the 16th from 15Z missed: caught up at 00Z on the 17th (16:00 local), still the 16th's brief
    expect(sends.slice(1).map((s) => [s.briefDate, s.at.toISOString()])).toEqual([
      ['2026-11-16', '2026-11-17T00:00:00.000Z'],
      ['2026-11-17', '2026-11-17T15:00:00.000Z'],
    ]);
  });

  it('zones that read the brief on the next local date get one per day, never two across midnight UTC', () => {
    const zones = [
      'Pacific/Kiritimati',
      'Pacific/Auckland',
      'Asia/Shanghai',
      'Asia/Tokyo',
      'Australia/Sydney',
      'Etc/GMT+12',
    ];
    const sends = simulate(newRule, zones, DAY, 4);
    for (const zone of zones) {
      const mine = sends.filter((s) => s.zone === zone);
      expect(mine.map((s) => s.briefDate)).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19']);
      // consecutive sends are a day apart, not minutes apart across 00:00Z
      for (let i = 1; i < mine.length; i++) expect(mine[i].at.getTime() - mine[i - 1].at.getTime()).toBe(24 * H);
    }
  });
});

describe('UTC+8 and friends: more than one chance a day (review finding 3)', () => {
  const PLUS8 = ['Asia/Shanghai', 'Asia/Singapore', 'Australia/Perth', 'Asia/Manila', 'Australia/Eucla'];

  it.each(PLUS8)('%s: a missed 23:00Z run is caught up in their morning, with the same brief', (zone) => {
    const sends = simulate(newRule, [zone], '2026-11-15', 3, { skipRuns: hours(DAY, 22, 24) });
    expect(sends.map((s) => s.briefDate)).toEqual(['2026-11-15', '2026-11-16', '2026-11-17']);
    expect(sends[1].at.toISOString()).toBe('2026-11-17T00:00:00.000Z');
  });

  it('on main-after-lane-B (window closed at midnight UTC) that reader lost the day', () => {
    const closedAtUtcMidnight: Rule = (zone, d, now) =>
      now.getTime() >= briefDueAt(zone, d).getTime() && now.getTime() < Date.parse(`${d}T00:00:00Z`) + 24 * H;
    const sends = simulate(closedAtUtcMidnight, ['Asia/Shanghai'], '2026-11-15', 3, {
      skipRuns: hours(DAY, 22, 24),
    });
    expect(sends.map((s) => s.briefDate)).toEqual(['2026-11-15', '2026-11-17']);
  });

  it('every one of the 20 table zones has at least two runs that can serve each day of 2026', () => {
    const single: string[] = [];
    for (const zone of ZONES) {
      for (let d = Date.parse('2026-01-01T00:00:00Z'); d < Date.parse('2027-01-01T00:00:00Z'); d += 24 * H) {
        const date = new Date(d).toISOString().slice(0, 10);
        // runs that serve D: D 10:00 … D+1 09:00 (today's brief, then carried over)
        const open = briefDueAt(zone, date).getTime();
        const close = briefWindowCloses(zone, date).getTime();
        let n = 0;
        for (let h = BRIEF_READY_HOUR; h < 24 + BRIEF_READY_HOUR; h++) if (d + h * H >= open && d + h * H < close) n++;
        if (n < 2) single.push(`${zone} ${date} ${n}`);
      }
    }
    expect(single).toEqual([]);
  });
});

describe('carry-over limits', () => {
  it("a carried-over brief is never anyone's first — no back-catalogue send on the day this deploys", () => {
    // Deploy at 00:00Z: yesterday's brief is renderable and Shanghai's window
    // for it is open, but this reader has never been sent anything.
    const sends = simulate(newRule, ['Asia/Shanghai'], DAY, 1);
    expect(sends.map((s) => [s.briefDate, s.at.getUTCHours()])).toEqual([[DAY, 23]]);
  });

  it("if the next brief never comes, yesterday's stops at the reader's local midnight — never a stale send", () => {
    const sends = simulate(newRule, ['Asia/Shanghai', 'America/Los_Angeles', 'Pacific/Kiritimati'], DAY, 3, {
      missingBriefs: ['2026-11-17'],
    });
    for (const s of sends) {
      expect(s.at.getTime()).toBeLessThan(briefWindowCloses(s.zone, s.briefDate).getTime());
      expect(s.briefDate).not.toBe('2026-11-17');
    }
    expect(sends.filter((s) => s.briefDate === '2026-11-18')).toHaveLength(3);
  });

  it('nobody gets two briefs on one local date, even after a whole day of missed runs', () => {
    const zones = ZONES.filter((z) => z !== 'Not/A_Zone');
    const sends = simulate(newRule, zones, '2026-11-15', 4, { skipRuns: hours('2026-11-16', 0, 24) });
    for (const zone of zones) {
      const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: zone, dateStyle: 'short' });
      const localDates = sends.filter((s) => s.zone === zone).map((s) => fmt.format(s.at));
      expect(new Set(localDates).size).toBe(localDates.length);
    }
  });
});

describe('briefDueAt: the instant of 07:00 local that falls within UTC day D', () => {
  it.each([
    ['Europe/London', DAY, '2026-11-16T07:00:00Z'],
    ['Asia/Kolkata', DAY, '2026-11-16T01:30:00Z'],
    ['Asia/Kathmandu', DAY, '2026-11-16T01:15:00Z'],
    ['Pacific/Kiritimati', DAY, '2026-11-16T17:00:00Z'],
    ['Etc/GMT+12', DAY, '2026-11-16T19:00:00Z'],
    ['Asia/Bangkok', DAY, '2026-11-16T00:00:00Z'], // +7: the boundary itself counts as inside D
    ['America/St_Johns', DAY, '2026-11-16T10:30:00Z'], // -3:30: due 10:30, so the 11:00 run
    ['Pacific/Marquesas', DAY, '2026-11-16T16:30:00Z'], // -9:30
    ['Pacific/Chatham', DAY, '2026-11-16T17:15:00Z'], // +13:45 (DST): 07:00 on the 17th local
  ])('%s on %s → %s', (zone, date, expected) => {
    expect(briefDueAt(zone, date).toISOString()).toBe(new Date(expected).toISOString());
  });

  // DST days. In every zone below the change happens at 01:00–03:00 local, so
  // 07:00 itself exists exactly once — what moves is its UTC instant.
  it.each([
    ['Europe/London', '2026-03-29', '2026-03-29T06:00:00Z'], // spring forward: 23-hour local day
    ['Europe/London', '2026-10-25', '2026-10-25T07:00:00Z'], // fall back: 25-hour local day
    ['America/New_York', '2026-03-08', '2026-03-08T11:00:00Z'], // 23-hour day
    ['America/New_York', '2026-11-01', '2026-11-01T12:00:00Z'], // 25-hour day
    ['America/Los_Angeles', '2026-11-01', '2026-11-01T15:00:00Z'],
    ['Australia/Sydney', '2026-10-03', '2026-10-03T20:00:00Z'], // 07:00 on 4 Oct local (+11), after the 02:00 change
    ['Australia/Sydney', '2026-04-04', '2026-04-04T21:00:00Z'], // 07:00 on 5 Apr local (+10), after the 03:00 change back
    ['Pacific/Auckland', '2026-09-26', '2026-09-26T18:00:00Z'], // 07:00 on 27 Sep local, NZDT
  ])('%s on %s → %s', (zone, date, expected) => {
    expect(briefDueAt(zone, date).toISOString()).toBe(new Date(expected).toISOString());
  });

  it('a zone with no DST is unaffected on a day others change', () => {
    expect(briefDueAt('Asia/Tokyo', '2026-03-29').toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(briefDueAt('America/Sao_Paulo', '2026-11-01').toISOString()).toBe('2026-11-01T10:00:00.000Z');
  });
});

describe('real changes that did skip 07:00 (historical tzdata)', () => {
  it('Samoa skipped 30 Dec 2011 local entirely: one send per UTC day, each at 07:00 local, none early', () => {
    const sends = simulate(newRule, ['Pacific/Apia'], '2011-12-28', 5);
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Pacific/Apia',
      dateStyle: 'short',
      timeStyle: 'short',
    });
    expect(sends.map((s) => [s.briefDate, local.format(s.at)])).toEqual([
      ['2011-12-28', '28/12/2011, 07:00'],
      ['2011-12-29', '29/12/2011, 07:00'],
      ['2011-12-30', '31/12/2011, 07:00'], // −10 → +14 at 10:00Z: the local 30th never happened
      ['2011-12-31', '01/01/2012, 07:00'],
      ['2012-01-01', '02/01/2012, 07:00'],
    ]);
  });

  it('when no 07:00 local falls inside the UTC day, the reader is due as soon as the brief exists', () => {
    // Sitka moved across the date line in 1867 (LMT +14:58 → −9:01), the
    // only case found where a UTC day holds no local 07:00. Its 07:00 had
    // already passed, so: due at the first run with a brief, not skipped.
    const due = briefDueAt('America/Sitka', '1867-10-19');
    expect(due.getTime()).toBeLessThan(Date.parse('1867-10-19T00:00:00Z'));
    expect(isDueForBrief('America/Sitka', '1867-10-19', at('1867-10-19T10:00:00Z'))).toBe(true);
  });
});

describe('stored values that are not a usable zone', () => {
  it.each([['UTC'], ['Etc/UTC'], ['utc']])('%s is 07:00Z', (zone) => {
    expect(briefDueAt(zone, DAY).toISOString()).toBe('2026-11-16T07:00:00.000Z');
  });

  it.each([
    ['Not/A_Zone'],
    ['America/Not_A_Zone'],
    [''],
    ['   '],
    ['x'.repeat(200)],
    [null],
    [undefined],
    [42],
    ["Europe/London'; DROP TABLE email_subscribers; --"],
  ])('%j never throws and falls back to UTC', (zone) => {
    expect(() => briefDueAt(zone, DAY)).not.toThrow();
    expect(deliveryTimeZone(zone)).toBe('UTC');
    expect(briefDueAt(zone, DAY).toISOString()).toBe('2026-11-16T07:00:00.000Z');
    expect(isDueForBrief(zone, DAY, utcHour(DAY, 10))).toBe(true);
  });

  it('one bad row does not change anyone else', () => {
    const sends = simulate(newRule, ['Not/A_Zone', 'America/Los_Angeles', 'Asia/Tokyo'], DAY, 1);
    expect(sends.map((s) => [s.zone, s.at.getUTCHours()])).toEqual([
      ['Not/A_Zone', 10],
      ['America/Los_Angeles', 15],
      ['Asia/Tokyo', 22],
    ]);
  });

  it('rejects a malformed brief date — that is a caller bug, not subscriber data', () => {
    expect(() => briefDueAt('UTC', '2026-13-01')).toThrow(RangeError);
    expect(() => briefDueAt('UTC', '16/11/2026')).toThrow(RangeError);
  });
});
