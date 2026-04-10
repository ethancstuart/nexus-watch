import '../styles/briefs.css';
import { createElement } from '../utils/dom.ts';

/**
 * Brief archive listing — shows all historical briefs.
 * Route: /#/briefs
 */
export function renderBriefs(root: HTMLElement): void {
  root.textContent = '';

  const page = createElement('div', { className: 'briefs-page' });
  page.innerHTML = `
    <nav class="briefs-nav">
      <a href="#/" class="briefs-nav-logo">NexusWatch</a>
      <div class="briefs-nav-links">
        <a href="#/intel" class="briefs-nav-link">PLATFORM</a>
        <a href="https://brief.nexuswatch.dev" target="_blank" class="briefs-nav-link briefs-nav-subscribe">SUBSCRIBE</a>
      </div>
    </nav>

    <header class="briefs-header">
      <h1 class="briefs-title">The NexusWatch Brief</h1>
      <p class="briefs-subtitle">Daily geopolitical intelligence. 3-minute scan. What's happening, why it matters, what to watch.</p>
      <form class="briefs-subscribe-form" id="briefs-subscribe">
        <input type="email" placeholder="your@email.com" required class="briefs-email-input">
        <button type="submit" class="briefs-subscribe-btn">GET THE BRIEF FREE</button>
      </form>
      <div class="briefs-subscribe-status" id="briefs-sub-status"></div>
    </header>

    <main class="briefs-list" id="briefs-list">
      <div class="briefs-loading">Loading briefs...</div>
    </main>

    <footer class="briefs-footer">
      <span>NexusWatch Intelligence Platform</span>
      <a href="#/">Home</a>
      <a href="#/intel">Live Map</a>
    </footer>
  `;

  root.appendChild(page);

  // Subscribe handler
  const form = document.getElementById('briefs-subscribe') as HTMLFormElement;
  const status = document.getElementById('briefs-sub-status');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (form.querySelector('input') as HTMLInputElement).value;
    if (status) status.textContent = 'Subscribing...';
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'briefs-archive' }),
      });
      const data = await res.json();
      if (status) {
        status.textContent = data.success ? "✓ You're in!" : data.error || 'Failed';
        status.style.color = data.success ? '#22c55e' : '#ef4444';
      }
    } catch {
      if (status) {
        status.textContent = 'Network error';
        status.style.color = '#ef4444';
      }
    }
  });

  // Load briefs list
  const listEl = document.getElementById('briefs-list')!;
  fetch('/api/briefs')
    .then((r) => r.json())
    .then((data) => {
      // API returns { briefs: [...], count } or single brief
      const list = data.briefs || (data.brief_date ? [data] : []);
      return list as Array<Record<string, unknown>>;
    })
    .then((briefs: Array<Record<string, unknown>>) => {
      if (briefs.length === 0) {
        listEl.innerHTML = '<p class="briefs-empty">No briefs yet. The first one publishes tomorrow at 5 AM ET.</p>';
        return;
      }

      listEl.innerHTML = briefs
        .map((b) => {
          const date = String(b.date || b.brief_date || '').split('T')[0];
          const summary = String(b.preview || b.summary || '');
          // Extract Good Morning section as preview
          const gmMatch = summary.match(/Good Morning[\s\S]*?(?=##|<h[23])/i);
          const preview = gmMatch
            ? gmMatch[0]
                .replace(/<[^>]+>/g, '')
                .replace(/##.*Good Morning/i, '')
                .replace(/☕/g, '')
                .trim()
                .slice(0, 200)
            : summary.replace(/<[^>]+>/g, '').slice(0, 200);

          const dayName = new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });

          return `
            <a href="#/brief/${date}" class="briefs-card">
              <div class="briefs-card-date">${dayName}</div>
              <div class="briefs-card-preview">${preview}...</div>
              <div class="briefs-card-read">Read full brief →</div>
            </a>
          `;
        })
        .join('');
    })
    .catch(() => {
      listEl.innerHTML = '<p class="briefs-empty">Failed to load briefs. Try refreshing.</p>';
    });
}

/**
 * Individual brief page — shows one day's full brief.
 * Route: /#/brief/:date
 */
