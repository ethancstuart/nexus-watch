import { createElement } from '../../utils/dom.ts';
import { getCachedScores, scoreToLabel } from '../../services/countryIndex.ts';
import type { CountryIntelScore } from '../../types/index.ts';

export function createCountryPanel(onSelectCountry: (code: string, lat: number, lon: number) => void): HTMLElement {
  const wrapper = createElement('div', { className: 'country-panel' });
  wrapper.classList.add('country-panel-hidden');

  const header = createElement('div', { className: 'country-panel-header' });
  const title = createElement('h3', { className: 'country-panel-title', textContent: 'COUNTRY INDEX' });
  const closeBtn = createElement('button', { className: 'country-panel-close', textContent: '✕' });
  closeBtn.addEventListener('click', () => wrapper.classList.add('country-panel-hidden'));
  header.appendChild(title);
  header.appendChild(closeBtn);

  const content = createElement('div', { className: 'country-panel-content' });
  const detail = createElement('div', { className: 'country-panel-detail' });
  detail.style.display = 'none';

  const list = createElement('div', { className: 'country-panel-list' });

  wrapper.appendChild(header);
  wrapper.appendChild(content);
  content.appendChild(detail);
  content.appendChild(list);

  // Toggle button
  const toggleBtn = createElement('button', { className: 'country-panel-toggle' });
  toggleBtn.innerHTML = '🌐 <span>Index</span>';
  toggleBtn.addEventListener('click', () => {
    wrapper.classList.toggle('country-panel-hidden');
    if (!wrapper.classList.contains('country-panel-hidden')) {
      renderList();
    }
  });
  wrapper.appendChild(toggleBtn);

  function renderList() {
    list.textContent = '';
    const scores = getCachedScores();

    if (scores.length === 0) {
      list.appendChild(createElement('div', { className: 'country-panel-empty', textContent: 'Loading data...' }));
      return;
    }

    for (const score of scores) {
      const row = createElement('div', { className: 'country-row' });
      row.addEventListener('click', () => {
        showDetail(score);
        // Find country coords from the scores data
        const COORDS: Record<string, [number, number]> = {
          US: [39.8, -98.5],
          RU: [61.5, 105.3],
          CN: [35.9, 104.2],
          UA: [48.4, 31.2],
          IL: [31.0, 34.9],
          IR: [32.4, 53.7],
          IN: [20.6, 78.9],
          GB: [54.0, -2.0],
          FR: [46.2, 2.2],
          DE: [51.2, 10.4],
          JP: [36.2, 138.3],
          BR: [-14.2, -51.9],
          TR: [38.9, 35.2],
          SA: [23.9, 45.1],
          EG: [26.8, 30.8],
          PK: [30.4, 69.3],
          NG: [9.1, 8.7],
          MX: [23.6, -102.6],
          KR: [35.9, 127.8],
          AU: [-25.3, 133.8],
          SY: [34.8, 38.9],
          AF: [33.9, 67.7],
          IQ: [33.2, 43.7],
        };
        const coords = COORDS[score.code];
        if (coords) onSelectCountry(score.code, coords[0], coords[1]);
      });

      const { label, color } = scoreToLabel(score.score);

      const flag = createElement('span', { className: 'country-flag' });
      flag.textContent = countryFlag(score.code);

      const name = createElement('span', { className: 'country-name', textContent: score.name });

      const scoreBadge = createElement('span', { className: 'country-score-badge' });
      scoreBadge.style.color = color;
      scoreBadge.textContent = `${score.score}`;

      const labelEl = createElement('span', { className: 'country-label' });
      labelEl.style.color = color;
      labelEl.textContent = label;

      row.appendChild(flag);
      row.appendChild(name);
      row.appendChild(labelEl);
      row.appendChild(scoreBadge);
      list.appendChild(row);
    }
  }

  function showDetail(score: CountryIntelScore) {
    detail.style.display = '';
    detail.textContent = '';
    const { label, color } = scoreToLabel(score.score);

    const detailHeader = createElement('div', { className: 'country-detail-header' });
    detailHeader.innerHTML = `
      <span class="country-detail-flag">${countryFlag(score.code)}</span>
      <span class="country-detail-name">${score.name}</span>
      <span class="country-detail-score" style="color:${color}">${score.score} — ${label}</span>
    `;

    const backBtn = createElement('button', { className: 'country-detail-back', textContent: '← Back' });
    backBtn.addEventListener('click', () => {
      detail.style.display = 'none';
    });

    // Component bars
    const components = createElement('div', { className: 'country-components' });
    const compData = [
      { label: 'Events', value: score.components.events, max: 25, color: '#ef4444' },
      { label: 'Disasters', value: score.components.disasters, max: 25, color: '#f97316' },
      { label: 'Sentiment', value: score.components.sentiment, max: 25, color: '#eab308' },
      { label: 'Predictions', value: score.components.predictions, max: 25, color: '#8b5cf6' },
    ];

    for (const comp of compData) {
      const row = createElement('div', { className: 'country-comp-row' });
      row.innerHTML = `
        <span class="country-comp-label">${comp.label}</span>
        <div class="country-comp-bar">
          <div class="country-comp-fill" style="width:${(comp.value / comp.max) * 100}%;background:${comp.color}"></div>
        </div>
        <span class="country-comp-value">${comp.value}/${comp.max}</span>
      `;
      components.appendChild(row);
    }

    // Recent events
    const events = createElement('div', { className: 'country-events' });
    const eventsTitle = createElement('div', { className: 'country-events-title', textContent: 'RECENT EVENTS' });
    events.appendChild(eventsTitle);

    if (score.recentEvents.length === 0) {
      events.appendChild(createElement('div', { className: 'country-events-empty', textContent: 'No recent events' }));
    } else {
      for (const ev of score.recentEvents) {
        const item = createElement('div', { className: 'country-event-item', textContent: ev });
        events.appendChild(item);
      }
    }

    detail.appendChild(backBtn);
    detail.appendChild(detailHeader);
    detail.appendChild(components);
    detail.appendChild(events);
  }

  // Re-render when intel updates
  document.addEventListener('dashview:intel-update', () => {
    if (!wrapper.classList.contains('country-panel-hidden')) {
      renderList();
    }
  });

  return wrapper;
}

function countryFlag(code: string): string {
  const OFFSET = 0x1f1e6 - 65; // 'A' = 65
  return String.fromCodePoint(code.charCodeAt(0) + OFFSET, code.charCodeAt(1) + OFFSET);
}
