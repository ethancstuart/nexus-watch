import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * ProMED Disease Early Warning (Phase 6, Data Moat).
 *
 * ProMED detected SARS (2003), MERS (2012), Ebola (2014), and
 * COVID-19 (2019) 7-14 days before WHO acknowledged them.
 * The single best early warning source for novel disease threats.
 *
 * Source: ProMED RSS feed (free, no auth)
 * Schedule: every 6 hours (0 at minute 0, hours 0/6/12/18)
 */

const PROMED_RSS = 'https://promedmail.org/promed-posts/feed/';

// Map country names found in ProMED titles/descriptions to ISO-2 codes
const COUNTRY_PATTERNS: Array<{ pattern: RegExp; code: string }> = [
  { pattern: /\bUkraine\b/i, code: 'UA' },
  { pattern: /\bRussia\b/i, code: 'RU' },
  { pattern: /\bChina\b/i, code: 'CN' },
  { pattern: /\bIran\b/i, code: 'IR' },
  { pattern: /\bIndia\b/i, code: 'IN' },
  { pattern: /\bBrazil\b/i, code: 'BR' },
  { pattern: /\bNigeria\b/i, code: 'NG' },
  { pattern: /\bSudan\b/i, code: 'SD' },
  { pattern: /\bEthiopia\b/i, code: 'ET' },
  { pattern: /\bSomalia\b/i, code: 'SO' },
  { pattern: /\bCongo\b/i, code: 'CD' },
  { pattern: /\bAfghanistan\b/i, code: 'AF' },
  { pattern: /\bPakistan\b/i, code: 'PK' },
  { pattern: /\bBangladesh\b/i, code: 'BD' },
  { pattern: /\bMexico\b/i, code: 'MX' },
  { pattern: /\bTurkey\b|Türkiye/i, code: 'TR' },
  { pattern: /\bEgypt\b/i, code: 'EG' },
  { pattern: /\bSaudi Arabia\b/i, code: 'SA' },
  { pattern: /\bIraq\b/i, code: 'IQ' },
  { pattern: /\bSyria\b/i, code: 'SY' },
  { pattern: /\bYemen\b/i, code: 'YE' },
  { pattern: /\bMyanmar\b|Burma\b/i, code: 'MM' },
  { pattern: /\bLebanon\b/i, code: 'LB' },
  { pattern: /\bVenezuela\b/i, code: 'VE' },
  { pattern: /\bHaiti\b/i, code: 'HT' },
  { pattern: /\bMali\b/i, code: 'ML' },
  { pattern: /\bKenya\b/i, code: 'KE' },
  { pattern: /\bSouth Africa\b/i, code: 'ZA' },
  { pattern: /\bIndonesia\b/i, code: 'ID' },
  { pattern: /\bPhilippines\b/i, code: 'PH' },
  { pattern: /\bJapan\b/i, code: 'JP' },
  { pattern: /\bUnited States\b|USA\b/i, code: 'US' },
  { pattern: /\bUnited Kingdom\b|UK\b/i, code: 'GB' },
  { pattern: /\bFrance\b/i, code: 'FR' },
  { pattern: /\bGermany\b/i, code: 'DE' },
  { pattern: /\bItaly\b/i, code: 'IT' },
  { pattern: /\bAustralia\b/i, code: 'AU' },
  { pattern: /\bCanada\b/i, code: 'CA' },
  { pattern: /\bColombia\b/i, code: 'CO' },
  { pattern: /\bArgentina\b/i, code: 'AR' },
  { pattern: /\bTaiwan\b/i, code: 'TW' },
  { pattern: /\bThailand\b/i, code: 'TH' },
];

function extractCountryCodes(text: string): string[] {
  const codes = new Set<string>();
  for (const { pattern, code } of COUNTRY_PATTERNS) {
    if (pattern.test(text)) codes.add(code);
  }
  return Array.from(codes);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const result = { ingested: 0, countries_mentioned: new Set<string>(), errors: [] as string[] };

  try {
    const r = await fetch(PROMED_RSS, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'NexusWatch/1.0 Intelligence Brief' },
    });
    if (!r.ok) throw new Error(`promed_rss_${r.status}`);

    const xml = await r.text();

    // Parse RSS items
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];
      const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(item);
      const linkMatch = /<link[^>]*>([\s\S]*?)<\/link>/.exec(item);
      const pubDateMatch = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/.exec(item);
      const descMatch = /<description[^>]*>([\s\S]*?)<\/description>/.exec(item);

      const title = (titleMatch?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
      const link = (linkMatch?.[1] || '').trim();
      const pubDate = pubDateMatch?.[1] ? new Date(pubDateMatch[1]).toISOString() : null;
      const description = (descMatch?.[1] || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();

      if (!title || title.length < 10) continue;

      const fullText = `${title} ${description}`;
      const countryCodes = extractCountryCodes(fullText);

      // Store as event snapshots (reuses existing table pattern)
      for (const code of countryCodes) {
        result.countries_mentioned.add(code);

        await sql`
          INSERT INTO event_snapshots (layer_id, country_code, title, source_url, timestamp, metadata)
          VALUES ('promed', ${code}, ${title.slice(0, 500)}, ${link}, ${pubDate || new Date().toISOString()},
                  ${JSON.stringify({ source: 'ProMED', description: description.slice(0, 300) })})
          ON CONFLICT DO NOTHING
        `;
        result.ingested++;
      }
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  console.log(
    `[source-promed] ingested=${result.ingested}, countries=${result.countries_mentioned.size}, errors=${result.errors.length}`,
  );
  return res.json({
    ...result,
    countries_mentioned: Array.from(result.countries_mentioned),
  });
}
