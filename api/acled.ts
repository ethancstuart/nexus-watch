import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs', maxDuration: 30 };

// Module-level cache
let cachedEvents: ConflictEvent[] = [];
let lastFetch = 0;
const CACHE_TTL = 1800_000; // 30 minutes

interface ConflictEvent {
  id: string;
  date: string;
  type: string;
  subType: string;
  actor1: string;
  actor2: string;
  country: string;
  region: string;
  lat: number;
  lon: number;
  fatalities: number;
  notes: string;
}

// Country centroids for geocoding GDELT articles that have country but no coords
const COUNTRY_COORDS: Record<string, [number, number]> = {
  'United States': [39.8, -98.5], 'Russia': [55.8, 37.6], 'Ukraine': [48.4, 31.2],
  'China': [35.9, 104.2], 'Iran': [32.4, 53.7], 'Iraq': [33.2, 43.7],
  'Syria': [34.8, 38.9], 'Israel': [31.0, 35.0], 'Yemen': [15.6, 48.5],
  'Sudan': [15.5, 32.5], 'Ethiopia': [9.1, 40.5], 'Somalia': [2.0, 45.3],
  'Myanmar': [19.8, 96.1], 'Afghanistan': [33.9, 67.7], 'Pakistan': [30.4, 69.3],
  'Nigeria': [9.1, 7.5], 'Libya': [26.3, 17.2], 'Lebanon': [33.9, 35.5],
  'Gaza': [31.5, 34.5], 'Palestine': [31.9, 35.2], 'Turkey': [39.9, 32.9],
  'India': [20.6, 78.9], 'Mexico': [19.4, -99.1], 'Colombia': [4.6, -74.3],
  'Venezuela': [8.0, -66.0], 'North Korea': [40.0, 127.0], 'South Korea': [37.6, 127.0],
  'Taiwan': [23.5, 121.0], 'Saudi Arabia': [24.7, 46.7], 'Egypt': [30.0, 31.2],
  'Mali': [17.6, -4.0], 'Burkina Faso': [12.3, -1.5], 'Niger': [17.6, 8.1],
  'Haiti': [18.5, -72.3], 'Congo': [-1.5, 29.0], 'Mozambique': [-15.4, 40.5],
};

// Classify GDELT article titles into conflict event types
function classifyConflict(title: string): { type: string; subType: string; fatalities: number } {
  const lower = title.toLowerCase();
  let fatalities = 0;

  // Extract casualty numbers
  const deathMatch = lower.match(/(\d+)\s*(killed|dead|deaths|casualties|fatalities|slain)/);
  if (deathMatch) fatalities = parseInt(deathMatch[1]) || 0;

  if (lower.includes('airstrike') || lower.includes('air strike') || lower.includes('bombing') || lower.includes('bombard')) {
    return { type: 'Battles', subType: 'Air/drone strike', fatalities };
  }
  if (lower.includes('missile') || lower.includes('rocket') || lower.includes('shell')) {
    return { type: 'Battles', subType: 'Shelling/artillery/missile', fatalities };
  }
  if (lower.includes('protest') || lower.includes('demonstrat') || lower.includes('rally')) {
    return { type: 'Protests', subType: 'Peaceful protest', fatalities };
  }
  if (lower.includes('riot') || lower.includes('clash')) {
    return { type: 'Riots', subType: 'Violent demonstration', fatalities };
  }
  if (lower.includes('attack') || lower.includes('ambush') || lower.includes('assault') || lower.includes('offensive')) {
    return { type: 'Battles', subType: 'Armed clash', fatalities };
  }
  if (lower.includes('kidnap') || lower.includes('abduct')) {
    return { type: 'Violence against civilians', subType: 'Abduction/forced disappearance', fatalities };
  }
  if (lower.includes('explosion') || lower.includes('bomb') || lower.includes('ied')) {
    return { type: 'Explosions/Remote violence', subType: 'Remote explosive', fatalities };
  }
  if (lower.includes('ceasefire') || lower.includes('peace') || lower.includes('truce')) {
    return { type: 'Strategic developments', subType: 'Ceasefire/peace agreement', fatalities: 0 };
  }
  if (lower.includes('sanction') || lower.includes('embargo')) {
    return { type: 'Strategic developments', subType: 'Sanctions', fatalities: 0 };
  }
  return { type: 'Violence against civilians', subType: 'Armed conflict', fatalities };
}

