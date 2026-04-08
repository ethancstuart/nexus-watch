import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Module-level cache
let cachedData: MarketSnapshot | null = null;
let lastFetch = 0;
const CACHE_TTL = 60_000; // 1 minute

interface MarketQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  category: 'index' | 'commodity' | 'fx' | 'crypto';
}

interface MarketSnapshot {
  quotes: MarketQuote[];
  timestamp: number;
}

// Symbols to track — covers major indices, commodities, FX, crypto
const SYMBOLS = {
  indices: [
    { symbol: 'SPY', name: 'S&P 500' },
    { symbol: 'QQQ', name: 'Nasdaq 100' },
    { symbol: 'DIA', name: 'Dow Jones' },
    { symbol: 'EWJ', name: 'Japan (Nikkei)' },
    { symbol: 'FXI', name: 'China (CSI)' },
    { symbol: 'EWZ', name: 'Brazil' },
  ],
  commodities: [
    { symbol: 'USO', name: 'Crude Oil' },
    { symbol: 'GLD', name: 'Gold' },
    { symbol: 'SLV', name: 'Silver' },
    { symbol: 'UNG', name: 'Natural Gas' },
    { symbol: 'WEAT', name: 'Wheat' },
    { symbol: 'CPER', name: 'Copper' },
  ],
  fx: [
    { symbol: 'UUP', name: 'US Dollar Index' },
    { symbol: 'FXE', name: 'EUR/USD' },
    { symbol: 'FXY', name: 'USD/JPY' },
    { symbol: 'FXB', name: 'GBP/USD' },
  ],
  crypto: [
    { symbol: 'BTC-USD', name: 'Bitcoin' },
    { symbol: 'ETH-USD', name: 'Ethereum' },
  ],
};

async function fetchTwelveData(symbols: string[]): Promise<Record<string, { price: number; change: number; pct: number }>> {
  const apiKey = process.env.TWELVEDATA_API_KEY;
  if (!apiKey) return {};

  const results: Record<string, { price: number; change: number; pct: number }> = {};

  // TwelveData batch quote
  try {
    const symbolStr = symbols.join(',');
    const res = await fetch(
      `https://api.twelvedata.com/quote?symbol=${symbolStr}&apikey=${apiKey}`,
      { signal: AbortSignal.timeout(8000) },
    );
    if (!res.ok) return results;

    const data = (await res.json()) as Record<string, unknown>;

    // Handle single vs batch response
    if (typeof data.symbol === 'string') {
      // Single result
      results[data.symbol as string] = {
        price: parseFloat(String(data.close)) || 0,
        change: parseFloat(String(data.change)) || 0,
        pct: parseFloat(String(data.percent_change)) || 0,
      };
    } else {
      // Batch results
      for (const [sym, quote] of Object.entries(data)) {
        const q = quote as Record<string, string>;
        if (q?.close) {
          results[sym] = {
            price: parseFloat(q.close) || 0,
            change: parseFloat(q.change) || 0,
            pct: parseFloat(q.percent_change) || 0,
          };
        }
      }
    }
  } catch {
    // TwelveData failed
  }

  return results;
}

async function fetchFinnhub(symbols: string[]): Promise<Record<string, { price: number; change: number; pct: number }>> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return {};

  const results: Record<string, { price: number; change: number; pct: number }> = {};

  // Finnhub requires individual requests
  const fetches = symbols.slice(0, 8).map(async (sym) => {
    try {
      const res = await fetch(
        `https://finnhub.io/api/v1/quote?symbol=${sym}&token=${apiKey}`,
        { signal: AbortSignal.timeout(5000) },
      );
      if (!res.ok) return;
      const data = await res.json() as { c: number; d: number; dp: number };
      if (data.c > 0) {
        results[sym] = { price: data.c, change: data.d || 0, pct: data.dp || 0 };
      }
    } catch {
      // skip
    }
  });

  await Promise.all(fetches);
  return results;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (cachedData && Date.now() - lastFetch < CACHE_TTL) {
    return res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60').json(cachedData);
  }

  // Collect all symbols
  const allSymbols = [
    ...SYMBOLS.indices.map((s) => s.symbol),
    ...SYMBOLS.commodities.map((s) => s.symbol),
    ...SYMBOLS.fx.map((s) => s.symbol),
  ];
  const cryptoSymbols = SYMBOLS.crypto.map((s) => s.symbol);

  // Fetch from TwelveData (primary) and Finnhub (fallback for stocks)
  const [twelveData, finnhub] = await Promise.all([
    fetchTwelveData([...allSymbols, ...cryptoSymbols]),
    fetchFinnhub(SYMBOLS.indices.map((s) => s.symbol)),
  ]);

  // Merge — TwelveData takes priority, Finnhub fills gaps
  const merged = { ...finnhub, ...twelveData };

  const quotes: MarketQuote[] = [];

  const addQuotes = (items: { symbol: string; name: string }[], category: MarketQuote['category']) => {
    for (const item of items) {
      const data = merged[item.symbol];
      if (data) {
        quotes.push({
          symbol: item.symbol,
          name: item.name,
          price: data.price,
          change: data.change,
          changePct: data.pct,
          category,
        });
      }
    }
  };

  addQuotes(SYMBOLS.indices, 'index');
  addQuotes(SYMBOLS.commodities, 'commodity');
  addQuotes(SYMBOLS.fx, 'fx');
  addQuotes(SYMBOLS.crypto, 'crypto');

  const snapshot: MarketSnapshot = { quotes, timestamp: Date.now() };

  if (quotes.length > 0) {
    cachedData = snapshot;
    lastFetch = Date.now();
  }

  return res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60').json(snapshot);
}
