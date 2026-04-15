import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * NOAA active tropical storms ingestion cron.
 *
 * Data source: NHC (National Hurricane Center) + CPHC + JTWC current
 * storms feed. NHC serves current-storms GeoJSON publicly at:
 *   https://www.nhc.noaa.gov/CurrentStorms.json
 *
 * That feed lists active Atlantic + East Pacific systems. For Central
 * Pacific and West Pacific coverage we also hit JTWC (Joint Typhoon
 * Warning Center) — but JTWC requires scraping text products. For the
 * first iteration we cover Atlantic + East Pacific via NHC only, which
 * is ~90% of tropical-cyclone signal impact for the platform.
 *
 * Runs hourly. Each active storm gets one row (UPSERT on storm_id);
 * when a storm disappears from the feed we mark it resolved.
 */

interface NhcStorm {
  id: string; // e.g. "AL012026"
  name: string; // e.g. "Alex"
  classification: string; // "TD" | "TS" | "HU" | "MH"
  intensity: string; // "40 kt" etc.
  pressure: string; // "1005 mb"
  latitudeNumeric?: number;
  longitudeNumeric?: number;
  binNumber?: string;
  lastUpdate?: string; // ISO
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    const r = await fetch('https://www.nhc.noaa.gov/CurrentStorms.json', {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'NexusWatch/1.0 (https://nexuswatch.dev)' },
    });
    if (!r.ok) {
      if (r.status === 404) {
        // NHC returns 404 when there are zero active storms — that's fine.
        await sql`
          UPDATE noaa_storms
          SET resolved_at = NOW()
          WHERE resolved_at IS NULL
        `;
        return res.json({ active: 0, ingested: 0, resolved: 'all' });
      }
      throw new Error(`nhc_${r.status}`);
    }
    const body = (await r.json()) as { activeStorms?: NhcStorm[] };
    const active = body.activeStorms ?? [];

    const activeIds: string[] = [];
    let ingested = 0;
    for (const s of active) {
      const maxWindKt = parseInt(s.intensity.match(/(\d+)/)?.[1] ?? '0', 10) || null;
      const pressureMb = parseInt(s.pressure.match(/(\d+)/)?.[1] ?? '0', 10) || null;
      await sql`
        INSERT INTO noaa_storms
          (storm_id, name, basin, category, max_wind_kt, min_pressure_mb,
           lat, lon, last_advisory_at)
        VALUES (
          ${s.id}, ${s.name}, ${basinFromId(s.id)}, ${normalizeCategory(s.classification, maxWindKt)},
          ${maxWindKt}, ${pressureMb},
          ${s.latitudeNumeric ?? null}, ${s.longitudeNumeric ?? null},
          ${s.lastUpdate ? new Date(s.lastUpdate).toISOString() : new Date().toISOString()}
        )
        ON CONFLICT (storm_id) DO UPDATE SET
          name = EXCLUDED.name,
          category = EXCLUDED.category,
          max_wind_kt = EXCLUDED.max_wind_kt,
          min_pressure_mb = EXCLUDED.min_pressure_mb,
          lat = EXCLUDED.lat,
          lon = EXCLUDED.lon,
          last_advisory_at = EXCLUDED.last_advisory_at,
          resolved_at = NULL
      `;
      activeIds.push(s.id);
      ingested++;
    }

    // Mark any previously-active storm not in current feed as resolved.
    await sql`
      UPDATE noaa_storms
      SET resolved_at = NOW()
      WHERE resolved_at IS NULL
        AND (${activeIds}::text[] = '{}' OR NOT (storm_id = ANY(${activeIds}::text[])))
    `;

    return res.json({ active: active.length, ingested, ids: activeIds });
  } catch (err) {
    console.error('[source-noaa-storms]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'noaa_ingest_failed' });
  }
}

function basinFromId(id: string): string {
  const prefix = id.slice(0, 2).toUpperCase();
  switch (prefix) {
    case 'AL':
      return 'atlantic';
    case 'EP':
      return 'east_pacific';
    case 'CP':
      return 'central_pacific';
    case 'WP':
      return 'west_pacific';
    default:
      return 'other';
  }
}

function normalizeCategory(classification: string, maxWindKt: number | null): string {
  const c = classification.toUpperCase();
  if (c === 'TD') return 'td';
  if (c === 'TS') return 'ts';
  // HU/MH: map Saffir-Simpson 1-5 from wind.
  if (!maxWindKt) return c.toLowerCase();
  if (maxWindKt >= 137) return '5';
  if (maxWindKt >= 113) return '4';
  if (maxWindKt >= 96) return '3';
  if (maxWindKt >= 83) return '2';
  if (maxWindKt >= 64) return '1';
  return 'ts';
}
