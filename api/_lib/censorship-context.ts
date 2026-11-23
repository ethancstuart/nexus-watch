/**
 * The censorship section of the daily brief's context, computed in code.
 *
 * WHY THIS EXISTS. Between 13 Sep and 5 Nov 2026 the brief told subscribers,
 * again and again, that Russia and Iran had hit "record" censorship. Checked
 * against OONI's daily totals, no Russia "record" was one and most Iran ones
 * were not (lanes2/DATA.md in the lead folder). The model had been given one
 * number per country — the sum of confirmed-blocked measurements over the last
 * week — and no total, no share and no history, so no comparison it wrote
 * could have been supported. A count of confirmed-blocked measurements rises
 * whenever volunteers run more tests; Russia's count tracked test volume while
 * its share sat flat at 4.0–4.8% all autumn.
 *
 * WHAT IT GIVES THE MODEL INSTEAD, per country: confirmed, total and share for
 * the last 7 complete UTC days, the same for the 7 days before, the highest
 * 7-day share in stored history, and RECORD MARKERS computed here. A record is
 * asserted by this function or not at all; the comparative-claims gate refuses
 * any draft that claims one the markers do not carry.
 *
 * Pure over rows, so tests run on synthetic data with no database.
 */

/** One stored day, as api/cron/source-ooni.ts writes it. */
export interface OoniDayRow {
  country_code: string;
  /** YYYY-MM-DD */
  measurement_date: string;
  confirmed_blocked: number;
  total_measurements: number;
}

export interface WindowStat {
  from: string;
  to: string;
  confirmed: number;
  total: number;
  /** confirmed ÷ total; null when total is 0. */
  share: number | null;
  /** Days in the window with a stored row that holds at least one test. */
  daysWithData: number;
}

/**
 * Computed claims the model may make, and the only ones the gate accepts:
 * records against the stored history, and direction against the previous
 * window. A comparison the markers do not carry is not made.
 */
export type CensorshipMarker =
  | 'highest-share'
  | 'lowest-share'
  | 'highest-count'
  | 'lowest-count'
  | 'share-up'
  | 'share-down'
  | 'count-up'
  | 'count-down'
  | 'count-doubled'
  | 'count-tripled';

export interface CountryCensorship {
  code: string;
  current: WindowStat;
  /** The 7 days before `current`; null when that window is not comparable. */
  previous: WindowStat | null;
  history: {
    since: string;
    /** Comparable windows before the current one. */
    comparableWindows: number;
    /** Highest share of any comparable window, current included. */
    highestShare: { share: number; to: string } | null;
  };
  markers: CensorshipMarker[];
}

/**
 * The first day the collector stored OONI's DAILY totals. Before 2026-09-12
 * it kept one hourly bucket per day (source-ooni.ts, "THE HOURLY-BUCKET
 * DEFECT"), so earlier rows understate counts by about 24× unless
 * scripts/backfill-ooni-daily.ts --write has been run — and whether it has is
 * not recorded anywhere this code can read. Comparing against those rows is
 * what made the 13 Sep "record" look like one.
 */
export const OONI_DAY_GRAIN_SINCE = '2026-09-12';

const WINDOW_DAYS = 7;
/** A window with fewer days of data than this is not compared with anything. */
const MIN_DAYS_FOR_COMPARISON = 6;
/**
 * Below this many tests in a window a share moves on a handful of probes. It
 * applies to EVERY window compared — current, previous and each one in the
 * history — so a thin week (35 tests at 60%) can neither set the "highest in
 * the history" figure nor block a real record. An independent review caught
 * the first version applying it to the current window only.
 */
export const MIN_TESTS_PER_WINDOW = 1000;
/** Two weeks of distinct window ends before "highest since" means anything. */
const MIN_HISTORY_WINDOWS = 14;
/** Shares within this of each other are a tie, not a record. */
const EPS = 1e-9;
/**
 * A change against the previous window smaller than this (relative) is not
 * "rose" or "fell": a 0.1% move is noise, and the headline audit
 * (lanes2/HEADLINE-AUDIT.md) judged trend claims by the same 5% bar.
 */
export const MIN_RELATIVE_CHANGE = 0.05;

function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function windowStat(byDay: Map<string, OoniDayRow>, to: string): WindowStat {
  const from = addDays(to, -(WINDOW_DAYS - 1));
  let confirmed = 0;
  let total = 0;
  let daysWithData = 0;
  for (let i = 0; i < WINDOW_DAYS; i++) {
    const row = byDay.get(addDays(from, i));
    // A row with no tests is a missing day, not a day of data: counting it
    // printed one real day as a full window.
    if (!row || !(row.total_measurements > 0)) continue;
    daysWithData++;
    confirmed += row.confirmed_blocked;
    total += row.total_measurements;
  }
  return { from, to, confirmed, total, share: total > 0 ? confirmed / total : null, daysWithData };
}

function comparable(w: WindowStat, since: string): boolean {
  return (
    w.from >= since && w.daysWithData >= MIN_DAYS_FOR_COMPARISON && w.share !== null && w.total >= MIN_TESTS_PER_WINDOW
  );
}

/** Counts are compared only between full weeks: a missing day lowers a count by itself. */
const fullWeek = (w: WindowStat) => w.daysWithData === WINDOW_DAYS;

/**
 * Summarise every country with confirmed-blocked measurements in the window
 * ending `endDate` (the last COMPLETE UTC day — today's row is partial and is
 * ignored), ordered by confirmed count, highest first.
 */
