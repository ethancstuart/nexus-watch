import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 120 };

/**
 * V-Dem (Varieties of Democracy) ingestion cron.
 *
 * V-Dem publishes yearly; this cron runs monthly (first Monday) so we
 * pick up the latest release + any revisions without hammering the feed.
 *
 * Data source: V-Dem publishes country-year indicators as CSV + JSON at
 * https://www.v-dem.net/data/the-v-dem-dataset/ — the full CSV is ~200 MB.
 * For NexusWatch we only need 6 indicators per country-year, so this
 * cron pulls the much smaller "v2x_polyarchy" indicator subset from the
 * V-Dem GitHub mirror at
 *   https://raw.githubusercontent.com/vdeminstitute/v-dem-data/main/...
 * OR operates off a locally-cached subset if VDEM_DATA_URL env is set.
 *
 * This is a SCAFFOLD: the fetch/parse logic is minimal because V-Dem's
 * canonical feed is a zipped CSV that's impractical to ingest from a
 * serverless function. Production usage: point VDEM_DATA_URL at a
 * precomputed NDJSON mirror hosted elsewhere (e.g. Cloudflare R2) with
 * one record per country-year.
 *
 * Record format expected at VDEM_DATA_URL (NDJSON):
 *   { country_code, year, electoral_dem, liberal_dem, participatory_dem,
 *     deliberative_dem, egalitarian_dem, rule_of_law, regime_type }
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });

  const vdemUrl = process.env.VDEM_DATA_URL;
  if (!vdemUrl) {
    return res.json({
      skipped: true,
      reason: 'VDEM_DATA_URL env not set',
      hint: 'Host the V-Dem subset NDJSON somewhere and set VDEM_DATA_URL. See cron source comments.',
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    const r = await fetch(vdemUrl, { signal: AbortSignal.timeout(60000) });
    if (!r.ok) throw new Error(`vdem_${r.status}`);
    const text = await r.text();
    const lines = text.split('\n').filter((l) => l.trim().length > 0);

    let ingested = 0;
    for (const line of lines) {
      try {
        const row = JSON.parse(line) as {
          country_code?: string;
          year?: number;
          electoral_dem?: number;
          liberal_dem?: number;
          participatory_dem?: number;
          deliberative_dem?: number;
          egalitarian_dem?: number;
          rule_of_law?: number;
          regime_type?: string;
        };
        if (!row.country_code || typeof row.year !== 'number') continue;
        await sql`
          INSERT INTO vdem_indicators (
            country_code, year, electoral_dem, liberal_dem, participatory_dem,
            deliberative_dem, egalitarian_dem, rule_of_law, regime_type
          ) VALUES (
            ${row.country_code.toUpperCase()}, ${row.year},
            ${row.electoral_dem ?? null}, ${row.liberal_dem ?? null},
            ${row.participatory_dem ?? null}, ${row.deliberative_dem ?? null},
            ${row.egalitarian_dem ?? null}, ${row.rule_of_law ?? null},
            ${row.regime_type ?? null}
          )
          ON CONFLICT (country_code, year) DO UPDATE SET
            electoral_dem = EXCLUDED.electoral_dem,
            liberal_dem = EXCLUDED.liberal_dem,
            participatory_dem = EXCLUDED.participatory_dem,
            deliberative_dem = EXCLUDED.deliberative_dem,
            egalitarian_dem = EXCLUDED.egalitarian_dem,
            rule_of_law = EXCLUDED.rule_of_law,
            regime_type = EXCLUDED.regime_type,
            ingested_at = NOW()
        `;
        ingested++;
      } catch {
        /* skip malformed row */
      }
    }
    return res.json({ ingested, lines: lines.length });
  } catch (err) {
    console.error('[source-vdem]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'vdem_ingest_failed' });
  }
}
