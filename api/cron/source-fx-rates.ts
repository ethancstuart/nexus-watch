import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { requireCron } from '../_cron-utils.js';
import { raiseAlert, clearAlert, scrubForLog } from '../_lib/alert.js';
import { UNRESOLVABLE_GRACE_DAYS } from '../_lib/calls.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * FX Rate ingestion cron (Phase 1, Data Moat Build).
 *
 * Fetches daily exchange rates for all CII-tracked currencies vs USD.
 * Computes 7-day rolling volatility. FX volatility is one of the strongest
 * short-term predictors of sovereign crisis — a currency dropping >5% in
 * a week almost always precedes broader instability within 7-14 days.
 *
 * Source: ExchangeRate.host (free, no auth, no rate limit)
 * Schedule: 0 5 * * * (daily at 5 AM UTC)
 */

// Currency → country code mapping for CII-tracked nations
const CURRENCY_MAP: Record<string, string> = {
  UAH: 'UA',
  RUB: 'RU',
  CNY: 'CN',
  TWD: 'TW',
  IRR: 'IR',
  SAR: 'SA',
  TRY: 'TR',
  EGP: 'EG',
  PKR: 'PK',
  BDT: 'BD',
  NGN: 'NG',
  ZAR: 'ZA',
  BRL: 'BR',
  MXN: 'MX',
  COP: 'CO',
  ARS: 'AR',
  VES: 'VE',
  PEN: 'PE',
  CLP: 'CL',
  IDR: 'ID',
  PHP: 'PH',
  THB: 'TH',
  VND: 'VN',
  MYR: 'MY',
  KRW: 'KR',
  JPY: 'JP',
  INR: 'IN',
  LBP: 'LB',
  JOD: 'JO',
  IQD: 'IQ',
  SYP: 'SY',
  YER: 'YE',
  SDG: 'SD',
  ETB: 'ET',
  KES: 'KE',
  TZS: 'TZ',
  UGX: 'UG',
  RWF: 'RW',
  GHS: 'GH',
  XOF: 'BF',
  XAF: 'CM',
  MMK: 'MM',
  AFN: 'AF',
  EUR: 'DE',
  GBP: 'GB',
  CAD: 'CA',
  AUD: 'AU',
  PLN: 'PL',
  RON: 'RO',
  HUF: 'HU',
  CZK: 'CZ',
  NOK: 'NO',
  SEK: 'SE',
  CHF: 'CH',
  NZD: 'NZ',
  SGD: 'SG',
  AED: 'AE',
  QAR: 'QA',
  KWD: 'KW',
  BHD: 'BH',
  MAD: 'MA',
  TND: 'TN',
  DZD: 'DZ',
  LYD: 'LY',
  CUP: 'CU',
  HTG: 'HT',
  KPW: 'KP',
  LKR: 'LK',
  NPR: 'NP',
  KHR: 'KH',
  GEL: 'GE',
  AZN: 'AZ',
  AMD: 'AM',
  KZT: 'KZ',
  UZS: 'UZ',
  MZN: 'MZ',
  AOA: 'AO',
  ZWL: 'ZW',
  SOS: 'SO',
  SSP: 'SS',
  CDF: 'CD',
  XOF_NE: 'NE',
  XOF_ML: 'ML',
  XOF_SN: 'SN',
  XAF_TD: 'TD',
  XAF_CF: 'CF',
};

// CURRENCIES list no longer needed — open.er-api returns all currencies.
// We filter by CURRENCY_MAP keys when processing the response.

