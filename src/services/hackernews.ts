import { fetchWithRetry } from '../utils/fetch.ts';
import type { HackerNewsData, HNTab } from '../types/index.ts';

export async function fetchHackerNews(tab: HNTab): Promise<HackerNewsData> {
  const res = await fetchWithRetry(`/api/hackernews?tab=${tab}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data as HackerNewsData;
}
