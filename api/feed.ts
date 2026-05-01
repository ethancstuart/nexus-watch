import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * RSS 2.0 feed for NexusWatch Intelligence Briefs.
 * Point Substack, Feedly, or any RSS reader at /api/feed.
 *
 * Pulls last 30 daily briefs from the `daily_briefs` table and renders
 * each as an <item> with the canonical /brief/:date permalink. The
 * description field is markdown-stripped plain text; <content:encoded>
 * carries the full HTML body wrapped in CDATA.
 */

interface BriefRow {
  brief_date: string;
  summary: string | null;
  generated_at: string | null;
  content?: unknown;
}

interface BriefContent {
  briefHtml?: string;
  briefText?: string;
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&apos;',
    };
    return map[c] || c;
  });
}

function plainTextFrom(summary: string): string {
  return summary
    .replace(/<[^>]+>/g, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).send('Database not configured');

  try {
    const sql = neon(dbUrl);
    const rows = (await sql`
      SELECT brief_date, summary, generated_at, content
      FROM daily_briefs
      ORDER BY brief_date DESC
      LIMIT 30
    `) as unknown as BriefRow[];

    const items = rows
      .map((row) => {
        const date = new Date(row.brief_date);
        const pubDate = row.generated_at ? new Date(row.generated_at).toUTCString() : date.toUTCString();
        const dateStr = date.toISOString().split('T')[0];
        const summary = row.summary || '';
        const plain = plainTextFrom(summary);

        let html = summary;
        if (row.content) {
          try {
            const c: BriefContent =
              typeof row.content === 'string' ? JSON.parse(row.content) : (row.content as BriefContent);
            if (c.briefHtml) html = c.briefHtml;
          } catch {
            /* fall back to summary */
          }
        }

        const link = `https://nexuswatch.dev/brief/${dateStr}`;

        return `    <item>
      <title>${escapeXml(`NexusWatch Intelligence Brief — ${dateStr}`)}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description><![CDATA[${plain}]]></description>
      <content:encoded><![CDATA[${html}]]></content:encoded>
    </item>`;
      })
      .join('\n');

    const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NexusWatch Intelligence Brief</title>
    <link>https://nexuswatch.dev</link>
    <description>Daily geopolitical intelligence briefing. Threat analysis, energy markets, cross-domain correlations, and 48-hour outlook. Free.</description>
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
