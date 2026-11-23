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
 * The UTC day the provider says its rates are for, read from its own
 * `time_last_update_unix`. Null when the response does not say.
 */
export function providerQuoteDate(body: { time_last_update_unix?: unknown }): string | null {
  const t = body.time_last_update_unix;
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0) return null;
  const d = new Date(t * 1000);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/** This collector's own key on the existing alert path. */
export const FX_COLLECTOR_ALERT_KEY = 'collector:source-fx-rates';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireCron(req, res)) return;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const result = { ingested: 0, errors: [] as string[] };
  const today = new Date().toISOString().split('T')[0];

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
    // day were scored without a quote fresher than 20 Nov. So a response the
    // provider last updated before today is not stored under today's date:
    // no row is written, and the day reads as missing rather than as fresh.
    // resolve-calls does not score a call whose last day has no row
    // (fxQuoteIsFreshFor).
    const quotedOn = providerQuoteDate(latestData);
    if (quotedOn === null || quotedOn < today) {
      throw new Error(
        quotedOn === null
          ? `open.er-api gave no update time; nothing stored for ${today}`
          : `open.er-api last updated ${quotedOn}, not ${today}; nothing stored for ${today}`,
      );
    }
    const rates = latestData.rates || {};

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
  // stores rates. The alert is fail-open: it never stops the collector.
  const storedNothing = result.ingested === 0;
  try {
    if (storedNothing) {
      await raiseAlert({
        key: FX_COLLECTOR_ALERT_KEY,
        severity: 'warning',
        title: `[source-fx-rates] no FX rates stored for ${today}`,
        body:
          `${scrubForLog(result.errors[0] ?? 'no rates in the response')}` +
          `${result.errors.length > 1 ? ` (and ${result.errors.length - 1} more error(s))` : ''}. ` +
          `FX calls due ${today} are held until a quote dated ${today} is stored. Running this job again the ` +
          'same UTC day, once the provider has updated, stores it, and the next resolve-calls run picks the ' +
          'calls up; a held call is ' +
          `settled as unresolvable, never scored, ${UNRESOLVABLE_GRACE_DAYS} days after its date.`,
      });
    } else {
      await clearAlert(FX_COLLECTOR_ALERT_KEY);
    }
  } catch (alertErr) {
    console.error('[source-fx-rates] alert failed (non-fatal):', alertErr);
  }

  console.log(`[source-fx-rates] ingested=${result.ingested}, errors=${result.errors.length}`);
  return res.status(storedNothing ? 502 : 200).json(result);
}
