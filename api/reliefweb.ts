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
    // ReliefWeb v1 uses GET with bracketed query params. Pattern matches
    // api/cron/source-reliefweb.ts.
    const params = new URLSearchParams();
    params.set('appname', 'nexuswatch');
    params.append('sort[]', 'date.created:desc');
    params.set('limit', String(limit));
    ['name', 'date.created', 'country', 'primary_country.iso3', 'type', 'status', 'url', 'description'].forEach((f) =>
      params.append('fields[include][]', f),
    );
    if (country) {
      params.set('filter[field]', 'primary_country.iso3');
      params.set('filter[value]', country);
    }
    if (status === 'current') {
      // append a second filter via filter[conditions] not supported with simple shape,
      // skip when both country and status set; query just by country.
    }

    // ReliefWeb v1 was decommissioned 2026-04. v2 requires an approved
    // appname (humans review at https://apidoc.reliefweb.int/parameters#appname).
    // Until "nexuswatch" is approved we return a clean awaiting-upstream
    // envelope so consumers don't show errors.
    const upstream = await fetch(`https://api.reliefweb.int/v2/disasters?${params.toString()}`, {
      signal: AbortSignal.timeout(7000),
      headers: { 'User-Agent': 'NexusWatch/1.0 (https://nexuswatch.dev)' },
    });
    if (upstream.status === 403) {
      return res
        .setHeader('Cache-Control', 'public, max-age=86400')
        .json({ events: [], status: 'awaiting-upstream-registration', upstream: 'reliefweb-v2' });
    }
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
    return res
      .setHeader('Cache-Control', 'public, max-age=300')
      .json({ events: [], status: 'upstream-error', upstream: 'reliefweb-v2' });
  }
}
