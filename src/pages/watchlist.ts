/**
 * Personalized Watchlist Page (/#/watchlist).
 *
 * User's saved countries, prioritized and enriched with live CII,
 * trends, and alerts. The "my home" page for returning users.
 */

import { createElement } from '../utils/dom.ts';
import { getCiiWatchlist, addCiiWatch, removeCiiWatch, updateCiiWatch } from '../services/ciiWatchlist.ts';
import { getCachedCII, getMonitoredCountries } from '../services/countryInstabilityIndex.ts';
import { getCountryNote, setCountryNote } from '../services/countryNotes.ts';

export function renderWatchlistPage(root: HTMLElement): void {
  root.innerHTML = '';
  root.className = 'nw-watchlist-page';

  const header = createElement('header', { className: 'nw-watchlist-header' });
  header.innerHTML = `
    <a href="#/intel" class="nw-watchlist-back">← Back to Intel Map</a>
    <h1>My Watchlist</h1>
    <p class="nw-watchlist-subtitle">
      Countries you follow. Personalized CII snapshots, trend indicators, and
      alert thresholds. Stored locally in your browser.
    </p>
  `;
  root.appendChild(header);

  // Add country form
  const adder = createElement('div', { className: 'nw-watchlist-adder' });
  const monitored = getMonitoredCountries();
  adder.innerHTML = `
    <select class="nw-watchlist-select">
      <option value="">Pick a country to add...</option>
      ${monitored
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => `<option value="${c.code}">${c.name} (${c.code}) — ${c.tier}</option>`)
        .join('')}
    </select>
    <button class="nw-watchlist-add-btn">Add to Watchlist</button>
  `;
  root.appendChild(adder);

  const content = createElement('div', { className: 'nw-watchlist-content' });
  root.appendChild(content);

  const select = adder.querySelector('.nw-watchlist-select') as HTMLSelectElement;
  const addBtn = adder.querySelector('.nw-watchlist-add-btn') as HTMLButtonElement;
  addBtn.addEventListener('click', () => {
    const code = select.value;
    if (!code) return;
    addCiiWatch(code);
    select.value = '';
    render();
  });

  function render(): void {
    content.innerHTML = '';
    const list = getCiiWatchlist();

    if (list.length === 0) {
      const empty = createElement('div', { className: 'nw-watchlist-empty' });
      empty.innerHTML = `
        <h3>No countries watched yet</h3>
        <p>Add countries above to start building your personalized dashboard.</p>
        <p style="margin-top:14px;font-size:12px;">
          Quick pick:
          <button class="nw-wl-quick" data-code="UA">+ Ukraine</button>
          <button class="nw-wl-quick" data-code="IL">+ Israel</button>
          <button class="nw-wl-quick" data-code="TW">+ Taiwan</button>
          <button class="nw-wl-quick" data-code="IR">+ Iran</button>
          <button class="nw-wl-quick" data-code="RU">+ Russia</button>
          <button class="nw-wl-quick" data-code="CN">+ China</button>
          <button class="nw-wl-quick" data-code="SD">+ Sudan</button>
        </p>
      `;
      content.appendChild(empty);
      empty.querySelectorAll('.nw-wl-quick').forEach((b) => {
        b.addEventListener('click', () => {
          addCiiWatch((b as HTMLElement).dataset.code!);
          render();
        });
      });
      return;
    }

    // Summary stats
    const scores = getCachedCII();
    const watchedScores = list
      .map((w) => scores.find((s) => s.countryCode === w.countryCode))
      .filter(Boolean) as ReturnType<typeof getCachedCII>;
    const avgCii =
      watchedScores.length > 0
        ? Math.round(watchedScores.reduce((s, sc) => s + sc.score, 0) / watchedScores.length)
        : 0;
    const elevated = watchedScores.filter((s) => s.score >= 60).length;
    const rising = watchedScores.filter((s) => s.trend === 'rising').length;

    const stats = createElement('div', { className: 'nw-watchlist-stats' });
    stats.innerHTML = `
      <div class="nw-watchlist-stat">
        <div class="nw-watchlist-stat-num">${list.length}</div>
        <div class="nw-watchlist-stat-label">WATCHING</div>
      </div>
      <div class="nw-watchlist-stat">
        <div class="nw-watchlist-stat-num">${avgCii}</div>
        <div class="nw-watchlist-stat-label">AVG CII</div>
      </div>
      <div class="nw-watchlist-stat">
        <div class="nw-watchlist-stat-num" style="color:${elevated > 0 ? '#dc2626' : '#22c55e'}">${elevated}</div>
        <div class="nw-watchlist-stat-label">ELEVATED</div>
      </div>
      <div class="nw-watchlist-stat">
        <div class="nw-watchlist-stat-num" style="color:${rising > 0 ? '#dc2626' : '#888'}">${rising}</div>
        <div class="nw-watchlist-stat-label">RISING</div>
      </div>
    `;
    content.appendChild(stats);

    // Country cards
    const grid = createElement('div', { className: 'nw-watchlist-grid' });
    for (const item of list) {
      const score = scores.find((s) => s.countryCode === item.countryCode);
      const meta = monitored.find((c) => c.code === item.countryCode);
      const name = meta?.name || item.countryCode;

      const card = createElement('div', { className: 'nw-watchlist-card' });
      const ciiScore = score?.score ?? 0;
      const color = ciiScore >= 75 ? '#dc2626' : ciiScore >= 50 ? '#f97316' : ciiScore >= 25 ? '#eab308' : '#22c55e';
      const trendArrow = score?.trend === 'rising' ? '↑' : score?.trend === 'falling' ? '↓' : '→';
      const trendColor = score?.trend === 'rising' ? '#dc2626' : score?.trend === 'falling' ? '#22c55e' : '#888';

      card.innerHTML = `
        <div class="nw-watchlist-card-header">
          <div class="nw-watchlist-card-title">${name}</div>
          <button class="nw-watchlist-remove" data-code="${item.countryCode}" title="Remove">✕</button>
        </div>
        <div class="nw-watchlist-card-score" style="color:${color}">${ciiScore}</div>
        <div class="nw-watchlist-card-trend" style="color:${trendColor}">${trendArrow} ${score?.trend ?? 'stable'}</div>
        <div class="nw-watchlist-card-conf">${score?.confidence?.toUpperCase() ?? 'NO DATA'} confidence</div>
        ${
          score && score.topSignals.length > 0
            ? `<div class="nw-watchlist-card-signals">
                ${score.topSignals
                  .slice(0, 2)
                  .map((s) => `<div>▸ ${s}</div>`)
                  .join('')}
              </div>`
            : ''
        }
        <div class="nw-watchlist-card-threshold">
          <label>Alert when CII ≥</label>
          <input type="number" min="0" max="100" value="${item.alertThreshold ?? ''}" placeholder="--" data-code="${item.countryCode}" class="nw-watchlist-threshold-input">
        </div>
        <div class="nw-watchlist-card-notes">
          <label>My notes</label>
          <textarea class="nw-watchlist-notes-input" data-code="${item.countryCode}" rows="2" placeholder="Your private annotations...">${escapeHtml(getCountryNote(item.countryCode)?.text ?? '')}</textarea>
        </div>
        <div class="nw-watchlist-card-actions">
          <a href="#/audit/${item.countryCode}" class="nw-watchlist-link">Audit</a>
          <a href="#/brief-country/${item.countryCode}" class="nw-watchlist-link">Brief</a>
        </div>
      `;
      grid.appendChild(card);
    }
    content.appendChild(grid);

    // Wire removes + threshold updates
    grid.querySelectorAll('.nw-watchlist-remove').forEach((btn) => {
      btn.addEventListener('click', () => {
        removeCiiWatch((btn as HTMLElement).dataset.code!);
        render();
      });
    });
    grid.querySelectorAll('.nw-watchlist-threshold-input').forEach((inp) => {
      inp.addEventListener('change', () => {
        const el = inp as HTMLInputElement;
        const code = el.dataset.code!;
        const val = parseInt(el.value, 10);
        updateCiiWatch(code, { alertThreshold: isNaN(val) ? undefined : val });
      });
    });
    // Debounced save on notes textarea
    grid.querySelectorAll('.nw-watchlist-notes-input').forEach((ta) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      ta.addEventListener('input', () => {
        const el = ta as HTMLTextAreaElement;
        const code = el.dataset.code!;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          setCountryNote(code, el.value);
        }, 500);
      });
    });
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

  render();

  // Re-render on external watchlist changes
  document.addEventListener('nw:cii-watchlist-changed', render);
}
