import type maplibregl from 'maplibre-gl';
import { createElement } from '../utils/dom.ts';
import type { MapLayerManager } from './MapLayerManager.ts';
import type { MapLayerCategory } from '../types/index.ts';
import { exportLayerAsCSV, exportLayerAsGeoJSON } from './DataExport.ts';
import { getProvenance, computeFreshness, freshnessColor, relativeTime } from '../services/dataProvenance.ts';

const CATEGORY_INFO: Record<MapLayerCategory, { label: string; color: string }> = {
  natural: { label: 'NATURAL HAZARDS', color: '#ff6b6b' },
  conflict: { label: 'CONFLICT & MILITARY', color: '#ef4444' },
  infrastructure: { label: 'INFRASTRUCTURE', color: '#06b6d4' },
  intelligence: { label: 'INTELLIGENCE', color: '#f59e0b' },
  weather: { label: 'WEATHER', color: '#06b6d4' },
};

const CATEGORY_ORDER: MapLayerCategory[] = ['conflict', 'natural', 'intelligence', 'infrastructure', 'weather'];

export function createLayerDrawer(
  layerManager: MapLayerManager,
  getLayerData: () => Map<string, unknown>,
  getMap?: () => maplibregl.Map | null,
): {
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
      const enabledCount = layers.filter((l) => l.isEnabled()).length;

      const catHeader = createElement('div', { className: 'nw-drawer-cat nw-drawer-cat-toggle' });
      catHeader.innerHTML = `<span class="nw-drawer-cat-dot" style="background:${info.color}"></span>${info.label} <span class="nw-drawer-cat-count">(${enabledCount}/${layers.length})</span>`;

      const catBody = createElement('div', { className: 'nw-drawer-cat-body' });
      // First category expanded, rest collapsed
      if (cat !== CATEGORY_ORDER[0]) catBody.style.display = 'none';
      catHeader.addEventListener('click', () => {
        catBody.style.display = catBody.style.display === 'none' ? '' : 'none';
        catHeader.classList.toggle('collapsed', catBody.style.display === 'none');
      });
      if (cat !== CATEGORY_ORDER[0]) catHeader.classList.add('collapsed');

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

        const exportBtn = createElement('button', { className: 'nw-drawer-export', textContent: 'CSV' });
        exportBtn.title = 'Export as CSV';
        exportBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          exportLayerAsCSV(layer, getLayerData());
        });

        const exportGeoBtn = createElement('button', { className: 'nw-drawer-export', textContent: 'GEO' });
        exportGeoBtn.title = 'Export as GeoJSON';
        exportGeoBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          exportLayerAsGeoJSON(layer, getLayerData());
        });

        // Opacity slider
        const opacitySlider = document.createElement('input');
        opacitySlider.type = 'range';
        opacitySlider.min = '0';
        opacitySlider.max = '100';
        opacitySlider.value = '100';
        opacitySlider.className = 'nw-drawer-opacity';
        opacitySlider.title = 'Layer opacity';
        opacitySlider.addEventListener('input', () => {
          const opacity = parseInt(opacitySlider.value) / 100;
          setLayerOpacity(layer.id, opacity);
        });

        // Freshness badge — shows data age from provenance tracking
        const freshDot = createElement('span', { className: 'nw-drawer-freshness' });
        const prov = getProvenance(layer.id);
        if (prov) {
          const f = computeFreshness(prov);
          freshDot.style.background = freshnessColor(f);
          freshDot.title = `${relativeTime(prov.fetchedAt)} — ${f}`;
          if (f === 'stale' || f === 'offline') freshDot.classList.add('nw-drawer-freshness-warn');
        } else {
          // Static/reference layers or layers that haven't loaded yet
          const isReference = layer.name.includes('Reference') || layer.name.includes('Curated');
          freshDot.style.background = isReference ? '#6b8aff' : '#666';
          freshDot.title = isReference ? 'Reference data (manually curated)' : 'No data yet';
        }

        row.appendChild(toggle);
        row.appendChild(freshDot);
        row.appendChild(nameWrap);
        row.appendChild(count);
        row.appendChild(opacitySlider);
        row.appendChild(exportBtn);
        row.appendChild(exportGeoBtn);
        catBody.appendChild(row);
      }
      drawerBody.appendChild(catBody);
    }
  }

  function setLayerOpacity(layerId: string, opacity: number): void {
    const map = getMap?.();
    if (!map) return;
    // Find all MapLibre layers that belong to this data layer (convention: layerId-*)
    const style = map.getStyle();
    if (!style?.layers) return;
    for (const ml of style.layers) {
      if (ml.id.startsWith(layerId + '-') || ml.id === layerId) {
        try {
          if (ml.type === 'circle') {
            map.setPaintProperty(ml.id, 'circle-opacity', opacity);
          } else if (ml.type === 'line') {
            map.setPaintProperty(ml.id, 'line-opacity', opacity);
          } else if (ml.type === 'symbol') {
            map.setPaintProperty(ml.id, 'text-opacity', opacity);
          } else if (ml.type === 'heatmap') {
            map.setPaintProperty(ml.id, 'heatmap-opacity', opacity);
          }
        } catch {
          // Some layers may not support opacity changes
        }
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