/**
 * HOW OLD THE PROVIDER'S UPDATE MAY BE WHEN THIS JOB STORES IT AS TODAY'S ROW.
 *
 * Measured by age, not by calendar date. The provider publishes once a day,
 * at 00:02 UTC on the days we have seen, 2.5 minutes after midnight, so a
 * calendar test ("stamped today") would refuse every day if that job ever
 * moved to 23:58.
 *
 * The bound, from this job's 05:00 UTC schedule and the resolver's 09:45 run:
 *  - It must be under 24 hours, the provider's cadence, so the previous day's
 *    update is always refused. Yesterday's 00:02 update is 28 h 58 min old at
 *    05:00.
 *  - It must admit any update that yesterday's calls could not have used. The
 *    resolver ran at 09:45 yesterday, which is 19 h 15 min before 05:00.
 *  - 20 hours is the whole hour above 19 h 15 min. At the scheduled run it
 *    admits any update published after 09:00 UTC yesterday. So yesterday's
 *    update is still refused if it came up to about 9 hours late (00:02 to
 *    09:00) and nothing newer followed.
 *
 * What it lets through: yesterday's update published MORE than about 9 hours
 * late (after 09:00 UTC yesterday), with nothing newer since. That update is
 * under 20 hours old at 05:00, so it is stored as today's row. It is not
 * refused, because it is the newest quote there is and yesterday's calls never
 * saw it; it is warned about (FX_UPDATE_EARLY_MARGIN_MINUTES).
 *
 * The cost: a manual re-run of this job is admitted only up to 20 hours after
 * the provider's update, which is about 20:00 UTC for a 00:02 update.
 */
export const FX_QUOTE_MAX_AGE_HOURS = 20;

/**
 * WHEN AN UPDATE STOPS LOOKING LIKE TODAY'S. Alert-only: the row is stored.
 *
 * The provider's daily update has landed between 00:02 and 00:33 UTC on every
 * stamp we hold: 00:02:31 on 16 Nov, 00:02:32 on 22 Nov, and 00:33:02 scheduled
 * for 23 Nov. The cut is the earliest of those, 00:02, less about an hour of
 * drift, rounded to the hour: 23:00 UTC the day before. So an update published
 * from 23:00 on (23:58, say) reads as today's, published early, and stays
 * quiet. One published before 23:00 is more than an hour earlier than any
 * daily update we have seen. It is far likelier to be yesterday's update
 * published late, now stored under today's date, so it is warned about.
 */
export const FX_UPDATE_EARLY_MARGIN_MINUTES = 60;

/** True when an update published at `updatedAt` reads as the cycle for UTC day `today` (YYYY-MM-DD). */
export function updateIsForDay(updatedAt: Date, today: string): boolean {
  const cut = Date.parse(`${today}T00:00:00Z`) - FX_UPDATE_EARLY_MARGIN_MINUTES * 60_000;
  return updatedAt.getTime() >= cut;
}

