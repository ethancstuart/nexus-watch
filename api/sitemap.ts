import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Dynamic XML sitemap (Track A.10).
 *
 * Served at `/sitemap.xml` via a vercel.json rewrite. Lists the
 * canonical homepage, the key static routes, and every historical
 * brief at its clean `/brief/:date` permalink. Googlebot and friends
 * crawl this to discover the full archive.
 *
 * Falls back to a static list (no briefs) if the DB is unreachable —
 * a minimal sitemap beats a 500 from a search engine's perspective.
 */

interface BriefRow {
  brief_date: string;
  generated_at: string | null;
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

function urlEntry(loc: string, lastmod: string, changefreq: string, priority: string): string {
  return `  <url>
    <loc>${escapeXml(loc)}</loc>
    <lastmod>${escapeXml(lastmod)}</lastmod>
    <changefreq>${escapeXml(changefreq)}</changefreq>
    <priority>${escapeXml(priority)}</priority>
  </url>`;
}

const STATIC_ROUTES: Array<{ path: string; changefreq: string; priority: string }> = [
  { path: '', changefreq: 'daily', priority: '1.0' },
  { path: 'briefs', changefreq: 'daily', priority: '0.9' },
  { path: 'intel', changefreq: 'hourly', priority: '0.9' },
  { path: 'methodology', changefreq: 'monthly', priority: '0.5' },
  { path: 'about', changefreq: 'monthly', priority: '0.5' },
  { path: 'roadmap', changefreq: 'weekly', priority: '0.4' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('method_not_allowed');
  }

  const base = 'https://nexuswatch.dev';
  const today = new Date().toISOString().slice(0, 10);

  const staticEntries = STATIC_ROUTES.map((r) =>
    urlEntry(`${base}${r.path ? '/' + r.path : ''}`, today, r.changefreq, r.priority),
  );

  let briefEntries: string[] = [];
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const sql = neon(dbUrl);
      const rows = (await sql`
        SELECT brief_date, generated_at
        FROM daily_briefs
        ORDER BY brief_date DESC
        LIMIT 365
      `) as unknown as BriefRow[];

      briefEntries = rows.map((r) => {
        const lastmod = r.generated_at ? r.generated_at.slice(0, 10) : r.brief_date;
        return urlEntry(`${base}/brief/${r.brief_date}`, lastmod, 'yearly', '0.7');
      });
    } catch (err) {
      console.error('[sitemap] DB query failed:', err instanceof Error ? err.message : err);
      // Soft-fail to static-only sitemap.
    }
  }

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...staticEntries, ...briefEntries].join('\n')}
</urlset>
`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
  return res.status(200).send(body);
}
