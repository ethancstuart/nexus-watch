import '../styles/briefs-dossier.css';
import { createElement } from '../utils/dom.ts';

/**
 * Brief archive pages — Light Intel Dossier styling (Track A.10).
 *
 * Site-facing counterpart to the email template rendered by
 * api/cron/daily-brief.ts. Shares the palette and typography tokens via
 * src/styles/briefs-dossier.css, which mirrors src/styles/email-tokens.ts.
 *
 * Routes:
 *   /#/briefs         → renderBriefs(): archive listing, newest first
 *   /#/brief/:date    → renderBrief():  single-day full brief
 *
 * The /brief/:date clean URL (without the hash) is served by the
 * api/brief/og.ts endpoint, which returns an HTML page with proper
 * Open Graph meta tags for social crawlers, then bounces human
 * visitors to this SPA via a meta-refresh to #/brief/:date.
 */

interface BriefListItem {
  date?: string;
  brief_date?: string;
  preview?: string;
  summary?: string;
  generatedAt?: string;
}

interface BriefDetailResponse {
  brief_date: string;
  summary: string | null;
  content?: unknown;
  generated_at: string | null;
}

// ---------------------------------------------------------------------------
// Shared markdown → dossier-HTML renderer (browser variant)
// ---------------------------------------------------------------------------
//
// The authoritative email renderer lives in api/cron/daily-brief.ts as
// renderDossierEmail(). That version produces inline styles because email
// clients strip <style> tags. This browser variant produces class-based
// HTML consumed by src/styles/briefs-dossier.css. The two MUST stay in
// aesthetic lockstep — same palette, same typography, same module
// ordering — otherwise the "email vs archive" experience drifts.

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

function renderInline(text: string): string {
  let out = escapeHtml(text);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return out;
}

/**
 * Render the single-brief body from the Sonnet markdown the cron stores
 * in `daily_briefs.content.briefText`. Falls back to the legacy `summary`
 * HTML column for pre-A.5 briefs that never had markdown text.
 */
function renderBriefBody(briefText: string, dateForImage: string): string {
  // Split on `## ` section boundaries. Each block becomes a <section>
  // with the emoji title as a heading, plus a conditional Map of the
  // Day image for the Map section.
  const fragments = briefText.split(/\n?^## /m).filter(Boolean);
  const sections: Array<{ emoji: string; title: string; body: string }> = [];
  for (const frag of fragments) {
    const nl = frag.indexOf('\n');
    const headerLine = nl === -1 ? frag : frag.slice(0, nl);
    const body = nl === -1 ? '' : frag.slice(nl + 1).trim();
    const space = headerLine.indexOf(' ');
    sections.push({
      emoji: space === -1 ? '' : headerLine.slice(0, space).trim(),
      title: (space === -1 ? headerLine : headerLine.slice(space + 1)).trim(),
      body,
    });
  }

  if (sections.length === 0) {
    // Non-markdown input (legacy HTML summary) — pass through with a
    // minimal wrapper. Dangerous HTML was stored by our own code so
    // it's trusted, but we still wrap it in a dossier-body container
    // so the styles apply.
    return briefText;
  }

  return sections
    .map((section) => {
      const isMapOfTheDay = /map of the day/i.test(section.title);
      const img = isMapOfTheDay
        ? `<img class="dossier-map-image" src="/api/brief/screenshot?date=${encodeURIComponent(dateForImage)}&size=email" alt="Map of the Day — ${escapeHtml(dateForImage)}" loading="lazy" />`
        : '';
      return `<section>
  <h2>${section.emoji ? escapeHtml(section.emoji) + ' ' : ''}${escapeHtml(section.title)}</h2>
  ${img}
  ${renderBlocks(section.body)}
</section>`;
    })
    .join('\n');
}

function renderBlocks(body: string): string {
  const blocks = body.split(/\n\s*\n/);
  const out: string[] = [];
  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    // Numbered story ("1. **Headline** — body").
    const numberedMatch = block.match(/^(\d+)\.\s+(.*)$/s);
    if (numberedMatch) {
      out.push(`<p><strong>${numberedMatch[1]}.</strong> ${renderInline(numberedMatch[2])}</p>`);
      continue;
    }

    // Bullet list.
    if (/^[-*]\s/.test(block)) {
      const items = block
        .split(/\n/)
        .filter((l) => /^[-*]\s/.test(l.trim()))
        .map((l) => l.trim().replace(/^[-*]\s+/, ''));
      out.push(`<ul>${items.map((i) => `<li>${renderInline(i)}</li>`).join('')}</ul>`);
      continue;
    }

    // Why it matters callout.
    const whyMatch = block.match(/^\*\*Why it matters[:\s*]+\*\*\s*(.*)$/is);
    if (whyMatch) {
      out.push(
        `<div class="dossier-callout"><span class="dossier-callout-label">Why it matters</span><p>${renderInline(whyMatch[1])}</p></div>`,
      );
      continue;
    }

    out.push(`<p>${renderInline(block)}</p>`);
  }
  return out.join('\n');
}

