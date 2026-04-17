import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Prediction Market × CII Divergence
 *
 * GET /api/v2/prediction-divergence
 *
 * Fetches live Polymarket/Kalshi geopolitical contracts, maps them to
 * countries via keyword matching, cross-references CII scores, and
 * flags divergences where market probability and CII risk disagree.
 *
 * A divergence is an insight: if Polymarket says 80% chance of
 * instability but CII is calm (or vice versa), something is mispriced.
 */

interface Market {
  id: string;
  question: string;
  probability: number;
  volume: number;
  source: string;
  url: string;
}

// Keyword → country code + lat/lon mapping
const GEO_MAP: Array<{
  pattern: RegExp;
  code: string;
  name: string;
  lat: number;
  lon: number;
}> = [
  { pattern: /china|beijing|xi jinping/i, code: 'CN', name: 'China', lat: 39.9, lon: 116.4 },
  { pattern: /russia|moscow|putin|kremlin/i, code: 'RU', name: 'Russia', lat: 55.8, lon: 37.6 },
  { pattern: /ukraine|kyiv|zelensky/i, code: 'UA', name: 'Ukraine', lat: 50.4, lon: 30.5 },
  { pattern: /iran|tehran/i, code: 'IR', name: 'Iran', lat: 35.7, lon: 51.4 },
  { pattern: /israel|gaza|hamas|netanyahu/i, code: 'IL', name: 'Israel', lat: 31.8, lon: 35.2 },
  { pattern: /taiwan|taipei/i, code: 'TW', name: 'Taiwan', lat: 25.0, lon: 121.5 },
  { pattern: /north korea|pyongyang|kim jong/i, code: 'KP', name: 'North Korea', lat: 39.0, lon: 125.8 },
  { pattern: /india|modi|new delhi/i, code: 'IN', name: 'India', lat: 28.6, lon: 77.2 },
  { pattern: /turkey|ankara|erdogan/i, code: 'TR', name: 'Turkey', lat: 39.9, lon: 32.9 },
  { pattern: /saudi|mbs|riyadh/i, code: 'SA', name: 'Saudi Arabia', lat: 24.7, lon: 46.7 },
  { pattern: /japan|tokyo/i, code: 'JP', name: 'Japan', lat: 35.7, lon: 139.7 },
  { pattern: /germany|berlin|scholz/i, code: 'DE', name: 'Germany', lat: 52.5, lon: 13.4 },
  { pattern: /france|macron|paris/i, code: 'FR', name: 'France', lat: 48.9, lon: 2.3 },
  { pattern: /uk|britain|london/i, code: 'GB', name: 'United Kingdom', lat: 51.5, lon: -0.1 },
  { pattern: /brazil|lula|brasilia/i, code: 'BR', name: 'Brazil', lat: -15.8, lon: -47.9 },
  { pattern: /mexico|mexico city/i, code: 'MX', name: 'Mexico', lat: 19.4, lon: -99.1 },
  { pattern: /pakistan|islamabad/i, code: 'PK', name: 'Pakistan', lat: 33.7, lon: 73.0 },
  { pattern: /egypt|cairo|sisi/i, code: 'EG', name: 'Egypt', lat: 30.0, lon: 31.2 },
  { pattern: /venezuela|maduro|caracas/i, code: 'VE', name: 'Venezuela', lat: 10.5, lon: -66.9 },
  { pattern: /sudan|khartoum/i, code: 'SD', name: 'Sudan', lat: 15.6, lon: 32.5 },
];

function matchCountry(question: string): (typeof GEO_MAP)[0] | null {
  for (const entry of GEO_MAP) {
    if (entry.pattern.test(question)) return entry;
  }
  return null;
}

interface PolymarketEvent {
  id: string;
  title: string;
  markets: {
    id: string;
    question: string;
    outcomePrices: string;
    volume: number;
  }[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;

  try {
    // Fetch prediction markets
    const markets: Market[] = [];

    try {
      const polyRes = await fetch(
        'https://gamma-api.polymarket.com/events?closed=false&order=volume24hr&ascending=false&limit=15',
        { signal: AbortSignal.timeout(5000) },
      );
      if (polyRes.ok) {
        const events = (await polyRes.json()) as PolymarketEvent[];
        for (const event of events) {
          for (const m of event.markets.slice(0, 1)) {
            let prob = 50;
            try {
              const prices = JSON.parse(m.outcomePrices || '[]');
              if (prices.length > 0) prob = Math.round(parseFloat(prices[0]) * 100);
            } catch {
              /* default */
            }
            markets.push({
              id: m.id,
              question: m.question || event.title,
              probability: prob,
              volume: m.volume || 0,
              source: 'polymarket',
              url: `https://polymarket.com/event/${event.id}`,
            });
          }
        }
      }
    } catch {
      /* continue */
    }

    // Get CII scores
    const ciiMap = new Map<string, number>();
    if (dbUrl) {
      try {
        const sql = neon(dbUrl);
        const rows = (await sql`
          SELECT DISTINCT ON (country_code) country_code, score
          FROM country_cii_history
          ORDER BY country_code, timestamp DESC
        `) as unknown as Array<{ country_code: string; score: number }>;
        for (const r of rows) ciiMap.set(r.country_code, r.score);
      } catch {
        /* continue without CII */
      }
    }

    // Compute divergences
    const divergences = markets
      .map((m) => {
        const geo = matchCountry(m.question);
        if (!geo) return null;

        const cii = ciiMap.get(geo.code) ?? null;
        if (cii === null) return null;

        // Normalize: market probability (0-100) vs CII (0-100)
        // High market probability of a negative event + low CII = market sees risk CII doesn't
        // Low market probability + high CII = CII sees risk market doesn't
        const gap = m.probability - cii;
        const absGap = Math.abs(gap);

        return {
          market: m.question,
          market_probability: m.probability,
          country_code: geo.code,
          country_name: geo.name,
          cii_score: cii,
          divergence: gap,
          abs_divergence: absGap,
          signal: absGap >= 20 ? (gap > 0 ? 'market_sees_more_risk' : 'cii_sees_more_risk') : 'aligned',
          lat: geo.lat,
          lon: geo.lon,
          source: m.source,
          url: m.url,
          volume: m.volume,
        };
      })
      .filter(Boolean)
      .sort((a, b) => (b?.abs_divergence ?? 0) - (a?.abs_divergence ?? 0));

    const significant = divergences.filter((d) => d && d.abs_divergence >= 20);

    return res.json({
      divergences,
      significant_count: significant.length,
      total_markets: markets.length,
      total_matched: divergences.length,
      meta: {
        methodology:
          'Compares prediction market probability (0-100%) against CII score (0-100). Divergence > 20 points flags a disagreement between markets and the instability index.',
        sources: ['Polymarket (gamma-api)', 'NexusWatch CII v2.1.0'],
        signal_interpretation: {
          market_sees_more_risk:
            'Market probability > CII score by 20+ points — markets price in more risk than CII measures',
          cii_sees_more_risk:
            'CII score > market probability by 20+ points — CII measures more risk than markets price in',
          aligned: 'Market and CII agree within 20 points',
        },
      },
    });
  } catch (err) {
    console.error('[prediction-divergence]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'divergence_failed' });
  }
}
