import { createElement } from '../utils/dom.ts';
import { fetchNews } from '../services/news.ts';
import type { NewsArticle, NewsCategory } from '../types/index.ts';

const CATEGORIES: { id: NewsCategory; label: string }[] = [
  { id: 'world', label: 'WORLD' },
  { id: 'us', label: 'US' },
  { id: 'markets', label: 'MKT' },
  { id: 'tech', label: 'TECH' },
  { id: 'science', label: 'SCI' },
];

export function createFeedsTab(): {
  element: HTMLElement;
  startDataCycle: () => void;
  stopDataCycle: () => void;
} {
  const el = createElement('div', { className: 'nw-feeds-tab' });
  let interval: ReturnType<typeof setInterval> | null = null;
  let activeCategory: NewsCategory = 'world';

  // Category tabs
  const catBar = createElement('div', { className: 'nw-feeds-cats' });
  for (const cat of CATEGORIES) {
    const btn = createElement('button', { className: 'nw-feeds-cat' });
    btn.textContent = cat.label;
    btn.dataset.cat = cat.id;
    if (cat.id === activeCategory) btn.classList.add('active');
    btn.addEventListener('click', () => {
      activeCategory = cat.id;
      catBar.querySelectorAll('.nw-feeds-cat').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      fetchAndRender();
    });
    catBar.appendChild(btn);
  }
  el.appendChild(catBar);

  const body = createElement('div', { className: 'nw-feeds-body' });
  el.appendChild(body);

  function startDataCycle() {
    fetchAndRender();
    interval = setInterval(fetchAndRender, 300_000); // 5 min
  }

  function stopDataCycle() {
    if (interval) clearInterval(interval);
    interval = null;
  }

  async function fetchAndRender() {
    // Show skeletons while loading
    body.textContent = '';
    for (let i = 0; i < 15; i++) {
      const sk = createElement('div', { className: 'nw-skeleton-row' });
      const bar = createElement('div', { className: 'nw-skeleton-bar' });
      bar.style.width = `${30 + Math.random() * 60}%`;
      bar.style.height = '10px';
      sk.appendChild(bar);
      body.appendChild(sk);
    }

    try {
      const data = await fetchNews(activeCategory);
      renderArticles(body, data.articles);
    } catch {
      body.textContent = '';
      body.appendChild(createElement('div', { className: 'nw-placeholder', textContent: 'Failed to load news' }));
    }
  }

  return { element: el, startDataCycle, stopDataCycle };
}

function renderArticles(container: HTMLElement, articles: NewsArticle[]): void {
  container.textContent = '';

  if (articles.length === 0) {
    container.appendChild(createElement('div', { className: 'nw-placeholder', textContent: 'No articles' }));
    return;
  }

  for (const article of articles.slice(0, 30)) {
    const row = createElement('div', { className: 'nw-feed-row' });

    const source = createElement('span', { className: 'nw-feed-source' });
    source.textContent = article.source?.slice(0, 12) || '—';

    const title = createElement('span', { className: 'nw-feed-title' });
    title.textContent = article.title;

    const time = createElement('span', { className: 'nw-feed-time' });
    time.textContent = formatTimeAgo(article.pubDate);

    row.appendChild(source);
    row.appendChild(title);
    row.appendChild(time);

    row.addEventListener('click', () => {
      if (article.link) window.open(article.link, '_blank', 'noopener');
    });

    container.appendChild(row);
  }
}

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
