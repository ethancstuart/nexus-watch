import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Cache for 30 minutes — WHO DON updates irregularly
let cachedOutbreaks: Outbreak[] = [];
let lastFetch = 0;
const CACHE_TTL = 1800_000;

interface Outbreak {
  disease: string;
  country: string;
  lat: number;
  lon: number;
  severity: string;
  date: string;
  summary: string;
  donId: string;
}

const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Democratic Republic of the Congo': [-4.3, 15.3],
  'DR Congo': [-4.3, 15.3],
  Congo: [-4.3, 15.3],
  Nigeria: [9.1, 7.5],
  Brazil: [-15.8, -47.9],
  'United States': [39.8, -98.5],
  'United States of America': [39.8, -98.5],
  India: [20.6, 78.9],
  China: [35.9, 104.2],
  Pakistan: [30.4, 69.3],
  Yemen: [15.6, 48.5],
  Tanzania: [-6.8, 37.7],
  'United Republic of Tanzania': [-6.8, 37.7],
  Uganda: [0.3, 32.6],
  Cambodia: [11.6, 104.9],
  Philippines: [14.6, 121.0],
  Mozambique: [-15.4, 40.7],
  Guinea: [9.9, -13.7],
  Burundi: [-3.4, 29.4],
  'South Sudan': [4.9, 31.6],
  Sudan: [15.5, 32.5],
  Ethiopia: [9.1, 40.5],
  Somalia: [2.0, 45.3],
  Kenya: [-1.3, 36.8],
  Afghanistan: [33.9, 67.7],
  Iraq: [33.2, 43.7],
  Syria: [34.8, 38.9],
  'Syrian Arab Republic': [34.8, 38.9],
  Libya: [26.3, 17.2],
  Bangladesh: [23.7, 90.4],
  Indonesia: [-2.5, 118.0],
  Thailand: [13.8, 100.5],
  'Viet Nam': [14.1, 108.3],
  Vietnam: [14.1, 108.3],
  Mexico: [23.6, -102.6],
  Colombia: [4.6, -74.3],
  Peru: [-12.0, -77.0],
  'South Africa': [-30.6, 22.9],
  Malawi: [-13.3, 33.8],
  Zambia: [-15.4, 28.3],
  Zimbabwe: [-19.0, 29.2],
  'Sierra Leone': [8.5, -11.8],
  Liberia: [6.4, -9.4],
  Chad: [12.1, 15.0],
  Niger: [17.6, 8.1],
  Mali: [17.6, -4.0],
  Madagascar: [-18.9, 47.5],
  Haiti: [18.5, -72.3],
  Bolivia: [-16.5, -68.1],
  Cameroon: [5.0, 12.4],
  Rwanda: [-2.0, 29.9],
  Angola: [-12.3, 17.5],
  'Saudi Arabia': [24.7, 46.7],
  Jordan: [31.0, 36.8],
  Lebanon: [33.9, 35.5],
  Egypt: [30.0, 31.2],
  Morocco: [31.8, -7.1],
  Algeria: [28.0, 1.7],
  Tunisia: [34.0, 9.5],
  Ghana: [7.9, -1.0],
  Senegal: [14.5, -14.5],
  Myanmar: [19.8, 96.1],
  Nepal: [28.4, 84.1],
  'Sri Lanka': [7.9, 80.8],
  Japan: [36.2, 138.3],
  'Republic of Korea': [35.9, 127.8],
};

// WHO severity keywords
const HIGH_SEVERITY_KEYWORDS = [
  'ebola',
  'marburg',
  'plague',
  'mers',
  'h5n1',
  'avian influenza',
  'mpox clade i',
  'cholera',
];
const MEDIUM_SEVERITY_KEYWORDS = [
  'dengue',
  'measles',
  'yellow fever',
  'diphtheria',
  'meningitis',
  'lassa',
  'polio',
  'hepatitis',
];

function classifySeverity(title: string): string {
  const lower = title.toLowerCase();
  if (HIGH_SEVERITY_KEYWORDS.some((k) => lower.includes(k))) return 'high';
  if (MEDIUM_SEVERITY_KEYWORDS.some((k) => lower.includes(k))) return 'medium';
  return 'low';
}

