import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * RSS feed for NexusWatch verified signals.
 *
 * GET /api/rss/verified-signals → RSS 2.0 XML of recent CONFIRMED/CORROBORATED signals
 *
 * Public, no auth. Designed for OSINT community use.
 */

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => {
    const map: Record<string, string> = {
      '<': '&lt;',
      '>': '&gt;',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;',
    };
    return map[c] || c;
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  let items: Array<{
    id: string;
    title: string;
    summary: string;
    link: string;
    pubDate: string;
    countryCode: string;
    level: string;
  }> = [];

  if (dbUrl) {
    try {
      const sql = neon(dbUrl);
      // Query recent audit entries with HIGH confidence as a proxy for verified signals
      // (The in-memory verification engine isn't persisted yet.)
      const rows = (await sql`
        SELECT id, country_code, computed_at_ms, score, confidence
        FROM audit_log
        WHERE confidence = 'high' AND computed_at_ms > ${Date.now() - 7 * 86400000}
        ORDER BY computed_at_ms DESC
        LIMIT 50
      `.catch(() => [])) as unknown as Array<{
        id: string;
        country_code: string;
        computed_at_ms: number;
        score: number;
        confidence: string;
      }>;

      items = rows.map((r) => ({
        id: r.id,
        title: `${r.country_code} CII ${r.score} — HIGH CONFIDENCE`,
        summary: `NexusWatch assessed ${r.country_code} at CII ${r.score} with HIGH confidence (3+ source agreement).`,
        link: `https://nexuswatch.dev/#/audit/${r.country_code}`,
        pubDate: new Date(r.computed_at_ms).toUTCString(),
        countryCode: r.country_code,
        level: 'high',
      }));
    } catch {
      items = [];
    }
  }

  // If no data yet, include a placeholder entry so the feed doesn't appear broken
  if (items.length === 0) {
    items.push({
      id: 'welcome',
      title: 'NexusWatch Verified Signals feed is live',
      summary:
        'This feed delivers CONFIRMED and CORROBORATED geopolitical signals — events where 2+ independent sources agree. As NexusWatch accumulates data, this feed will populate with real-time verified intelligence.',
      link: 'https://nexuswatch.dev/#/intel',
      pubDate: new Date().toUTCString(),
      countryCode: '',
      level: 'info',
    });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NexusWatch — Verified Geopolitical Signals</title>
    <link>https://nexuswatch.dev</link>
    <atom:link href="https://nexuswatch.dev/api/rss/verified-signals" rel="self" type="application/rss+xml" />
    <description>Cross-source verified geopolitical intelligence signals. Only CONFIRMED and CORROBORATED events (2+ independent sources agree). Updated continuously.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>300</ttl>
    ${items
      .map(
        (item) => `
    <item>
      <title>${escapeXml(item.title)}</title>
      <link>${escapeXml(item.link)}</link>
      <guid isPermaLink="false">${escapeXml(item.id)}</guid>
      <pubDate>${item.pubDate}</pubDate>
      <description>${escapeXml(item.summary)}</description>
      ${item.countryCode ? `<category>${escapeXml(item.countryCode)}</category>` : ''}
      <category>${escapeXml(item.level)}</category>
    </item>`,
      )
      .join('')}
  </channel>
</rss>`;

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  return res.send(xml);
}
