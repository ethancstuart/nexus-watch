import { createElement } from '../utils/dom.ts';
import { getIntelItems } from '../services/geoIntelligence.ts';
import type { IntelItem } from '../types/index.ts';

export function createIntelBar(onFlyTo: (lat: number, lon: number) => void): HTMLElement {
  const bar = createElement('div', { className: 'intel-bar' });
  bar.setAttribute('role', 'status');
  bar.setAttribute('aria-live', 'polite');
  bar.setAttribute('aria-label', 'Intelligence feed');

  function render(items: IntelItem[]) {
    bar.textContent = '';

    const label = createElement('span', { className: 'intel-bar-label' });
    label.textContent = 'INTEL';
    bar.appendChild(label);

    if (items.length === 0) {
      const empty = createElement('span', { className: 'intel-bar-empty', textContent: 'All clear — monitoring...' });
      bar.appendChild(empty);
      return;
    }

    const scrollContainer = createElement('div', { className: 'intel-bar-scroll' });

    for (const item of items.slice(0, 12)) {
      const pill = createElement('div', { className: `intel-bar-item intel-bar-p${item.priority}` });
      pill.setAttribute('role', 'button');
      pill.setAttribute('tabindex', '0');

      const icon = createElement('span', { className: 'intel-bar-item-icon', textContent: item.icon });
      const text = createElement('span', { className: 'intel-bar-item-text', textContent: item.text });

      pill.appendChild(icon);
      pill.appendChild(text);

      const activate = () => {
        if (item.lat !== 0 || item.lon !== 0) {
          onFlyTo(item.lat, item.lon);
        }
      };
      pill.addEventListener('click', activate);
      pill.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      });

      scrollContainer.appendChild(pill);
    }

    bar.appendChild(scrollContainer);
  }

  render(getIntelItems());

  document.addEventListener('dashview:intel-update', (e) => {
    const items = ((e as CustomEvent).detail?.items as IntelItem[]) || [];
    render(items);
  });

  return bar;
}
