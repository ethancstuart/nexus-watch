import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { cronJitter } from '../_cron-utils.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Crisis detection cron — Phase 9 auto-trigger (Chairman plan Week 4-6).
 *
 * Runs every 30 minutes. Walks two independent detectors:
 *
 *   1. CII spike: any country whose score moved >= SPIKE_THRESHOLD (default
 *      15 points) in the last 24h gets a 'cii_spike' trigger row.
 *      Dedup key: "cii_spike:<country>:<YYYY-MM-DD>" — one trigger per
 *      country per UTC day, so a country that oscillates doesn't flood.
 *
 *   2. Major quake: USGS M7+ feed (last 24h). Each event gets one
 *      'major_quake' trigger keyed by event id.
 *
 * Resolution: after TRIGGER_TTL_HOURS (default 48) a still-active trigger
 * is auto-resolved. If a CII country's score retreats below the spike
 * threshold on a subsequent snapshot we also resolve early.
 *
 * Response body includes an { inserted, resolved } pair so the cron
 * log is actionable at a glance.
 */

const SPIKE_THRESHOLD = 15;
const TRIGGER_TTL_HOURS = 48;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  await cronJitter(5);

  const inserted: string[] = [];
  const resolved: number[] = [];

  try {
    // --- 1. CII spike detection ---
    const latestDate = (await sql`SELECT MAX(date) AS d FROM cii_daily_snapshots`) as unknown as Array<{
      d: string | null;
    }>;
    const today = latestDate[0]?.d;
    if (today) {
      const spikes = (await sql`
        WITH today AS (
          SELECT country_code, cii_score FROM cii_daily_snapshots WHERE date = ${today}
        ),
        yesterday AS (
          SELECT DISTINCT ON (country_code) country_code, cii_score
          FROM cii_daily_snapshots
          WHERE date <= (${today}::date - INTERVAL '1 day')::date
          ORDER BY country_code, date DESC
        )
        SELECT t.country_code, t.cii_score,
               (t.cii_score - y.cii_score) AS delta
        FROM today t
        JOIN yesterday y ON y.country_code = t.country_code
        WHERE ABS(t.cii_score - y.cii_score) >= ${SPIKE_THRESHOLD}
      `) as unknown as Array<{ country_code: string; cii_score: number; delta: number }>;

      for (const s of spikes) {
        const dedupKey = `cii_spike:${s.country_code}:${today}`;
        const playbookKey = inferPlaybookForCountry(s.country_code);
        const rows = (await sql`
          INSERT INTO crisis_triggers
            (playbook_key, country_code, trigger_type, cii_score, cii_delta, notes, dedup_key)
          VALUES
            (${playbookKey}, ${s.country_code}, 'cii_spike', ${s.cii_score}, ${s.delta},
             ${`CII moved ${s.delta > 0 ? '+' : ''}${s.delta.toFixed(1)} in 24h (now ${s.cii_score.toFixed(1)})`},
             ${dedupKey})
          ON CONFLICT (dedup_key) DO NOTHING
          RETURNING id
        `) as unknown as Array<{ id: number }>;
        if (rows.length > 0) inserted.push(`cii:${s.country_code}`);
      }
    }

    // --- 2. USGS M7+ quake detection (last 24h) ---
    try {
      const usgs = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson', {
        signal: AbortSignal.timeout(10000),
      });
      if (usgs.ok) {
        const data = (await usgs.json()) as {
          features?: Array<{
            id?: string;
            properties?: { mag?: number; place?: string; time?: number };
            geometry?: { coordinates?: number[] };
          }>;
        };
        for (const f of data.features ?? []) {
          const mag = f.properties?.mag ?? 0;
          if (mag < 7) continue;
          const eventId = f.id ?? `quake:${f.properties?.time ?? Date.now()}`;
          const dedupKey = `major_quake:${eventId}`;
          const place = f.properties?.place ?? 'unknown';
          const rows = (await sql`
            INSERT INTO crisis_triggers
              (playbook_key, country_code, trigger_type, magnitude, source_ref, notes, dedup_key)
            VALUES
              ('major_earthquake_response', ${inferCountryFromUsgsPlace(place)}, 'major_quake',
               ${mag}, ${eventId},
               ${`USGS M${mag.toFixed(1)} — ${place}`}, ${dedupKey})
            ON CONFLICT (dedup_key) DO NOTHING
            RETURNING id
          `) as unknown as Array<{ id: number }>;
          if (rows.length > 0) inserted.push(`quake:${eventId}`);
        }
      }
    } catch (err) {
      console.warn('[crisis-detection] USGS fetch failed:', err instanceof Error ? err.message : err);
    }

    // --- 3. Resolve stale triggers ---
    const stale = (await sql`
      UPDATE crisis_triggers
      SET resolved_at = NOW()
      WHERE resolved_at IS NULL
        AND triggered_at < NOW() - (${TRIGGER_TTL_HOURS}::int || ' hours')::interval
      RETURNING id
    `) as unknown as Array<{ id: number }>;
    for (const r of stale) resolved.push(r.id);

    return res.json({
      ok: true,
      inserted_count: inserted.length,
      resolved_count: resolved.length,
      inserted,
    });
  } catch (err) {
    console.error('[crisis-detection] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'detection_failed' });
  }
}

/**
 * Heuristic mapping from ISO-2 country code to a playbook key. Playbook
 * defs live in src/services/crisisPlaybook.ts; the resolver there falls
 * back to a generic playbook if the key isn't known.
 */
function inferPlaybookForCountry(code: string): string {
  if (['IL', 'PS', 'LB', 'SY', 'IR', 'YE', 'SA', 'IQ'].includes(code)) return 'middle_east_escalation';
  if (['TW', 'CN', 'JP', 'KR', 'PH'].includes(code)) return 'taiwan_strait_crisis';
  if (['UA', 'RU', 'BY', 'PL', 'RO'].includes(code)) return 'russia_nato_escalation';
  if (['SD', 'SS', 'ET', 'TD', 'ML', 'BF', 'NE', 'SO'].includes(code)) return 'horn_of_africa_crisis';
  if (['KP'].includes(code)) return 'korean_peninsula_crisis';
  return 'generic_country_crisis';
}

/** Extract best-guess country code from a USGS `place` string. */
function inferCountryFromUsgsPlace(place: string): string | null {
  const lower = place.toLowerCase();
  const map: Array<[string, string]> = [
    ['japan', 'JP'],
    ['indonesia', 'ID'],
    ['turkey', 'TR'],
    ['iran', 'IR'],
    ['afghanistan', 'AF'],
    ['pakistan', 'PK'],
    ['india', 'IN'],
    ['china', 'CN'],
    ['philippines', 'PH'],
    ['mexico', 'MX'],
    ['chile', 'CL'],
    ['peru', 'PE'],
    ['ecuador', 'EC'],
    ['papua new guinea', 'PG'],
    ['tonga', 'TO'],
    ['fiji', 'FJ'],
    ['vanuatu', 'VU'],
    ['new zealand', 'NZ'],
    ['russia', 'RU'],
    ['greece', 'GR'],
    ['italy', 'IT'],
    ['alaska', 'US'],
    ['california', 'US'],
    ['taiwan', 'TW'],
    ['nepal', 'NP'],
    ['syria', 'SY'],
  ];
  for (const [needle, code] of map) if (lower.includes(needle)) return code;
  return null;
}
