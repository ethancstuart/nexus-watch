import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Gold Layer Data Lake Cron — runs every 5 minutes.
 *
 * Pulls data from ALL upstream sources into Postgres for:
 * 1. Reliability — upstream API failures don't break the platform
 * 2. Performance — web app reads from our DB, not upstream
 * 3. History — we keep timestamped snapshots for timeline/replay
 * 4. Unblocking — GDELT/ACLED blocked from Vercel? Data still flows via cache.
 *
 * Tables: data_lake (layer_id, data JSONB, feature_count, fetched_at)
 */

interface DataSource {
  id: string;
  fetch: () => Promise<unknown[] | null>;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  const sql = neon(dbUrl);

  // Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS data_lake (
      id SERIAL PRIMARY KEY,
      layer_id TEXT NOT NULL,
      data JSONB NOT NULL,
      feature_count INTEGER DEFAULT 0,
      fetched_at TIMESTAMP DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_data_lake_layer ON data_lake (layer_id, fetched_at DESC)`;

  const sources: DataSource[] = [
    {
      id: 'earthquakes',
      fetch: async () => {
        const r = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', {
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) return null;
        const d = (await r.json()) as { features: Array<Record<string, unknown>> };
        return (d.features || []).slice(0, 500).map((f: Record<string, unknown>) => {
          const props = f.properties as Record<string, unknown>;
          const geom = f.geometry as { coordinates: number[] };
          return {
            mag: props.mag,
            place: props.place,
            time: props.time,
            lat: geom.coordinates[1],
            lon: geom.coordinates[0],
            depth: geom.coordinates[2],
          };
        });
      },
    },
    {
      id: 'fires',
      fetch: async () => {
        const key = process.env.NASA_FIRMS_KEY;
        const url = key
          ? `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/world/1`
          : 'https://firms.modaps.eosdis.nasa.gov/data/active_fire/modis-c6.1/csv/MODIS_C6_1_Global_24h.csv';
        const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!r.ok) return null;
        const text = await r.text();
        const lines = text.trim().split('\n');
        if (lines.length < 2) return null;
        const headers = lines[0].split(',');
        const latIdx = headers.indexOf('latitude');
        const lonIdx = headers.indexOf('longitude');
        const brIdx = headers.indexOf('brightness');
        const frpIdx = headers.indexOf('frp');
        return lines
          .slice(1, 1000)
          .map((line) => {
            const cols = line.split(',');
            return {
              lat: parseFloat(cols[latIdx]),
              lon: parseFloat(cols[lonIdx]),
              brightness: parseFloat(cols[brIdx]) || 0,
              frp: parseFloat(cols[frpIdx]) || 0,
            };
          })
          .filter((f) => !isNaN(f.lat) && !isNaN(f.lon));
      },
    },
    {
      id: 'disease-outbreaks',
      fetch: async () => {
        const r = await fetch(
          'https://www.who.int/api/news/diseaseoutbreaknews?$top=20&$orderby=PublicationDate%20desc',
          { signal: AbortSignal.timeout(10000) },
        );
        if (!r.ok) return null;
        const d = (await r.json()) as { value: Array<{ Title: string; PublicationDate: string }> };
        return (d.value || []).map((i) => ({ title: i.Title, date: i.PublicationDate }));
      },
    },
    {
      id: 'gdelt-news',
      fetch: async () => {
        try {
          const r = await fetch(
            'https://api.gdeltproject.org/api/v2/doc/doc?query=conflict%20OR%20crisis%20OR%20sanctions%20OR%20military&mode=artlist&maxrecords=20&timespan=1440min&format=json&sort=DateDesc',
            { signal: AbortSignal.timeout(10000) },
          );
          if (!r.ok) return null;
          const text = await r.text();
          if (text.startsWith('Please limit')) return null;
          const d = JSON.parse(text) as { articles?: Array<{ title: string; url: string; domain: string }> };
          return (d.articles || []).slice(0, 20).map((a) => ({
            title: a.title,
            url: a.url,
            source: a.domain,
          }));
        } catch {
          return null; // GDELT may be blocked — that's OK, we cache what we have
        }
      },
    },
    {
      id: 'launches',
      fetch: async () => {
        const r = await fetch('https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=10&mode=list', {
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) return null;
        const d = (await r.json()) as { results: Array<Record<string, unknown>> };
        return (d.results || []).map((l) => ({
          name: l.name,
          net: l.net,
          status: (l.status as Record<string, unknown>)?.name,
          provider: (l.launch_service_provider as Record<string, unknown>)?.name,
          pad: (l.pad as Record<string, unknown>)?.name,
          padLat: (l.pad as Record<string, unknown>)?.latitude,
          padLon: (l.pad as Record<string, unknown>)?.longitude,
        }));
      },
    },
    {
      id: 'gdacs-disasters',
      fetch: async () => {
        const r = await fetch('https://www.gdacs.org/gdacsapi/api/events/geteventlist/ALL', {
          signal: AbortSignal.timeout(10000),
          headers: { Accept: 'application/json' },
        });
        if (!r.ok) return null;
        const d = (await r.json()) as { features?: Array<Record<string, unknown>> };
        return (d.features || []).slice(0, 50).map((f) => {
          const props = f.properties as Record<string, unknown>;
          const geom = f.geometry as { coordinates: number[] };
          return {
            type: props.eventtype,
            name: props.eventname || props.name,
            severity: props.alertlevel,
            lat: geom?.coordinates?.[1],
            lon: geom?.coordinates?.[0],
            date: props.fromdate,
          };
        });
      },
    },
  ];

  // Fetch all in parallel
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      try {
        const data = await source.fetch();
        if (!data || data.length === 0) return { id: source.id, count: 0, status: 'empty' };

        // Upsert: keep latest + maintain history
        await sql`
        INSERT INTO data_lake (layer_id, data, feature_count)
        VALUES (${source.id}, ${JSON.stringify(data)}, ${data.length})
      `;

        return { id: source.id, count: data.length, status: 'ok' };
      } catch (err) {
        return { id: source.id, count: 0, status: `error: ${err instanceof Error ? err.message : 'unknown'}` };
      }
    }),
  );

  // Prune old data (keep 7 days)
  await sql`DELETE FROM data_lake WHERE fetched_at < NOW() - INTERVAL '7 days'`;

  const summary = results.map((r) => (r.status === 'fulfilled' ? r.value : { id: '?', count: 0, status: 'rejected' }));

  return res.json({
    fetched: summary.filter((s) => s.status === 'ok').length,
    total: sources.length,
    sources: summary,
  });
}
