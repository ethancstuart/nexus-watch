import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * EIA Commodity Price Ingestion (Phase 1, Market Exposure).
 *
 * Fetches daily Brent crude, WTI crude, and Henry Hub natural gas prices.
 * Oil price moves directly drive the Market Exposure CII component for
 * oil-dependent economies (SA, RU, IQ, NG, VE, IR, KW, AE, DZ, LY).
 *
 * Source: U.S. Energy Information Administration (free API key)
 * Schedule: 0 6 * * * (daily at 6 AM UTC)
 * Env: EIA_API_KEY (free: https://www.eia.gov/opendata/register.php)
 */

const EIA_BASE = 'https://api.eia.gov/v2';

const COMMODITIES = [
  { id: 'EPCBRENT', name: 'brent_crude', series: 'petroleum/pri/spt/data' },
  { id: 'EPCWTI', name: 'wti_crude', series: 'petroleum/pri/spt/data' },
  { id: 'RNGWHHD', name: 'natural_gas_henry_hub', series: 'natural-gas/pri/sum/data' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const apiKey = process.env.EIA_API_KEY;
  if (!apiKey) {
    return res.json({
      skipped: true,
      reason: 'EIA_API_KEY not set. Get a free key at https://www.eia.gov/opendata/register.php',
    });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const result = { ingested: 0, errors: [] as string[] };

  for (const commodity of COMMODITIES) {
    try {
      const url = `${EIA_BASE}/${commodity.series}/?api_key=${apiKey}&frequency=daily&data[0]=value&facets[product][]=${commodity.id}&sort[0][column]=period&sort[0][direction]=desc&length=30`;

      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!r.ok) {
        result.errors.push(`${commodity.name}: EIA returned ${r.status}`);
        continue;
      }

      const data = (await r.json()) as {
        response?: { data?: Array<{ period: string; value: number }> };
      };

      const rows = data.response?.data || [];
      for (const row of rows) {
        if (!row.period || row.value == null) continue;

        await sql`
          INSERT INTO commodity_prices (commodity, date, price_usd, source)
          VALUES (${commodity.name}, ${row.period}, ${row.value}, 'eia')
          ON CONFLICT (commodity, date, source) DO UPDATE SET
            price_usd = EXCLUDED.price_usd
        `;
        result.ingested++;
      }
    } catch (err) {
      result.errors.push(`${commodity.name}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[source-eia] ingested=${result.ingested}, errors=${result.errors.length}`);
  return res.json(result);
}
