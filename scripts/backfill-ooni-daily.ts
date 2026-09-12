/**
 * Re-ingest ooni_measurements at DAY grain — dry run by default.
 *
 * WHY. Until 2026-09-12 the OONI collector asked for one-to-three-day windows
 * without stating a time grain, and OONI answered in hourly buckets. The
 * day-keyed upsert kept whichever hour arrived last, so every row in the table
 * holds one hour's measurements and one hour's confirmed blocks, labelled as
 * the day. api/cron/source-ooni.ts carries the full finding and the numbers.
 *
 * WHAT THIS DOES. For every country the evidence table holds, fetches OONI's
 * daily totals from `since` to today with `time_grain=day` and compares them
 * with the stored rows. Without --write it PRINTS the diff and touches
 * nothing. With --write it upserts the true totals — which CORRECTS rows the
 * collector stored from an hourly bucket and ADDS rows for days OONI has
 * measurements the collector never stored at all. A stored day OONI no longer
 * reports measurements for is left as it is and named in the report: there is
 * no daily total to correct it with. It never touches `calls`: a resolved
 * call is never rewritten, and what the corrected evidence means for the 54
 * published misses that are hits is a published correction decided by the
 * owner, not a script.
 *
 * TWO PHASES. Phase one fetches and compares every country and writes
 * nothing. Phase two writes the plan — only if phase one fetched every
 * country. A --write run is therefore all-or-nothing at the country level:
 * one failed request means NOTHING is written, the failures are named, and
 * the exit code is 1. A partial report is not a report and a partial write is
 * not a backfill. (A database failure mid-write can still stop phase two
 * early; every upsert is idempotent, so the re-run completes it.) Two
 * independent review rounds caught the versions that skipped a failed country
 * with exit 0, and then wrote as they went.
 *
 * Usage:
 *   npx tsx scripts/backfill-ooni-daily.ts                 # dry run, since 2026-04-18
 *   npx tsx scripts/backfill-ooni-daily.ts --since 2026-08-01    # or --since=2026-08-01
 *   npx tsx scripts/backfill-ooni-daily.ts --write         # after the owner's go
 */
import { neon } from '@neondatabase/serverless';

// Overridable so the failure path can be exercised: point it at a dead path
// and every country must be reported as failed, nothing written, exit 1.
const OONI_API = process.env.OONI_API_BASE ?? 'https://api.ooni.io/api/v1';
const DEFAULT_SINCE = '2026-04-18';
// OONI rate-limits (429) and has bad minutes (5xx). Both are waited out: the
// alternative is a whole run abandoned, because phase two writes nothing
// unless every country answered. Four dry runs in twenty minutes on
// 2026-09-12 were enough to be told 429 for all 39 countries.
const MAX_ATTEMPTS = 4;
const RETRY_BASE_MS = 30_000;
const COUNTRY_GAP_MS = 400;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar date in YYYY-MM-DD, not merely something shaped like one. */
function isCalendarDate(s: string): boolean {
  if (!DATE_RE.test(s)) return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
}

/**
 * Strict: every token is either a known flag or an error. A script that can
 * write must never run with an argument it did not understand — an
 * independent review found `--since=2026-08-01` being silently dropped, which
 * under --write would have backfilled from the default date instead.
 */
function parseArgs(argv: string[]): { write: boolean; since: string } {
  let write = false;
  let since: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--write') {
      write = true;
      continue;
    }
    if (a === '--since' || a.startsWith('--since=')) {
      const v = a === '--since' ? argv[++i] : a.slice('--since='.length);
      // `--since --write` must not turn "--write" into the window's start,
      // and 2026-99-99 must not reach the query.
      if (!isCalendarDate(v ?? '')) {
        throw new Error(`--since needs a real YYYY-MM-DD date, got ${JSON.stringify(v)}`);
      }
      since = v;
      continue;
    }
    throw new Error(
      `unknown argument ${JSON.stringify(a)} — usage: [--write] [--since YYYY-MM-DD | --since=YYYY-MM-DD]`,
    );
  }
  return { write, since: since ?? DEFAULT_SINCE };
}

interface Bucket {
  measurement_start_day: string;
  anomaly_count: number;
  confirmed_count: number;
  measurement_count: number;
}

const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

/** Fetch one country's daily buckets, waiting out 429/5xx up to MAX_ATTEMPTS. */
async function fetchBuckets(url: string, log: (m: string) => void): Promise<Bucket[]> {
  for (let attempt = 1; ; attempt++) {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: { 'User-Agent': 'NexusWatch/1.0 (+https://nexuswatch.dev)' },
    });
    if (r.ok) return ((await r.json()) as { result?: Bucket[] }).result ?? [];
    const retryable = r.status === 429 || r.status >= 500;
    if (!retryable || attempt >= MAX_ATTEMPTS) throw new Error(`HTTP ${r.status} after ${attempt} attempt(s)`);
    const retryAfter = Number(r.headers.get('retry-after'));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : RETRY_BASE_MS * 2 ** (attempt - 1);
    log(`HTTP ${r.status} — attempt ${attempt} of ${MAX_ATTEMPTS}, retrying in ${Math.round(waitMs / 1000)}s`);
    await sleep(waitMs);
  }
}

