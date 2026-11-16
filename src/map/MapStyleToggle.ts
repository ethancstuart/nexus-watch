import { createElement } from '../utils/dom.ts';

export type MapStyleId = 'dark' | 'positron' | 'voyager';

const STYLES: Record<MapStyleId, { url: string; label: string }> = {
  dark: { url: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json', label: 'DARK' },
  positron: { url: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json', label: 'LIGHT' },
  voyager: { url: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json', label: 'VOYAGER' },
};

const STORAGE_KEY = 'nw:map-style';

export function getMapStyleUrl(): string {
  const saved = localStorage.getItem(STORAGE_KEY) as MapStyleId | null;
  return STYLES[saved || 'dark'].url;
}

export function createMapStyleToggle(onStyleChange: (styleUrl: string) => void): HTMLElement {
  const wrapper = createElement('div', { className: 'nw-style-toggle' });

  let current: MapStyleId = (localStorage.getItem(STORAGE_KEY) as MapStyleId) || 'dark';

  for (const [id, style] of Object.entries(STYLES) as [MapStyleId, { url: string; label: string }][]) {
    const btn = createElement('button', { className: 'nw-style-btn' });
    btn.textContent = style.label;
    btn.dataset.style = id;
    if (id === current) btn.classList.add('active');

    btn.addEventListener('click', () => {
      if (id === current) return;
      current = id;
      localStorage.setItem(STORAGE_KEY, id);
      wrapper.querySelectorAll('.nw-style-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      onStyleChange(style.url);
    });

    wrapper.appendChild(btn);
  }

  return wrapper;
}
