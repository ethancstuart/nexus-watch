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
 * measurements the collector never stored at all. It never touches `calls`:
 * a resolved call is never rewritten, and what the corrected evidence means
 * for the 54 published misses that are hits is a published correction decided
 * by the owner, not a script.
 *
 * A country whose OONI request fails is NOT silently skipped: the run
 * finishes the other countries, names the failures, and exits 1. A partial
 * report is not a report and a partial write is not a backfill — an
 * independent review caught the earlier version, which logged the skip and
 * exited 0.
 *
 * Usage:
 *   npx tsx scripts/backfill-ooni-daily.ts                 # dry run, since 2026-04-18
 *   npx tsx scripts/backfill-ooni-daily.ts --since 2026-08-01
 *   npx tsx scripts/backfill-ooni-daily.ts --write         # after the owner's go
 */
import { neon } from '@neondatabase/serverless';

// Overridable so the failure path can be exercised: point it at a dead path
// and every country must be reported as failed and the exit code must be 1.
const OONI_API = process.env.OONI_API_BASE ?? 'https://api.ooni.io/api/v1';
const DEFAULT_SINCE = '2026-04-18';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface Bucket {
  measurement_start_day: string;
  anomaly_count: number;
  confirmed_count: number;
  measurement_count: number;
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const sinceIdx = process.argv.indexOf('--since');
  const sinceArg = sinceIdx > -1 ? process.argv[sinceIdx + 1] : undefined;
  if (sinceIdx > -1 && !DATE_RE.test(sinceArg ?? '')) {
    // `--since --write` must not turn "--write" into the window's start.
    throw new Error(`--since needs a YYYY-MM-DD date, got ${JSON.stringify(sinceArg)}`);
  }
  const since = sinceArg ?? DEFAULT_SINCE;
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

  let rowsChanged = 0;
  let rowsAdded = 0;
  let rowsSame = 0;
  const perCountry: string[] = [];
  const failed: string[] = [];

  for (const cc of countries) {
    const url = `${OONI_API}/aggregation?probe_cc=${cc}&since=${since}&until=${today}&test_name=web_connectivity&axis_x=measurement_start_day&time_grain=day`;
    let buckets: Bucket[];
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
        headers: { 'User-Agent': 'NexusWatch/1.0 (+https://nexuswatch.dev)' },
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      buckets = (((await r.json()) as { result?: Bucket[] }).result ?? []).filter((b) => b.measurement_count > 0);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`  ${cc}: FAILED (${reason}) — not corrected`);
      failed.push(cc);
      continue;
    }
    // Same key the write targets: (country_code, test_name, measurement_date).
    const stored = (await sql`
      SELECT measurement_date::text AS d, anomaly_count, confirmed_blocked, total_measurements
      FROM ooni_measurements
      WHERE country_code = ${cc} AND test_name = 'web_connectivity' AND measurement_date >= ${since}::date
    `) as unknown as Array<{ d: string; anomaly_count: number; confirmed_blocked: number; total_measurements: number }>;
    const byDay = new Map(stored.map((s) => [s.d, s]));

    let changed = 0;
    let added = 0;
    let flippedBlockedDays = 0;
    for (const b of buckets) {
      const d = b.measurement_start_day.slice(0, 10);
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
      if (write) {
        await sql`
          INSERT INTO ooni_measurements (country_code, test_name, measurement_date, anomaly_count, confirmed_blocked, total_measurements)
          VALUES (${cc}, 'web_connectivity', ${d}, ${b.anomaly_count}, ${b.confirmed_count}, ${b.measurement_count})
          ON CONFLICT (country_code, test_name, measurement_date) DO UPDATE SET
            anomaly_count = EXCLUDED.anomaly_count,
            confirmed_blocked = EXCLUDED.confirmed_blocked,
            total_measurements = EXCLUDED.total_measurements
        `;
      }
    }
    rowsChanged += changed;
    rowsAdded += added;
    perCountry.push(
      `${cc}: ${changed} changed, ${added} added, ${flippedBlockedDays} day(s) whose blocked/not-blocked reading flips`,
    );
    await new Promise((res) => setTimeout(res, 150));
  }

  for (const line of perCountry) console.log('  ' + line);
  console.log(
    `\n${write ? 'WROTE' : 'WOULD WRITE'}: ${rowsChanged} rows corrected, ${rowsAdded} rows added, ${rowsSame} already true.`,
  );
  if (!write)
    console.log(
      'Nothing was written. Re-run with --write after the owner has decided how the 54 published misses are to be corrected.',
    );
  if (failed.length > 0) {
    console.error(
      `\nINCOMPLETE: ${failed.length} of ${countries.length} countries could not be fetched and were NOT ${write ? 'corrected' : 'compared'}: ${failed.join(' ')}. Re-run for them before treating this backfill as done.`,
    );
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
