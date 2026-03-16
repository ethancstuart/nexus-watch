import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'edge' };

const VALID_TABS = new Set(['top', 'best', 'new', 'show', 'ask']);

const TAB_ENDPOINTS: Record<string, string> = {
  top: 'topstories',
  best: 'beststories',
  new: 'newstories',
  show: 'showstories',
  ask: 'askstories',
};

interface HNItem {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
  time: number;
  descendants?: number;
  type: string;
}

export default async function handler(req: VercelRequest, _res: VercelResponse) {
  const url = new URL(req.url!, 'https://localhost');
  const tab = url.searchParams.get('tab') || 'top';

  if (!VALID_TABS.has(tab)) {
    return new Response(JSON.stringify({ error: 'Invalid tab' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const endpoint = TAB_ENDPOINTS[tab];
    const idsResp = await fetch(`https://hacker-news.firebaseio.com/v0/${endpoint}.json`);
    const allIds = (await idsResp.json()) as number[];
    const ids = allIds.slice(0, 20);

    const stories = await Promise.all(
      ids.map(async (id) => {
        const resp = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        const item = (await resp.json()) as HNItem;
        let domain = '';
        if (item.url) {
          try {
            domain = new URL(item.url).hostname.replace('www.', '');
          } catch {
            // invalid URL, leave domain empty
          }
        }
        return {
          id: item.id,
          title: item.title,
          url: item.url || `https://news.ycombinator.com/item?id=${item.id}`,
          domain,
          score: item.score,
          by: item.by,
          time: item.time,
          descendants: item.descendants ?? 0,
        };
      }),
    );

    return new Response(JSON.stringify({ stories, tab, fetchedAt: Date.now() }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'max-age=300',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch Hacker News data';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
