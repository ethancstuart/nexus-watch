import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Copernicus Emergency Management Service damage-assessment ingestion cron.
 *
 * Copernicus EMS publishes activations (named "EMSR###") after major
 * disasters: earthquakes, floods, wildfires, conflict events. Each
 * activation produces damage-grade products (destroyed / damaged /
 * possibly_damaged building counts and footprints) from satellite imagery.
 *
 * Feed: https://emergency.copernicus.eu/mapping/list-of-activations-rapid
 * The list page is HTML; there's also a RSS feed at
 *   https://emergency.copernicus.eu/mapping/ems/rss
 *
 * For reliable parsing, a production deployment should use the RSS feed
 * (simple XML) + scrape each activation page for the damage counts.
 * This cron runs daily at 12:00 UTC to pick up new activations.
 *
 * First iteration is RSS-only — we record the activation metadata and
 * leave damage counts null until the damage product parser is built.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    const r = await fetch('https://emergency.copernicus.eu/mapping/ems/rss', {
      signal: AbortSignal.timeout(20000),
      headers: { 'User-Agent': 'NexusWatch/1.0 (https://nexuswatch.dev)' },
    });
    if (!r.ok) throw new Error(`copernicus_${r.status}`);
    const xml = await r.text();

    const items = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    let ingested = 0;
    for (const m of items) {
      const block = m[1];
      const title = block.match(/<title>([^<]+)<\/title>/)?.[1] ?? '';
      const link = block.match(/<link>([^<]+)<\/link>/)?.[1] ?? '';
      const pubDate = block.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] ?? '';
      const description = block.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? '';

      const activationMatch = title.match(/\b(EMSR\d+)\b/);
      if (!activationMatch) continue;
      const activationId = activationMatch[1];

      const eventType = inferEventType(title + ' ' + description);
      const country = inferCountry(title + ' ' + description);
      const activatedAt = pubDate ? new Date(pubDate).toISOString() : null;

      await sql`
        INSERT INTO copernicus_damage
          (activation_id, event_type, country_code, region, product_url, activated_at)
        VALUES (
          ${activationId}, ${eventType}, ${country}, ${title.slice(0, 200)},
          ${link}, ${activatedAt}
        )
        ON CONFLICT (activation_id) DO UPDATE SET
          product_url = EXCLUDED.product_url,
          region = EXCLUDED.region,
          activated_at = COALESCE(copernicus_damage.activated_at, EXCLUDED.activated_at)
      `;
      ingested++;
    }
    return res.json({ ingested });
  } catch (err) {
    console.error('[source-copernicus]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'copernicus_ingest_failed' });
  }
}

function inferEventType(text: string): string {
  const lower = text.toLowerCase();
  if (/earthquake|seismic/.test(lower)) return 'earthquake';
  if (/flood|flooding|inundation/.test(lower)) return 'flood';
  if (/fire|wildfire|forest fire/.test(lower)) return 'wildfire';
  if (/volcan|eruption/.test(lower)) return 'volcano';
  if (/conflict|war|combat|strike/.test(lower)) return 'conflict';
  if (/storm|cyclone|typhoon|hurricane/.test(lower)) return 'storm';
  return 'other';
}

function inferCountry(text: string): string | null {
  // Best-effort: look for "in <Country>" patterns. Not exhaustive.
  const m = text.match(/\bin\s+([A-Z][a-zA-Z]{2,})/);
  if (!m) return null;
  const name = m[1];
  const map: Record<string, string> = {
    Ukraine: 'UA',
    Russia: 'RU',
    Turkey: 'TR',
    Syria: 'SY',
    Iraq: 'IQ',
    Sudan: 'SD',
    Spain: 'ES',
    France: 'FR',
    Germany: 'DE',
    Italy: 'IT',
    Greece: 'GR',
    Portugal: 'PT',
    Morocco: 'MA',
    Libya: 'LY',
    Pakistan: 'PK',
    Afghanistan: 'AF',
    Japan: 'JP',
    Indonesia: 'ID',
    Philippines: 'PH',
    Mexico: 'MX',
    Chile: 'CL',
    Peru: 'PE',
    Ecuador: 'EC',
    Bangladesh: 'BD',
    Iran: 'IR',
    Lebanon: 'LB',
    Israel: 'IL',
  };
  return map[name] ?? null;
}
