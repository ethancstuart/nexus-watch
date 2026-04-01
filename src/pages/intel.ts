import '../styles/map.css';
import '../styles/intel-bar.css';
import { createElement } from '../utils/dom.ts';
import { MapView } from '../map/MapView.ts';
import { MapLayerManager } from '../map/MapLayerManager.ts';
import { MapOverlayManager } from '../map/MapOverlayManager.ts';
import { EarthquakeLayer } from '../map/layers/earthquakeLayer.ts';
import { NewsLayer } from '../map/layers/newsLayer.ts';
import { FireLayer } from '../map/layers/fireLayer.ts';
import { WeatherAlertLayer } from '../map/layers/weatherLayer.ts';
import { PredictionLayer } from '../map/layers/predictionLayer.ts';
import { FlightLayer } from '../map/layers/flightLayer.ts';
import { CyberLayer } from '../map/layers/cyberLayer.ts';
import { createLayerPanel } from '../map/controls/LayerPanel.ts';
import { createCountryPanel } from '../map/controls/CountryPanel.ts';
import { createViewToggle } from '../map/controls/ViewToggle.ts';
import { createIntelBar } from '../ui/intelBar.ts';
import { initGeoIntelligence, destroyGeoIntelligence, getLayerData } from '../services/geoIntelligence.ts';
import { computeCountryScores } from '../services/countryIndex.ts';
import { generateSitrep } from '../services/sitrep.ts';
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

  // Sitrep button
  const sitrepBtn = createElement('button', { className: 'intel-sitrep-btn', textContent: '📋 Sitrep' });
  sitrepBtn.addEventListener('click', async () => {
    sitrepBtn.textContent = '⏳ Generating...';
    sitrepBtn.disabled = true;
    try {
      const result = await generateSitrep('Global', getLayerData());
      showSitrepOverlay(mapContainer, result.sitrep, result.region, result.generatedAt);
    } catch (err) {
      showSitrepOverlay(
        mapContainer,
        `Failed to generate sitrep: ${err instanceof Error ? err.message : 'Unknown error'}`,
        'Error',
        '',
      );
    } finally {
      sitrepBtn.textContent = '📋 Sitrep';
      sitrepBtn.disabled = false;
    }
  });

  topbar.appendChild(logo);
  topbar.appendChild(viewToggle);
  topbar.appendChild(sitrepBtn);
  topbar.appendChild(status);

  // ── Map Container ──
  const mapContainer = createElement('div', { className: 'intel-map-container' });

  // ── Intel Bar (replaces simple bottom bar) ──
  const intelBar = createIntelBar((lat, lon) => {
    mapView.flyTo(lon, lat, 6);
  });

  // ── Status Bar ──
  const statusBar = createElement('div', { className: 'intel-bottombar' });
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
    flights: { el: createElement('span', { className: 'intel-bottombar-item' }), color: '#818cf8', label: 'Aircraft' },
    cyber: { el: createElement('span', { className: 'intel-bottombar-item' }), color: '#dc2626', label: 'Cyber' },
  };
  for (const info of Object.values(layerCounts)) {
    info.el.innerHTML = `<span class="layer-dot" style="background:${info.color}"></span> ${info.label}: --`;
    statusBar.appendChild(info.el);
  }

  // Assemble
  view.appendChild(topbar);
  view.appendChild(mapContainer);
  view.appendChild(intelBar);
  view.appendChild(statusBar);
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
  layerManager.register(new FlightLayer());
  layerManager.register(new CyberLayer());

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

  // ── Country Panel (left side) ──
  const countryPanel = createCountryPanel((_code, lat, lon) => {
    mapView.flyTo(lon, lat, 5);
  });
  mapContainer.appendChild(countryPanel);

  // ── Geo-Intelligence Engine ──
  initGeoIntelligence(signal);

  // Recompute country scores when layer data changes
  document.addEventListener(
    'dashview:layer-data',
    () => {
      computeCountryScores(getLayerData());
    },
    { signal },
  );

  // ── Update status bar on layer data ──
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
        destroyGeoIntelligence();
        intelAbort?.abort();
        intelAbort = null;
      }
    },
    { signal },
  );
}

function showSitrepOverlay(container: HTMLElement, text: string, region: string, generatedAt: string): void {
  // Remove existing overlay
  container.querySelector('.sitrep-overlay')?.remove();

  const overlay = createElement('div', { className: 'sitrep-overlay' });
  const header = createElement('div', { className: 'sitrep-header' });
  header.innerHTML = `<span class="sitrep-title">SITUATION REPORT — ${region.toUpperCase()}</span>`;

  if (generatedAt) {
    const time = createElement('span', { className: 'sitrep-time' });
    time.textContent = new Date(generatedAt).toLocaleTimeString();
    header.appendChild(time);
  }

  const closeBtn = createElement('button', { className: 'sitrep-close', textContent: '✕' });
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(closeBtn);

  const body = createElement('div', { className: 'sitrep-body' });
  body.textContent = text;

  overlay.appendChild(header);
  overlay.appendChild(body);
  container.appendChild(overlay);
}
