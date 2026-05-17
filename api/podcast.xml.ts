/**
 * NexusWatch FM — public podcast RSS feed.
 *
 * GET /podcast.xml  (rewrite → /api/podcast.xml)
 *
 * iTunes/Apple Podcasts-compliant RSS 2.0 with the itunes namespace.
 * Reads the last 50 audio_briefs rows. Cover art served via /api/og?type=site
 * (a 1200x630 wide image — iTunes prefers 1400x1400 square; we accept the
 * warning for now and can swap to a dedicated cover endpoint later).
 *
 * 2026-05 tier-up Phase 4.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

const SITE = 'https://nexuswatch.dev';
const TITLE = 'NexusWatch FM — Daily Geopolitical Intelligence Brief';
const AUTHOR = 'NexusWatch';
const EMAIL = 'ethan@nexuswatch.dev';
const SUMMARY =
  'Three-minute AI-narrated daily geopolitical intelligence brief from NexusWatch. The conflicts that moved overnight, the disasters that landed, the markets that flinched. Evidence-chained back to the source. Free.';
const COVER_ART = `${SITE}/api/og?type=site`;

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).send('<?xml version="1.0"?><error>db_not_configured</error>');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  let rows: Array<{
    brief_date: string;
    duration_sec: number | null;
    bytes: number | null;
    blob_url: string;
    cover_art_url: string | null;
    script: string;
    created_at: string;
  }> = [];
  try {
    rows = (await sql`
      SELECT brief_date::text AS brief_date, duration_sec, bytes,
             blob_url, cover_art_url, script, created_at
      FROM audio_briefs
      ORDER BY brief_date DESC
      LIMIT 50
    `) as unknown as typeof rows;
  } catch (e) {
    console.error('[podcast.xml]', e instanceof Error ? e.message : e);
  }

  const items = rows
    .map((r) => {
      const title = `Daily Brief — ${new Date(r.brief_date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      })}`;
      const guid = `${SITE}/audio/${r.brief_date}`;
      const pubDate = new Date(r.created_at).toUTCString();
      const description = excerpt(r.script);
      const duration = secondsToHms(r.duration_sec ?? 0);
      return `
    <item>
      <title>${escapeXml(title)}</title>
      <description>${escapeXml(description)}</description>
      <content:encoded><![CDATA[${description}]]></content:encoded>
      <link>${SITE}/#/audio</link>
      <guid isPermaLink="false">${escapeXml(guid)}</guid>
      <pubDate>${pubDate}</pubDate>
      <enclosure url="${escapeXml(r.blob_url)}" length="${r.bytes ?? 0}" type="audio/mpeg" />
      <itunes:author>${escapeXml(AUTHOR)}</itunes:author>
      <itunes:duration>${duration}</itunes:duration>
      <itunes:summary>${escapeXml(description)}</itunes:summary>
      <itunes:explicit>false</itunes:explicit>
    </item>`;
    })
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
     xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
     xmlns:content="http://purl.org/rss/1.0/modules/content/"
     xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(TITLE)}</title>
    <link>${SITE}/#/audio</link>
    <atom:link href="${SITE}/podcast.xml" rel="self" type="application/rss+xml" />
    <description>${escapeXml(SUMMARY)}</description>
    <language>en-us</language>
    <copyright>© ${new Date().getFullYear()} NexusWatch · MIT License</copyright>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <itunes:author>${escapeXml(AUTHOR)}</itunes:author>
    <itunes:summary>${escapeXml(SUMMARY)}</itunes:summary>
    <itunes:owner>
      <itunes:name>${escapeXml(AUTHOR)}</itunes:name>
      <itunes:email>${escapeXml(EMAIL)}</itunes:email>
    </itunes:owner>
    <itunes:image href="${COVER_ART}" />
    <itunes:category text="News">
      <itunes:category text="Politics" />
    </itunes:category>
    <itunes:category text="News">
      <itunes:category text="Daily News" />
    </itunes:category>
    <itunes:explicit>false</itunes:explicit>
    <itunes:type>episodic</itunes:type>
${items}
  </channel>
</rss>`;

  return res.status(200).send(xml);
}

function excerpt(script: string): string {
  // Strip [HOST_X] tags so the description reads as flowing copy.
  const cleaned = script
    .replace(/\[HOST_[A-C]\]\s*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned.length > 400 ? cleaned.slice(0, 397) + '…' : cleaned;
}

function secondsToHms(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '00:00';
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60)
    .toString()
    .padStart(2, '0');
  return `${m.toString().padStart(2, '0')}:${sec}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
