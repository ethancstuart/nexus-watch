import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const CORS_ORIGIN = 'https://nexuswatch.dev';
export const config = { runtime: 'nodejs' };

/**
 * Dark vessel API — returns active AIS gap events.
 * Used by the map to render ghost ship icons.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  try {
    const sql = neon(dbUrl);

    // Active gaps (vessels currently dark)
    const active = await sql`
      SELECT mmsi, vessel_name, vessel_type, last_lat, last_lon,
             gap_start, duration_minutes, sensitive_area
      FROM vessel_gaps
      WHERE gap_end IS NULL AND duration_minutes >= 30
      ORDER BY duration_minutes DESC
      LIMIT 50
    `;

    // Recent resolved gaps (last 24h)
    const recent = await sql`
      SELECT mmsi, vessel_name, vessel_type, last_lat, last_lon,
             gap_start, gap_end, duration_minutes, sensitive_area
      FROM vessel_gaps
      WHERE gap_end IS NOT NULL AND gap_end > NOW() - INTERVAL '24 hours'
      ORDER BY gap_end DESC
      LIMIT 20
    `;

    return res.setHeader('Cache-Control', 'public, max-age=60').json({
      active: active.map((r) => ({
        mmsi: r.mmsi,
        name: r.vessel_name,
        type: r.vessel_type,
        lat: r.last_lat,
        lon: r.last_lon,
        gapStart: r.gap_start,
        durationMinutes: r.duration_minutes,
        sensitiveArea: r.sensitive_area,
      })),
      recent: recent.map((r) => ({
        mmsi: r.mmsi,
        name: r.vessel_name,
        type: r.vessel_type,
        lat: r.last_lat,
        lon: r.last_lon,
        gapStart: r.gap_start,
        gapEnd: r.gap_end,
        durationMinutes: r.duration_minutes,
        sensitiveArea: r.sensitive_area,
      })),
      activeCount: active.length,
      recentCount: recent.length,
    });
  } catch (err) {
    console.error('Dark vessels API error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to load dark vessel data' });
  }
}
