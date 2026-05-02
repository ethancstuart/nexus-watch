import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * UCDP — Uppsala Conflict Data Program. Free academic-grade conflict
 * event data. Used as cross-check for ACLED.
 *
 * GET /api/ucdp?country=UA&days=30
 *
 * Returns recent UCDP-GED events the client can compare to ACLED clusters
 * for `corroborationCount` enrichment in the alert pill.
 *
 * Cached 6h in module memory (Fluid Compute reuses instances).
 */

interface UcdpEvent {
  id: string;
  date: string;
  country: string;
  lat: number;
  lon: number;
  fatalities: number;
  type: string;
}

const CACHE_TTL = 6 * 60 * 60 * 1000;
const cache = new Map<string, { ts: number; data: UcdpEvent[] }>();

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const country = String(req.query.country || '')
    .toUpperCase()
    .slice(0, 3);
  const days = Math.min(90, Math.max(1, parseInt(String(req.query.days || '30'), 10)));
  const key = `${country}:${days}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return res.setHeader('Cache-Control', 'public, max-age=21600').json({ events: hit.data, cached: true });
  }

  // UCDP Candidate Events API — pre-release subset, free, no key.
  // Endpoint: https://ucdpapi.pcr.uu.se/api/gedevents-candidate/24.0.25.10.31?Country=804&pagesize=100
  // We don't have a country-name → ucdp ID map here; fall back to global pull
  // and filter client-side. For ACLED corroboration the client already knows
  // the lat/lon to match against, so country filtering server-side is optional.
  try {
    // Use the stable yearly GED endpoint (24.1 = 2024 release). The candidate
    // endpoint requires a date-versioned URL that rotates monthly; using the
    // stable release is simpler and covers ACLED corroboration just as well.
    const url = `https://ucdpapi.pcr.uu.se/api/gedevents/24.1?pagesize=200`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(7000) });
    if (!upstream.ok) throw new Error(`UCDP HTTP ${upstream.status}`);
    const data = (await upstream.json()) as { Result: Array<Record<string, unknown>> };
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const events: UcdpEvent[] = (data.Result || [])
      .map((e) => ({
        id: String(e.id ?? ''),
        date: String(e.date_start ?? ''),
        country: String(e.country ?? ''),
        lat: Number(e.latitude ?? 0),
        lon: Number(e.longitude ?? 0),
        fatalities: Number(e.deaths_a ?? 0) + Number(e.deaths_b ?? 0) + Number(e.deaths_civilians ?? 0),
        type: String(e.type_of_violence ?? ''),
      }))
      .filter((e) => e.lat && e.lon && e.date && new Date(e.date).getTime() >= cutoff);

    cache.set(key, { ts: Date.now(), data: events });
    return res.setHeader('Cache-Control', 'public, max-age=21600').json({ events });
  } catch (err) {
    console.error('[ucdp] upstream failed', err);
    if (hit) {
      return res.setHeader('Cache-Control', 'public, max-age=300').json({ events: hit.data, stale: true });
    }
    return res.status(502).json({ events: [], error: 'UCDP upstream failed' });
  }
}
