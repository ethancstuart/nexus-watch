import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

const CORS = 'https://nexuswatch.dev';

// Direct upstream sources — NO self-referencing through our own domain
const LAYER_SOURCES: Record<string, { url: string; dataKey: string; transform?: (data: unknown) => unknown[] }> = {
  earthquakes: {
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    dataKey: 'features',
    transform: (data) => {
      const d = data as {
        features: Array<{
          id: string;
          properties: { mag: number; place: string; time: number };
          geometry: { coordinates: [number, number, number] };
        }>;
      };
      return (d.features || [])
        .filter((f) => f.properties.mag >= 2.5)
        .slice(0, 200)
        .map((f) => ({
          id: f.id,
          magnitude: f.properties.mag,
          place: f.properties.place,
          time: f.properties.time,
          lat: f.geometry.coordinates[1],
          lon: f.geometry.coordinates[0],
        }));
    },
  },
  launches: {
    url: 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=15&mode=list',
    dataKey: 'results',
    transform: (data) => {
      const d = data as {
        results: Array<{ name: string; net: string; status: { name: string }; lsp_name?: string; mission?: string }>;
      };
      return (d.results || []).map((l) => ({
        name: l.name,
        date: l.net,
        status: l.status.name,
        provider: l.lsp_name || '',
        mission: l.mission || l.name,
      }));
    },
  },
  'disease-outbreaks': {
    url: 'https://www.who.int/api/news/diseaseoutbreaknews?$top=20&$orderby=PublicationDate%20desc',
    dataKey: 'value',
    transform: (data) => {
      const d = data as { value: Array<{ Title: string; PublicationDate: string; DonId: string }> };
      return (d.value || []).map((o) => ({ title: o.Title, date: o.PublicationDate?.split('T')[0], donId: o.DonId }));
    },
  },
  predictions: {
    url: 'https://gamma-api.polymarket.com/markets?limit=10&active=true&closed=false',
    dataKey: '_root',
    transform: (data) => {
      return Array.isArray(data)
        ? data.slice(0, 10).map((m: Record<string, unknown>) => ({
            question: m.question,
            volume: m.volume,
          }))
        : [];
    },
  },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const layer = req.query.layer as string | undefined;

  try {
    if (layer) {
      const source = LAYER_SOURCES[layer];
      if (!source) {
        return res.status(400).json({
          error: `Unknown layer: ${layer}`,
          availableLayers: Object.keys(LAYER_SOURCES),
        });
      }

      const response = await fetch(source.url, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return res.status(502).json({ error: `Upstream ${layer} API returned ${response.status}` });
      const raw = await response.json();
      const items = source.transform
        ? source.transform(raw)
        : (((raw as Record<string, unknown>)[source.dataKey] || []) as unknown[]);

      return res.setHeader('Cache-Control', 'public, max-age=30').json({
        layer,
        data: items,
        count: Array.isArray(items) ? items.length : 0,
        timestamp: Date.now(),
      });
    }

    // All layers
    const results = await Promise.allSettled(
      Object.entries(LAYER_SOURCES).map(async ([id, source]) => {
        const response = await fetch(source.url, { signal: AbortSignal.timeout(8000) });
        if (!response.ok) return { layer: id, data: [] as unknown[], count: 0 };
        const raw = await response.json();
        const items = source.transform
          ? source.transform(raw)
          : (((raw as Record<string, unknown>)[source.dataKey] || []) as unknown[]);
        const arr = Array.isArray(items) ? items.slice(0, 50) : [];
        return { layer: id, data: arr, count: arr.length };
      }),
    );

    const layers: Array<{ layer: string; count: number; data: unknown[] }> = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) layers.push(r.value);
    }

    return res.setHeader('Cache-Control', 'public, max-age=30').json({
      layers,
      totalEvents: layers.reduce((s, l) => s + l.count, 0),
      layerCount: layers.length,
      timestamp: Date.now(),
    });
  } catch (err) {
    console.error('API v1 events error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
