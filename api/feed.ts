import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * RSS feed for NexusWatch Intelligence Briefs.
 * Point Substack, Feedly, or any RSS reader at /api/feed
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).send('Database not configured');

  try {
    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT brief_date, summary, generated_at
      FROM daily_briefs
      ORDER BY brief_date DESC
      LIMIT 30
    `;

    const items = rows
      .map((row) => {
        const date = new Date(row.brief_date as string);
        const pubDate = row.generated_at ? new Date(row.generated_at as string).toUTCString() : date.toUTCString();
        const dateStr = date.toISOString().split('T')[0];
        const summary = row.summary as string;

        // Strip HTML tags for the description (plain text excerpt)
        const plainText = summary
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 500);

        return `    <item>
      <title>NexusWatch Intelligence Brief — ${dateStr}</title>
      <link>https://nexuswatch.dev/#/intel</link>
      <guid isPermaLink="false">nexuswatch-brief-${dateStr}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${plainText}...]]></description>
      <content:encoded><![CDATA[${summary}]]></content:encoded>
    </item>`;
      })
      .join('\n');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NexusWatch Intelligence Brief</title>
    <link>https://nexuswatch.dev</link>
    <description>Daily geopolitical intelligence briefing. Threat analysis, energy markets, cross-domain correlations, and 48-hour outlook. AI-powered by NexusWatch.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <atom:link href="https://nexuswatch.dev/api/feed" rel="self" type="application/rss+xml"/>
    <image>
      <url>https://nexuswatch.dev/icons/icon-512.svg</url>
      <title>NexusWatch Intelligence</title>
      <link>https://nexuswatch.dev</link>
    </image>
${items}
  </channel>
</rss>`;

    return res
      .setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
      .setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600')
      .send(rss);
  } catch (err) {
    console.error('RSS feed error:', err instanceof Error ? err.message : err);
    return res.status(500).send('Feed generation failed');
  }
}
