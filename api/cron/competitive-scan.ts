import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 120 };

/**
 * Competitive Monitoring Cron
 *
 * Runs weekly. Fetches competitor landing pages and pricing pages,
 * extracts key signals (pricing, feature mentions, product count),
 * and stores snapshots. Flags changes from prior week.
 *
 * Competitors scanned:
 * - world-monitor.app (primary)
 * - sitdeck.com (feature-rich alternative)
 * - stratfor.com (pricing comparable)
 *
 * Stored in: competitor_snapshots table (created on first run)
 */

interface CompetitorSignals {
  competitor: string;
  url: string;
  scanned_at: string;
  // Extracted signals
  pricing_mentions: string[]; // e.g., "$4.99/month", "$49/mo"
  feature_mentions: string[]; // keywords: "AI", "chat", "alerts", etc.
  country_count?: number; // "160+ countries" etc.
  layer_count?: number;
  raw_size: number; // HTML size for diff detection
}

const COMPETITORS = [
  { id: 'world-monitor', name: 'World Monitor', url: 'https://world-monitor.app' },
  { id: 'sitdeck', name: 'SitDeck', url: 'https://sitdeck.com' },
  { id: 'stratfor', name: 'Stratfor', url: 'https://worldview.stratfor.com' },
];

const FEATURE_KEYWORDS = [
  'AI',
  'chat',
  'analyst',
  'alert',
  'CII',
  'tension',
  'scenario',
  'portfolio',
  'webhook',
  'API',
  'verified',
  'confidence',
  'cascade',
  'crisis',
  'prediction',
  'simulation',
  'timeline',
  'export',
  'real-time',
  'satellite',
  'OSINT',
];

async function scanCompetitor(c: (typeof COMPETITORS)[0]): Promise<CompetitorSignals | null> {
  try {
    const res = await fetch(c.url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; NexusWatch-ComptitiveScan/1.0)' },
    });
    if (!res.ok) return null;
    const html = await res.text();

    // Extract pricing mentions ($X.XX, $XX/mo, etc.)
    const pricingMatches = [...html.matchAll(/\$(\d{1,4}(?:\.\d{2})?)\s*(?:\/|\s*per\s*)(mo|month|year|yr)/gi)];
    const pricing_mentions = [
      ...new Set(pricingMatches.map((m) => `$${m[1]}/${m[2].toLowerCase().startsWith('y') ? 'yr' : 'mo'}`)),
    ];

    // Extract feature mentions
    const feature_mentions = FEATURE_KEYWORDS.filter((kw) => {
      const regex = new RegExp(`\\b${kw}\\b`, 'i');
      return regex.test(html);
    });

    // Extract country count ("160+ countries", "195 countries")
    let country_count: number | undefined;
    const countryMatch = /(\d{2,3})\+?\s*countries/i.exec(html);
    if (countryMatch) country_count = parseInt(countryMatch[1], 10);

    // Extract layer count
    let layer_count: number | undefined;
    const layerMatch = /(\d{1,3})\+?\s*(?:data\s*)?layers/i.exec(html);
    if (layerMatch) layer_count = parseInt(layerMatch[1], 10);

    return {
      competitor: c.id,
      url: c.url,
      scanned_at: new Date().toISOString(),
      pricing_mentions,
      feature_mentions,
      country_count,
      layer_count,
      raw_size: html.length,
    };
  } catch (err) {
    console.error(`[competitive-scan] ${c.id} failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const results: CompetitorSignals[] = [];
  for (const c of COMPETITORS) {
    const signals = await scanCompetitor(c);
    if (signals) results.push(signals);
  }

  // Store snapshots
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl && results.length > 0) {
    try {
      const sql = neon(dbUrl);
      await sql`
        CREATE TABLE IF NOT EXISTS competitor_snapshots (
          id SERIAL PRIMARY KEY,
          competitor TEXT NOT NULL,
          url TEXT NOT NULL,
          scanned_at TIMESTAMPTZ NOT NULL,
          pricing_mentions JSONB,
          feature_mentions JSONB,
          country_count INTEGER,
          layer_count INTEGER,
          raw_size INTEGER,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `;
      for (const r of results) {
        await sql`
          INSERT INTO competitor_snapshots
            (competitor, url, scanned_at, pricing_mentions, feature_mentions, country_count, layer_count, raw_size)
          VALUES
            (${r.competitor}, ${r.url}, ${r.scanned_at}, ${JSON.stringify(r.pricing_mentions)},
             ${JSON.stringify(r.feature_mentions)}, ${r.country_count ?? null}, ${r.layer_count ?? null}, ${r.raw_size})
        `;
      }
    } catch (err) {
      console.error('[competitive-scan] DB insert failed:', err instanceof Error ? err.message : err);
    }
  }

  return res.json({
    scanned: results.length,
    results,
    note: 'Snapshots stored in competitor_snapshots table. Manual review recommended for significant changes.',
  });
}
