import '../styles/map.css';
import { createElement } from '../utils/dom.ts';
import { MapView } from '../map/MapView.ts';
import { MapLayerManager } from '../map/MapLayerManager.ts';
import { MapOverlayManager } from '../map/MapOverlayManager.ts';
import { EarthquakeLayer } from '../map/layers/earthquakeLayer.ts';
import { NewsLayer } from '../map/layers/newsLayer.ts';
import { FireLayer } from '../map/layers/fireLayer.ts';
import { WeatherAlertLayer } from '../map/layers/weatherLayer.ts';
import { PredictionLayer } from '../map/layers/predictionLayer.ts';
import { createLayerPanel } from '../map/controls/LayerPanel.ts';
import { createViewToggle } from '../map/controls/ViewToggle.ts';
import { checkSession } from '../services/auth.ts';
import type { Panel } from '../panels/Panel.ts';

// Lazy-load panel constructors to avoid loading all panels upfront
async function loadPanelRegistry(): Promise<Map<string, Panel>> {
  const [{ WeatherPanel }, { StocksPanel }, { NewsPanel }, { CryptoPanel }, { SportsPanel }, { HackerNewsPanel }] =
    await Promise.all([
      import('../panels/WeatherPanel.ts'),
      import('../panels/StocksPanel.ts'),
      import('../panels/NewsPanel.ts'),
      import('../panels/CryptoPanel.ts'),
      import('../panels/SportsPanel.ts'),
      import('../panels/HackerNewsPanel.ts'),
    ]);

  const panels: Panel[] = [
    new WeatherPanel(),
    new StocksPanel(),
    new NewsPanel(),
    new CryptoPanel(),
    new SportsPanel(),
    new HackerNewsPanel(),
  ];

  const map = new Map<string, Panel>();
  for (const p of panels) {
    map.set(p.id, p);
  }
  return map;
}

let intelAbort: AbortController | null = null;

export async function renderIntelView(root: HTMLElement): Promise<void> {
  if (intelAbort) intelAbort.abort();
  intelAbort = new AbortController();
  const signal = intelAbort.signal;

  root.textContent = '';

  // Auth gate
  const sessionUser = await checkSession();
  if (!sessionUser) {
    window.location.hash = '#/';
    return;
  }

  // Build page structure
  const view = createElement('div', { className: 'intel-view' });

  // ── Top Bar ──
  const topbar = createElement('div', { className: 'intel-topbar' });

  const logo = createElement('span', { className: 'intel-logo' });
  logo.textContent = 'DashPulse Intel';

  const viewToggle = createViewToggle('map', (mode) => {
    if (mode === 'classic') {
      window.location.hash = '#/app';
    }
  });

  const status = createElement('div', { className: 'intel-status' });
  const dot = createElement('span', { className: 'intel-status-dot' });
  const statusText = createElement('span', {});
  statusText.textContent = 'LIVE';
  status.appendChild(dot);
  status.appendChild(statusText);

  topbar.appendChild(logo);
  topbar.appendChild(viewToggle);
  topbar.appendChild(status);

  // ── Map Container ──
  const mapContainer = createElement('div', { className: 'intel-map-container' });

  // ── Bottom Bar ──
  const bottomBar = createElement('div', { className: 'intel-bottombar' });
  const layerCounts: Record<string, { el: HTMLElement; color: string; label: string }> = {
    earthquakes: {
      el: createElement('span', { className: 'intel-bottombar-item' }),
      color: '#ff3c3c',
      label: 'Quakes',
    },
    news: { el: createElement('span', { className: 'intel-bottombar-item' }), color: '#eab308', label: 'News' },
    fires: { el: createElement('span', { className: 'intel-bottombar-item' }), color: '#ff6b00', label: 'Fires' },
    'weather-alerts': {
      el: createElement('span', { className: 'intel-bottombar-item' }),
      color: '#3b82f6',
      label: 'Weather',
    },
    predictions: {
      el: createElement('span', { className: 'intel-bottombar-item' }),
      color: '#22c55e',
      label: 'Predictions',
    },
  };
  for (const info of Object.values(layerCounts)) {
    info.el.innerHTML = `<span class="layer-dot" style="background:${info.color}"></span> ${info.label}: --`;
    bottomBar.appendChild(info.el);
  }

  // Assemble
  view.appendChild(topbar);
  view.appendChild(mapContainer);
  view.appendChild(bottomBar);
  root.appendChild(view);

  // ── Initialize Map ──
  const mapView = new MapView(mapContainer);
  const map = mapView.init();

  // ── Layer Manager ──
  const layerManager = new MapLayerManager();
  layerManager.setMap(map);

  // Register all data layers
  layerManager.register(new EarthquakeLayer());
  layerManager.register(new NewsLayer());
  layerManager.register(new FireLayer());
  layerManager.register(new WeatherAlertLayer());
  layerManager.register(new PredictionLayer());

  // Wait for map to load, then initialize layers
  map.on('load', () => {
    layerManager.initAll();
  });

  // ── Panel Registry (for overlays) ──
  const panelRegistry = await loadPanelRegistry();

  // ── Overlay Manager ──
  const overlayManager = new MapOverlayManager(mapContainer, panelRegistry);

  // ── Layer Panel (slide-out drawer) ──
  const layerPanel = createLayerPanel(layerManager, overlayManager, panelRegistry);
  mapContainer.appendChild(layerPanel);

  // ── Update bottom bar on layer data ──
  document.addEventListener(
    'dashview:layer-data',
    ((e: CustomEvent) => {
      const layerId = e.detail.layerId as string;
      const info = layerCounts[layerId];
      if (info) {
        const data = e.detail.data as { length: number };
        info.el.innerHTML = `<span class="layer-dot" style="background:${info.color}"></span> ${info.label}: ${data.length}`;
      }
    }) as EventListener,
    { signal },
  );

  // Restore saved overlays
  overlayManager.restoreOverlays();

  // ── Cleanup on navigation ──
  window.addEventListener(
    'hashchange',
    () => {
      if (!window.location.hash.startsWith('#/intel')) {
        mapView.destroy();
        layerManager.destroy();
        overlayManager.destroy();
        intelAbort?.abort();
        intelAbort = null;
      }
    },
    { signal },
  );
}
