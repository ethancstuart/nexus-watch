/**
 * Proactive Intelligence Feed (/#/feed).
 *
 * Swipeable card stream of verified signals, CII movements, scenario
 * triggers, crisis alerts, and cascade activations. The "For You"
 * page of geopolitical intelligence — keeps users engaged between
 * briefs, not just waiting for the 6am email.
 */

import { createElement } from '../utils/dom.ts';
import { getCachedCII, getMonitoredCountries } from '../services/countryInstabilityIndex.ts';
import { getVerifiedSignals } from '../services/verificationEngine.ts';
import { getContradictions } from '../services/sourceDisagreement.ts';
import { detectActiveCascades } from '../services/cascadeEngine.ts';
import { isCiiWatching, toggleCiiWatch } from '../services/ciiWatchlist.ts';

type FeedCardType = 'high-cii' | 'rising-cii' | 'verified-signal' | 'contradiction' | 'cascade' | 'watchlist-alert';

interface FeedCard {
  id: string;
  type: FeedCardType;
  timestamp: number;
  /** Sort priority — higher floats to top. */
  priority: number;
  /** Optional country code this card is about. */
  countryCode?: string;
  title: string;
  body: string;
  accentColor: string;
  icon: string;
  cta?: { label: string; href: string };
}

function buildFeed(): FeedCard[] {
  const cards: FeedCard[] = [];
  const scores = getCachedCII();
  const monitored = getMonitoredCountries();
  const now = Date.now();

  // High CII countries
  for (const s of scores.filter((s) => s.score >= 70).slice(0, 8)) {
    const name = monitored.find((c) => c.code === s.countryCode)?.name || s.countryCode;
    const color = s.score >= 85 ? '#dc2626' : '#f97316';
    cards.push({
      id: `high-${s.countryCode}`,
      type: 'high-cii',
      timestamp: now,
      priority: s.score,
      countryCode: s.countryCode,
      title: `${name}: CII ${s.score}`,
      body:
        s.topSignals.length > 0
          ? s.topSignals.join(' · ')
          : `${s.confidence.toUpperCase()} confidence, ${s.evidence.totalSourceCount} sources contributing.`,
      accentColor: color,
      icon: '▲',
      cta: { label: 'View audit trail', href: `#/audit/${s.countryCode}` },
    });
  }

  // Rising-trend countries
  for (const s of scores.filter((s) => s.trend === 'rising' && s.score >= 50).slice(0, 5)) {
    const name = monitored.find((c) => c.code === s.countryCode)?.name || s.countryCode;
    cards.push({
      id: `rising-${s.countryCode}`,
      type: 'rising-cii',
      timestamp: now,
      priority: 60 + s.score / 10,
      countryCode: s.countryCode,
      title: `${name} — trajectory rising`,
      body: `CII at ${s.score}, up from previous cycle. ${s.topSignals[0] || 'Check evidence for drivers.'}`,
      accentColor: '#eab308',
      icon: '↗',
      cta: { label: 'See components', href: `#/audit/${s.countryCode}` },
    });
  }

  // Verified signals
  const signals = getVerifiedSignals();
  for (const sig of signals.slice(0, 10)) {
    const color = sig.level === 'confirmed' ? '#22c55e' : '#eab308';
    cards.push({
      id: `sig-${sig.id}`,
      type: 'verified-signal',
      timestamp: sig.detectedAt,
      priority: sig.level === 'confirmed' ? 80 : 50,
      countryCode: sig.countryCode,
      title: sig.summary.slice(0, 100),
      body: `${sig.level.toUpperCase()} by ${sig.sources.length} independent sources: ${sig.sources.map((s) => s.name).join(', ')}.`,
      accentColor: color,
      icon: sig.level === 'confirmed' ? '🛡' : '◈',
      cta: sig.countryCode ? { label: 'View country', href: `#/audit/${sig.countryCode}` } : undefined,
    });
  }

  // Contradictions (source disagreement)
  const contradictions = getContradictions();
  for (const c of contradictions.slice(0, 5)) {
    cards.push({
      id: `contra-${c.id}`,
      type: 'contradiction',
      timestamp: c.detectedAt,
      priority: 70,
      countryCode: c.countryCode,
      title: `${c.countryName} — sources disagree`,
      body: c.summary,
      accentColor: '#f97316',
      icon: '⚠',
      cta: { label: 'See both sides', href: `#/audit/${c.countryCode}` },
    });
  }

  // Active cascades
  const cascades = detectActiveCascades();
  for (const cas of cascades.slice(0, 5)) {
    cards.push({
      id: `cas-${cas.id}`,
      type: 'cascade',
      timestamp: now,
      priority: 55 + cas.intensity * 20,
      countryCode: cas.to.code,
      title: `${cas.from.name} → ${cas.to.name}`,
      body: cas.description,
      accentColor: '#a855f7',
      icon: '↯',
      cta: { label: 'Inspect receiving country', href: `#/audit/${cas.to.code}` },
    });
  }

  // Sort by priority, then timestamp
  cards.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.timestamp - a.timestamp;
  });

  return cards;
}