function extractCountry(title: string, source: string): { country: string; lat: number; lon: number } {
  // Try to match country names in title
  for (const [name, coords] of Object.entries(COUNTRY_COORDS)) {
    if (title.includes(name) || source.includes(name)) {
      return { country: name, lat: coords[0], lon: coords[1] };
    }
  }
  // Try common demonyms
  const demonyms: Record<string, string> = {
    'Iranian': 'Iran', 'Russian': 'Russia', 'Ukrainian': 'Ukraine', 'Syrian': 'Syria',
    'Israeli': 'Israel', 'Iraqi': 'Iraq', 'Yemeni': 'Yemen', 'Sudanese': 'Sudan',
    'Palestinian': 'Palestine', 'Lebanese': 'Lebanon', 'Afghan': 'Afghanistan',
    'Nigerian': 'Nigeria', 'Libyan': 'Libya', 'Somali': 'Somalia', 'Pakistani': 'Pakistan',
    'Chinese': 'China', 'Korean': 'North Korea', 'Mexican': 'Mexico', 'Turkish': 'Turkey',
  };
  for (const [demonym, country] of Object.entries(demonyms)) {
    if (title.includes(demonym)) {
      const coords = COUNTRY_COORDS[country] || [0, 0];
      return { country, lat: coords[0], lon: coords[1] };
    }
  }
  return { country: 'Unknown', lat: 0, lon: 0 };
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  // Serve from cache
  if (cachedEvents.length > 0 && Date.now() - lastFetch < CACHE_TTL) {
    return res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800').json({
      events: cachedEvents,
      count: cachedEvents.length,
      cached: true,
      source: 'gdelt-conflict',
    });
  }

  try {
    // Primary: GDELT conflict/military/attack news (geolocated articles)
    const queries = [
      'attack OR airstrike OR missile OR bombing',
      'protest OR riot OR clash OR violence',
      'military OR offensive OR ceasefire OR war',
    ];

    const allEvents: ConflictEvent[] = [];
    const seen = new Set<string>();

    for (const query of queries) {
      try {
        const params = new URLSearchParams({
          query,
          mode: 'artlist',
          maxrecords: '50',
          timespan: '1440min',
          format: 'json',
          sort: 'DateDesc',
        });

        const response = await fetch(
          `https://api.gdeltproject.org/api/v2/doc/doc?${params}`,
          { signal: AbortSignal.timeout(10000) },
        );

        if (!response.ok) continue;
        const text = await response.text();
        if (text.startsWith('Please limit')) continue; // Rate limited

        const data = JSON.parse(text) as { articles?: Array<{ title: string; url: string; source: string; sourcecountry: string; seendate: string; tone: number }> };

        for (const article of data.articles || []) {
          const dedup = article.title.slice(0, 50);
          if (seen.has(dedup)) continue;
          seen.add(dedup);

          const classification = classifyConflict(article.title);
          const geo = extractCountry(article.title, article.sourcecountry || '');
          if (geo.country === 'Unknown') continue;

          allEvents.push({
            id: `gdelt-${article.seendate}-${seen.size}`,
            date: article.seendate ? `${article.seendate.slice(0, 4)}-${article.seendate.slice(4, 6)}-${article.seendate.slice(6, 8)}` : new Date().toISOString().split('T')[0],
            type: classification.type,
            subType: classification.subType,
            actor1: article.source || '',
            actor2: '',
            country: geo.country,
            region: '',
            lat: geo.lat + (Math.random() - 0.5) * 2, // Slight jitter to avoid stacking
            lon: geo.lon + (Math.random() - 0.5) * 2,
            fatalities: classification.fatalities,
            notes: article.title.slice(0, 200),
          });
        }

        // Rate limit courtesy: wait 5 seconds between GDELT requests
        await new Promise((resolve) => setTimeout(resolve, 5000));
      } catch {
        continue;
      }
    }

    if (allEvents.length > 0) {
      cachedEvents = allEvents;
      lastFetch = Date.now();
    }

    return res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800').json({
      events: cachedEvents.length > 0 ? cachedEvents : allEvents,
      count: cachedEvents.length || allEvents.length,
      source: 'gdelt-conflict',
    });
  } catch (err) {
    console.error('Conflict API error:', err instanceof Error ? err.message : err);
    if (cachedEvents.length > 0) {
      return res.json({ events: cachedEvents, count: cachedEvents.length, cached: true, stale: true, source: 'gdelt-conflict' });
    }
    return res.status(502).json({ error: 'Conflict data service error', events: [], count: 0 });
  }
}
