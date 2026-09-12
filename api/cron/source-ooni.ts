import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

// 180, not 60: see BACKFILL_DAYS and the deadline below. The run no longer
// times out — it stops starting work with time to spare and says what it
// skipped — but it needs room to reach the whole list on an ordinary day.
export const config = { runtime: 'nodejs', maxDuration: 180 };

/**
 * OONI network-interference collector — the evidence the censorship calls
 * resolve against.
 *
 * Source: OONI API (free, no auth). Schedule: every 6 hours.
 *
 * WHAT WAS WRONG WITH THE PREVIOUS VERSION, measured 2026-09-12. It walked
 * forty countries one at a time with a 10 s timeout each inside a 60 s
 * function budget, fetched only yesterday, and the thin-coverage countries
 * sat at positions 30 to 40 of a hand-ordered list. On a slow OONI day the
 * function hit Vercel's 60 s limit mid-list (twice that week, 504) and the
 * countries it never reached were exactly the ones the register most needs:
 * ML, NE, TD, CF, SO, HT, LB. A day nobody fetched was a day nobody would
 * ever fetch, because `since = yesterday` never looked back. SO lost five of
 * seven days; NE all seven. The resolver then settled their calls as
 * unresolvable for want of coverage — a published outcome caused by our own
 * collector's ordering, not by OONI's volunteers.
 *
 * NOW:
 *   - THINNEST FIRST, derived from the table. Each run counts the last
 *     fourteen days of rows per country and fetches the sparsest first, so
 *     the countries with the least evidence are the ones a slow day can never
 *     starve. Nothing is hand-ordered; as coverage shifts, so does the order.
 *   - BOUNDED CONCURRENCY instead of a serial walk with a courtesy delay.
 *   - A BACKFILL WINDOW, so a day missed by one run is picked up by the next.
 *     The upsert has always been idempotent; only the window was too narrow.
 *   - A DEADLINE with slack, governing work in flight as well as work not yet
 *     started: each request's timeout is capped at the time remaining, and no
 *     batch of writes begins past the deadline. What could not be done is
 *     reported as `skipped` — a fact in the log rather than a 504 in the
 *     dashboard — and with thinnest-first, what gets skipped is the
 *     well-covered tail with three runs left today. The residual overrun is
 *     one in-flight database write, which is milliseconds.
 */

/** The countries the register watches. Membership is a product decision; ORDER is not — see thinnestFirst. */
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
] as const;

/** Days of history each run asks for. A run that misses a day is healed by the next three days of runs. */
export const BACKFILL_DAYS = 3;
/** Requests in flight at once. OONI is a volunteer-funded public API; four is polite. */
export const CONCURRENCY = 4;
/** Window over which "thin" is measured — the resolver's own fortnight. */
export const COVERAGE_LOOKBACK_DAYS = 14;
/** Per-country request timeout. */
const REQUEST_TIMEOUT_MS = 10_000;
/** Stop starting new countries this long before the function budget ends. */
const DEADLINE_SLACK_MS = 20_000;

const OONI_API = 'https://api.ooni.io/api/v1';

/**
 * Fetch order: fewest rows in the lookback window first; ties keep the list's
 * own order. A country absent from the counts has zero rows and goes first of
 * all — which is where KP sits today, at 0 of 14 days.
 */
export function thinnestFirst(countries: readonly string[], rowsInLookback: ReadonlyMap<string, number>): string[] {
  const position = new Map(countries.map((c, i) => [c, i]));
  return [...countries].sort(
    (a, b) =>
      (rowsInLookback.get(a) ?? 0) - (rowsInLookback.get(b) ?? 0) || (position.get(a) ?? 0) - (position.get(b) ?? 0),
  );
}

interface OoniAggregation {
  result?: Array<{
    measurement_start_day: string;
    anomaly_count: number;
    confirmed_count: number;
    measurement_count: number;
  }>;
}

interface RunResult {
  ingested: number;
  censorship_detected: number;
  /** Countries whose request failed, with why. */
  errors: string[];
  /** Countries never started because the budget ran out — thinnest-first means the well-covered tail. */
  skipped: string[];
  /** Countries OONI answered for with no rows in the window. */
  empty: string[];
  /** The first few countries in this run's derived order, for the log. */
  order_head: string[];
  elapsed_ms: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const startedAt = Date.now();
  const deadline = startedAt + config.maxDuration * 1000 - DEADLINE_SLACK_MS;
  const result: RunResult = {
    ingested: 0,
    censorship_detected: 0,
    errors: [],
    skipped: [],
    empty: [],
    order_head: [],
    elapsed_ms: 0,
  };