export function renderFeedPage(root: HTMLElement): void {
  root.innerHTML = '';
  root.className = 'nw-feed-page';

  const header = createElement('header', { className: 'nw-feed-header' });
  header.innerHTML = `
    <a href="#/intel" class="nw-feed-back">← Back to Intel Map</a>
    <h1>Intelligence Feed</h1>
    <p class="nw-feed-subtitle">
      Live stream of verified signals, CII movements, cascading risk, and source contradictions.
      Reordered every 5 minutes. Not a brief — this is real-time.
    </p>
  `;
  root.appendChild(header);

  const filters = createElement('div', { className: 'nw-feed-filters' });
  filters.innerHTML = `
    <button class="nw-feed-filter active" data-filter="all">All</button>
    <button class="nw-feed-filter" data-filter="high-cii">High CII</button>
    <button class="nw-feed-filter" data-filter="rising-cii">Rising</button>
    <button class="nw-feed-filter" data-filter="verified-signal">Verified</button>
    <button class="nw-feed-filter" data-filter="contradiction">Contested</button>
    <button class="nw-feed-filter" data-filter="cascade">Cascades</button>
    <button class="nw-feed-filter" data-filter="watchlist">My Watchlist</button>
  `;
  root.appendChild(filters);

  const stream = createElement('div', { className: 'nw-feed-stream' });
  root.appendChild(stream);

  let currentFilter: string = 'all';

  function render(): void {
    const cards = buildFeed();
    const filtered =
      currentFilter === 'all'
        ? cards
        : currentFilter === 'watchlist'
          ? cards.filter((c) => c.countryCode && isCiiWatching(c.countryCode))
          : cards.filter((c) => c.type === currentFilter);

    stream.innerHTML = '';
    if (filtered.length === 0) {
      stream.innerHTML = `
        <div class="nw-feed-empty">
          <p>No cards match this filter right now.</p>
          ${currentFilter === 'watchlist' ? '<p style="margin-top:10px;"><a href="#/watchlist">Build your watchlist →</a></p>' : ''}
        </div>
      `;
      return;
    }

    for (const card of filtered) {
      const cardEl = createElement('article', { className: 'nw-feed-card' });
      cardEl.style.borderLeftColor = card.accentColor;
      const watching = card.countryCode && isCiiWatching(card.countryCode);

      cardEl.innerHTML = `
        <div class="nw-feed-card-header">
          <span class="nw-feed-card-icon" style="color:${card.accentColor};">${card.icon}</span>
          <div class="nw-feed-card-meta">
            <span class="nw-feed-card-type">${card.type.replace(/-/g, ' ').toUpperCase()}</span>
            ${card.countryCode ? `<span class="nw-feed-card-country">${card.countryCode}</span>` : ''}
          </div>
          ${
            card.countryCode
              ? `<button class="nw-feed-watch-btn ${watching ? 'watching' : ''}" data-code="${card.countryCode}">${watching ? '★ Watching' : '☆ Watch'}</button>`
              : ''
          }
        </div>
        <h3 class="nw-feed-card-title">${escapeHtml(card.title)}</h3>
        <p class="nw-feed-card-body">${escapeHtml(card.body)}</p>
        ${card.cta ? `<a href="${card.cta.href}" class="nw-feed-card-cta">${card.cta.label} →</a>` : ''}
      `;
      stream.appendChild(cardEl);
    }

    // Wire watch toggles
    stream.querySelectorAll('.nw-feed-watch-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = (btn as HTMLElement).dataset.code!;
        toggleCiiWatch(code);
        render();
      });
    });
  }

  filters.querySelectorAll('.nw-feed-filter').forEach((btn) => {
    btn.addEventListener('click', () => {
      filters.querySelectorAll('.nw-feed-filter').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = (btn as HTMLElement).dataset.filter!;
      render();
    });
  });

  render();

  // Refresh every 5 minutes
  setInterval(render, 5 * 60 * 1000);
  document.addEventListener('nw:cii-watchlist-changed', render);
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
