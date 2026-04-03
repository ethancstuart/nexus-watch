import { createElement } from '../utils/dom.ts';
import type { MapLayerManager } from './MapLayerManager.ts';
import type { MapLayerCategory } from '../types/index.ts';

const CATEGORY_INFO: Record<MapLayerCategory, { label: string; color: string }> = {
  natural: { label: 'NATURAL HAZARDS', color: '#ff6b6b' },
  conflict: { label: 'CONFLICT & MILITARY', color: '#ef4444' },
  infrastructure: { label: 'INFRASTRUCTURE', color: '#06b6d4' },
  intelligence: { label: 'INTELLIGENCE', color: '#f59e0b' },
  weather: { label: 'WEATHER', color: '#3b82f6' },
};

const CATEGORY_ORDER: MapLayerCategory[] = ['conflict', 'natural', 'intelligence', 'infrastructure', 'weather'];

export function createLayerDrawer(layerManager: MapLayerManager): {
  element: HTMLElement;
  toggleBtn: HTMLElement;
  refresh: () => void;
} {
  // Toggle button for topbar
  const toggleBtn = createElement('button', { className: 'nw-drawer-toggle' });
  const activeCount = layerManager.getEnabledLayers().length;
  toggleBtn.innerHTML = `<span class="nw-drawer-toggle-icon">◉</span> LAYERS <span class="nw-drawer-count">${activeCount}</span>`;

  // Drawer panel
  const drawer = createElement('div', { className: 'nw-layer-drawer' });
  drawer.classList.add('nw-drawer-closed');

  const drawerHeader = createElement('div', { className: 'nw-drawer-header' });
  drawerHeader.innerHTML = '<span>DATA LAYERS</span>';
  const closeBtn = createElement('button', { className: 'nw-drawer-close', textContent: '✕' });
  closeBtn.addEventListener('click', () => drawer.classList.add('nw-drawer-closed'));
  drawerHeader.appendChild(closeBtn);
  drawer.appendChild(drawerHeader);

  const drawerBody = createElement('div', { className: 'nw-drawer-body' });
  drawer.appendChild(drawerBody);

  // Toggle drawer
  toggleBtn.addEventListener('click', () => {
    drawer.classList.toggle('nw-drawer-closed');
    if (!drawer.classList.contains('nw-drawer-closed')) {
      renderDrawerContent();
    }
  });

  function renderDrawerContent() {
    drawerBody.textContent = '';

    for (const cat of CATEGORY_ORDER) {
      const layers = layerManager.getLayersByCategory(cat);
      if (layers.length === 0) continue;

      const info = CATEGORY_INFO[cat];
      const catHeader = createElement('div', { className: 'nw-drawer-cat' });
      catHeader.innerHTML = `<span class="nw-drawer-cat-dot" style="background:${info.color}"></span>${info.label}`;
      drawerBody.appendChild(catHeader);

      for (const layer of layers) {
        const row = createElement('label', { className: 'nw-drawer-row' });

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = layer.isEnabled();
        toggle.className = 'nw-drawer-check';
        toggle.addEventListener('change', () => {
          layerManager.toggle(layer.id);
          updateToggleCount();
        });

        const nameWrap = createElement('div', { className: 'nw-drawer-name-wrap' });
        const name = createElement('span', { className: 'nw-drawer-name', textContent: layer.name });
        const desc = createElement('span', { className: 'nw-drawer-desc', textContent: layer.description });
        nameWrap.appendChild(name);
        nameWrap.appendChild(desc);

        const count = createElement('span', { className: 'nw-drawer-feature-count' });
        const fc = layer.getFeatureCount();
        if (fc > 0) count.textContent = String(fc);

        row.appendChild(toggle);
        row.appendChild(nameWrap);
        row.appendChild(count);
        drawerBody.appendChild(row);
      }
    }
  }

  function updateToggleCount() {
    const count = layerManager.getEnabledLayers().length;
    const countEl = toggleBtn.querySelector('.nw-drawer-count');
    if (countEl) countEl.textContent = String(count);
  }

  function refresh() {
    updateToggleCount();
    if (!drawer.classList.contains('nw-drawer-closed')) {
      renderDrawerContent();
    }
  }

  return { element: drawer, toggleBtn, refresh };
}