interface StoredRow {
  d: string;
  anomaly_count: number;
  confirmed_blocked: number;
  total_measurements: number;
}

async function main(): Promise<void> {
  const { write, since } = parseArgs(process.argv.slice(2));
  const today = new Date().toISOString().slice(0, 10);
  const dbUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
  const sql = neon(dbUrl);

  // The scope of a backfill is the table it corrects: every country the
  // evidence table has ever held a row for, DERIVED from the table rather
  // than copied from the collector's list. A country the collector has since
  // stopped watching still has rows to correct; a country it never watched
  // has nothing to correct. An independent review caught the copied list.
  const countryRows = (await sql`
    SELECT DISTINCT country_code FROM ooni_measurements ORDER BY country_code
  `) as unknown as Array<{ country_code: string }>;
  const countries = countryRows.map((r) => r.country_code);
  if (countries.length === 0) {
    throw new Error('ooni_measurements is empty — nothing to backfill, refusing to report success');
  }

  console.log(
    `${write ? 'WRITE' : 'DRY RUN'} — day-grain backfill ${since} → ${today}, ${countries.length} countries from the table`,
  );

  // ---- PHASE ONE: fetch and compare. Nothing is written here. ----
  let rowsChanged = 0;
  let rowsAdded = 0;
  let rowsSame = 0;
  let rowsLeft = 0;
  const perCountry: string[] = [];
  const failed: string[] = [];
  const plan: Array<{ cc: string; d: string; b: Bucket }> = [];

  for (const cc of countries) {
    const url = `${OONI_API}/aggregation?probe_cc=${cc}&since=${since}&until=${today}&test_name=web_connectivity&axis_x=measurement_start_day&time_grain=day`;
    let buckets: Bucket[];
    try {
      buckets = (await fetchBuckets(url, (m) => console.error(`  ${cc}: ${m}`))).filter((b) => b.measurement_count > 0);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`  ${cc}: FAILED (${reason})`);
      failed.push(cc);
      continue;
    }
    // Same key the write targets: (country_code, test_name, measurement_date).
    const stored = (await sql`
      SELECT measurement_date::text AS d, anomaly_count, confirmed_blocked, total_measurements
      FROM ooni_measurements
      WHERE country_code = ${cc} AND test_name = 'web_connectivity' AND measurement_date >= ${since}::date
    `) as unknown as StoredRow[];
    const byDay = new Map(stored.map((s) => [s.d, s]));
    const seen = new Set<string>();

    let changed = 0;
    let added = 0;
    let flippedBlockedDays = 0;
    for (const b of buckets) {
      const d = b.measurement_start_day.slice(0, 10);
      seen.add(d);
      const s = byDay.get(d);
      const same =
        s &&
        s.anomaly_count === b.anomaly_count &&
        s.confirmed_blocked === b.confirmed_count &&
        s.total_measurements === b.measurement_count;
      if (same) {
        rowsSame++;
        continue;
      }
      if (!s) added++;
      else {
        changed++;
        if (s.confirmed_blocked > 0 !== b.confirmed_count > 0) flippedBlockedDays++;
      }
      plan.push({ cc, d, b });
    }
    // Stored days OONI reports no measurements for: left as they are, and said.
    const left = stored.filter((s) => !seen.has(s.d)).length;
    rowsLeft += left;
    rowsChanged += changed;
    rowsAdded += added;
    perCountry.push(
      `${cc}: ${changed} changed, ${added} added, ${flippedBlockedDays} day(s) whose blocked/not-blocked reading flips` +
        (left > 0 ? `, ${left} stored day(s) OONI has no total for (left as is)` : ''),
    );
    await sleep(COUNTRY_GAP_MS);
  }

  for (const line of perCountry) console.log('  ' + line);
  console.log(
    `\n${write ? 'TO WRITE' : 'WOULD WRITE'}: ${rowsChanged} rows corrected, ${rowsAdded} rows added, ${rowsSame} already true, ${rowsLeft} left as is.`,
  );

  if (failed.length > 0) {
    console.error(
      `\nINCOMPLETE: ${failed.length} of ${countries.length} countries could not be fetched (${failed.join(' ')}). ` +
        (write
          ? 'NOTHING WRITTEN — a backfill that skips a country is not a backfill.'
          : 'The comparison above is partial.') +
        ' Re-run once OONI answers for them.',
    );
    process.exit(1);
  }
  if (!write) {
    console.log(
      'Nothing was written. Re-run with --write after the owner has decided how the 54 published misses are to be corrected.',
    );
    return;
  }

  // ---- PHASE TWO: every country answered; write the plan. ----
  let written = 0;
  for (const { cc, d, b } of plan) {
    await sql`
      INSERT INTO ooni_measurements (country_code, test_name, measurement_date, anomaly_count, confirmed_blocked, total_measurements)
      VALUES (${cc}, 'web_connectivity', ${d}, ${b.anomaly_count}, ${b.confirmed_count}, ${b.measurement_count})
      ON CONFLICT (country_code, test_name, measurement_date) DO UPDATE SET
        anomaly_count = EXCLUDED.anomaly_count,
        confirmed_blocked = EXCLUDED.confirmed_blocked,
        total_measurements = EXCLUDED.total_measurements
    `;
    written++;
  }
  console.log(`WROTE ${written} of ${plan.length} planned rows.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
