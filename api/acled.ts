import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs', maxDuration: 30 };

// Module-level cache for OAuth token + conflict data
let cachedToken: { token: string; expiresAt: number } | null = null;
let cachedEvents: unknown[] = [];
let lastFetch = 0;
const CACHE_TTL = 3600_000; // 1 hour

async function getAcledToken(): Promise<string | null> {
  const email = process.env.ACLED_EMAIL?.trim();
  const password = process.env.ACLED_PASSWORD?.trim();
  if (!email || !password) return null;

  // Return cached token if still valid
  if (cachedToken && Date.now() < cachedToken.expiresAt) return cachedToken.token;

  try {
    const res = await fetch('https://acleddata.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        username: email,
        password: password,
        grant_type: 'password',
        client_id: 'acled',
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) return null;
    const data = (await res.json()) as { access_token: string; expires_in: number };
    cachedToken = {
      token: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 300) * 1000, // Refresh 5 min early
    };
    return cachedToken.token;
  } catch {
    return null;
  }
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  // Serve from cache if fresh
  if (cachedEvents.length > 0 && Date.now() - lastFetch < CACHE_TTL) {
    return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({
      events: cachedEvents,
      count: cachedEvents.length,
      cached: true,
      source: 'acled',
    });
  }

  try {
    // Try ACLED OAuth API (new endpoint: acleddata.com/api/acled/read)
    const token = await getAcledToken();
    if (token) {
      const today = new Date();
      const weekAgo = new Date(today.getTime() - 7 * 86400000);
      const dateFrom = weekAgo.toISOString().split('T')[0];
      const dateTo = today.toISOString().split('T')[0];

      const url = `https://acleddata.com/api/acled/read?_format=json&event_date=${dateFrom}|${dateTo}&event_date_where=BETWEEN&limit=500&fields=event_id_cnty|event_date|event_type|sub_event_type|actor1|actor2|country|admin1|latitude|longitude|fatalities|notes`;

      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });

      if (response.ok) {
        const data = (await response.json()) as { status: number; data: Array<Record<string, string>> };
        if (data.status === 200 && data.data) {
          const events = data.data.map((e) => ({
            id: e.event_id_cnty,
            date: e.event_date,
            type: e.event_type,
            subType: e.sub_event_type,
            actor1: e.actor1,
            actor2: e.actor2,
            country: e.country,
            region: e.admin1,
            lat: parseFloat(e.latitude),
            lon: parseFloat(e.longitude),
            fatalities: parseInt(e.fatalities) || 0,
            notes: (e.notes || '').slice(0, 200),
          }));

          if (events.length > 0) {
            cachedEvents = events;
            lastFetch = Date.now();
          }

          return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({
            events,
            count: events.length,
            source: 'acled',
          });
        }
      }
    }

    // Fallback: UCDP Georeferenced Event Dataset (free, no auth)
    try {
      const year = new Date().getFullYear();
      const url = `https://ucdpapi.pcr.uu.se/api/gedevents/${year}?pagesize=100`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (response.ok) {
        const data = (await response.json()) as {
          Result: Array<{
            id: number; date_start: string; type_of_violence: number;
            side_a: string; side_b: string; country: string; region: string;
            latitude: number; longitude: number; best: number;
          }>;
        };
        const violenceTypes: Record<number, string> = { 1: 'State-based', 2: 'Non-state', 3: 'One-sided' };
        const events = (data.Result || []).map((e) => ({
          id: String(e.id), date: e.date_start,
          type: violenceTypes[e.type_of_violence] || 'Armed conflict',
          subType: '', actor1: e.side_a, actor2: e.side_b || '',
          country: e.country, region: e.region,
          lat: e.latitude, lon: e.longitude,
          fatalities: e.best || 0, notes: '',
        }));

        if (events.length > 0) {
          cachedEvents = events;
          lastFetch = Date.now();
        }

        return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({
          events,
          count: events.length,
          source: 'ucdp',
        });
      }
    } catch {
      // UCDP also failed
    }

    // Return stale cache if available
    if (cachedEvents.length > 0) {
      return res.setHeader('Cache-Control', 'public, max-age=300').json({
        events: cachedEvents,
        count: cachedEvents.length,
        cached: true,
        stale: true,
      });
    }

    return res.json({
      events: [],
      count: 0,
      error: 'ACLED: account authenticated but data access denied. Complete data access approval at acleddata.com/myacled. UCDP fallback also unavailable.',
    });
  } catch (err) {
    console.error('ACLED API error:', err instanceof Error ? err.message : err);
    if (cachedEvents.length > 0) {
      return res.json({ events: cachedEvents, count: cachedEvents.length, cached: true, stale: true });
    }
    return res.status(502).json({ error: 'Conflict data service error' });
  }
}