// ---------------------------------------------------------------------------
// Archive listing page — /#/briefs
// ---------------------------------------------------------------------------

export function renderBriefs(root: HTMLElement): void {
  root.textContent = '';

  document.title = 'The NexusWatch Brief — Daily Geopolitical Intelligence';
  const descMeta = document.querySelector('meta[name="description"]');
  if (descMeta) {
    descMeta.setAttribute(
      'content',
      'Daily geopolitical intelligence from NexusWatch. 3-minute scans of what changed overnight and what to watch.',
    );
  }

  const page = createElement('div', { className: 'briefs-dossier' });
  page.innerHTML = `
    <nav class="dossier-nav">
      <a href="#/" class="dossier-nav-logo">NexusWatch</a>
      <div class="dossier-nav-links">
        <a href="#/intel" class="dossier-nav-link">PLATFORM</a>
        <a href="#/briefs" class="dossier-nav-link">BRIEFS</a>
        <a href="https://brief.nexuswatch.dev" target="_blank" rel="noopener" class="dossier-nav-link dossier-nav-subscribe">SUBSCRIBE</a>
      </div>
    </nav>

    <header class="dossier-header">
      <div class="dossier-kicker">SITUATION BRIEF · DAILY</div>
      <h1 class="dossier-title">The NexusWatch Brief</h1>
      <p class="dossier-subtitle">Daily geopolitical intelligence. Three-minute scans of what changed overnight, why it matters, and what to watch.</p>
      <div class="dossier-divider"></div>
      <form class="dossier-subscribe" id="briefs-subscribe">
        <input type="email" placeholder="your@email.com" required class="dossier-email">
        <button type="submit" class="dossier-subscribe-btn">Get it free</button>
      </form>
      <div class="dossier-subscribe-status" id="briefs-sub-status" role="status" aria-live="polite"></div>
    </header>

    <main class="dossier-list" id="briefs-list">
      <div class="dossier-loading">Loading briefs…</div>
    </main>

    <footer class="dossier-footer">
      <a href="#/">Home</a>
      <a href="#/intel">Live Map</a>
      <a href="#/methodology">Methodology</a>
      <a href="mailto:hello@nexuswatch.dev">hello@nexuswatch.dev</a>
    </footer>
  `;

  root.appendChild(page);

  wireSubscribe('briefs-subscribe', 'briefs-sub-status', 'briefs-archive');

  const listEl = document.getElementById('briefs-list');
  if (!listEl) return;
  void fetch('/api/briefs')
    .then((r) => r.json())
    .then((data: { briefs?: BriefListItem[] }) => {
      const briefs: BriefListItem[] = data.briefs ?? [];
      if (briefs.length === 0) {
        listEl.innerHTML = `<p class="dossier-empty">No briefs yet. The first one publishes tomorrow at 5 AM ET.</p>`;
        return;
      }
      listEl.innerHTML = briefs
        .map((b) => {
          const date = String(b.date || b.brief_date || '').split('T')[0];
          const summary = String(b.preview || b.summary || '');
          const previewText = summary
            .replace(/<[^>]+>/g, '')
            .replace(/^##\s*[^\n]*\n+/, '')
            .trim()
            .slice(0, 240);
          const dayName = new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });
          return `
            <a href="#/brief/${encodeURIComponent(date)}" class="dossier-card">
              <div class="dossier-card-date">${escapeHtml(dayName)}</div>
              <h2 class="dossier-card-headline">Situation Brief · ${escapeHtml(date)}</h2>
              <p class="dossier-card-preview">${escapeHtml(previewText)}…</p>
              <div class="dossier-card-read">Read full brief →</div>
            </a>
          `;
        })
        .join('');
    })
    .catch(() => {
      listEl.innerHTML = `<p class="dossier-empty">Failed to load briefs. Try refreshing.</p>`;
    });
}

// ---------------------------------------------------------------------------
// Single-brief article page — /#/brief/:date
// ---------------------------------------------------------------------------

