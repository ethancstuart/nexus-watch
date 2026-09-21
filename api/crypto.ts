import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

interface CoinGeckoMarket {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  price_change_percentage_24h: number;
  market_cap: number;
  total_volume: number;
  sparkline_in_7d?: { price: number[] };
  market_cap_rank: number;
  high_24h: number;
  low_24h: number;
  ath: number;
  ath_change_percentage: number;
}

const TOP_COINS = [
  'bitcoin',
  'ethereum',
  'solana',
  'xrp',
  'cardano',
  'dogecoin',
  'avalanche-2',
  'chainlink',
  'polkadot',
  'polygon',
];

// Module-level cache to avoid CoinGecko rate limits (10-30 req/min free tier)
let cachedCoins: unknown[] = [];
let lastCryptoFetch = 0;
const CRYPTO_CACHE_TTL = 120_000; // 2 minutes

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  // Return cached data if fresh enough
  if (Date.now() - lastCryptoFetch < CRYPTO_CACHE_TTL && cachedCoins.length > 0) {
    return res.setHeader('Cache-Control', 'public, s-maxage=120, max-age=120').json({
      coins: cachedCoins,
      fetchedAt: lastCryptoFetch,
      cached: true,
    });
  }

  try {
    const ids = TOP_COINS.join(',');
    const response = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&sparkline=true&price_change_percentage=24h`,
      { signal: AbortSignal.timeout(10000) },
    );
    if (!response.ok) {
      // Try CoinCap as fallback
      if (cachedCoins.length > 0) {
        return res.json({ coins: cachedCoins, fetchedAt: lastCryptoFetch, cached: true, source: 'cache-fallback' });
      }
      try {
        const capRes = await fetch('https://api.coincap.io/v2/assets?limit=10', {
          signal: AbortSignal.timeout(5000),
        });
        if (capRes.ok) {
          const capData = (await capRes.json()) as {
            data?: Array<{
              id: string;
              symbol: string;
              name: string;
              priceUsd: string;
              changePercent24Hr: string;
              marketCapUsd: string;
            }>;
          };
          const fallbackCoins = (capData.data || []).map((c) => ({
            id: c.id,
            symbol: c.symbol,
            name: c.name,
            price: parseFloat(c.priceUsd) || 0,
            change24h: parseFloat(c.changePercent24Hr) || 0,
            marketCap: parseFloat(c.marketCapUsd) || 0,
            volume: 0,
            sparkline: [],
            rank: 0,
            high24h: 0,
            low24h: 0,
            ath: 0,
            athChange: 0,
          }));
          cachedCoins = fallbackCoins;
          lastCryptoFetch = Date.now();
          return res.json({ coins: fallbackCoins, fetchedAt: lastCryptoFetch, source: 'coincap' });
        }
      } catch {
        /* CoinCap also failed */
      }
      return res.json({ coins: [], error: 'Crypto data temporarily unavailable' });
    }

    const data = (await response.json()) as CoinGeckoMarket[];

    const coins = data.map((coin) => ({
      id: coin.id,
      symbol: coin.symbol.toUpperCase(),
      name: coin.name,
      price: coin.current_price,
      change24h: coin.price_change_percentage_24h ?? 0,
      marketCap: coin.market_cap,
      volume: coin.total_volume,
      sparkline: coin.sparkline_in_7d?.price ? sampleSparkline(coin.sparkline_in_7d.price, 24) : [],
      rank: coin.market_cap_rank,
      high24h: coin.high_24h,
      low24h: coin.low_24h,
      ath: coin.ath,
      athChange: coin.ath_change_percentage,
    }));

    // Cache successful response
    cachedCoins = coins;
    lastCryptoFetch = Date.now();

    return res
      .setHeader('Cache-Control', 'public, s-maxage=120, max-age=120')
      .json({ coins, fetchedAt: lastCryptoFetch });
  } catch (err) {
    console.error('Crypto API error:', err instanceof Error ? err.message : err);
    // Return cached data on error instead of 502
    if (cachedCoins.length > 0) {
      return res.json({ coins: cachedCoins, fetchedAt: lastCryptoFetch, cached: true, source: 'error-fallback' });
    }
    return res.json({ coins: [], error: 'Crypto data temporarily unavailable' });
  }
}

function sampleSparkline(prices: number[], points: number): number[] {
  if (prices.length <= points) return prices;
  const step = Math.floor(prices.length / points);
  const sampled: number[] = [];
  for (let i = 0; i < points; i++) {
    sampled.push(prices[i * step]);
  }
  return sampled;
}
