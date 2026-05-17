/**
 * /#/audio — NexusWatch FM listing page.
 *
 * Lists the last 50 daily audio briefs with waveform players, plus
 * the "Call the Analyst" voice agent at the bottom of the page.
 *
 * Subscribe links to /podcast.xml so users can drop the feed into
 * Apple Podcasts, Spotify, Pocket Casts, Overcast, Castro.
 *
 * 2026-05 tier-up Phase 4.
 */

import { createElement } from '../utils/dom.ts';
import { setPageSeo, PAGE_SEO } from '../utils/seo.ts';
import { WaveformPlayer, injectWaveformStyles } from '../ui/waveformPlayer.ts';
import { CallAnalyst, injectCallAnalystStyles } from '../voice/callAnalyst.ts';

interface AudioBrief {
  brief_date: string;
  duration_sec: number | null;
  bytes: number | null;
  blob_url: string;
  script: string | null;
}

export async function renderAudioPage(root: HTMLElement): Promise<void> {
  setPageSeo(PAGE_SEO.audio);
  root.innerHTML = '';
  root.className = 'nw-audio-page';
  injectStyles();
  injectWaveformStyles();
  injectCallAnalystStyles();

  const wrap = createElement('div', { className: 'nw-audio-wrap' });

  // Nav
  const nav = createElement('nav', { className: 'nw-audio-nav' });
  nav.setAttribute('aria-label', 'Primary');
  nav.innerHTML = `
    <a href="#/intel" class="nw-audio-back">← Intel Map</a>
    <div class="nw-audio-nav-links">
      <a href="#/briefs">Text Briefs</a>
      <a href="#/mcp">MCP</a>
      <a href="#/accuracy">Accuracy</a>
    </div>
  `;
  wrap.appendChild(nav);

  // Hero
  const hero = createElement('header', { className: 'nw-audio-hero' });
  hero.innerHTML = `
    <div class="nw-audio-eyebrow">NexusWatch FM</div>
    <h1 class="nw-audio-title">Daily geopolitical brief.<br/>Ninety seconds.</h1>
    <p class="nw-audio-blurb">
      Every morning at 10:30 UTC, the Council writes a podcast script and three AI hosts read it
      aloud. Subscribe in your podcast app, or call the analyst directly with the voice agent below.
    </p>
    <div class="nw-audio-subscribe">
      <a class="nw-audio-sub-btn" href="/podcast.xml" target="_blank" rel="noopener">RSS feed</a>
      <a class="nw-audio-sub-btn" href="https://podcasts.apple.com/" target="_blank" rel="noopener">Apple Podcasts</a>
      <a class="nw-audio-sub-btn" href="https://open.spotify.com/" target="_blank" rel="noopener">Spotify</a>
      <span class="nw-audio-sub-note">(paste the feed URL into your app of choice)</span>
    </div>
  `;
  wrap.appendChild(hero);

  // Briefs list mount
  const listSection = createElement('section', { className: 'nw-audio-section' });
  listSection.innerHTML = `
    <h2 class="nw-audio-section-title">Recent briefs</h2>
    <div class="nw-audio-list" data-list><div class="nw-audio-loading">Loading episodes…</div></div>
  `;
  wrap.appendChild(listSection);

  // Voice agent
  const callSection = createElement('section', { className: 'nw-audio-section' });
  callSection.innerHTML = `<h2 class="nw-audio-section-title">Call the Analyst</h2>`;
  const callMount = createElement('div', { className: 'nw-audio-call-mount' });
  callSection.appendChild(callMount);
  wrap.appendChild(callSection);

  root.appendChild(wrap);

  // Mount voice agent
  new CallAnalyst(callMount);

  // Fetch briefs
  const listMount = listSection.querySelector<HTMLElement>('[data-list]')!;
  try {
    const res = await fetch('/api/audio/list');
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { briefs: AudioBrief[] };
    if (!data.briefs || data.briefs.length === 0) {
      listMount.innerHTML = `<div class="nw-audio-empty">No briefs yet. The first will be generated tomorrow morning.</div>`;
      return;
    }
    listMount.innerHTML = '';
    for (const b of data.briefs) {
      const card = createElement('div', { className: 'nw-audio-card' });
      const title = new Date(b.brief_date).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
      });
      const playerMount = document.createElement('div');
      card.appendChild(playerMount);
      listMount.appendChild(card);
      new WaveformPlayer(playerMount, {
        url: b.blob_url,
        title,
        duration: b.duration_sec ?? undefined,
      });
      if (b.script) {
        const excerpt = document.createElement('div');
        excerpt.className = 'nw-audio-excerpt';
        const cleaned = b.script
          .replace(/\[HOST_[A-C]\]\s*/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        excerpt.textContent = cleaned.slice(0, 240) + (cleaned.length > 240 ? '…' : '');
        card.appendChild(excerpt);
      }
    }
  } catch (e) {
    listMount.innerHTML = `<div class="nw-audio-empty">Failed to load episodes: ${e instanceof Error ? e.message : 'unknown'}</div>`;
  }
}

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  stylesInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    .nw-audio-page {
      background: var(--color-surface, #050505);
      color: var(--color-text, #e0e0e0);
      min-height: 100vh;
    }
    .nw-audio-wrap { max-width: 880px; margin: 0 auto; padding: 1.5rem 1.5rem 4rem; }
    .nw-audio-nav {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid var(--color-border, #2a2a2a);
      margin-bottom: 2rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.75rem;
    }
    .nw-audio-back, .nw-audio-nav-links a {
      color: var(--color-text-muted, #888); text-decoration: none;
    }
    .nw-audio-nav-links a { margin-left: 1.25rem; }
    .nw-audio-back:hover, .nw-audio-nav-links a:hover { color: var(--color-accent, #ff6600); }

    .nw-audio-hero { margin-bottom: 2.5rem; }
    .nw-audio-eyebrow {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem; letter-spacing: 0.18em; text-transform: uppercase;
      color: var(--color-accent, #ff6600); margin-bottom: 0.5rem;
    }
    .nw-audio-title {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: clamp(2rem, 5vw, 3.2rem); line-height: 1.05;
      margin: 0 0 0.85rem; color: var(--color-text, #f4f4f4);
      letter-spacing: -0.01em;
    }
    .nw-audio-blurb {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 1.05rem; line-height: 1.6;
      color: var(--color-text, #c8c8c8); max-width: 62ch; margin: 0 0 1.25rem;
    }
    .nw-audio-subscribe {
      display: flex; flex-wrap: wrap; align-items: center; gap: 0.65rem;
    }
    .nw-audio-sub-btn {
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      color: var(--color-text, #e0e0e0);
      padding: 0.5rem 0.95rem;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      letter-spacing: 0.05em;
      border-radius: 3px;
      text-decoration: none;
      transition: border-color 0.15s, color 0.15s;
    }
    .nw-audio-sub-btn:hover {
      border-color: var(--color-accent, #ff6600);
      color: var(--color-accent, #ff6600);
    }
    .nw-audio-sub-note {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.7rem;
      color: var(--color-text-muted, #666);
      font-style: italic;
    }

    .nw-audio-section { margin-top: 2.5rem; }
    .nw-audio-section-title {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.8rem; letter-spacing: 0.16em; text-transform: uppercase;
      color: var(--color-accent, #ff6600); margin: 0 0 0.85rem;
    }

    .nw-audio-list {
      display: flex; flex-direction: column; gap: 1rem;
    }
    .nw-audio-card {
      display: flex; flex-direction: column; gap: 0.55rem;
    }
    .nw-audio-excerpt {
      font-family: 'Source Serif Pro', Georgia, serif;
      font-size: 0.92rem;
      line-height: 1.55;
      color: var(--color-text-muted, #aaa);
      padding-left: 1rem;
      border-left: 1px solid var(--color-border, #2a2a2a);
    }
    .nw-audio-loading, .nw-audio-empty {
      font-family: 'JetBrains Mono', monospace;
      color: var(--color-text-muted, #888);
      padding: 2rem;
      text-align: center;
      background: var(--color-surface-2, #0f0f0f);
      border: 1px solid var(--color-border, #2a2a2a);
      border-radius: 4px;
    }
  `;
  document.head.appendChild(style);
}
