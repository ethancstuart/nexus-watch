/**
 * News Station View — click an area/issue to see live news aggregation
 * with video clips, articles, and social media discussion.
 *
 * Opens a right-side slide-out panel with:
 * - YouTube videos (if YT_API_KEY set)
 * - Articles from BBC, Al Jazeera, DW, Bellingcat
 * - Reddit discussions for real-time commentary
 */

import { createElement } from '../utils/dom.ts';

interface NewsArticle {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  summary?: string;
}

interface NewsVideo {
  title: string;
  url: string;
  thumbnail: string;
  channel: string;
  publishedAt: string;
}

interface NewsDiscussion {
  title: string;
  url: string;
  subreddit?: string;
  score?: number;
  comments?: number;
}

interface NewsFeedResponse {
  query: string;
  articles: NewsArticle[];
  videos: NewsVideo[];
  discussions: NewsDiscussion[];
  lastUpdated: number;
}

let panelEl: HTMLElement | null = null;

export async function showNewsView(query: string, displayName?: string): Promise<void> {
  closeNewsView();

  panelEl = createElement('div', { className: 'nw-news-panel' });

  const header = createElement('div', { className: 'nw-news-header' });
  header.innerHTML = `
    <div class="nw-news-header-text">
      <div class="nw-news-kicker">NEWS STATION</div>
      <h2>${displayName || query}</h2>
    </div>
    <button class="nw-news-close" aria-label="Close">✕</button>
  `;
  (header.querySelector('.nw-news-close') as HTMLButtonElement).addEventListener('click', closeNewsView);
  panelEl.appendChild(header);

  const loader = createElement('div', { className: 'nw-news-loading' });
  loader.innerHTML = `
    <div class="nw-news-loader-dot"></div>
    <div>Loading news feeds, videos, and discussions...</div>
  `;
  panelEl.appendChild(loader);

  document.body.appendChild(panelEl);

  // Esc to close
  document.addEventListener('keydown', escCloseHandler);

  try {
    const res = await fetch(`/api/news-feed?query=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error('news fetch failed');
    const data = (await res.json()) as NewsFeedResponse;

    loader.remove();
    renderFeedContent(panelEl, data);
  } catch {
    loader.innerHTML = `
      <div class="nw-news-error">
        Unable to load news feed. Try again or check /#/status.
      </div>
    `;
  }
}

function renderFeedContent(panel: HTMLElement, data: NewsFeedResponse): void {
  const body = createElement('div', { className: 'nw-news-body' });

  // Videos section (if any)
  if (data.videos.length > 0) {
    const videos = createElement('section', { className: 'nw-news-section' });
    videos.innerHTML = `<div class="nw-news-section-title">📺 Latest Videos</div>`;
    const grid = createElement('div', { className: 'nw-news-video-grid' });
    for (const v of data.videos) {
      const card = createElement('a', { className: 'nw-news-video-card' });
      (card as HTMLAnchorElement).href = v.url;
      (card as HTMLAnchorElement).target = '_blank';
      (card as HTMLAnchorElement).rel = 'noopener';
      card.innerHTML = `
        <div class="nw-news-video-thumb" style="background-image:url(${v.thumbnail});"></div>
        <div class="nw-news-video-info">
          <div class="nw-news-video-title">${escapeHtml(v.title)}</div>
          <div class="nw-news-video-meta">${escapeHtml(v.channel)} · ${relativeTime(v.publishedAt)}</div>
        </div>
      `;
      grid.appendChild(card);
    }
    videos.appendChild(grid);
    body.appendChild(videos);
  }

  // Articles section
  if (data.articles.length > 0) {
    const articles = createElement('section', { className: 'nw-news-section' });
    articles.innerHTML = `<div class="nw-news-section-title">📰 Latest Articles</div>`;
    const list = createElement('div', { className: 'nw-news-article-list' });
    for (const a of data.articles) {
      const item = createElement('a', { className: 'nw-news-article-item' });
      (item as HTMLAnchorElement).href = a.url;
      (item as HTMLAnchorElement).target = '_blank';
      (item as HTMLAnchorElement).rel = 'noopener';
      item.innerHTML = `
        <div class="nw-news-article-source">${escapeHtml(a.source)}</div>
        <div class="nw-news-article-title">${escapeHtml(a.title)}</div>
        ${a.summary ? `<div class="nw-news-article-summary">${escapeHtml(a.summary.slice(0, 200))}...</div>` : ''}
        ${a.publishedAt ? `<div class="nw-news-article-date">${relativeTime(a.publishedAt)}</div>` : ''}
      `;
      list.appendChild(item);
    }
    articles.appendChild(list);
    body.appendChild(articles);
  }

  // Reddit discussion section
  if (data.discussions.length > 0) {
    const discussions = createElement('section', { className: 'nw-news-section' });
    discussions.innerHTML = `<div class="nw-news-section-title">💬 Live Discussion</div>`;
    const list = createElement('div', { className: 'nw-news-discussion-list' });
    for (const d of data.discussions) {
      const item = createElement('a', { className: 'nw-news-discussion-item' });
      (item as HTMLAnchorElement).href = d.url;
      (item as HTMLAnchorElement).target = '_blank';
      (item as HTMLAnchorElement).rel = 'noopener';
      item.innerHTML = `
        <div class="nw-news-discussion-sub">r/${escapeHtml(d.subreddit || 'unknown')}</div>
        <div class="nw-news-discussion-title">${escapeHtml(d.title)}</div>
        <div class="nw-news-discussion-meta">▲ ${d.score || 0} · 💬 ${d.comments || 0}</div>
      `;
      list.appendChild(item);
    }
    discussions.appendChild(list);
    body.appendChild(discussions);
  }

  if (data.articles.length === 0 && data.videos.length === 0 && data.discussions.length === 0) {
    const empty = createElement('div', { className: 'nw-news-empty' });
    empty.textContent = `No recent news found for "${data.query}". Try broadening the search.`;
    body.appendChild(empty);
  }

  panel.appendChild(body);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c] || c;
  });
}

function relativeTime(dateStr: string): string {
  try {
    const t = new Date(dateStr).getTime();
    const diff = Date.now() - t;
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  } catch {
    return '';
  }
}

function escCloseHandler(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeNewsView();
}

export function closeNewsView(): void {
  panelEl?.remove();
  panelEl = null;
  document.removeEventListener('keydown', escCloseHandler);
}
