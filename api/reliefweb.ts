import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs', maxDuration: 8 };

/**
 * ReliefWeb — UN OCHA humanitarian crises feed.
 * Free public API: api.reliefweb.int
 *
 * GET /api/reliefweb?country=UA&limit=20
 * GET /api/reliefweb?type=ongoing&limit=50
 *
 * Returns recent disasters / humanitarian events filtered by country.
 * Powers the country panel "Headlines" section + a future humanitarian
 * map layer.
 */

interface ReliefEvent {
  id: string;
  name: string;
  type: string;
  status: string;
  country: string;
  countryIso3: string;
  date: string;
  url: string;
  description?: string;
}

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, { ts: number; data: ReliefEvent[] }>();

interface RWFields {
  name?: string;
  status?: string;
  date?: { created?: string };
  url?: string;
  description?: string;
  type?: Array<{ name?: string }>;
  country?: Array<{ name?: string; iso3?: string }>;
}

interface RWHit {
  id: string;
  fields?: RWFields;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const country = String(req.query.country || '').toUpperCase();
  const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '20'), 10)));
  const status = String(req.query.type || 'current'); // 'current' | 'past' | 'alert'
  const key = `${country}:${limit}:${status}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return res.setHeader('Cache-Control', 'public, max-age=3600').json({ events: hit.data, cached: true });
  }

  try {
    const filters: Array<{ field: string; value: string | string[] }> = [];
    if (country) filters.push({ field: 'country.iso3', value: country });
    if (status === 'current') filters.push({ field: 'status', value: 'current' });

    const body = {
      limit,
      sort: ['date.created:desc'],
      fields: { include: ['name', 'type', 'status', 'country', 'date', 'url', 'description'] },
      filter:
        filters.length > 0
          ? { operator: 'AND', conditions: filters.map((f) => ({ field: f.field, value: f.value })) }
          : undefined,
    };

    const upstream = await fetch('https://api.reliefweb.int/v1/disasters?appname=nexuswatch', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(7000),
    });
    if (!upstream.ok) throw new Error(`ReliefWeb HTTP ${upstream.status}`);
    const data = (await upstream.json()) as { data?: RWHit[] };

    const events: ReliefEvent[] = (data.data || []).map((d) => {
      const fields: RWFields = d.fields || {};
      const c0 = fields.country?.[0];
      return {
        id: d.id,
        name: fields.name || 'Untitled disaster',
        type: fields.type?.[0]?.name || 'Other',
        status: fields.status || 'unknown',
        country: c0?.name || '',
        countryIso3: c0?.iso3 || '',
        date: fields.date?.created || '',
        url: fields.url || '',
        description: typeof fields.description === 'string' ? fields.description.slice(0, 280) : undefined,
      };
    });

    cache.set(key, { ts: Date.now(), data: events });
    return res.setHeader('Cache-Control', 'public, max-age=3600').json({ events });
  } catch (err) {
    console.error('[reliefweb] upstream failed', err);
    if (hit) {
      return res.setHeader('Cache-Control', 'public, max-age=300').json({ events: hit.data, stale: true });
    }
    return res.status(502).json({ events: [], error: 'ReliefWeb upstream failed' });
  }
}