function geocodeFromTitle(title: string): { country: string; coords: [number, number] } | null {
  // WHO DON titles are typically "Disease - Country" or "Disease Name - Country Name"
  const parts = title.split(' - ');
  const candidateCountry = parts[parts.length - 1]?.trim();
  if (candidateCountry && COUNTRY_COORDS[candidateCountry]) {
    return { country: candidateCountry, coords: COUNTRY_COORDS[candidateCountry] };
  }
  // Try matching any known country in the title
  for (const [name, coords] of Object.entries(COUNTRY_COORDS)) {
    if (title.includes(name)) return { country: name, coords };
  }
  return null;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (Date.now() - lastFetch < CACHE_TTL && cachedOutbreaks.length > 0) {
    return res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800').json({
      outbreaks: cachedOutbreaks,
      count: cachedOutbreaks.length,
      cached: true,
      source: 'who-don',
    });
  }

  try {
    // WHO Disease Outbreak News JSON API
    const response = await fetch(
      'https://www.who.int/api/news/diseaseoutbreaknews?$top=30&$orderby=PublicationDate%20desc',
      { signal: AbortSignal.timeout(10000) },
    );

    if (!response.ok) throw new Error(`WHO API returned ${response.status}`);

    const data = (await response.json()) as {
      value: Array<{
        Id: string;
        Title: string;
        PublicationDate: string;
        DonId: string;
        Summary?: string;
      }>;
    };

    const outbreaks: Outbreak[] = data.value
      .map((item) => {
        const geo = geocodeFromTitle(item.Title);
        if (!geo) return null;

        const titleParts = item.Title.split(' - ');
        const disease = titleParts[0]?.trim() || item.Title;

        return {
          disease,
          country: geo.country,
          lat: geo.coords[0],
          lon: geo.coords[1],
          severity: classifySeverity(item.Title),
          date: item.PublicationDate?.split('T')[0] || '',
          summary: (item.Summary || '').slice(0, 200),
          donId: item.DonId || item.Id,
        };
      })
      .filter((o): o is Outbreak => o !== null);

    if (outbreaks.length > 0) {
      cachedOutbreaks = outbreaks;
      lastFetch = Date.now();
    }

    return res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800').json({
      outbreaks,
      count: outbreaks.length,
      source: 'who-don',
    });
  } catch (err) {
    console.error('Disease outbreaks API error:', err instanceof Error ? err.message : err);

    // Try RSS fallback
    try {
      const rssRes = await fetch('https://www.who.int/feeds/entity/don/en/rss.xml', {
        signal: AbortSignal.timeout(5000),
      });
      if (rssRes.ok) {
        const xml = await rssRes.text();
        const parsed = parseWhoRss(xml);
        if (parsed.length > 0) {
          cachedOutbreaks = parsed;
          lastFetch = Date.now();
          return res.setHeader('Cache-Control', 'public, max-age=1800').json({
            outbreaks: parsed,
            count: parsed.length,
            source: 'who-rss',
          });
        }
      }
    } catch {
      // RSS also failed
    }

    if (cachedOutbreaks.length > 0) {
      return res.setHeader('Cache-Control', 'public, max-age=300').json({
        outbreaks: cachedOutbreaks,
        count: cachedOutbreaks.length,
        cached: true,
        stale: true,
      });
    }
    return res.status(500).json({ outbreaks: [], count: 0, error: 'WHO API unavailable' });
  }
}

function parseWhoRss(xml: string): Outbreak[] {
  const results: Outbreak[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && results.length < 20) {
    const item = match[1];
    const title = extractTag(item, 'title');
    const pubDate = extractTag(item, 'pubDate');
    if (!title) continue;
    const geo = geocodeFromTitle(title);
    if (!geo) continue;
    const titleParts = title.split(' - ');
    results.push({
      disease: titleParts[0]?.trim() || title,
      country: geo.country,
      lat: geo.coords[0],
      lon: geo.coords[1],
      severity: classifySeverity(title),
      date: pubDate || '',
      summary: '',
      donId: '',
    });
  }
  return results;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = regex.exec(xml);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}
