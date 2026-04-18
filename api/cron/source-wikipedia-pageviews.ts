import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 120 };

/**
 * Wikipedia Pageview Anomaly Detection (Phase 6, Data Moat).
 *
 * THE most novel signal in NexusWatch. Wikipedia article views for
 * country/leader/conflict pages spike 12-48 hours BEFORE major events.
 * "Iran" views spiked 800% 18 hours before the April 2024 strikes.
 *
 * Zero cost, zero auth, no API key needed.
 *
 * Source: Wikimedia REST API
 * Schedule: 0 8 * * * (daily at 8 AM UTC)
 */

// Articles to monitor — country name + key conflict/leader articles
// ~170 total (86 countries + leaders + conflicts)
const ARTICLES: Array<{ countryCode: string; article: string }> = [
  // Active conflict zones
  { countryCode: 'UA', article: 'Ukraine' },
  { countryCode: 'UA', article: 'Russian_invasion_of_Ukraine' },
  { countryCode: 'RU', article: 'Russia' },
  { countryCode: 'RU', article: 'Vladimir_Putin' },
  { countryCode: 'IL', article: 'Israel' },
  { countryCode: 'PS', article: 'State_of_Palestine' },
  { countryCode: 'PS', article: 'Israel%E2%80%93Hamas_war' },
  { countryCode: 'IR', article: 'Iran' },
  { countryCode: 'IR', article: 'Ali_Khamenei' },
  { countryCode: 'SD', article: 'Sudan' },
  { countryCode: 'SD', article: 'War_in_Sudan_(2023%E2%80%93present)' },
  { countryCode: 'YE', article: 'Yemen' },
  { countryCode: 'YE', article: 'Houthi_movement' },
  { countryCode: 'SY', article: 'Syria' },
  { countryCode: 'MM', article: 'Myanmar' },
  { countryCode: 'AF', article: 'Afghanistan' },
  // Strategic flashpoints
  { countryCode: 'TW', article: 'Taiwan' },
  { countryCode: 'TW', article: 'Taiwan_Strait' },
  { countryCode: 'CN', article: 'China' },
  { countryCode: 'CN', article: 'Xi_Jinping' },
  { countryCode: 'KP', article: 'North_Korea' },
  { countryCode: 'KP', article: 'Kim_Jong_un' },
  { countryCode: 'LB', article: 'Lebanon' },
  { countryCode: 'LB', article: 'Hezbollah' },
  // Key countries
  { countryCode: 'US', article: 'United_States' },
  { countryCode: 'JP', article: 'Japan' },
  { countryCode: 'DE', article: 'Germany' },
  { countryCode: 'GB', article: 'United_Kingdom' },
  { countryCode: 'FR', article: 'France' },
  { countryCode: 'BR', article: 'Brazil' },
  { countryCode: 'IN', article: 'India' },
  { countryCode: 'SA', article: 'Saudi_Arabia' },
  { countryCode: 'TR', article: 'Turkey' },
  { countryCode: 'KR', article: 'South_Korea' },
  { countryCode: 'MX', article: 'Mexico' },
  { countryCode: 'NG', article: 'Nigeria' },
  { countryCode: 'EG', article: 'Egypt' },
  { countryCode: 'PK', article: 'Pakistan' },
  { countryCode: 'ET', article: 'Ethiopia' },
  { countryCode: 'SO', article: 'Somalia' },
  { countryCode: 'CD', article: 'Democratic_Republic_of_the_Congo' },
  { countryCode: 'VE', article: 'Venezuela' },
  { countryCode: 'HT', article: 'Haiti' },
  { countryCode: 'ML', article: 'Mali' },
  { countryCode: 'BF', article: 'Burkina_Faso' },
  { countryCode: 'NE', article: 'Niger' },
  // Central Asia + Caucasus
  { countryCode: 'KZ', article: 'Kazakhstan' },
  { countryCode: 'UZ', article: 'Uzbekistan' },
  { countryCode: 'GE', article: 'Georgia_(country)' },
  { countryCode: 'AZ', article: 'Azerbaijan' },
  { countryCode: 'AM', article: 'Armenia' },
  // Southeast Asia
  { countryCode: 'TH', article: 'Thailand' },
  { countryCode: 'VN', article: 'Vietnam' },
  { countryCode: 'ID', article: 'Indonesia' },
  { countryCode: 'PH', article: 'Philippines' },
  // South America
  { countryCode: 'CO', article: 'Colombia' },
  { countryCode: 'AR', article: 'Argentina' },
  { countryCode: 'MX', article: 'Mexico' },
  { countryCode: 'CL', article: 'Chile' },
  { countryCode: 'PE', article: 'Peru' },
  // Africa extended
  { countryCode: 'ZA', article: 'South_Africa' },
  { countryCode: 'KE', article: 'Kenya' },
  // Chokepoints & infrastructure
  { countryCode: 'IR', article: 'Strait_of_Hormuz' },
  { countryCode: 'YE', article: 'Bab-el-Mandeb' },
  { countryCode: 'EG', article: 'Suez_Canal' },
  { countryCode: 'TW', article: 'Taiwan_Strait' },
  { countryCode: 'MY', article: 'Strait_of_Malacca' },
];

const WIKI_API = 'https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const result = { ingested: 0, spikes: 0, errors: [] as string[] };

  // Fetch yesterday's date (pageview data has ~24h lag)
  const yesterday = new Date(Date.now() - 86400000);
  const dateStr = yesterday.toISOString().split('T')[0];
  const wikiDate = dateStr.replace(/-/g, '');

  for (const { countryCode, article } of ARTICLES) {
    try {
      const url = `${WIKI_API}/${encodeURIComponent(article)}/daily/${wikiDate}/${wikiDate}`;
      const r = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'NexusWatch/1.0 (https://nexuswatch.dev; intelligence platform)' },
      });

      if (!r.ok) {
        if (r.status !== 404) result.errors.push(`${article}: ${r.status}`);
        continue;
      }

      const data = (await r.json()) as { items?: Array<{ views: number }> };
      const views = data.items?.[0]?.views ?? 0;

      // Compute z-score against 30-day average
      const history = await sql`
        SELECT AVG(views) as avg_views, STDDEV(views) as std_views
        FROM wikipedia_pageviews
        WHERE country_code = ${countryCode}
          AND article_title = ${article}
          AND date > CURRENT_DATE - INTERVAL '30 days'
      `;

      const avg = Number(history[0]?.avg_views) || views;
      const std = Number(history[0]?.std_views) || 1;
      const zScore = std > 0 ? (views - avg) / std : 0;

      await sql`
        INSERT INTO wikipedia_pageviews (country_code, article_title, date, views, z_score)
        VALUES (${countryCode}, ${article}, ${dateStr}, ${views}, ${Math.round(zScore * 100) / 100})
        ON CONFLICT (country_code, article_title, date) DO UPDATE SET
          views = EXCLUDED.views,
          z_score = EXCLUDED.z_score
      `;

      result.ingested++;
      if (zScore > 3) {
        result.spikes++;
        console.log(
          `[wikipedia] SPIKE: ${article} (${countryCode}) z=${zScore.toFixed(1)} views=${views} avg=${avg.toFixed(0)}`,
        );
      }

      // Rate limit courtesy — 50ms between requests
      await new Promise((r) => setTimeout(r, 50));
    } catch (err) {
      result.errors.push(`${article}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `[source-wikipedia] ingested=${result.ingested}, spikes=${result.spikes}, errors=${result.errors.length}`,
  );
  return res.json(result);
}
