import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

/**
 * News feed aggregation for a specific area or country.
 *
 * GET /api/news-feed?country=Ukraine
 * GET /api/news-feed?lat=48.4&lon=31.2&radius=3
 * GET /api/news-feed?query=hormuz
 *
 * Aggregates from:
 * - GDELT (already cached in news layer)
 * - YouTube search for current event videos (if YT_API_KEY set)
 * - RSS feeds for major news outlets
 * - Reddit search for real-time discussion
 *
 * Returns: { articles, videos, discussions, lastUpdated }
 */

interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  imageUrl?: string;
  summary?: string;
  tone?: number;
}

interface NewsVideo {
  title: string;
  url: string;
  thumbnail: string;
  channel: string;
  publishedAt: string;
  source: 'youtube';
}

interface NewsDiscussion {
  title: string;
  url: string;
  subreddit?: string;
  score?: number;
  comments?: number;
  source: 'reddit';
}

// Major news RSS feeds keyed by topic
const GLOBAL_NEWS_FEEDS = [
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera' },
  { url: 'https://rss.dw.com/xml/rss-en-all', source: 'DW' },
  { url: 'https://www.bellingcat.com/feed/', source: 'Bellingcat' },
];

async function fetchRssForQuery(query: string, limit = 10): Promise<NewsArticle[]> {
  const lowerQuery = query.toLowerCase();
  const results: NewsArticle[] = [];

  const fetches = await Promise.allSettled(
    GLOBAL_NEWS_FEEDS.map(async (feed) => {
      const r = await fetch(feed.url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'NexusWatch/1.0' },
      });
      if (!r.ok) return [];
      const xml = await r.text();
      return parseRssItems(xml, feed.source).filter(
        (item) =>
          item.title.toLowerCase().includes(lowerQuery) || (item.summary || '').toLowerCase().includes(lowerQuery),
      );
    }),
  );

  for (const f of fetches) {
    if (f.status === 'fulfilled') results.push(...f.value);
  }

  return results.slice(0, limit);
}

function parseRssItems(xml: string, source: string): NewsArticle[] {
  const items: NewsArticle[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 20) {
    const item = match[1];
    const title =
      /<title[^>]*>([\s\S]*?)<\/title>/
        .exec(item)?.[1]
        ?.replace(/<!\[CDATA\[|\]\]>/g, '')
        .trim() || '';
    const link = /<link[^>]*>([\s\S]*?)<\/link>/.exec(item)?.[1]?.trim() || '';
    const pubDate = /<pubDate[^>]*>([\s\S]*?)<\/pubDate>/.exec(item)?.[1]?.trim();
    const desc = /<description[^>]*>([\s\S]*?)<\/description>/
      .exec(item)?.[1]
      ?.replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/<[^>]+>/g, '')
      .trim();
    if (title && link) {
      items.push({ title, url: link, source, publishedAt: pubDate, summary: desc });
    }
  }
  return items;
}

async function fetchYouTubeVideos(query: string, limit = 5): Promise<NewsVideo[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) return [];

  try {
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&q=${encodeURIComponent(
      query,
    )}&maxResults=${limit}&order=date&relevanceLanguage=en&key=${apiKey}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!r.ok) return [];
    const data = (await r.json()) as {
      items?: Array<{
        id: { videoId: string };
        snippet: {
          title: string;
          channelTitle: string;
          publishedAt: string;
          thumbnails: { high?: { url: string }; medium?: { url: string } };
        };
      }>;
    };
    return (data.items || []).map((v) => ({
      title: v.snippet.title,
      url: `https://www.youtube.com/watch?v=${v.id.videoId}`,
      thumbnail: v.snippet.thumbnails.high?.url || v.snippet.thumbnails.medium?.url || '',
      channel: v.snippet.channelTitle,
      publishedAt: v.snippet.publishedAt,
      source: 'youtube' as const,
    }));
  } catch {
    return [];
  }
}

async function fetchRedditDiscussion(query: string, limit = 5): Promise<NewsDiscussion[]> {
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=new&limit=${limit}&restrict_sr=&include_over_18=off`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: { 'User-Agent': 'NexusWatch/1.0' },
    });
    if (!r.ok) return [];
    const data = (await r.json()) as {
      data: {
        children: Array<{
          data: { title: string; permalink: string; subreddit: string; score: number; num_comments: number };
        }>;
      };
    };
    return (data.data?.children || []).map((p) => ({
      title: p.data.title,
      url: `https://reddit.com${p.data.permalink}`,
      subreddit: p.data.subreddit,
      score: p.data.score,
      comments: p.data.num_comments,
      source: 'reddit' as const,
    }));
  } catch {
    return [];
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const country = typeof req.query.country === 'string' ? req.query.country : null;
  const query = typeof req.query.query === 'string' ? req.query.query : country;

  if (!query) {
    return res.status(400).json({ error: 'country or query parameter required' });
  }

  try {
    const [articles, videos, discussions] = await Promise.all([
      fetchRssForQuery(query, 10),
      fetchYouTubeVideos(query, 5),
      fetchRedditDiscussion(query, 5),
    ]);

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
    return res.json({
      query,
      articles,
      videos,
      discussions,
      lastUpdated: Date.now(),
    });
  } catch (err) {
    console.error('[api/news-feed]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'news_feed_failed' });
  }
}
