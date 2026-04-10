import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

const COUNTRY_COORDS: Record<string, [number, number]> = {
  'United States': [39.8, -98.5],
  Russia: [55.8, 37.6],
  Ukraine: [48.4, 31.2],
  China: [35.9, 104.2],
  Iran: [32.4, 53.7],
  Iraq: [33.2, 43.7],
  Syria: [34.8, 38.9],
  Israel: [31.0, 35.0],
  Yemen: [15.6, 48.5],
  Sudan: [15.5, 32.5],
  Ethiopia: [9.1, 40.5],
  Somalia: [2.0, 45.3],
  Myanmar: [19.8, 96.1],
  Afghanistan: [33.9, 67.7],
  Pakistan: [30.4, 69.3],
  Nigeria: [9.1, 7.5],
  Libya: [26.3, 17.2],
  Lebanon: [33.9, 35.5],
  Gaza: [31.5, 34.5],
  Palestine: [31.9, 35.2],
  Turkey: [39.9, 32.9],
  India: [20.6, 78.9],
  'North Korea': [40.0, 127.0],
  'Saudi Arabia': [24.7, 46.7],
};

const DEMONYMS: Record<string, string> = {
  Iranian: 'Iran',
  Russian: 'Russia',
  Ukrainian: 'Ukraine',
  Syrian: 'Syria',
  Israeli: 'Israel',
  Iraqi: 'Iraq',
  Yemeni: 'Yemen',
  Sudanese: 'Sudan',
  Palestinian: 'Palestine',
  Lebanese: 'Lebanon',
  Afghan: 'Afghanistan',
  Nigerian: 'Nigeria',
  Somali: 'Somalia',
  Pakistani: 'Pakistan',
  Turkish: 'Turkey',
};

function classifyConflict(title: string): { type: string; subType: string; fatalities: number } {
  const lower = title.toLowerCase();
  let fatalities = 0;
  const m = lower.match(/(\d+)\s*(killed|dead|deaths|casualties|slain)/);
  if (m) fatalities = parseInt(m[1]) || 0;
  if (lower.includes('airstrike') || lower.includes('bombing'))
    return { type: 'Battles', subType: 'Air/drone strike', fatalities };
  if (lower.includes('missile') || lower.includes('rocket'))
    return { type: 'Battles', subType: 'Shelling/missile', fatalities };
  if (lower.includes('protest') || lower.includes('demonstrat'))
    return { type: 'Protests', subType: 'Protest', fatalities };
  if (lower.includes('attack') || lower.includes('offensive'))
    return { type: 'Battles', subType: 'Armed clash', fatalities };
  if (lower.includes('ceasefire') || lower.includes('truce'))
    return { type: 'Strategic developments', subType: 'Ceasefire', fatalities: 0 };
  return { type: 'Violence against civilians', subType: 'Conflict', fatalities };
}

function extractCountry(title: string): { country: string; lat: number; lon: number } | null {
  for (const [name, coords] of Object.entries(COUNTRY_COORDS)) {
    if (title.includes(name)) return { country: name, lat: coords[0], lon: coords[1] };
  }
  for (const [dem, country] of Object.entries(DEMONYMS)) {
    if (title.includes(dem)) {
      const c = COUNTRY_COORDS[country];
      return c ? { country, lat: c[0], lon: c[1] } : null;
    }
  }
  return null;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.json({ events: [], count: 0, error: 'No database configured' });

  try {
    const sql = neon(dbUrl);
    const rows = await sql`SELECT data, updated_at FROM cached_layer_data WHERE layer_id = 'gdelt-conflict'`;

    if (rows.length === 0 || !rows[0].data) {
      return res.json({
        events: [],
        count: 0,
        source: 'gdelt-conflict',
        error: 'Cache empty — cron populates every 5 min',
      });
    }

    const cached = rows[0].data as {
      articles?: Array<{ title: string; source: string; sourcecountry: string; seendate: string }>;
    };
    const seen = new Set<string>();
    const events = (cached.articles || [])
      .map((a) => {
        const key = a.title.slice(0, 50);
        if (seen.has(key)) return null;
        seen.add(key);
        const geo = extractCountry(a.title);
        if (!geo) return null;
        const c = classifyConflict(a.title);
        return {
          id: `gdelt-${seen.size}`,
          date: a.seendate?.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') || '',
          type: c.type,
          subType: c.subType,
          actor1: a.source || '',
          actor2: '',
          country: geo.country,
          region: '',
          lat: geo.lat + (Math.random() - 0.5) * 1.5,
          lon: geo.lon + (Math.random() - 0.5) * 1.5,
          fatalities: c.fatalities,
          notes: a.title.slice(0, 200),
        };
      })
      .filter(Boolean);

    return res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300').json({
      events,
      count: events.length,
      source: 'gdelt-conflict',
      cachedAt: rows[0].updated_at,
    });
  } catch (err) {
    console.error('Conflict API error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ events: [], count: 0, error: 'Failed to read conflict cache' });
  }
}
