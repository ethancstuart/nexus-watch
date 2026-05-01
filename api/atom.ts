import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Atom 1.0 feed for NexusWatch Intelligence Briefs.
 * Parallel to /api/feed (RSS 2.0) for readers that prefer Atom.
 *
 * Pulls last 30 daily briefs and renders each as an <entry> linking
 * to its canonical /brief/:date permalink.
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

    const updated =
      rows.length > 0 && rows[0].generated_at ? new Date(rows[0].generated_at).toISOString() : new Date().toISOString();

    const entries = rows
      .map((row) => {
        const dateStr = new Date(row.brief_date).toISOString().split('T')[0];
        const updatedIso = row.generated_at
          ? new Date(row.generated_at).toISOString()
          : new Date(row.brief_date).toISOString();
        const summary = row.summary || '';
        const plain = plainTextFrom(summary);

        let html = summary;
        if (row.content) {
          try {
            const c: BriefContent =
              typeof row.content === 'string' ? JSON.parse(row.content) : (row.content as BriefContent);
            if (c.briefHtml) html = c.briefHtml;
          } catch {
            /* fall back */
          }
        }

        const link = `https://nexuswatch.dev/brief/${dateStr}`;

        return `  <entry>
    <title>${escapeXml(`NexusWatch Intelligence Brief — ${dateStr}`)}</title>
    <link href="${escapeXml(link)}" rel="alternate" type="text/html"/>
    <id>${escapeXml(link)}</id>
    <updated>${updatedIso}</updated>
    <published>${updatedIso}</published>
    <summary type="text">${escapeXml(plain)}</summary>
    <content type="html"><![CDATA[${html}]]></content>
    <author><name>NexusWatch</name></author>
  </entry>`;
      })
      .join('\n');

    const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>NexusWatch Intelligence Brief</title>
  <subtitle>Daily geopolitical intelligence — free.</subtitle>
  <link href="https://nexuswatch.dev/api/atom" rel="self" type="application/atom+xml"/>
  <link href="https://nexuswatch.dev" rel="alternate" type="text/html"/>
  <id>https://nexuswatch.dev/</id>
  <updated>${updated}</updated>
  <icon>https://nexuswatch.dev/icons/icon-192.svg</icon>
  <logo>https://nexuswatch.dev/icons/icon-512.svg</logo>
  <author><name>NexusWatch</name><uri>https://nexuswatch.dev</uri></author>
${entries}
</feed>`;

    return res
      .setHeader('Content-Type', 'application/atom+xml; charset=utf-8')
      .setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600')
      .send(atom);
  } catch (err) {
    console.error('Atom feed error:', err instanceof Error ? err.message : err);
    return res.status(500).send('Feed generation failed');
  }
}
