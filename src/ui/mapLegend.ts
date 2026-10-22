import { createElement } from '../utils/dom.ts';
import type { MapLayerManager } from '../map/MapLayerManager.ts';

interface LegendEntry {
  label: string;
  type: 'circle' | 'line' | 'line-dashed' | 'fill' | 'heatmap';
  color: string;
  layerId: string;
}

const LEGEND_ENTRIES: LegendEntry[] = [
  // Points
  { label: 'Earthquake', type: 'circle', color: '#ff3c3c', layerId: 'earthquakes' },
  { label: 'Conflict Event', type: 'circle', color: '#ef4444', layerId: 'acled' },
  { label: 'Wildfire', type: 'heatmap', color: '#ff6b00', layerId: 'fires' },
  { label: 'Disease Outbreak', type: 'circle', color: '#f97316', layerId: 'diseases' },
  { label: 'Weather Alert', type: 'circle', color: '#eab308', layerId: 'weather-alerts' },
  { label: 'Air Quality', type: 'circle', color: '#00ff00', layerId: 'air-quality' },
  { label: 'News Event', type: 'circle', color: '#eab308', layerId: 'news' },
  { label: 'Disaster Alert', type: 'circle', color: '#3b82f6', layerId: 'gdacs' },
  // Military / Intel
  { label: 'Military Base (NATO)', type: 'circle', color: '#3b82f6', layerId: 'military' },
  { label: 'Military Base (RU/CN)', type: 'circle', color: '#ef4444', layerId: 'military' },
  { label: 'Nuclear Facility', type: 'circle', color: '#eab308', layerId: 'nuclear' },
  { label: 'Sanctioned Country', type: 'circle', color: '#dc2626', layerId: 'sanctions' },
  { label: 'GPS Jamming Zone', type: 'circle', color: '#ef4444', layerId: 'gps-jamming' },
  { label: 'Internet Outage', type: 'circle', color: '#dc2626', layerId: 'internet-outages' },
  { label: 'Election (upcoming)', type: 'circle', color: '#8b5cf6', layerId: 'elections' },
  { label: 'Space Launch Site', type: 'circle', color: '#8b5cf6', layerId: 'launches' },
  // Tracking
  { label: 'Aircraft (civilian)', type: 'circle', color: '#818cf8', layerId: 'flights' },
  { label: 'Vessel (cargo/tanker)', type: 'circle', color: '#3b82f6', layerId: 'ships' },
  { label: 'Vessel (military)', type: 'circle', color: '#ef4444', layerId: 'ships' },
  { label: 'Satellite', type: 'circle', color: '#00ff00', layerId: 'satellites' },
  { label: 'Prediction Market', type: 'circle', color: '#00ff00', layerId: 'predictions' },
  // Lines
  { label: 'Trade Route', type: 'line-dashed', color: '#f59e0b', layerId: 'trade-routes' },
  { label: 'Undersea Cable', type: 'line', color: '#06b6d4', layerId: 'cables' },
  { label: 'Pipeline (active)', type: 'line', color: '#888888', layerId: 'pipelines' },
  { label: 'Pipeline (damaged)', type: 'line-dashed', color: '#ef4444', layerId: 'pipelines' },
  { label: 'Refugee Flow', type: 'line-dashed', color: '#38bdf8', layerId: 'displacement' },
  { label: 'Cyber Threat Arc', type: 'line-dashed', color: '#dc2626', layerId: 'cyber' },
  // Areas
  { label: 'Conflict Zone', type: 'fill', color: '#ef4444', layerId: 'frontlines' },
  { label: 'Frontline Trace', type: 'line', color: '#ff3333', layerId: 'frontlines' },
  { label: 'Chokepoint (normal)', type: 'circle', color: '#00ff00', layerId: 'chokepoints' },
  { label: 'Chokepoint (disrupted)', type: 'circle', color: '#ef4444', layerId: 'chokepoints' },
  { label: 'Strategic Port', type: 'circle', color: '#ff6600', layerId: 'ports' },
];

export function createMapLegend(layerManager: MapLayerManager): HTMLElement {
  const wrapper = createElement('div', { className: 'nw-legend' });
  wrapper.classList.add('nw-legend-collapsed');

  const toggleBtn = createElement('button', { className: 'nw-legend-toggle' });
  toggleBtn.textContent = 'LEGEND';
  toggleBtn.addEventListener('click', () => {
    wrapper.classList.toggle('nw-legend-collapsed');
  });

  const content = createElement('div', { className: 'nw-legend-content' });
  const header = createElement('div', { className: 'nw-legend-header', textContent: 'MAP LEGEND' });
  content.appendChild(header);

  const list = createElement('div', { className: 'nw-legend-list' });

  for (const entry of LEGEND_ENTRIES) {
    const row = createElement('div', { className: 'nw-legend-row' });

    const swatch = createElement('span', { className: `nw-legend-swatch nw-legend-${entry.type}` });
    swatch.style.setProperty('--swatch-color', entry.color);

    const label = createElement('span', { className: 'nw-legend-label', textContent: entry.label });

    row.appendChild(swatch);
    row.appendChild(label);

    // Dim if layer is not enabled
    row.dataset.layerId = entry.layerId;

    list.appendChild(row);
  }

  content.appendChild(list);
  wrapper.appendChild(toggleBtn);
  wrapper.appendChild(content);

  // Update visibility based on enabled layers
  function updateVisibility() {
    const rows = list.querySelectorAll('.nw-legend-row');
    for (const row of rows) {
      const lid = (row as HTMLElement).dataset.layerId;
      if (lid) {
        const layer = layerManager.getLayer(lid);
        (row as HTMLElement).style.opacity = layer?.isEnabled() ? '1' : '0.3';
      }
    }
  }

  updateVisibility();
  document.addEventListener('dashview:layer-toggle', updateVisibility);
  document.addEventListener('dashview:layer-data', updateVisibility);

  return wrapper;
}
