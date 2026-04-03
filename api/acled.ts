import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  try {
    // ACLED API — free, no auth required for read access
    // Fetch last 7 days of conflict events
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 7 * 86400000);
    const dateFrom = weekAgo.toISOString().split('T')[0];

    const url = `https://api.acleddata.com/acled/read?event_date=${dateFrom}|${today.toISOString().split('T')[0]}&event_date_where=BETWEEN&limit=500&fields=event_id_cnty|event_date|event_type|sub_event_type|actor1|actor2|country|admin1|latitude|longitude|fatalities|notes`;

    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) {
      return res.status(response.status).json({ error: 'ACLED API error' });
    }

    const data = (await response.json()) as {
      success: boolean;
      data: {
        event_id_cnty: string;
        event_date: string;
        event_type: string;
        sub_event_type: string;
        actor1: string;
        actor2: string;
        country: string;
        admin1: string;
        latitude: string;
        longitude: string;
        fatalities: string;
        notes: string;
      }[];
    };

    const events = (data.data || []).map((e) => ({
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

    return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({
      events,
      count: events.length,
    });
  } catch (err) {
    console.error('ACLED API error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'Conflict data service error' });
  }
}
