import { describe, it, expect } from 'vitest';
import {
  summariseCensorship,
  formatCensorshipLine,
  censorshipWindowLabel,
  OONI_DAY_GRAIN_SINCE,
  MIN_TESTS_PER_WINDOW,
  MIN_RELATIVE_CHANGE,
  type OoniDayRow,
} from './censorship-context.js';
import { parseRecordMarkers } from './comparative-claims.js';

/** ISO day `n` days after `start`. */
function addDays(start: string, n: number): string {
  const d = new Date(`${start}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** One row per day from `from` to `to` inclusive; `fn` returns null for a day with no row. */
function series(
  cc: string,
  from: string,
  to: string,
  fn: (i: number, day: string) => { confirmed: number; total: number } | null,
): OoniDayRow[] {
  const rows: OoniDayRow[] = [];
  for (let i = 0; addDays(from, i) <= to; i++) {
    const day = addDays(from, i);
    const v = fn(i, day);
    if (v)
      rows.push({
        country_code: cc,
        measurement_date: day,
        confirmed_blocked: v.confirmed,
        total_measurements: v.total,
      });
  }
  return rows;
}

const SINCE = '2026-09-12';
const END = '2026-10-04';
const inCurrent = (day: string) => day >= '2026-09-28';

describe('summariseCensorship — windows are complete days, labelled truthfully', () => {
  it('current window is the 7 days ending endDate; previous is the 7 days before it', () => {
    const rows = series('IR', SINCE, END, () => ({ confirmed: 100, total: 1000 }));
    const [ir] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(ir.current).toMatchObject({ from: '2026-09-28', to: END, confirmed: 700, total: 7000, daysWithData: 7 });
    expect(ir.current.share).toBeCloseTo(0.1, 6);
    expect(ir.previous).toMatchObject({ from: '2026-09-21', to: '2026-09-27', confirmed: 700, total: 7000 });
  });

  it('ignores rows after endDate (today is partial) and before historySince', () => {
    const rows = [
      ...series('IR', '2026-09-01', '2026-10-05', () => ({ confirmed: 100, total: 1000 })),
      { country_code: 'IR', measurement_date: '2026-10-05', confirmed_blocked: 99999, total_measurements: 100000 },
    ];
    const [ir] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(ir.current.confirmed).toBe(700);
    expect(ir.history.since).toBe(SINCE);
  });

  it('the label states the window, the previous window and the history floor', () => {
    expect(censorshipWindowLabel(END, SINCE)).toBe(
      'window = 7 complete days to 2026-10-04 (UTC); previous window = the 7 days before; history = every 7-day window since 2026-09-12',
    );
  });

  it('orders countries by current confirmed count and drops those with none', () => {
    const rows = [
      ...series('RU', SINCE, END, () => ({ confirmed: 9000, total: 200000 })),
      ...series('IR', SINCE, END, () => ({ confirmed: 7000, total: 22000 })),
      ...series('NO', SINCE, END, () => ({ confirmed: 0, total: 5000 })),
    ];
    expect(summariseCensorship(rows, { endDate: END, historySince: SINCE }).map((c) => c.code)).toEqual(['RU', 'IR']);
  });
});

describe('summariseCensorship — markers are computed, never inferred from a count', () => {
  it('Iran 5 Oct shape: share and count rise above every prior window', () => {
    const rows = series('IR', SINCE, END, (_, d) =>
      inCurrent(d) ? { confirmed: 7400, total: 22000 } : { confirmed: 6000, total: 20000 },
    );
    const [ir] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(ir.markers).toEqual(['highest-share', 'highest-count', 'share-up', 'count-up']);
    expect(ir.history.highestShare?.to).toBe(END);
  });

  it('Russia shape: a count record driven by test volume with a flat share → no record, no share-up', () => {
    const rows = series('RU', SINCE, END, (_, d) =>
      inCurrent(d) ? { confirmed: 9000, total: 200000 } : { confirmed: 7200, total: 160000 },
    );
    const [ru] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    // The count did rise 25%, and that alone is all the markers say.
    expect(ru.markers).toEqual(['count-up']);
  });

  it('Iran 1 Nov shape: share at its period low → lowest-share and share-down, never a high', () => {
    const rows = series('IR', SINCE, '2026-10-31', (_, d) =>
      d >= '2026-10-25' ? { confirmed: 4000, total: 16000 } : { confirmed: 6000, total: 20000 },
    );
    const [ir] = summariseCensorship(rows, { endDate: '2026-10-31', historySince: SINCE });
    expect(ir.markers).toEqual(expect.arrayContaining(['lowest-share', 'share-down', 'count-down']));
    expect(ir.markers.some((m) => m.startsWith('highest') || m.endsWith('-up'))).toBe(false);
  });

  it(`a change under ${MIN_RELATIVE_CHANGE * 100}% is not "rose" or "fell"`, () => {
    const rows = series('RU', SINCE, END, (_, d) =>
      inCurrent(d) ? { confirmed: 9300, total: 200000 } : { confirmed: 9000, total: 200000 },
    );
    const [ru] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(ru.markers.filter((m) => /-(?:up|down)$/.test(m))).toEqual([]);
  });

  it('"doubled" and "tripled" are computed, not inferred from "up"', () => {
    const rows = series('CU', SINCE, END, (_, d) =>
      inCurrent(d) ? { confirmed: 700, total: 2000 } : { confirmed: 200, total: 2000 },
    );
    const [cu] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(cu.markers).toEqual(expect.arrayContaining(['count-up', 'count-doubled', 'count-tripled']));
  });

  it('too little history → no record marker, however high the week', () => {
    const end = addDays(SINCE, 12);
    const rows = series('IR', SINCE, end, (i) =>
      i >= 6 ? { confirmed: 9000, total: 20000 } : { confirmed: 1, total: 20000 },
    );
    const [ir] = summariseCensorship(rows, { endDate: end, historySince: SINCE });
    expect(ir.markers.filter((m) => /^(?:highest|lowest)/.test(m))).toEqual([]);
    expect(ir.history.comparableWindows).toBeLessThan(14);
  });

  it('a tie with an earlier window is not a record', () => {
    const rows = series('IR', SINCE, END, () => ({ confirmed: 3000, total: 10000 }));
    expect(summariseCensorship(rows, { endDate: END, historySince: SINCE })[0].markers).toEqual([]);
  });
});

/** The review's probes (reviews2/scratch/lane-j-head/api/_lib/zz-ctx-probe.test.ts), as tests. */
describe('summariseCensorship — the windows compared must be real weeks', () => {
  it(`a thin earlier window (35 tests at 60%) neither sets the history maximum nor blocks a record`, () => {
    const rows = series('DD', SINCE, END, (i, d) =>
      i >= 2 && i < 9
        ? { confirmed: 3, total: 5 }
        : inCurrent(d)
          ? { confirmed: 300, total: 1000 }
          : { confirmed: 200, total: 1000 },
    );
    const [dd] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(dd.history.highestShare?.share).toBeCloseTo(0.3, 6);
    expect(dd.markers).toContain('highest-share');
  });

  it(`a current window under ${MIN_TESTS_PER_WINDOW} tests carries no marker`, () => {
    const rows = series('GG', SINCE, END, (_, d) =>
      inCurrent(d) ? { confirmed: 100, total: 140 } : { confirmed: 50, total: 140 },
    );
    const [gg] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(gg.current.total).toBeLessThan(MIN_TESTS_PER_WINDOW);
    expect(gg.markers).toEqual([]);
  });

  it('a missing day in the current window gives no count marker (the count is lower because of the gap)', () => {
    const rows = series('CC', SINCE, END, (_, d) =>
      d === END ? null : inCurrent(d) ? { confirmed: 99, total: 1000 } : { confirmed: 100, total: 1000 },
    );
    const [cc] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(cc.current.daysWithData).toBe(6);
    expect(cc.markers.filter((m) => m.includes('count'))).toEqual([]);
  });

  it('a missing day in an earlier window gives no count marker either', () => {
    const rows = series('BB', SINCE, END, (_, d) =>
      d === '2026-09-20' ? null : inCurrent(d) ? { confirmed: 400, total: 1000 } : { confirmed: 200, total: 1000 },
    );
    const [bb] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(bb.markers).toContain('highest-share');
    expect(bb.markers).not.toContain('highest-count');
  });

  it('a row with zero tests is a missing day, not a day of data', () => {
    const rows = series('EE', SINCE, END, (_, d) =>
      inCurrent(d)
        ? d < END
          ? { confirmed: 0, total: 0 }
          : { confirmed: 50, total: 100 }
        : { confirmed: 10, total: 1000 },
    );
    const [ee] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(ee.current.daysWithData).toBe(1);
    expect(ee.markers).toEqual([]);
    expect(formatCensorshipLine(ee, 'Testland')).toContain('(data on 1 of 7 days)');
  });

  it('a window with missing days is not comparable and is not a record', () => {
    const rows = series('CU', SINCE, END, (i) => ({ confirmed: i * 10, total: 2000 })).filter(
      (r) => !(r.measurement_date >= '2026-09-29' && r.measurement_date <= '2026-10-02'),
    );
    const [cu] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
    expect(cu.current.daysWithData).toBe(3);
    expect(cu.markers).toEqual([]);
  });
});

describe('formatCensorshipLine — the context the model reads', () => {
  const rows = series('IR', SINCE, END, (_, d) =>
    inCurrent(d) ? { confirmed: 7400, total: 22000 } : { confirmed: 6000, total: 20000 },
  );
  const [ir] = summariseCensorship(rows, { endDate: END, historySince: SINCE });
  const line = formatCensorshipLine(ir, 'Iran');

  it('says measurements, gives total and share, the previous window and the markers', () => {
    expect(line).toBe(
      'Iran (IR): 51,800 of 154,000 OONI measurements confirmed blocked (33.6%); previous window 42,000 of 140,000 (30.0%); highest share in the history: 33.6% (window to 2026-10-04). MARKERS: highest-share, highest-count, share-up, count-up',
    );
    expect(line).not.toMatch(/\bblocks\b/);
  });

  it('round-trips through the gate parser', () => {
    expect(parseRecordMarkers(line)).toEqual(
      new Map([['IR', { name: 'Iran', markers: new Set(['highest-share', 'highest-count', 'share-up', 'count-up']) }]]),
    );
  });

  it('a country without a marker says "none", and an absent previous window says so', () => {
    const r2 = series('CU', '2026-09-30', END, () => ({ confirmed: 300, total: 2000 }));
    const [cu] = summariseCensorship(r2, { endDate: END, historySince: SINCE });
    const l = formatCensorshipLine(cu, 'Cuba');
    expect(l).toContain('previous window: no comparable data');
    expect(l).toContain('history too short to compare');
    expect(l.endsWith('MARKERS: none')).toBe(true);
  });
});

describe('OONI_DAY_GRAIN_SINCE', () => {
  it('is the day the collector stopped storing hourly samples (source-ooni.ts)', () => {
    expect(OONI_DAY_GRAIN_SINCE).toBe('2026-09-12');
  });
});
