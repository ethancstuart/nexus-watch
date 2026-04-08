import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 30 };

// Layers to snapshot for timeline playback
const SNAPSHOT_LAYERS = [
  { id: 'earthquakes', url: '/api/earthquakes', dataKey: 'earthquakes' },
  { id: 'acled', url: '/api/acled', dataKey: 'events' },
  { id: 'fires', url: '/api/fires', dataKey: 'fires' },
  { id: 'disease-outbreaks', url: '/api/disease-outbreaks', dataKey: 'outbreaks' },
  { id: 'internet-outages', url: '/api/internet-outages', dataKey: 'outages' },
  { id: 'ships', url: '/api/ships', dataKey: 'vessels' },
  { id: 'flights', url: '/api/flights', dataKey: 'aircraft' },
];

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://dashpulse.app';

  const sql = neon(dbUrl);
  let snapshots = 0;

  try {
    const results = await Promise.allSettled(
      SNAPSHOT_LAYERS.map(async (layer) => {
        try {
          const response = await fetch(`${baseUrl}${layer.url}`, {
            signal: AbortSignal.timeout(10000),
          });
          if (!response.ok) return null;
          const json = (await response.json()) as Record<string, unknown>;
          const data = (json[layer.dataKey] || []) as unknown[];
          const count = Array.isArray(data) ? data.length : 0;
          if (count === 0) return null;

          // Store snapshot — limit to 500 items per layer to keep storage reasonable
          const trimmed = Array.isArray(data) ? data.slice(0, 500) : data;
          await sql`
            INSERT INTO event_snapshots (layer_id, data, feature_count)
            VALUES (${layer.id}, ${JSON.stringify(trimmed)}, ${count})
          `;
          return { layer: layer.id, count };
        } catch {
          return null;
        }
      }),
    );

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) snapshots++;
    }

    // Prune snapshots older than 90 days
    await sql`DELETE FROM event_snapshots WHERE timestamp < NOW() - INTERVAL '90 days'`;

    return res.json({ success: true, snapshots, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Snapshot cron error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Snapshot failed' });
  }
}
