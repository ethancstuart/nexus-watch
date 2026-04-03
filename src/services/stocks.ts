import { fetchWithRetry } from '../utils/fetch.ts';
import type { StockQuote, StocksData } from '../types/index.ts';

export async function fetchStocks(watchlist: string[]): Promise<StocksData> {
  const res = await fetchWithRetry(`/api/stocks?symbols=${watchlist.join(',')}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);

  return { indices: [], watchlist: data.quotes as StockQuote[], timestamp: data.timestamp };
}
