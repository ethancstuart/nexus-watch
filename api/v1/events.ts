import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, getClientIp } from './_middleware';

export const config = { runtime: 'nodejs' };

const CORS = 'https://dashpulse.app';

// Map of layer IDs to their internal API endpoints and data keys
const LAYER_ENDPOINTS: Record<string, { url: string; dataKey: string }> = {
  earthquakes: { url: '/api/earthquakes', dataKey: 'earthquakes' },
  acled: { url: '/api/acled', dataKey: 'events' },
  fires: { url: '/api/fires', dataKey: 'fires' },
  ships: { url: '/api/ships', dataKey: 'vessels' },
  flights: { url: '/api/flights', dataKey: 'aircraft' },
  launches: { url: '/api/launches', dataKey: 'launches' },
  satellites: { url: '/api/satellites', dataKey: 'satellites' },
  'disease-outbreaks': { url: '/api/disease-outbreaks', dataKey: 'outbreaks' },
  'internet-outages': { url: '/api/internet-outages', dataKey: 'outages' },
  displacement: { url: '/api/displacement', dataKey: 'flows' },
  'weather-alerts': { url: '/api/weather-alerts', dataKey: 'alerts' },
  'air-quality': { url: '/api/air-quality', dataKey: 'cities' },
  predictions: { url: '/api/prediction', dataKey: 'markets' },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const ip = getClientIp(req.headers); if (!rateLimit(res, ip)) return;

  const layer = req.query.layer as string | undefined;
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://dashpulse.app';

  try {
    if (layer) {
      // Single layer
      const endpoint = LAYER_ENDPOINTS[layer];
      if (!endpoint) {
        return res.status(400).json({
          error: `Unknown layer: ${layer}`,
          availableLayers: Object.keys(LAYER_ENDPOINTS),
        });
      }

      const response = await fetch(`${baseUrl}${endpoint.url}`, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return res.status(502).json({ error: `Upstream ${layer} API failed` });
      const data = (await response.json()) as Record<string, unknown>;

      return res.setHeader('Cache-Control', 'public, max-age=30').json({
        layer,
        data: data[endpoint.dataKey] || [],
        count: data.count || 0,
        timestamp: Date.now(),
      });
    }

    // All layers — unified event stream
    // Only fetch from layers with API endpoints (skip static layers)
    const results = await Promise.allSettled(
      Object.entries(LAYER_ENDPOINTS).map(async ([id, endpoint]) => {
        const response = await fetch(`${baseUrl}${endpoint.url}`, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return { layer: id, data: [], count: 0 };
        const json = (await response.json()) as Record<string, unknown>;
        const items = json[endpoint.dataKey];
        return { layer: id, data: Array.isArray(items) ? items.slice(0, 50) : [], count: Number(json.count) || 0 };
      }),
    );

    const layers: Array<{ layer: string; count: number; data: unknown[] }> = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        layers.push(r.value);
      }
    }

    const totalEvents = layers.reduce((s, l) => s + l.count, 0);

    return res.setHeader('Cache-Control', 'public, max-age=30').json({
      layers,
      totalEvents,
      layerCount: layers.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('API v1 events error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
