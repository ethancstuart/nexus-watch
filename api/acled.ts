import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  try {
    // Try ACLED API with key if available, then fallback to UCDP GED
    const acledKey = process.env.ACLED_API_KEY;
    const acledEmail = process.env.ACLED_EMAIL;

    let events: Array<{
      id: string; date: string; type: string; subType: string;
      actor1: string; actor2: string; country: string; region: string;
      lat: number; lon: number; fatalities: number; notes: string;
    }> = [];

    // Primary: ACLED API (requires key + email)
    if (acledKey && acledEmail) {
      try {
        const today = new Date();
        const weekAgo = new Date(today.getTime() - 7 * 86400000);
        const dateFrom = weekAgo.toISOString().split('T')[0];
        const url = `https://api.acleddata.com/acled/read?key=${acledKey}&email=${acledEmail}&event_date=${dateFrom}|${today.toISOString().split('T')[0]}&event_date_where=BETWEEN&limit=500&fields=event_id_cnty|event_date|event_type|sub_event_type|actor1|actor2|country|admin1|latitude|longitude|fatalities|notes`;
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (response.ok) {
          const data = (await response.json()) as { data: Array<Record<string, string>> };
          events = (data.data || []).map((e) => ({
            id: e.event_id_cnty, date: e.event_date, type: e.event_type,
            subType: e.sub_event_type, actor1: e.actor1, actor2: e.actor2,
            country: e.country, region: e.admin1,
            lat: parseFloat(e.latitude), lon: parseFloat(e.longitude),
            fatalities: parseInt(e.fatalities) || 0, notes: (e.notes || '').slice(0, 200),
          }));
        }
      } catch {
        // ACLED API failed, try fallback
      }
    }

    // Fallback: UCDP Georeferenced Event Dataset API (free, no auth)
    if (events.length === 0) {
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
          events = (data.Result || []).map((e) => ({
            id: String(e.id), date: e.date_start,
            type: violenceTypes[e.type_of_violence] || 'Armed conflict',
            subType: '', actor1: e.side_a, actor2: e.side_b || '',
            country: e.country, region: e.region,
            lat: e.latitude, lon: e.longitude,
            fatalities: e.best || 0, notes: '',
          }));
        }
      } catch {
        // UCDP also failed
      }
    }

    return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({
      events,
      count: events.length,
      source: events.length > 0 && !acledKey ? 'ucdp' : 'acled',
    });
  } catch (err) {
    console.error('ACLED API error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'Conflict data service error' });
  }
}
