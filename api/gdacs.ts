import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  try {
    // GDACS RSS feed — free, no auth
    const url = 'https://www.gdacs.org/xml/rss.xml';
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });

    if (!response.ok) {
      return res.status(response.status).json({ error: 'GDACS API error' });
    }

    const xml = await response.text();
    const alerts = parseGdacsXml(xml);

    return res.setHeader('Cache-Control', 'public, max-age=1800, s-maxage=1800').json({
      alerts,
      count: alerts.length,
    });
  } catch (err) {
    console.error('GDACS error:', err instanceof Error ? err.message : err);
    return res.status(502).json({ error: 'Disaster alert service error' });
  }
}

interface GdacsAlert {
  id: string;
  title: string;
  type: string;
  severity: string;
  lat: number;
  lon: number;
  date: string;
  country: string;
  description: string;
}

function parseGdacsXml(xml: string): GdacsAlert[] {
  const alerts: GdacsAlert[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = extractTag(item, 'title');
    const description = extractTag(item, 'description');
    const lat = parseFloat(extractTag(item, 'geo:lat') || extractTag(item, 'gdacs:lat') || '0');
    const lon = parseFloat(extractTag(item, 'geo:long') || extractTag(item, 'gdacs:long') || '0');
    const pubDate = extractTag(item, 'pubDate');

    // Determine type from title
    let type = 'other';
    const titleLower = title.toLowerCase();
    if (titleLower.includes('earthquake')) type = 'earthquake';
    else if (titleLower.includes('tsunami')) type = 'tsunami';
    else if (titleLower.includes('flood')) type = 'flood';
    else if (titleLower.includes('cyclone') || titleLower.includes('hurricane') || titleLower.includes('typhoon'))
      type = 'cyclone';
    else if (titleLower.includes('volcano')) type = 'volcano';
    else if (titleLower.includes('drought')) type = 'drought';

    // Determine severity from title
    let severity = 'green';
    if (titleLower.includes('red') || titleLower.includes('alert')) severity = 'red';
    else if (titleLower.includes('orange')) severity = 'orange';

    // Extract country from title (often "Country: Event")
    const country = title.split(':')[0]?.trim() || '';

    if (lat !== 0 || lon !== 0) {
      alerts.push({
        id: `gdacs-${alerts.length}`,
        title,
        type,
        severity,
        lat,
        lon,
        date: pubDate,
        country,
        description: (description || '').replace(/<[^>]+>/g, '').slice(0, 200),
      });
    }
  }

  return alerts;
}

function extractTag(xml: string, tag: string): string {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`);
  const match = regex.exec(xml);
  return match ? match[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
}
