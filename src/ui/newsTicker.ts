/**
 * Live News Ticker — scrolling headlines from data lake.
 * Sits above the status bar at the bottom of the map view.
 * Auto-refreshes every 2 minutes from /api/v1/data-lake?layer=news-global
 */

import { createElement } from '../utils/dom.ts';

interface NewsItem {
  title: string;
  source: string;
  link: string;
  pubDate: string;
}

export class NewsTicker {
  private container: HTMLElement;
  private tickerEl: HTMLElement | null = null;
  private refreshInterval: ReturnType<typeof setInterval> | null = null;
  private items: NewsItem[] = [];

  constructor(parent: HTMLElement) {
    this.container = parent;
    this.init();
  }

  private init(): void {
    this.tickerEl = createElement('div', { className: 'nw-news-ticker' });
    this.tickerEl.innerHTML = `
      <span class="nw-ticker-label">LIVE</span>
      <div class="nw-ticker-track">
        <div class="nw-ticker-scroll" id="ticker-scroll"></div>
      </div>
    `;
    this.container.appendChild(this.tickerEl);

    void this.loadNews();
    this.refreshInterval = setInterval(() => void this.loadNews(), 120000);
  }

  private async loadNews(): Promise<void> {
    try {
      const res = await fetch('/api/v1/data-lake?layer=news-global');
      if (!res.ok) return;
      const data = (await res.json()) as { data: NewsItem[] };
      this.items = Array.isArray(data.data) ? data.data : [];
      this.render();
    } catch {
      // Try OSINT feed as fallback
      try {
        const res = await fetch('/api/osint-feed');
        if (!res.ok) return;
        const data = (await res.json()) as {
          posts: Array<{ title: string; source: string; link: string; pubDate: string }>;
        };
        this.items = (data.posts || []).slice(0, 20).map((p) => ({
          title: p.title,
          source: p.source,
          link: p.link || '#',
          pubDate: p.pubDate || '',
        }));
        this.render();
      } catch {
        /* both failed — keep existing items */
      }
    }
  }

  private render(): void {
    const scroll = this.tickerEl?.querySelector('#ticker-scroll') as HTMLElement | null;
    if (!scroll || this.items.length === 0) return;

    // Build ticker content — duplicate for seamless loop
    const content = this.items
      .map((item) => {
        const timeAgo = item.pubDate ? this.formatTimeAgo(new Date(item.pubDate)) : '';
        return `<span class="nw-ticker-item">
          <span class="nw-ticker-source">${item.source}</span>
          <span class="nw-ticker-headline">${item.title}</span>
          ${timeAgo ? `<span class="nw-ticker-time">${timeAgo}</span>` : ''}
          <span class="nw-ticker-sep">///</span>
        </span>`;
      })
      .join('');

    // Duplicate for seamless infinite scroll
    scroll.innerHTML = content + content;

    // Calculate animation duration based on content length
    const totalWidth = scroll.scrollWidth / 2;
    const duration = Math.max(30, totalWidth / 50); // ~50px/sec
    scroll.style.animationDuration = `${duration}s`;
  }

  private formatTimeAgo(date: Date): string {
    const mins = Math.round((Date.now() - date.getTime()) / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    if (mins < 1440) return `${Math.round(mins / 60)}h`;
    return `${Math.round(mins / 1440)}d`;
  }

  destroy(): void {
    if (this.refreshInterval) clearInterval(this.refreshInterval);
    this.tickerEl?.remove();
  }
}