  // The order comes from the table. If the count query itself fails the run
  // still proceeds in list order — a collector must never refuse to collect
  // because it could not decide where to start.
  const rowsInLookback = new Map<string, number>();
  try {
    const counts = (await sql`
      SELECT country_code, COUNT(*)::int AS n
      FROM ooni_measurements
      WHERE measurement_date >= CURRENT_DATE - ${COVERAGE_LOOKBACK_DAYS}::int
        AND country_code = ANY(${[...PROBE_COUNTRIES]})
      GROUP BY country_code
    `) as unknown as Array<{ country_code: string; n: number }>;
    for (const c of counts) rowsInLookback.set(c.country_code, c.n);
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    console.error('[source-ooni] coverage count failed; fetching in list order:', why);
    // In the result too, not only the log: a run that silently lost its
    // ordering would look identical to one that had it.
    result.errors.push(`coverage-count: ${why} (fetched in list order)`);
  }
  const order = thinnestFirst(PROBE_COUNTRIES, rowsInLookback);
  result.order_head = order.slice(0, 8);

  const today = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.now() - BACKFILL_DAYS * 86_400_000).toISOString().slice(0, 10);

  async function collect(cc: string): Promise<void> {
    const url = `${OONI_API}/aggregation?probe_cc=${cc}&since=${since}&until=${today}&test_name=web_connectivity&axis_x=measurement_start_day`;
    // The request budget is the smaller of the per-request timeout and what
    // is left before the deadline, so a request started late cannot carry the
    // run past the function's limit. The deadline governs work in flight,
    // not only the decision to start it.
    const budgetMs = Math.max(1_000, Math.min(REQUEST_TIMEOUT_MS, deadline - Date.now()));
    const r = await fetch(url, {
      signal: AbortSignal.timeout(budgetMs),
      headers: { 'User-Agent': 'NexusWatch/1.0 (+https://nexuswatch.dev)' },
    });
    if (!r.ok) {
      if (r.status !== 404) result.errors.push(`${cc}: HTTP ${r.status}`);
      else result.empty.push(cc);
      return;
    }
    const items = ((await r.json()) as OoniAggregation).result ?? [];
    if (items.length === 0) {
      result.empty.push(cc);
      return;
    }
    for (const item of items) {
      // A late response does not get to start a batch of writes past the
      // deadline; the country is reported as skipped and the backfill window
      // picks its days up on the next run.
      if (Date.now() >= deadline) {
        result.skipped.push(cc);
        return;
      }
      await sql`
        INSERT INTO ooni_measurements
          (country_code, test_name, measurement_date, anomaly_count, confirmed_blocked, total_measurements)
        VALUES
          (${cc}, 'web_connectivity', ${item.measurement_start_day}, ${item.anomaly_count}, ${item.confirmed_count}, ${item.measurement_count})
        ON CONFLICT (country_code, test_name, measurement_date) DO UPDATE SET
          anomaly_count = EXCLUDED.anomaly_count,
          confirmed_blocked = EXCLUDED.confirmed_blocked,
          total_measurements = EXCLUDED.total_measurements
      `;
      result.ingested++;
      if (item.confirmed_count > 10) {
        result.censorship_detected++;
        console.log(
          `[ooni] CENSORSHIP: ${cc} — ${item.confirmed_count} confirmed blocks on ${item.measurement_start_day}`,
        );
      }
    }
  }

  // A small pool: each worker takes the next country until the list is empty
  // or the deadline is reached. Whatever is left when the deadline hits is
  // reported, not silently dropped.
  let next = 0;
  async function worker(): Promise<void> {
    while (next < order.length) {
      if (Date.now() >= deadline) return;
      const cc = order[next++] as string;
      try {
        await collect(cc);
      } catch (err) {
        const why =
          err instanceof Error
            ? err.name === 'TimeoutError'
              ? `timeout after ${REQUEST_TIMEOUT_MS} ms`
              : err.message
            : String(err);
        result.errors.push(`${cc}: ${why}`);
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  result.skipped = order.slice(next);
  result.elapsed_ms = Date.now() - startedAt;

  console.log(
    `[source-ooni] ingested=${result.ingested} censorship=${result.censorship_detected} ` +
      `errors=${result.errors.length} empty=${result.empty.length} skipped=${result.skipped.length} ` +
      `in ${result.elapsed_ms} ms; thinnest first: ${result.order_head.join(' ')}` +
      (result.skipped.length ? `; skipped: ${result.skipped.join(' ')}` : ''),
  );
  if (result.errors.length) console.warn(`[source-ooni] per-country errors: ${result.errors.join('; ')}`);
  return res.json(result);
}
