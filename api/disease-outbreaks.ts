import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// WHO Disease Outbreak News — use RSS for reliability
// Fallback: curated active outbreaks from public health sources
const ACTIVE_OUTBREAKS = [
  {
    disease: 'Mpox (Clade I)',
    country: 'DR Congo',
    lat: -4.3,
    lon: 15.3,
    severity: 'high',
    cases: 32000,
    date: '2026-03-28',
  },
  {
    disease: 'Mpox (Clade I)',
    country: 'Burundi',
    lat: -3.4,
    lon: 29.4,
    severity: 'high',
    cases: 1800,
    date: '2026-03-25',
  },
  { disease: 'Cholera', country: 'Nigeria', lat: 9.1, lon: 7.5, severity: 'high', cases: 12500, date: '2026-03-20' },
  {
    disease: 'Cholera',
    country: 'Mozambique',
    lat: -15.4,
    lon: 40.7,
    severity: 'medium',
    cases: 4200,
    date: '2026-03-18',
  },
  { disease: 'Dengue', country: 'Brazil', lat: -15.8, lon: -47.9, severity: 'high', cases: 450000, date: '2026-03-30' },
  {
    disease: 'Dengue',
    country: 'Philippines',
    lat: 14.6,
    lon: 121.0,
    severity: 'medium',
    cases: 28000,
    date: '2026-03-22',
  },
  {
    disease: 'Avian Influenza (H5N1)',
    country: 'United States',
    lat: 39.8,
    lon: -98.5,
    severity: 'medium',
    cases: 67,
    date: '2026-03-25',
  },
  {
    disease: 'Avian Influenza (H5N1)',
    country: 'Cambodia',
    lat: 11.6,
    lon: 104.9,
    severity: 'medium',
    cases: 12,
    date: '2026-03-15',
  },
  { disease: 'Marburg', country: 'Tanzania', lat: -6.8, lon: 37.7, severity: 'high', cases: 14, date: '2026-03-10' },
  { disease: 'Measles', country: 'Yemen', lat: 15.6, lon: 48.5, severity: 'medium', cases: 8500, date: '2026-03-28' },
  {
    disease: 'Diphtheria',
    country: 'Guinea',
    lat: 9.9,
    lon: -13.7,
    severity: 'medium',
    cases: 420,
    date: '2026-03-20',
  },
  {
    disease: 'Lassa Fever',
    country: 'Nigeria',
    lat: 7.5,
    lon: 4.5,
    severity: 'medium',
    cases: 1100,
    date: '2026-03-22',
  },
  {
    disease: 'Polio (cVDPV2)',
    country: 'Pakistan',
    lat: 30.4,
    lon: 69.3,
    severity: 'medium',
    cases: 45,
    date: '2026-03-18',
  },
  { disease: 'Ebola', country: 'Uganda', lat: 0.3, lon: 32.6, severity: 'low', cases: 0, date: '2026-02-15' },
];

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  // Try WHO RSS first, fall back to curated data
  try {
    const whoRes = await fetch('https://www.who.int/feeds/entity/don/en/rss.xml', {
      signal: AbortSignal.timeout(5000),
    });

    if (whoRes.ok) {
      const xml = await whoRes.text();
      const parsed = parseWhoRss(xml);
      if (parsed.length > 0) {
        return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({
          outbreaks: parsed,
          count: parsed.length,
          source: 'who-rss',
        });
      }
    }
  } catch {
    // WHO RSS failed, use fallback
  }

  // Fallback: curated active outbreaks
  return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({
    outbreaks: ACTIVE_OUTBREAKS,
    count: ACTIVE_OUTBREAKS.length,
    source: 'curated',
  });
}

function parseWhoRss(
  xml: string,
): { disease: string; country: string; lat: number; lon: number; severity: string; cases: number; date: string }[] {
  // Simple XML parsing for WHO DON RSS
  const results: {
    disease: string;
    country: string;
    lat: number;
    lon: number;
    severity: string;
    cases: number;
    date: string;
  }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null && results.length < 20) {
    const item = match[1];
    const title = extractTag(item, 'title');
    const pubDate = extractTag(item, 'pubDate');

    if (!title) continue;

    // Parse "Disease - Country" format
    const parts = title.split(' - ');
    const disease = parts[0]?.trim() || title;
    const country = parts[1]?.trim() || '';

    // Geocode country (simplified)
    const coords = COUNTRY_COORDS[country] || [0, 0];

    results.push({
      disease,
      country,
      lat: coords[0],
      lon: coords[1],
      severity: 'medium',
      cases: 0,
      date: pubDate || '',
    });
  }

  return results;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const m = regex.exec(xml);
  return m ? m[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}

const COUNTRY_COORDS: Record<string, [number, number]> = {
  'Democratic Republic of the Congo': [-4.3, 15.3],
  'DR Congo': [-4.3, 15.3],
  Nigeria: [9.1, 7.5],
  Brazil: [-15.8, -47.9],
  'United States': [39.8, -98.5],
  'United States of America': [39.8, -98.5],
  India: [20.6, 78.9],
  China: [35.9, 104.2],
  Pakistan: [30.4, 69.3],
  Yemen: [15.6, 48.5],
  Tanzania: [-6.8, 37.7],
  Uganda: [0.3, 32.6],
  Cambodia: [11.6, 104.9],
  Philippines: [14.6, 121.0],
  Mozambique: [-15.4, 40.7],
  Guinea: [9.9, -13.7],
  Burundi: [-3.4, 29.4],
};
