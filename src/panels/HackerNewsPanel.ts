import { Panel } from './Panel.ts';
import { createElement } from '../utils/dom.ts';
import { fetchHackerNews } from '../services/hackernews.ts';
import * as storage from '../services/storage.ts';
import type { HNTab, HackerNewsData, HNStory, WidgetSize } from '../types/index.ts';

const TAB_KEY = 'dashview-hn-tab';

const TABS: { id: HNTab; label: string }[] = [
  { id: 'top', label: 'Top' },
  { id: 'best', label: 'Best' },
  { id: 'new', label: 'New' },
  { id: 'show', label: 'Show HN' },
  { id: 'ask', label: 'Ask HN' },
];

export class HackerNewsPanel extends Panel {
  private tab: HNTab;
  private data: HackerNewsData | null = null;

  getLastData(): HackerNewsData | null {
    return this.data;
  }

  renderAtSize(size: WidgetSize): void {
    if (size === 'compact' && this.data?.stories?.length) {
      this.contentEl.textContent = '';
      const top = this.data.stories[0];
      const wrap = createElement('div', {});
      wrap.style.cssText = 'text-align:center;padding:8px 0';
      const title = createElement('div', {});
      title.style.cssText = 'font-size:13px;font-weight:600';
      title.textContent = top.title;
      const meta = createElement('div', {});
      meta.style.cssText = 'font-size:11px;color:var(--color-text-muted)';
      meta.textContent = `${top.score} pts`;
      wrap.appendChild(title);
      wrap.appendChild(meta);
      this.contentEl.appendChild(wrap);
      return;
    }
    if (this.data) this.render(this.data);
  }

  constructor() {
    super({
      id: 'hackernews',
      title: 'Hacker News',
      enabled: true,
      refreshInterval: 300000,
      priority: 2,
      category: 'dev',
    });
    this.tab = storage.get<HNTab>(TAB_KEY, 'top');
  }

  override async startDataCycle(): Promise<void> {
    await super.startDataCycle();
    document.addEventListener(
      'dashview:storage-changed',
      ((e: CustomEvent) => {
        if (e.detail?.key === TAB_KEY) {
          this.tab = storage.get<HNTab>(TAB_KEY, 'top');
          void this.refresh();
        }
      }) as EventListener,
      { signal: this.cycleAbort!.signal },
    );
  }

  async fetchData(): Promise<void> {
    this.data = await fetchHackerNews(this.tab);
    this.render(this.data);
  }

  render(_data: unknown): void {
    this.contentEl.textContent = '';

    // Tab bar
    const tabs = createElement('div', { className: 'news-tabs' });
    for (const t of TABS) {
      const btn = createElement('button', {
        className: `news-tab ${t.id === this.tab ? 'news-tab-active' : ''}`,
        textContent: t.label,
      });
      btn.addEventListener('click', () => {
        if (t.id === this.tab) return;
        this.tab = t.id;
        storage.set(TAB_KEY, this.tab);
        void this.fetchData();
      });
      tabs.appendChild(btn);
    }
    this.contentEl.appendChild(tabs);

    if (!this.data || this.data.stories.length === 0) {
      const empty = createElement('div', {
        className: 'panel-empty-state',
        textContent: 'No stories available.',
      });
      this.contentEl.appendChild(empty);
      return;
    }

    // Story list
    const list = createElement('div', { className: 'hn-list' });
    for (const story of this.data.stories) {
      list.appendChild(this.createStoryRow(story));
    }
    this.contentEl.appendChild(list);
  }

  private createStoryRow(story: HNStory): HTMLElement {
    const row = createElement('div', { className: 'hn-story' });

    // Score
    const score = createElement('div', {
      className: 'hn-story-score',
      textContent: String(story.score),
    });
    row.appendChild(score);

    // Content wrapper
    const content = createElement('div', { className: 'hn-story-content' });

    // Title link
    const titleLink = document.createElement('a');
    titleLink.className = 'hn-story-title';
    titleLink.href = story.url;
    titleLink.textContent = story.title;
    titleLink.target = '_blank';
    titleLink.rel = 'noopener noreferrer';
    content.appendChild(titleLink);

    // Meta row
    const meta = createElement('div', { className: 'hn-story-meta' });

    if (story.domain) {
      const domain = createElement('span', {
        className: 'hn-story-domain',
        textContent: story.domain,
      });
      meta.appendChild(domain);
    }

    const by = createElement('span', { textContent: story.by });
    meta.appendChild(by);

    const timeAgo = createElement('span', { textContent: this.formatUnixTimeAgo(story.time) });
    meta.appendChild(timeAgo);

    const comments = document.createElement('a');
    comments.className = 'hn-story-comments';
    comments.href = `https://news.ycombinator.com/item?id=${story.id}`;
    comments.textContent = `${story.descendants} comments`;
    comments.target = '_blank';
    comments.rel = 'noopener noreferrer';
    meta.appendChild(comments);

    content.appendChild(meta);
    row.appendChild(content);
    return row;
  }

  private formatUnixTimeAgo(unixSeconds: number): string {
    const diff = Math.floor(Date.now() / 1000) - unixSeconds;
    if (diff < 60) return 'just now';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
