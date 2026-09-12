/**
 * Re-ingest ooni_measurements at DAY grain — dry run by default.
 *
 * WHY. Until 2026-09-12 the OONI collector asked for one-to-three-day windows
 * without stating a time grain, and OONI answered in hourly buckets. The
 * day-keyed upsert kept whichever hour arrived last, so every row in the table
 * holds one hour's measurements and one hour's confirmed blocks, labelled as
 * the day. api/cron/source-ooni.ts carries the full finding and the numbers.
 *
 * WHAT THIS DOES. For every probe country, fetches OONI's daily totals from
 * `since` to today with `time_grain=day` and compares them with the stored
 * rows. Without --write it PRINTS the diff and touches nothing. With --write
 * it upserts the true totals. It never touches `calls`: a resolved call is
 * never rewritten, and what the corrected evidence means for the 54 published
 * misses that are hits is a published correction decided by the owner, not a
 * script.
 *
 * Usage:
 *   npx tsx scripts/backfill-ooni-daily.ts                 # dry run, since 2026-04-18
 *   npx tsx scripts/backfill-ooni-daily.ts --since 2026-08-01
 *   npx tsx scripts/backfill-ooni-daily.ts --write         # after the owner's go
 */
import { neon } from '@neondatabase/serverless';

const PROBE_COUNTRIES = [
  'IR',
  'CN',
  'RU',
  'MM',
  'SD',
  'ET',
  'SY',
  'VE',
  'CU',
  'KP',
  'BY',
  'TR',
  'EG',
  'SA',
  'PK',
  'BD',
  'TH',
  'VN',
  'IN',
  'IQ',
  'AF',
  'YE',
  'LY',
  'SS',
  'CD',
  'UG',
  'TZ',
  'KE',
  'NG',
  'ML',
  'BF',
  'NE',
  'TD',
  'CF',
  'SO',
  'HT',
  'AZ',
  'KZ',
  'UZ',
  'LB',
];
const OONI_API = 'https://api.ooni.io/api/v1';

interface Bucket {
  measurement_start_day: string;
  anomaly_count: number;
  confirmed_count: number;
  measurement_count: number;
}

async function main(): Promise<void> {
  const write = process.argv.includes('--write');
  const sinceIdx = process.argv.indexOf('--since');
  const since = sinceIdx > -1 ? (process.argv[sinceIdx + 1] ?? '2026-04-18') : '2026-04-18';
  const today = new Date().toISOString().slice(0, 10);
  const dbUrl = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
  const sql = neon(dbUrl);

  console.log(
    `${write ? 'WRITE' : 'DRY RUN'} — day-grain backfill ${since} → ${today}, ${PROBE_COUNTRIES.length} countries`,
  );

  let rowsChanged = 0;
  let rowsAdded = 0;
  let rowsSame = 0;
  const perCountry: string[] = [];

  for (const cc of PROBE_COUNTRIES) {
    const url = `${OONI_API}/aggregation?probe_cc=${cc}&since=${since}&until=${today}&test_name=web_connectivity&axis_x=measurement_start_day&time_grain=day`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
      headers: { 'User-Agent': 'NexusWatch/1.0 (+https://nexuswatch.dev)' },
    });
    if (!r.ok) {
      console.error(`  ${cc}: HTTP ${r.status} — skipped`);
      continue;
    }
    const buckets = (((await r.json()) as { result?: Bucket[] }).result ?? []).filter((b) => b.measurement_count > 0);
    const stored = (await sql`
      SELECT measurement_date::text AS d, anomaly_count, confirmed_blocked, total_measurements
      FROM ooni_measurements WHERE country_code = ${cc} AND measurement_date >= ${since}::date
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
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