export function renderBrief(root: HTMLElement, date: string): void {
  root.textContent = '';

  const page = createElement('div', { className: 'briefs-dossier' });
  page.innerHTML = `
    <nav class="dossier-nav">
      <a href="#/" class="dossier-nav-logo">NexusWatch</a>
      <div class="dossier-nav-links">
        <a href="#/briefs" class="dossier-nav-link">ALL BRIEFS</a>
        <a href="#/intel" class="dossier-nav-link">PLATFORM</a>
        <a href="https://brief.nexuswatch.dev" target="_blank" rel="noopener" class="dossier-nav-link dossier-nav-subscribe">SUBSCRIBE</a>
      </div>
    </nav>

    <article class="dossier-article" id="brief-content">
      <div class="dossier-loading">Loading brief for ${escapeHtml(date)}…</div>
    </article>

    <section class="dossier-bottom-cta">
      <h3>Get this in your inbox every morning</h3>
      <p>The NexusWatch Brief — three-minute geopolitical intelligence scan, free.</p>
      <form class="dossier-subscribe" id="brief-subscribe">
        <input type="email" placeholder="your@email.com" required class="dossier-email">
        <button type="submit" class="dossier-subscribe-btn">Subscribe free</button>
      </form>
      <div class="dossier-subscribe-status" id="brief-sub-status" role="status" aria-live="polite"></div>
    </section>

    <footer class="dossier-footer">
      <a href="#/briefs">All Briefs</a>
      <a href="#/intel">Live Map</a>
      <a href="#/methodology">Methodology</a>
      <a href="mailto:hello@nexuswatch.dev">hello@nexuswatch.dev</a>
    </footer>
  `;

  root.appendChild(page);

  wireSubscribe('brief-subscribe', 'brief-sub-status', 'brief-page');

  const articleEl = document.getElementById('brief-content');
  if (!articleEl) return;

  void fetch(`/api/v1/brief?date=${encodeURIComponent(date)}`)
    .then((r) => {
      if (!r.ok) throw new Error('Not found');
      return r.json() as Promise<BriefDetailResponse>;
    })
    .then((data) => {
      const briefDate = String(data.brief_date || date).split('T')[0];
      const dayName = new Date(`${briefDate}T12:00:00Z`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      // Prefer briefText (markdown) from content column; fall back to
      // the legacy HTML summary for pre-A.5 historical briefs.
      let content: { briefText?: string } = {};
      if (typeof data.content === 'string') {
        try {
          content = JSON.parse(data.content) as { briefText?: string };
        } catch {
          /* ignore */
        }
      } else if (data.content && typeof data.content === 'object') {
        content = data.content as { briefText?: string };
      }

      const body = content.briefText
        ? renderBriefBody(content.briefText, briefDate)
        : (data.summary ?? '<p>Brief content unavailable.</p>');

      articleEl.innerHTML = `
        <div class="dossier-kicker">SITUATION BRIEF</div>
        <h1 class="dossier-title">NexusWatch · ${escapeHtml(briefDate)}</h1>
        <div class="dossier-article-date">${escapeHtml(dayName)}</div>
        <div class="dossier-body">${body}</div>
        <div class="dossier-share">
          <button class="dossier-share-btn" id="share-brief" type="button">Copy share link</button>
        </div>
      `;

      const shareBtn = document.getElementById('share-brief');
      shareBtn?.addEventListener('click', () => {
        const url = `${window.location.origin}/brief/${briefDate}`;
        void navigator.clipboard.writeText(url).then(() => {
          shareBtn.textContent = 'Copied!';
          setTimeout(() => {
            shareBtn.textContent = 'Copy share link';
          }, 2000);
        });
      });

      // SEO — update <title> and <meta description> for this brief.
      document.title = `NexusWatch Situation Brief · ${briefDate}`;
      const descMeta = document.querySelector('meta[name="description"]');
      if (descMeta) {
        descMeta.setAttribute(
          'content',
          `NexusWatch geopolitical intelligence brief for ${dayName}. Read the full situation report.`,
        );
      }
      // og:image points at our screenshot endpoint so social link
      // previews get a real map. The clean /brief/:date URL (served
      // by api/brief/og.ts) is the preferred share surface for
      // crawlers, but this in-SPA update helps clients that re-crawl
      // on hash changes.
      upsertMeta('property', 'og:title', `NexusWatch Situation Brief · ${briefDate}`);
      upsertMeta('property', 'og:description', `Daily geopolitical intelligence from NexusWatch — ${dayName}.`);
      upsertMeta('property', 'og:image', `/api/brief/screenshot?date=${encodeURIComponent(briefDate)}&size=og`);
      upsertMeta('property', 'og:url', `https://nexuswatch.dev/brief/${briefDate}`);
      upsertMeta('property', 'og:type', 'article');
    })
    .catch(() => {
      articleEl.innerHTML = `
        <div class="dossier-not-found">
          <h2>Brief not found</h2>
          <p>No brief available for ${escapeHtml(date)}. <a href="#/briefs">View all briefs →</a></p>
        </div>
      `;
    });
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function wireSubscribe(formId: string, statusId: string, source: string): void {
  const form = document.getElementById(formId) as HTMLFormElement | null;
  const statusEl = document.getElementById(statusId);
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input');
    const email = input instanceof HTMLInputElement ? input.value : '';
    if (statusEl) {
      statusEl.textContent = 'Subscribing…';
      statusEl.style.color = '#6B7280';
    }
    try {
      const res = await fetch('/api/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, source }),
      });
      const data = (await res.json()) as { success?: boolean; error?: string };
      if (statusEl) {
        statusEl.textContent = data.success
          ? "✓ You're in. First brief arrives tomorrow morning."
          : (data.error ?? 'Failed');
        statusEl.style.color = data.success ? '#1F7A4C' : '#B8341C';
      }
    } catch {
      if (statusEl) {
        statusEl.textContent = 'Network error — try again.';
        statusEl.style.color = '#B8341C';
      }
    }
  });
}

function upsertMeta(attr: 'name' | 'property', key: string, value: string): void {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}
