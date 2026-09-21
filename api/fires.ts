import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const mapKey = process.env.NASA_FIRMS_KEY;
  if (!mapKey) {
    // Fallback: use the public CSV endpoint (MODIS, last 24h, limited)
    return await handlePublicFeed(res);
  }

  const source = (req.query.source as string) || 'VIIRS_SNPP_NRT';
  const dayRange = (req.query.days as string) || '1';

  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${mapKey}/${source}/world/${dayRange}`;
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'NASA FIRMS API error' });
    }

    const csv = await response.text();
    const { hotspots, total } = parseCsv(csv);

    return res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600').json({
      hotspots,
      /** Hotspots in the feed, before sampling. */
      count: total,
      /** How many are in this response. */
      returned: hotspots.length,
      sampled: total > hotspots.length,
    });
  } catch (err) {
    console.error('FIRMS API error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'Fire service error' });
  }
}

async function handlePublicFeed(res: VercelResponse) {
  try {
    // Public MODIS feed (no key required, last 24h)
    const url = 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv';
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });

    if (!response.ok) {
      return res.status(502).json({ error: 'Public fire feed unavailable' });
    }

    const csv = await response.text();
    const { hotspots, total } = parseCsv(csv);

    return res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=600').json({
      hotspots,
      /** Hotspots in the feed, before sampling. */
      count: total,
      /** How many are in this response. */
      returned: hotspots.length,
      sampled: total > hotspots.length,
    });
  } catch (err) {
    console.error('Public FIRMS feed error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'Fire service error' });
  }
}

interface Hotspot {
  lat: number;
  lon: number;
  brightness: number;
  confidence: number | string;
  satellite: string;
  acqDate: string;
  acqTime: string;
  frp: number;
}

/**
 * Returns the sampled hotspots AND how many the feed actually held.
 *
 * It used to return only the sampled array, and both callers published
 * `count: hotspots.length`. The sampler caps at 2000, so on any serious fire
 * day the endpoint reported exactly 2000 — a page size presented as a
 * measurement of the world. The same defect api/_lib/ledger-by-kind.ts was
 * written about, in a different file.
 */
function parseCsv(csv: string): { hotspots: Hotspot[]; total: number } {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return { hotspots: [], total: 0 };

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const latIdx = headers.indexOf('latitude');
  const lonIdx = headers.indexOf('longitude');
  const brightIdx = headers.indexOf('brightness');
  const confIdx = headers.indexOf('confidence');
  const satIdx = headers.indexOf('satellite');
  const dateIdx = headers.indexOf('acq_date');
  const timeIdx = headers.indexOf('acq_time');
  const frpIdx = headers.indexOf('frp');

  if (latIdx === -1 || lonIdx === -1) return { hotspots: [], total: 0 };

  const results: Hotspot[] = [];

  // Sample for performance — max 2000 hotspots
  const step = lines.length > 2001 ? Math.ceil((lines.length - 1) / 2000) : 1;

  for (let i = 1; i < lines.length; i += step) {
    const cols = lines[i].split(',');
    const lat = parseFloat(cols[latIdx]);
    const lon = parseFloat(cols[lonIdx]);
    if (isNaN(lat) || isNaN(lon)) continue;

    results.push({
      lat,
      lon,
      brightness: brightIdx >= 0 ? parseFloat(cols[brightIdx]) || 0 : 0,
      confidence: confIdx >= 0 ? (isNaN(Number(cols[confIdx])) ? cols[confIdx] : Number(cols[confIdx])) : 0,
      satellite: satIdx >= 0 ? cols[satIdx] || '' : '',
      acqDate: dateIdx >= 0 ? cols[dateIdx] || '' : '',
      acqTime: timeIdx >= 0 ? cols[timeIdx] || '' : '',
      frp: frpIdx >= 0 ? parseFloat(cols[frpIdx]) || 0 : 0,
    });
  }

  // `total` is the data rows in the feed, before sampling — the header line
  // is excluded, and a malformed row still counted as present upstream.
  return { hotspots: results, total: Math.max(0, lines.length - 1) };
}