/** When the provider says it last updated, from its own `time_last_update_unix`. Null when it does not say. */
export function providerUpdatedAt(body: { time_last_update_unix?: unknown }): Date | null {
  const t = body.time_last_update_unix;
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return null;
  const d = new Date(t * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** This collector's own key on the existing alert path. */
export const FX_COLLECTOR_ALERT_KEY = 'collector:source-fx-rates';

/** Equal at the column's precision: rate_vs_usd is NUMERIC(16,6). */
const sameStoredRate = (a: number, b: number) => Math.round(a * 1e6) === Math.round(b * 1e6);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireCron(req, res)) return;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const result = { ingested: 0, errors: [] as string[] };
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  // Logged on every run: the provider's own update time, the one fact that
  // tells a stale-stamp morning from a fresh-stamp, stale-values morning.
  let providerUpdate = 'none';
  // Set when the stored update reads as yesterday's, published late.
  let lateUpdate: string | null = null;
  // DIAGNOSTICS, alert-only. The previous stored day's rates, to notice the
  // 21 Nov shape when it arrives under a fresh update time. Nothing here
  // changes what is stored.
  let prevDate: string | null = null;
  const prev = new Map<string, number>();
  const stored = new Set<string>();
  let compared = 0;
  let identical = 0;

  try {
    // Fetch latest rates from open.er-api.com (free, no auth, reliable)
    // Switched from exchangerate.host which now requires API key
    const latestRes = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: AbortSignal.timeout(15000),
    });
    if (!latestRes.ok) throw new Error(`open.er-api ${latestRes.status}`);
    const latestData = (await latestRes.json()) as { rates?: Record<string, number>; time_last_update_unix?: unknown };

    // A ROW DATED TODAY MUST HOLD TODAY'S QUOTE. Every row below is dated by
    // this job's own clock, not the provider's. On Sat 21 Nov 2026 all 65
    // currencies repeated their 20 Nov values, and the 66 FX calls due that
    // day were scored without a quote fresher than 20 Nov. So an update older
    // than FX_QUOTE_MAX_AGE_HOURS is not stored under today's date: no row is
    // written, and the day reads as missing rather than as fresh.
    // resolve-calls does not score a call whose last day has no row
    // (fxQuoteIsFreshFor).
    const updatedAt = providerUpdatedAt(latestData);
    if (updatedAt === null) throw new Error(`open.er-api gave no update time; nothing stored for ${today}`);
    const ageHours = (now.getTime() - updatedAt.getTime()) / 3_600_000;
    providerUpdate = `${updatedAt.toISOString()} (${ageHours.toFixed(1)} h old)`;
    if (ageHours > FX_QUOTE_MAX_AGE_HOURS) {
      throw new Error(
        `open.er-api last updated ${updatedAt.toISOString()}, ${ageHours.toFixed(1)} h ago ` +
          `(limit ${FX_QUOTE_MAX_AGE_HOURS} h); nothing stored for ${today}`,
      );
    }
    if (!updateIsForDay(updatedAt, today)) lateUpdate = updatedAt.toISOString();
    const rates = latestData.rates || {};

    try {
      const rows = (await sql`
        SELECT currency_code, rate_vs_usd::float AS rate, date::text AS date
        FROM fx_rates
        WHERE date = (SELECT MAX(date) FROM fx_rates WHERE date < ${today})
      `) as unknown as Array<{ currency_code: string; rate: number; date: string }>;
      for (const r of rows) {
        prev.set(r.currency_code, r.rate);
        prevDate = r.date;
      }
    } catch (diagErr) {
      console.error('[source-fx-rates] previous-day read failed; diagnostics skipped:', diagErr);
    }

    // Upsert today's rates
    for (const [currency, rate] of Object.entries(rates)) {
      const countryCode = CURRENCY_MAP[currency];
      if (!countryCode || !rate) continue;

      try {
        // Get 7-day history for volatility calculation
        const history = await sql`
          SELECT rate_vs_usd FROM fx_rates
          WHERE currency_code = ${currency}
          ORDER BY date DESC LIMIT 7
        `;

        let volatility7d: number | null = null;
        if (history.length >= 2) {
          const returns = [];
          const allRates = [rate, ...history.map((r) => Number(r.rate_vs_usd))];
          for (let i = 0; i < allRates.length - 1; i++) {
            returns.push(Math.log(allRates[i] / allRates[i + 1]));
          }
          const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
          const variance = returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
          volatility7d = Math.sqrt(variance) * 100; // as percentage
        }

        await sql`
          INSERT INTO fx_rates (currency_code, country_code, date, rate_vs_usd, volatility_7d)
          VALUES (${currency}, ${countryCode}, ${today}, ${rate}, ${volatility7d})
          ON CONFLICT (currency_code, date) DO UPDATE SET
            rate_vs_usd = EXCLUDED.rate_vs_usd,
            volatility_7d = EXCLUDED.volatility_7d
        `;
        result.ingested++;
        stored.add(currency);
        const before = prev.get(currency);
        if (before !== undefined) {
          compared++;
          if (sameStoredRate(rate, before)) identical++;
        }
      } catch (err) {
        result.errors.push(`${currency}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  // FAIL LOUDLY. A run that stored nothing for today used to answer 200 with
  // the reason in a body nobody reads, and every FX call due today is then
  // held. Now it raises an alert on the existing path, keyed so a continuing
  // failure is one notice plus reminders, and stood down by the first run that
  // stores rates in full. The alert is fail-open: it never stops the collector.
  //
  // A run that stored rows can still be wrong in ways worth a look, and these
  // are reported on the same key without changing what was stored:
  //  - a currency failed to store, or one stored the previous day is missing,
  //    so its calls will be held;
  //  - EVERY stored rate equals the previous stored day's. Before 21 Nov that
  //    happened on no day in 92, weekends included; the most on any other day
  //    was 6 of 65 (both Sundays). A fresh update time carrying the previous
  //    day's values passes the age test above, and this is the only sign of it.
  const storedNothing = result.ingested === 0;
  const missing = [...prev.keys()].filter((c) => !stored.has(c)).sort();
  const allIdentical = compared > 0 && compared === result.ingested && identical === compared;
  const concerns: string[] = [];
  if (!storedNothing) {
    if (result.errors.length > 0) {
      concerns.push(`${result.errors.length} currency(ies) failed to store, e.g. ${scrubForLog(result.errors[0])}`);
    }
    if (missing.length > 0) {
      concerns.push(
        `${missing.length} currency(ies) stored for ${prevDate} are missing today: ${missing.slice(0, 12).join(', ')}` +
          `${missing.length > 12 ? ' …' : ''}; their FX calls due today will be held`,
      );
    }
    if (lateUpdate !== null) {
      concerns.push(
        `the update stored as ${today} was published ${lateUpdate}, more than ` +
          `${FX_UPDATE_EARLY_MARGIN_MINUTES} minutes before ${today} began (UTC). It is probably the previous ` +
          `day's update published late. It was stored, and FX calls due ${today} will be scored on it`,
      );
    }
    if (allIdentical) {
      concerns.push(
        `all ${compared} rates stored equal those stored for ${prevDate}. The provider may have repeated ` +
          'the values of the previous day under a new update time: the same repeated-values pattern that ' +
          '21 Nov showed. The rows are stored and will be scored',
      );
    }
  }
  try {
    if (storedNothing) {
      await raiseAlert({
        key: FX_COLLECTOR_ALERT_KEY,
        severity: 'warning',
        title: `[source-fx-rates] no FX rates stored for ${today}`,
        body:
          `${scrubForLog(result.errors[0] ?? 'no rates in the response')}` +
          `${result.errors.length > 1 ? ` (and ${result.errors.length - 1} more error(s))` : ''}. ` +
          `Provider update: ${providerUpdate}. FX calls due ${today} are held until a quote dated ${today} ` +
          'is stored. Running this job again once the provider has updated stores it, if the update is under ' +
          `${FX_QUOTE_MAX_AGE_HOURS} hours old; the next resolve-calls run then picks the calls up. A held call ` +
          `is settled as unresolvable, never scored, ${UNRESOLVABLE_GRACE_DAYS} days after its date.`,
      });
    } else if (concerns.length > 0) {
      await raiseAlert({
        key: FX_COLLECTOR_ALERT_KEY,
        severity: 'warning',
        title: `[source-fx-rates] FX rates for ${today} stored with ${concerns.length} warning(s)`,
        body: `${concerns.join('. ')}. Provider update: ${providerUpdate}.`,
      });
    } else {
      await clearAlert(
        FX_COLLECTOR_ALERT_KEY,
        `Rates for ${today} were stored in full. A day that stored nothing stays missing: FX calls due ` +
          `that day are held and, unless a rate for it is stored, settled unresolvable after ` +
          `${UNRESOLVABLE_GRACE_DAYS} days.`,
      );
    }
  } catch (alertErr) {
    console.error('[source-fx-rates] alert failed (non-fatal):', alertErr);
  }

  console.log(
    `[source-fx-rates] provider update ${providerUpdate}; ingested=${result.ingested}, ` +
      `errors=${result.errors.length}, same as ${prevDate ?? 'no previous day'}: ${identical}/${compared}`,
  );
  return res.status(storedNothing ? 502 : 200).json(result);
}
