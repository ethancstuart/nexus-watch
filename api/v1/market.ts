import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

const CORS = 'https://dashpulse.app';

const SYMBOLS = [
  { symbol: 'SPY', name: 'S&P 500', category: 'index' },
  { symbol: 'QQQ', name: 'Nasdaq 100', category: 'index' },
  { symbol: 'GLD', name: 'Gold', category: 'commodity' },
  { symbol: 'USO', name: 'Crude Oil', category: 'commodity' },
  { symbol: 'UUP', name: 'US Dollar', category: 'fx' },
];

let cachedQuotes: unknown[] = [];
let lastFetch = 0;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (cachedQuotes.length > 0 && Date.now() - lastFetch < 60_000) {
    return res
      .setHeader('Cache-Control', 'public, max-age=60')
      .json({ quotes: cachedQuotes, timestamp: lastFetch, cached: true });
  }

  // Call TwelveData directly — NOT proxying through /api/market-data
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) {
    return res.json({ quotes: [], timestamp: Date.now(), error: 'TWELVEDATA_API_KEY not configured' });
  }

  try {
    const symbolStr = SYMBOLS.map((s) => s.symbol).join(',');
    const response = await fetch(`https://api.twelvedata.com/quote?symbol=${symbolStr}&apikey=${apiKey}`, {
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return res.status(502).json({ error: `TwelveData returned ${response.status}` });

    const data = (await response.json()) as Record<string, unknown>;
    const quotes = SYMBOLS.map((s) => {
      const q = data[s.symbol] as Record<string, string> | undefined;
      if (!q?.close) return null;
      return {
        symbol: s.symbol,
        name: s.name,
        category: s.category,
        price: parseFloat(q.close) || 0,
        change: parseFloat(q.change) || 0,
        changePct: parseFloat(q.percent_change) || 0,
      };
    }).filter(Boolean);

    cachedQuotes = quotes;
    lastFetch = Date.now();

    return res.setHeader('Cache-Control', 'public, max-age=60').json({ quotes, timestamp: Date.now() });
  } catch (err) {
    console.error('API v1 market error:', err instanceof Error ? err.message : err);
    if (cachedQuotes.length > 0) return res.json({ quotes: cachedQuotes, cached: true });
    return res.status(500).json({ error: 'Market data unavailable' });
  }
}
