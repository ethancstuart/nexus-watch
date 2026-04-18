import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * FRED Sovereign Bond Yield Ingestion (Phase 1, Market Exposure).
 *
 * Fetches 10-year government bond yields for major economies.
 * Yield spikes >200bps in 30 days = elevated sovereign stress.
 * Sovereign spreads are the single best financial leading indicator
 * for country instability — they widen 7-14 days before political
 * crises become visible in news.
 *
 * Source: Federal Reserve Economic Data (free API key)
 * Schedule: 0 7 * * * (daily at 7 AM UTC)
 * Env: FRED_API_KEY (free: https://fredaccount.stlouisfed.org/login)
 */

// FRED series → country code mapping
const SERIES: Array<{ id: string; country: string }> = [
  { id: 'DGS10', country: 'US' },
  { id: 'IRLTLT01GBM156N', country: 'GB' },
  { id: 'IRLTLT01DEM156N', country: 'DE' },
  { id: 'IRLTLT01JPM156N', country: 'JP' },
  { id: 'IRLTLT01FRM156N', country: 'FR' },
  { id: 'IRLTLT01ITM156N', country: 'IT' },
  { id: 'IRLTLT01CAM156N', country: 'CA' },
  { id: 'IRLTLT01AUM156N', country: 'AU' },
  { id: 'IRLTLT01KRM156N', country: 'KR' },
  { id: 'IRLTLT01INM156N', country: 'IN' },
  { id: 'IRLTLT01BRM156N', country: 'BR' },
  { id: 'IRLTLT01MXM156N', country: 'MX' },
  { id: 'IRLTLT01ZAM156N', country: 'ZA' },
  { id: 'IRLTLT01TRM156N', country: 'TR' },
];

const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return res.json({
      skipped: true,
      reason: 'FRED_API_KEY not set. Get a free key at https://fredaccount.stlouisfed.org/login',
    });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const result = { ingested: 0, errors: [] as string[] };

  for (const series of SERIES) {
    try {
      const url = `${FRED_BASE}?series_id=${series.id}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=30`;

      const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (!r.ok) {
        result.errors.push(`${series.id}: FRED returned ${r.status}`);
        continue;
      }

      const data = (await r.json()) as {
        observations?: Array<{ date: string; value: string }>;
      };

      const observations = data.observations || [];
      for (const obs of observations) {
        if (!obs.date || obs.value === '.') continue; // FRED uses '.' for missing data
        const yieldPct = parseFloat(obs.value);
        if (isNaN(yieldPct)) continue;

        await sql`
          INSERT INTO sovereign_yields (series_id, country_code, date, yield_pct)
          VALUES (${series.id}, ${series.country}, ${obs.date}, ${yieldPct})
          ON CONFLICT (series_id, date) DO UPDATE SET
            yield_pct = EXCLUDED.yield_pct
        `;
        result.ingested++;
      }

      // FRED allows 120 req/min — pace at ~500ms between series
      await new Promise((r) => setTimeout(r, 500));
    } catch (err) {
      result.errors.push(`${series.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[source-fred] ingested=${result.ingested}, errors=${result.errors.length}`);
  return res.json(result);
}