export function summariseCensorship(
  rows: OoniDayRow[],
  opts: { endDate: string; historySince: string },
): CountryCensorship[] {
  const { endDate, historySince } = opts;
  const byCountry = new Map<string, Map<string, OoniDayRow>>();
  for (const r of rows) {
    const day = r.measurement_date.slice(0, 10);
    if (day > endDate || day < historySince) continue;
    let m = byCountry.get(r.country_code);
    if (!m) byCountry.set(r.country_code, (m = new Map()));
    m.set(day, { ...r, measurement_date: day });
  }

  const out: CountryCensorship[] = [];
  for (const [code, byDay] of byCountry) {
    const current = windowStat(byDay, endDate);
    if (current.confirmed <= 0) continue;
    const prevStat = windowStat(byDay, addDays(endDate, -WINDOW_DAYS));
    const previous = comparable(prevStat, historySince) ? prevStat : null;

    // Every 7-day window ending before endDate whose start is on or after the
    // floor — overlapping, as DATA.md ranked them.
    const prior: WindowStat[] = [];
    for (let to = addDays(historySince, WINDOW_DAYS - 1); to < endDate; to = addDays(to, 1)) {
      const w = windowStat(byDay, to);
      if (comparable(w, historySince)) prior.push(w);
    }

    const currentComparable = comparable(current, historySince);
    let highestShare: { share: number; to: string } | null = null;
    for (const w of currentComparable ? [...prior, current] : prior) {
      if (highestShare === null || (w.share as number) > highestShare.share + EPS) {
        highestShare = { share: w.share as number, to: w.to };
      }
    }

    const markers: CensorshipMarker[] = [];
    // Count markers need the current week and every week compared to be
    // full: with a day missing, a count is lower because of the gap.
    const countsComparable = fullWeek(current) && prior.every(fullWeek);
    if (currentComparable && prior.length >= MIN_HISTORY_WINDOWS) {
      const share = current.share as number;
      const shares = prior.map((w) => w.share as number);
      const counts = prior.map((w) => w.confirmed);
      const highShare = shares.every((s) => share > s + EPS);
      const lowShare = shares.every((s) => share < s - EPS);
      // A count record ALONE is a test-volume reading (Russia, every week of
      // the autumn). It is marked only when the share made the same record,
      // so the marker never certifies a volume artifact as censorship.
      if (highShare) {
        markers.push('highest-share');
        if (countsComparable && counts.every((c) => current.confirmed > c)) markers.push('highest-count');
      }
      if (lowShare) {
        markers.push('lowest-share');
        if (countsComparable && counts.every((c) => current.confirmed < c)) markers.push('lowest-count');
      }
    }
    // Direction against the previous window, for "rose", "fell", "up from";
    // only a change of at least MIN_RELATIVE_CHANGE counts.
    if (currentComparable && previous) {
      const ratio = (current.share as number) / (previous.share as number);
      if (ratio >= 1 + MIN_RELATIVE_CHANGE) markers.push('share-up');
      if (ratio <= 1 - MIN_RELATIVE_CHANGE) markers.push('share-down');
      if (fullWeek(current) && fullWeek(previous) && previous.confirmed > 0) {
        const r = current.confirmed / previous.confirmed;
        if (r >= 1 + MIN_RELATIVE_CHANGE) markers.push('count-up');
        if (r <= 1 - MIN_RELATIVE_CHANGE) markers.push('count-down');
        if (r >= 2) markers.push('count-doubled');
        if (r >= 3) markers.push('count-tripled');
      }
    }

    out.push({
      code,
      current,
      previous,
      history: { since: historySince, comparableWindows: prior.length, highestShare },
      markers,
    });
  }
  return out.sort((a, b) => b.current.confirmed - a.current.confirmed || a.code.localeCompare(b.code));
}

/** The section header's description of the window. */
export function censorshipWindowLabel(endDate: string, historySince: string): string {
  return `window = ${WINDOW_DAYS} complete days to ${endDate} (UTC); previous window = the ${WINDOW_DAYS} days before; history = every ${WINDOW_DAYS}-day window since ${historySince}`;
}

const n = (v: number) => v.toLocaleString('en-US');
const pct = (s: number) => `${(s * 100).toFixed(1)}%`;

/**
 * One context line. The phrase "MARKERS:" and the marker names are a
 * contract with parseRecordMarkers in comparative-claims.ts. The history floor
 * is stated once, in the section header (censorshipWindowLabel), not per line:
 * every numeral here is one more for groundDraft's pairwise support set, which
 * only spans the context's first 400 numerals.
 */
export function formatCensorshipLine(c: CountryCensorship, name: string): string {
  const cur = c.current;
  const coverage = cur.daysWithData < WINDOW_DAYS ? ` (data on ${cur.daysWithData} of ${WINDOW_DAYS} days)` : '';
  const head = `${name} (${c.code}): ${n(cur.confirmed)} of ${n(cur.total)} OONI measurements confirmed blocked (${cur.share === null ? 'n/a' : pct(cur.share)})${coverage}`;
  const prev = c.previous
    ? `previous window ${n(c.previous.confirmed)} of ${n(c.previous.total)} (${pct(c.previous.share as number)})`
    : `previous window: no comparable data`;
  const hist =
    c.history.comparableWindows >= MIN_HISTORY_WINDOWS && c.history.highestShare
      ? `highest share in the history: ${pct(c.history.highestShare.share)} (window to ${c.history.highestShare.to})`
      : `history too short to compare`;
  return `${head}; ${prev}; ${hist}. MARKERS: ${c.markers.length > 0 ? c.markers.join(', ') : 'none'}`;
}
