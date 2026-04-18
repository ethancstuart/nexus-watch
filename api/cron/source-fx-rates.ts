import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

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
  UAH: 'UA', RUB: 'RU', CNY: 'CN', TWD: 'TW', IRR: 'IR', SAR: 'SA',
  TRY: 'TR', EGP: 'EG', PKR: 'PK', BDT: 'BD', NGN: 'NG', ZAR: 'ZA',
  BRL: 'BR', MXN: 'MX', COP: 'CO', ARS: 'AR', VES: 'VE', PEN: 'PE',
  CLP: 'CL', IDR: 'ID', PHP: 'PH', THB: 'TH', VND: 'VN', MYR: 'MY',
  KRW: 'KR', JPY: 'JP', INR: 'IN', LBP: 'LB', JOD: 'JO', IQD: 'IQ',
  SYP: 'SY', YER: 'YE', SDG: 'SD', ETB: 'ET', KES: 'KE', TZS: 'TZ',
  UGX: 'UG', RWF: 'RW', GHS: 'GH', XOF: 'BF', XAF: 'CM', MMK: 'MM',
  AFN: 'AF', EUR: 'DE', GBP: 'GB', CAD: 'CA', AUD: 'AU', PLN: 'PL',
  RON: 'RO', HUF: 'HU', CZK: 'CZ', NOK: 'NO', SEK: 'SE', CHF: 'CH',
  NZD: 'NZ', SGD: 'SG', AED: 'AE', QAR: 'QA', KWD: 'KW', BHD: 'BH',
  MAD: 'MA', TND: 'TN', DZD: 'DZ', LYD: 'LY', CUP: 'CU', HTG: 'HT',
  KPW: 'KP', LKR: 'LK', NPR: 'NP', KHR: 'KH', GEL: 'GE', AZN: 'AZ',
  AMD: 'AM', KZT: 'KZ', UZS: 'UZ', MZN: 'MZ', AOA: 'AO', ZWL: 'ZW',
  SOS: 'SO', SSP: 'SS', CDF: 'CD', XOF_NE: 'NE', XOF_ML: 'ML',
  XOF_SN: 'SN', XAF_TD: 'TD', XAF_CF: 'CF',
};

const CURRENCIES = Object.keys(CURRENCY_MAP).filter(
  (c) => !c.includes('_'), // Skip duplicate zone entries
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const result = { ingested: 0, errors: [] as string[] };
  const today = new Date().toISOString().split('T')[0];

  try {
    // Fetch latest rates
    const latestRes = await fetch(
      `https://api.exchangerate.host/latest?base=USD&symbols=${CURRENCIES.join(',')}`,
      { signal: AbortSignal.timeout(15000) },
    );
    if (!latestRes.ok) throw new Error(`exchangerate.host ${latestRes.status}`);
    const latestData = (await latestRes.json()) as { rates?: Record<string, number> };
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

  console.log(`[source-fx-rates] ingested=${result.ingested}, errors=${result.errors.length}`);
  return res.json(result);
}
