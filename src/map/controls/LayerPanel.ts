import { createElement } from '../../utils/dom.ts';
import type { MapLayerManager } from '../MapLayerManager.ts';
import type { MapOverlayManager } from '../MapOverlayManager.ts';
import type { Panel } from '../../panels/Panel.ts';
import type { MapLayerCategory } from '../../types/index.ts';

const CATEGORY_LABELS: Record<MapLayerCategory, { label: string; icon: string }> = {
  natural: { label: 'NATURAL', icon: '🌍' },
  conflict: { label: 'CONFLICT', icon: '⚔️' },
  infrastructure: { label: 'INFRA', icon: '🏗️' },
  intelligence: { label: 'INTEL', icon: '🔍' },
  weather: { label: 'WEATHER', icon: '🌦️' },
};

export function createLayerPanel(
  layerManager: MapLayerManager,
  overlayManager: MapOverlayManager,
  panelRegistry: Map<string, Panel>,
): HTMLElement {
  const wrapper = createElement('div', { className: 'layer-panel' });
  wrapper.classList.add('layer-panel-collapsed');

  // Toggle button (always visible)
  const toggleBtn = createElement('button', { className: 'layer-panel-toggle' });
  toggleBtn.innerHTML =
    '<span class="layer-panel-toggle-icon">☰</span><span class="layer-panel-toggle-label">Layers</span>';
  toggleBtn.addEventListener('click', () => {
    wrapper.classList.toggle('layer-panel-collapsed');
  });

  // Content
  const content = createElement('div', { className: 'layer-panel-content' });

  // Header
  const header = createElement('div', { className: 'layer-panel-header' });
  header.innerHTML = '<h3 class="layer-panel-title">DATA LAYERS</h3>';
  content.appendChild(header);

  // Data layers section
  const layersSection = createElement('div', { className: 'layer-panel-section' });
  renderDataLayers(layersSection, layerManager);
  content.appendChild(layersSection);

  // Widgets section
  const widgetsHeader = createElement('div', { className: 'layer-panel-section-header' });
  widgetsHeader.textContent = 'WIDGETS';
  content.appendChild(widgetsHeader);

  const widgetsSection = createElement('div', { className: 'layer-panel-section' });
  renderWidgetToggles(widgetsSection, overlayManager, panelRegistry);
  content.appendChild(widgetsSection);

  wrapper.appendChild(toggleBtn);
  wrapper.appendChild(content);

  // Re-render on layer toggle
  document.addEventListener('dashview:layer-toggle', () => {
    layersSection.textContent = '';
    renderDataLayers(layersSection, layerManager);
  });

  return wrapper;
}

function renderDataLayers(container: HTMLElement, layerManager: MapLayerManager): void {
  const layers = layerManager.getAllLayers();
  const categories = new Map<MapLayerCategory, typeof layers>();

  for (const layer of layers) {
    if (!categories.has(layer.category)) {
      categories.set(layer.category, []);
    }
    categories.get(layer.category)!.push(layer);
  }

  for (const [cat, catLayers] of categories) {
    const info = CATEGORY_LABELS[cat];
    const group = createElement('div', { className: 'layer-group' });

    const groupHeader = createElement('div', { className: 'layer-group-header' });
    groupHeader.textContent = `${info.icon} ${info.label}`;
    group.appendChild(groupHeader);

    for (const layer of catLayers) {
      const row = createElement('label', { className: 'layer-row' });

      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = layer.isEnabled();
      toggle.className = 'layer-toggle';
      toggle.addEventListener('change', () => {
        layerManager.toggle(layer.id);
      });

      const label = createElement('span', { className: 'layer-label' });
      label.textContent = layer.name;

      const count = createElement('span', { className: 'layer-count' });
      if (layer.isEnabled() && layer.getFeatureCount() > 0) {
        count.textContent = String(layer.getFeatureCount());
      }

      row.appendChild(toggle);
      row.appendChild(label);
      row.appendChild(count);
      group.appendChild(row);
    }

    container.appendChild(group);
  }
}

function renderWidgetToggles(
  container: HTMLElement,
  overlayManager: MapOverlayManager,
  panelRegistry: Map<string, Panel>,
): void {
  for (const [id, panel] of panelRegistry) {
    const row = createElement('label', { className: 'layer-row widget-row' });

    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.checked = overlayManager.isOpen(id);
    toggle.className = 'layer-toggle';
    toggle.addEventListener('change', () => {
      if (toggle.checked) {
        overlayManager.openOverlay(id);
      } else {
        overlayManager.closeOverlay(id);
      }
    });

    const label = createElement('span', { className: 'layer-label' });
    label.textContent = panel.title;

    row.appendChild(toggle);
    row.appendChild(label);
    container.appendChild(row);
  }
}
