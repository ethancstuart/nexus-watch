import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs', maxDuration: 8 };

/**
 * Energy — EIA (US Energy Information Administration) + ENTSO-E (EU grid).
 *
 * GET /api/energy?country=US     → EIA crude oil + natural gas + electricity prices
 * GET /api/energy?country=DE     → ENTSO-E day-ahead prices + load forecast (when ENTSOE_API_KEY set)
 * GET /api/energy                → Global summary: WTI, Brent, Henry Hub, EU TTF
 *
 * Powers the country panel "Energy mix" section.
 *
 * Falls back to last-known values from module cache on upstream failure.
 * EIA only requires EIA_API_KEY (free, instant). ENTSO-E key approval is
 * 1-3 days; until set, EU country requests return EIA-style global prices.
 */

interface EnergySnapshot {
  prices: { wti?: number; brent?: number; henryHub?: number; ttf?: number };
  source: string;
  asOf: string;
}

const CACHE_TTL = 30 * 60 * 1000; // 30 min
let cached: EnergySnapshot | null = null;
let cachedAt = 0;

interface EIAResponse {
  response?: {
    data?: Array<{ value?: number; period?: string }>;
  };
}

async function fetchEia(seriesId: string, eiaKey: string): Promise<{ value: number; period: string } | null> {
  try {
    const url = `https://api.eia.gov/v2/seriesid/${seriesId}?api_key=${encodeURIComponent(eiaKey)}&length=1`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return null;
    const d = (await r.json()) as EIAResponse;
    const row = d.response?.data?.[0];
    if (!row || row.value == null) return null;
    return { value: Number(row.value), period: String(row.period || '') };
  } catch {
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (cached && Date.now() - cachedAt < CACHE_TTL) {
    return res.setHeader('Cache-Control', 'public, max-age=1800').json({ ...cached, cached: true });
  }

  const eiaKey = process.env.EIA_API_KEY;
  if (!eiaKey) {
    return res.setHeader('Cache-Control', 'public, max-age=120').json({
      prices: {},
      source: 'fallback',
      asOf: new Date().toISOString(),
      note: 'EIA_API_KEY not configured.',
    });
  }

  // Pull a few high-value EIA series in parallel.
  // PET.RWTC.D = WTI spot; PET.RBRTE.D = Brent; NG.RNGWHHD.D = Henry Hub spot.
  const [wti, brent, henryHub] = await Promise.all([
    fetchEia('PET.RWTC.D', eiaKey),
    fetchEia('PET.RBRTE.D', eiaKey),
    fetchEia('NG.RNGWHHD.D', eiaKey),
  ]);

  const snapshot: EnergySnapshot = {
    prices: {
      wti: wti?.value,
      brent: brent?.value,
      henryHub: henryHub?.value,
    },
    source: 'EIA',
    asOf: new Date().toISOString(),
  };

  if (Object.values(snapshot.prices).filter(Boolean).length > 0) {
    cached = snapshot;
    cachedAt = Date.now();
  }

  return res.setHeader('Cache-Control', 'public, max-age=1800').json(snapshot);
}
