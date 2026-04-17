import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * CII Daily Updates RSS Feed
 *
 * GET /rss/cii (rewritten from /api/rss/cii)
 *
 * Publishes country instability score changes as an RSS 2.0 feed.
 * Each item represents a country whose CII changed by 2+ points
 * since the previous day. Sorted by absolute delta descending.
 *
 * Use case: analysts subscribe in Feedly/NetNewsWire to get daily
 * CII movement alerts without logging in or paying.
 */

const NAME_MAP: Record<string, string> = {
  UA: 'Ukraine',
  RU: 'Russia',
  CN: 'China',
  TW: 'Taiwan',
  IR: 'Iran',
  IQ: 'Iraq',
  SY: 'Syria',
  IL: 'Israel',
  YE: 'Yemen',
  SD: 'Sudan',
  KP: 'North Korea',
  KR: 'South Korea',
  TR: 'Turkey',
  SA: 'Saudi Arabia',
  EG: 'Egypt',
  PK: 'Pakistan',
  AF: 'Afghanistan',
  MM: 'Myanmar',
  ET: 'Ethiopia',
  SO: 'Somalia',
  CD: 'DR Congo',
  LB: 'Lebanon',
  VE: 'Venezuela',
  NG: 'Nigeria',
  LY: 'Libya',
  US: 'United States',
  JP: 'Japan',
  DE: 'Germany',
  GB: 'United Kingdom',
  FR: 'France',
  IN: 'India',
  BR: 'Brazil',
  PL: 'Poland',
  RO: 'Romania',
  PH: 'Philippines',
  ID: 'Indonesia',
  TH: 'Thailand',
  MX: 'Mexico',
  CO: 'Colombia',
  ZA: 'South Africa',
  KE: 'Kenya',
  BD: 'Bangladesh',
};

function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c] || c,
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    return res.send(emptyFeed('Database not configured'));
  }

  try {
    const sql = neon(dbUrl);

    // Get today's and yesterday's snapshots, compute deltas
    const rows = (await sql`
      WITH latest AS (
        SELECT country_code, cii_score, date
        FROM cii_daily_snapshots
        WHERE date = (SELECT MAX(date) FROM cii_daily_snapshots)
      ),
      previous AS (
        SELECT DISTINCT ON (country_code) country_code, cii_score, date
        FROM cii_daily_snapshots
        WHERE date < (SELECT MAX(date) FROM cii_daily_snapshots)
        ORDER BY country_code, date DESC
      )
      SELECT
        l.country_code,
        l.cii_score AS score,
        l.date AS latest_date,
        p.cii_score AS prev_score,
        p.date AS prev_date,
        l.cii_score - COALESCE(p.cii_score, l.cii_score) AS delta
      FROM latest l
      LEFT JOIN previous p ON p.country_code = l.country_code
      ORDER BY ABS(l.cii_score - COALESCE(p.cii_score, l.cii_score)) DESC
    `) as unknown as Array<{
      country_code: string;
      score: number;
      latest_date: string;
      prev_score: number | null;
      prev_date: string | null;
      delta: number;
    }>;

    const latestDate = rows[0]?.latest_date ? new Date(rows[0].latest_date) : new Date();

    // Include countries with delta >= 2 (significant movers), or top 10 if none move
    const movers = rows.filter((r) => Math.abs(r.delta) >= 2);
    const items = movers.length > 0 ? movers : rows.slice(0, 10);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NexusWatch CII Daily Updates</title>
    <link>https://nexuswatch.dev/#/intel</link>
    <atom:link href="https://nexuswatch.dev/rss/cii" rel="self" type="application/rss+xml" />
    <description>Daily Country Instability Index score changes for 86 nations. Tracks geopolitical risk movements worldwide.</description>
    <language>en-us</language>
    <lastBuildDate>${latestDate.toUTCString()}</lastBuildDate>
    <ttl>3600</ttl>
    <image>
      <url>https://nexuswatch.dev/icons/icon-192.png</url>
      <title>NexusWatch</title>
      <link>https://nexuswatch.dev</link>
    </image>
    ${items
      .map((r) => {
        const name = NAME_MAP[r.country_code] || r.country_code;
        const arrow = r.delta > 0 ? '\u2191' : r.delta < 0 ? '\u2193' : '\u2192';
        const sign = r.delta > 0 ? '+' : '';
        const dateStr = r.latest_date
          ? new Date(r.latest_date).toISOString().slice(0, 10)
          : new Date().toISOString().slice(0, 10);
        const severity = r.score >= 70 ? 'CRITICAL' : r.score >= 50 ? 'ELEVATED' : r.score >= 30 ? 'WATCH' : 'STABLE';

        const title = `${name}: CII ${r.score} ${arrow} (${sign}${r.delta})`;
        const desc =
          `${name} (${r.country_code}) Country Instability Index: ${r.score}/100 [${severity}]. ` +
          (r.delta !== 0
            ? `Changed ${sign}${r.delta} points from ${r.prev_score ?? 'N/A'}.`
            : `Unchanged at ${r.score}.`) +
          ` Source: NexusWatch CII v2.1.0.`;

        return `
    <item>
      <title>${escapeXml(title)}</title>
      <link>https://nexuswatch.dev/#/intel?country=${r.country_code}</link>
      <guid isPermaLink="false">nw-cii-${r.country_code}-${dateStr}</guid>
      <pubDate>${new Date(r.latest_date || dateStr).toUTCString()}</pubDate>
      <description>${escapeXml(desc)}</description>
      <category>${severity}</category>
    </item>`;
      })
      .join('')}
  </channel>
</rss>`;

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=7200');
    return res.send(xml);
  } catch (err) {
    console.error('[rss/cii]', err instanceof Error ? err.message : err);
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    return res.send(emptyFeed('Data temporarily unavailable'));
  }
}

function emptyFeed(note: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NexusWatch CII Daily Updates</title>
    <link>https://nexuswatch.dev/#/intel</link>
    <atom:link href="https://nexuswatch.dev/rss/cii" rel="self" type="application/rss+xml" />
    <description>${note}. Subscribe for daily geopolitical risk score updates.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  </channel>
</rss>`;
}