export function renderBrief(root: HTMLElement, date: string): void {
  root.textContent = '';

  const page = createElement('div', { className: 'briefs-page' });
  page.innerHTML = `
    <nav class="briefs-nav">
      <a href="#/" class="briefs-nav-logo">NexusWatch</a>
      <div class="briefs-nav-links">
        <a href="#/briefs" class="briefs-nav-link">ALL BRIEFS</a>
        <a href="#/intel" class="briefs-nav-link">PLATFORM</a>
        <a href="https://brief.nexuswatch.dev" target="_blank" class="briefs-nav-link briefs-nav-subscribe">SUBSCRIBE</a>
      </div>
    </nav>

    <article class="brief-article" id="brief-content">
      <div class="briefs-loading">Loading brief for ${date}...</div>
    </article>

    <div class="brief-bottom-cta">
      <h3>Get this in your inbox every morning</h3>
      <p>The NexusWatch Brief — 3-minute geopolitical intelligence scan, free.</p>
      <form class="briefs-subscribe-form" id="brief-subscribe">
        <input type="email" placeholder="your@email.com" required class="briefs-email-input">
        <button type="submit" class="briefs-subscribe-btn">SUBSCRIBE FREE</button>
      </form>
      <div class="briefs-subscribe-status" id="brief-sub-status"></div>
    </div>

    <footer class="briefs-footer">
      <span>NexusWatch Intelligence Platform</span>
      <a href="#/briefs">All Briefs</a>
      <a href="#/intel">Live Map</a>
    </footer>
  `;

  root.appendChild(page);

  // Subscribe handler
  const form = document.getElementById('brief-subscribe') as HTMLFormElement;
  const status = document.getElementById('brief-sub-status');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (form.querySelector('input') as HTMLInputElement).value;
    if (status) status.textContent = 'Subscribing...';
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source: 'brief-page' }),
      });
      const data = await res.json();
      if (status) {
        status.textContent = data.success ? "✓ You're in!" : data.error || 'Failed';
        status.style.color = data.success ? '#22c55e' : '#ef4444';
      }
    } catch {
      if (status) {
        status.textContent = 'Network error';
        status.style.color = '#ef4444';
      }
    }
  });

  // Load brief
  const articleEl = document.getElementById('brief-content')!;
  fetch(`/api/v1/brief?date=${date}`)
    .then((r) => {
      if (!r.ok) throw new Error('Not found');
      return r.json();
    })
    .then((data) => {
      const summary = String(data.summary || '');
      const briefDate = String(data.brief_date || date).split('T')[0];
      const dayName = new Date(briefDate + 'T12:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      let rendered: string;
      if (summary.startsWith('<')) {
        // HTML format (old briefs)
        rendered = summary;
      } else {
        // Markdown format (new briefs)
        rendered = summary
          .replace(/## (.*)/g, '<h2 class="brief-section-header">$1</h2>')
          .replace(/### (.*)/g, '<h3 class="brief-subsection">$1</h3>')
          .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
          .replace(/\n\n/g, '</p><p>')
          .replace(/\n/g, '<br>');
        rendered = `<p>${rendered}</p>`;
      }

      articleEl.innerHTML = `
        <div class="brief-date-header">
          <span class="brief-date">${dayName}</span>
          <span class="brief-badge">THE NEXUSWATCH BRIEF</span>
        </div>
        <div class="brief-body">${rendered}</div>
        <div class="brief-share">
          <button class="brief-share-btn" id="share-brief">Copy link to share</button>
        </div>
      `;

      // Share button
      document.getElementById('share-brief')?.addEventListener('click', () => {
        const url = `${window.location.origin}/#/brief/${briefDate}`;
        void navigator.clipboard.writeText(url).then(() => {
          const btn = document.getElementById('share-brief')!;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = 'Copy link to share';
          }, 2000);
        });
      });

      // Update document title for SEO/sharing
      document.title = `NexusWatch Intelligence Brief — ${briefDate}`;
    })
    .catch(() => {
      articleEl.innerHTML = `
        <div class="brief-not-found">
          <h2>Brief not found</h2>
          <p>No brief available for ${date}. <a href="#/briefs">View all briefs →</a></p>
        </div>
      `;
    });
}
