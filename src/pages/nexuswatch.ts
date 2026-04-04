import '../styles/nexuswatch.css';
import { createElement } from '../utils/dom.ts';
import { MapView } from '../map/MapView.ts';
import { MapLayerManager } from '../map/MapLayerManager.ts';
import { EarthquakeLayer } from '../map/layers/earthquakeLayer.ts';
import { NewsLayer } from '../map/layers/newsLayer.ts';
import { FireLayer } from '../map/layers/fireLayer.ts';
import { WeatherAlertLayer } from '../map/layers/weatherLayer.ts';
import { PredictionLayer } from '../map/layers/predictionLayer.ts';
import { FlightLayer } from '../map/layers/flightLayer.ts';
import { CyberLayer } from '../map/layers/cyberLayer.ts';
import { MilitaryBasesLayer } from '../map/layers/militaryBasesLayer.ts';
import { NuclearLayer } from '../map/layers/nuclearLayer.ts';
import { PortsLayer } from '../map/layers/portsLayer.ts';
import { ConflictZonesLayer } from '../map/layers/conflictZonesLayer.ts';
import { CablesLayer } from '../map/layers/cablesLayer.ts';
import { PipelinesLayer } from '../map/layers/pipelinesLayer.ts';
import { GpsJammingLayer } from '../map/layers/gpsJammingLayer.ts';
import { SatelliteLayer } from '../map/layers/satelliteLayer.ts';
import { ShipLayer } from '../map/layers/shipLayer.ts';
import { AcledLayer } from '../map/layers/acledLayer.ts';
import { GdacsLayer } from '../map/layers/gdacsLayer.ts';
import { ChokepointStatusLayer } from '../map/layers/chokepointStatusLayer.ts';
import { AirQualityLayer } from '../map/layers/airQualityLayer.ts';
import { DiseaseLayer } from '../map/layers/diseaseLayer.ts';
import { DisplacementLayer } from '../map/layers/displacementLayer.ts';
import { InternetOutagesLayer } from '../map/layers/internetOutagesLayer.ts';
import { SanctionsLayer } from '../map/layers/sanctionsLayer.ts';
import { ElectionLayer } from '../map/layers/electionLayer.ts';
import { TradeRoutesLayer } from '../map/layers/tradeRoutesLayer.ts';
import { LaunchLayer } from '../map/layers/launchLayer.ts';
import { FrontlinesLayer } from '../map/layers/frontlinesLayer.ts';
import {
  initGeoIntelligence,
  destroyGeoIntelligence,
  getIntelItems,
  getLayerData,
} from '../services/geoIntelligence.ts';
import { computeCountryScores, getCachedScores, scoreToLabel } from '../services/countryIndex.ts';
import { generateSitrep, generatePersonalBrief } from '../services/sitrep.ts';
import { loadRules, checkRules, getTriggeredAlerts } from '../services/alertRules.ts';
import { computeTensionIndex, tensionColor, tensionLabel } from '../services/tensionIndex.ts';
import { loadWatchlist, scanForMatches, getWatchMatches } from '../services/watchlist.ts';
import { createMarketsTab } from '../ui/sidebarMarkets.ts';
import { createFeedsTab } from '../ui/sidebarFeeds.ts';
import { createMapSearch } from '../map/MapSearch.ts';
import { showOnboarding } from '../ui/onboardingOverlay.ts';
import { createMapLegend } from '../ui/mapLegend.ts';
import { FloatingWidgetManager } from '../map/FloatingWidget.ts';
import { createLayerDrawer } from '../map/LayerDrawer.ts';
import { createMapStyleToggle } from '../map/MapStyleToggle.ts';
import type { IntelItem, CountryIntelScore, MapLayerCategory } from '../types/index.ts';

let nwAbort: AbortController | null = null;

export async function renderNexusWatch(root: HTMLElement): Promise<void> {
  if (nwAbort) nwAbort.abort();
  nwAbort = new AbortController();
  const signal = nwAbort.signal;

  root.textContent = '';

  // ── Build DOM structure synchronously ──
  const app = createElement('div', { className: 'nw-app' });

  // Top bar — 3 zones: left (brand), center (tension index), right (controls)
  const topbar = createElement('div', { className: 'nw-topbar' });

  // LEFT ZONE: logo + search
  const topLeft = createElement('div', { className: 'nw-topbar-left' });
  const logo = createElement('span', { className: 'nw-logo', textContent: 'NexusWatch' });
  const searchSlot = createElement('div', {});
  topLeft.appendChild(logo);
  topLeft.appendChild(searchSlot);

  // CENTER ZONE: tension index (wired after data loads)
  const tensionSlot = createElement('div', { className: 'nw-topbar-center' });
  tensionSlot.innerHTML =
    '<span class="nw-tension-label">GLOBAL TENSION</span><span class="nw-tension-value">--</span>';

  // RIGHT ZONE: layers toggle + controls dropdown + status
  const topRight = createElement('div', { className: 'nw-topbar-right' });
  const drawerToggleSlot = createElement('div', {});

  const sitrepBtn = createElement('button', { className: 'nw-sitrep-btn', textContent: 'SITREP' });
  const briefBtn = createElement('button', { className: 'nw-sitrep-btn', textContent: 'MY BRIEF' });
  const popoutSlot = createElement('div', {});

  // Map style toggle (collapsed into right zone)
  const styleToggle = createMapStyleToggle((styleUrl) => {
    mapView.getMap()?.setStyle(styleUrl);
    setTimeout(() => {
      for (const layer of layerManager.getEnabledLayers()) {
        layer.disable();
        layer.enable();
        void layer.refresh();
      }
    }, 1000);
  });

  const statusArea = createElement('div', { className: 'nw-topbar-status' });
  const liveDot = createElement('span', { className: 'nw-live-dot' });
  const clockEl = createElement('span', {});
  statusArea.appendChild(liveDot);
  statusArea.appendChild(clockEl);

  topRight.appendChild(drawerToggleSlot);
  topRight.appendChild(sitrepBtn);
  topRight.appendChild(briefBtn);
  topRight.appendChild(popoutSlot);
  topRight.appendChild(styleToggle);
  topRight.appendChild(statusArea);

  topbar.appendChild(topLeft);
  topbar.appendChild(tensionSlot);
  topbar.appendChild(topRight);

  // Main area
  const main = createElement('div', { className: 'nw-main' });

  // Sidebar
  const sidebar = createElement('div', { className: 'nw-sidebar' });
  const tabBar = createElement('div', { className: 'nw-sidebar-tabs' });
  const tabIntel = createElement('button', { className: 'nw-sidebar-tab', textContent: 'INTEL' });
  const tabMarkets = createElement('button', { className: 'nw-sidebar-tab', textContent: 'MARKETS' });
  const tabFeeds = createElement('button', { className: 'nw-sidebar-tab', textContent: 'FEEDS' });
  tabBar.appendChild(tabIntel);
  tabBar.appendChild(tabMarkets);
  tabBar.appendChild(tabFeeds);

  const sidebarContent = createElement('div', { className: 'nw-sidebar-content' });
  sidebar.appendChild(tabBar);
  sidebar.appendChild(sidebarContent);

  // Map container
  const mapContainer = createElement('div', { className: 'nw-map-container' });

  main.appendChild(sidebar);
  main.appendChild(mapContainer);

  // Status bar
  const statusBar = createElement('div', { className: 'nw-statusbar' });

  // Assemble and render immediately
  app.appendChild(topbar);
  app.appendChild(main);
  app.appendChild(statusBar);
  root.appendChild(app);

  // ── Onboarding (first visit only) ──
  showOnboarding(root);

  // ── Initialize map ──
  const mapView = new MapView(mapContainer);
  const map = mapView.init();

  // ── Layer manager ──
  const layerManager = new MapLayerManager();
  layerManager.setMap(map);

  const allLayers = [
    new EarthquakeLayer(),
    new NewsLayer(),
    new FireLayer(),
    new WeatherAlertLayer(),
    new PredictionLayer(),
    new FlightLayer(),
    new CyberLayer(),
    new MilitaryBasesLayer(),
    new NuclearLayer(),
    new PortsLayer(),
    new ConflictZonesLayer(),
    new CablesLayer(),
    new PipelinesLayer(),
    new GpsJammingLayer(),
    new SatelliteLayer(),
    new ShipLayer(),
    new AcledLayer(),
    new GdacsLayer(),
    new ChokepointStatusLayer(),
    new AirQualityLayer(),
    new DiseaseLayer(),
    new DisplacementLayer(),
    new InternetOutagesLayer(),
    new SanctionsLayer(),
    new ElectionLayer(),
    new TradeRoutesLayer(),
    new LaunchLayer(),
    new FrontlinesLayer(),
  ];

  for (const layer of allLayers) {
    layerManager.register(layer);
  }

  map.on('load', () => {
    layerManager.initAll();
  });

  // ── Floating widgets ──
  const floatMgr = new FloatingWidgetManager(mapContainer);

  // Add pop-out button
  const popoutBtn = createElement('button', { className: 'nw-sitrep-btn', textContent: 'POP-OUT' });
  popoutSlot.appendChild(popoutBtn);
  popoutBtn.addEventListener('click', () => {
    // Open a floating intel summary widget
    floatMgr.open('intel-summary', 'INTEL SUMMARY', (body) => {
      const items = getIntelItems();
      if (items.length === 0) {
        body.textContent = 'No active alerts';
        return;
      }
      for (const item of items.slice(0, 10)) {
        const row = createElement('div', { className: 'nw-alert-row' });
        const dot = createElement('span', { className: 'nw-alert-dot' });
        dot.classList.add(item.priority === 0 ? 'critical' : item.priority === 1 ? 'elevated' : 'monitor');
        const text = createElement('span', { className: 'nw-alert-text', textContent: item.text });
        row.appendChild(dot);
        row.appendChild(text);
        body.appendChild(row);
      }
    });
  });

  // ── Search bar ──
  const searchBar = createMapSearch(mapView);
  searchSlot.appendChild(searchBar);

  // ── Layer drawer ──
  const layerDrawer = createLayerDrawer(layerManager, getLayerData, () => mapView.getMap());
  drawerToggleSlot.appendChild(layerDrawer.toggleBtn);
  mapContainer.appendChild(layerDrawer.element);

  // ── Map Legend ──
  const legend = createMapLegend(layerManager);
  mapContainer.appendChild(legend);

  // ── Tab switching ──
  let activeTab: 'intel' | 'markets' | 'feeds' =
    (localStorage.getItem('nw:active-tab') as 'intel' | 'markets' | 'feeds') || 'intel';

  // Set initial active tab
  if (activeTab === 'markets') tabMarkets.classList.add('active');
  else if (activeTab === 'feeds') tabFeeds.classList.add('active');
  else tabIntel.classList.add('active');

  function setActiveTab(tab: typeof activeTab) {
    activeTab = tab;
    localStorage.setItem('nw:active-tab', tab);
    tabIntel.classList.toggle('active', tab === 'intel');
    tabMarkets.classList.toggle('active', tab === 'markets');
    tabFeeds.classList.toggle('active', tab === 'feeds');
    renderSidebarContent();
  }

  tabIntel.addEventListener('click', () => setActiveTab('intel'));
  tabMarkets.addEventListener('click', () => setActiveTab('markets'));
  tabFeeds.addEventListener('click', () => setActiveTab('feeds'));

  // ── Sidebar tab components ──
  const marketsTab = createMarketsTab();
  const feedsTab = createFeedsTab();

  let sidebarDebounce: ReturnType<typeof setTimeout> | null = null;
  function debouncedSidebarRender() {
    if (sidebarDebounce) clearTimeout(sidebarDebounce);
    sidebarDebounce = setTimeout(renderSidebarContent, 1000);
  }

  function renderSidebarContent() {
    sidebarContent.textContent = '';

    // Stop data cycles for inactive tabs
    marketsTab.stopDataCycle();
    feedsTab.stopDataCycle();

    if (activeTab === 'intel') {
      renderIntelTab(sidebarContent, mapView, layerManager);
    } else if (activeTab === 'markets') {
      sidebarContent.appendChild(marketsTab.element);
      marketsTab.startDataCycle();
    } else {
      sidebarContent.appendChild(feedsTab.element);
      feedsTab.startDataCycle();
    }
  }

  renderSidebarContent();

  // ── Status bar ──
  function updateStatusBar() {
    statusBar.textContent = '';
    for (const layer of layerManager.getAllLayers()) {
      if (!layer.isEnabled()) continue;
      const item = createElement('span', { className: 'nw-statusbar-item' });
      const dot = createElement('span', { className: 'nw-statusbar-dot' });
      dot.style.background = '#ff6600';
      const text = createElement('span', {});
      text.textContent = `${layer.name}: ${layer.getFeatureCount()}`;
      item.appendChild(dot);
      item.appendChild(text);
      statusBar.appendChild(item);
    }

    const clock = createElement('span', { className: 'nw-statusbar-clock' });
    clock.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    statusBar.appendChild(clock);
  }

  updateStatusBar();

  // ── Clock update ──
  const clockInterval = setInterval(() => {
    clockEl.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    updateStatusBar();
  }, 1000);

  // ── Geo-intelligence + Alert Rules ──
  initGeoIntelligence(signal);
  loadRules();
  loadWatchlist();
  // Notification permission requested on first alert trigger, not page load

  document.addEventListener(
    'dashview:layer-data',
    ((e: CustomEvent) => {
      computeCountryScores(getLayerData());

      // Update tension index
      const tension = computeTensionIndex(getLayerData());
      const tensionValue = tensionSlot.querySelector('.nw-tension-value');
      if (tensionValue) {
        tensionValue.textContent = String(tension.global);
        (tensionValue as HTMLElement).style.color = tensionColor(tension.global);
      }
      // Update or add trend arrow
      let trendEl = tensionSlot.querySelector('.nw-tension-trend') as HTMLElement;
      if (!trendEl) {
        trendEl = createElement('span', { className: 'nw-tension-trend' });
        tensionSlot.appendChild(trendEl);
      }
      trendEl.textContent = tension.trend === 'rising' ? '▲' : tension.trend === 'falling' ? '▼' : '—';
      trendEl.style.color =
        tension.trend === 'rising' ? '#ef4444' : tension.trend === 'falling' ? '#00ff00' : '#666666';
      // Update label
      let labelEl = tensionSlot.querySelector('.nw-tension-level') as HTMLElement;
      if (!labelEl) {
        labelEl = createElement('span', { className: 'nw-tension-level' });
        tensionSlot.appendChild(labelEl);
      }
      labelEl.textContent = tensionLabel(tension.global);
      labelEl.style.color = tensionColor(tension.global);
      layerDrawer.refresh();
      if (activeTab === 'intel') debouncedSidebarRender();

      // Check alert rules + watchlist
      checkRules(getLayerData());
      scanForMatches(getLayerData());

      // Refresh pulse animation
      const flash = createElement('div', { className: 'nw-refresh-flash' });
      mapContainer.appendChild(flash);
      setTimeout(() => flash.remove(), 900);

      // Pulse the status bar item for this layer
      const layerId = e.detail?.layerId as string;
      if (layerId) {
        const items = statusBar.querySelectorAll('.nw-statusbar-item');
        for (const item of items) {
          if (item.textContent?.includes(layerManager.getLayer(layerId)?.name || '')) {
            item.classList.add('refreshing');
            setTimeout(() => item.classList.remove('refreshing'), 800);
          }
        }
      }
    }) as EventListener,
    { signal },
  );

  document.addEventListener(
    'dashview:intel-update',
    () => {
      if (activeTab === 'intel') debouncedSidebarRender();
    },
    { signal },
  );

  // ── Sitrep button ──
  sitrepBtn.addEventListener('click', async () => {
    sitrepBtn.textContent = 'GENERATING...';
    sitrepBtn.disabled = true;
    try {
      const result = await generateSitrep('Global', getLayerData());
      showSitrep(mapContainer, result.sitrep, result.generatedAt);
    } catch (err) {
      showSitrep(mapContainer, `Error: ${err instanceof Error ? err.message : 'Failed'}`, '');
    } finally {
      sitrepBtn.textContent = 'SITREP';
      sitrepBtn.disabled = false;
    }
  });

  // ── Personal brief button ──
  briefBtn.addEventListener('click', async () => {
    briefBtn.textContent = 'GENERATING...';
    briefBtn.disabled = true;
    try {
      const result = await generatePersonalBrief(getLayerData());
      showSitrep(mapContainer, result.sitrep, result.generatedAt);
    } catch (err) {
      showSitrep(mapContainer, `Error: ${err instanceof Error ? err.message : 'Failed'}`, '');
    } finally {
      briefBtn.textContent = 'MY BRIEF';
      briefBtn.disabled = false;
    }
  });

  // ── Fullscreen toggle ──
  let exitBtn: HTMLElement | null = null;
  function toggleFullscreen() {
    const isFS = app.classList.toggle('nw-fullscreen');
    if (isFS) {
      exitBtn = createElement('button', { className: 'nw-fullscreen-exit', textContent: 'EXIT FULLSCREEN (Esc)' });
      exitBtn.addEventListener('click', toggleFullscreen);
      mapContainer.appendChild(exitBtn);
    } else {
      exitBtn?.remove();
      exitBtn = null;
    }
    // Trigger map resize after layout change
    setTimeout(() => mapView.getMap()?.resize(), 100);
  }

  // ── Keyboard shortcuts ──
  document.addEventListener(
    'keydown',
    (e) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      switch (e.key) {
        case '1':
        case '2':
        case '3':
        case '4':
        case '5':
        case '6':
        case '7': {
          const layers = layerManager.getAllLayers();
          const idx = parseInt(e.key) - 1;
          if (idx < layers.length) {
            layerManager.toggle(layers[idx].id);
            layerDrawer.refresh();
          }
          break;
        }
        case 's':
          if (!e.ctrlKey && !e.metaKey) sitrepBtn.click();
          break;
        case 'Escape':
          mapContainer.querySelector('.nw-sitrep-overlay')?.remove();
          if (app.classList.contains('nw-fullscreen')) toggleFullscreen();
          break;
        case 'f':
          if (!e.ctrlKey && !e.metaKey) toggleFullscreen();
          break;
        case '?':
          showShortcutsHelp(mapContainer);
          break;
      }
    },
    { signal },
  );

  // ── Cleanup ──
  signal.addEventListener('abort', () => {
    clearInterval(clockInterval);
    mapView.destroy();
    layerManager.destroy();
    floatMgr.destroy();
    destroyGeoIntelligence();
  });

  window.addEventListener(
    'hashchange',
    () => {
      if (!['#/', '#/app', ''].includes(window.location.hash)) {
        nwAbort?.abort();
        nwAbort = null;
      }
    },
    { signal },
  );
}

// ── Intel Tab ──

function renderIntelTab(container: HTMLElement, mapView: MapView, layerMgr: MapLayerManager): void {
  // Data summary strip
  const summary = createElement('div', { className: 'nw-data-summary' });
  const stats = [
    { id: 'earthquakes', label: 'QUAKES', color: '#ff3c3c' },
    { id: 'fires', label: 'FIRES', color: '#ff6b00' },
    { id: 'news', label: 'NEWS', color: '#eab308' },
    { id: 'flights', label: 'FLIGHTS', color: '#818cf8' },
    { id: 'conflicts', label: 'CONFLICTS', color: '#ef4444' },
  ];
  for (const stat of stats) {
    const layer = layerMgr.getLayer(stat.id);
    const count = layer?.getFeatureCount() || 0;
    const cell = createElement('div', { className: 'nw-stat-cell' });
    cell.innerHTML = `<span class="nw-stat-value" style="color:${stat.color}">${count}</span><span class="nw-stat-label">${stat.label}</span>`;
    summary.appendChild(cell);
  }
  container.appendChild(summary);

  // Watchlist matches
  const watchMatches = getWatchMatches();
  if (watchMatches.length > 0) {
    const watchHeader = createElement('div', { className: 'nw-section-header', textContent: 'WATCHLIST' });
    container.appendChild(watchHeader);
    for (const match of watchMatches.slice(0, 10)) {
      const row = createElement('div', { className: 'nw-alert-row' });
      const dot = createElement('span', { className: 'nw-alert-dot' });
      dot.style.background = '#ff6600';
      const tag = createElement('span', { className: 'nw-watch-tag' });
      tag.textContent = match.watchLabel;
      const text = createElement('span', { className: 'nw-alert-text' });
      text.textContent = `[${match.source}] ${match.text}`;
      row.appendChild(dot);
      row.appendChild(tag);
      row.appendChild(text);
      if (match.lat !== 0 || match.lon !== 0) {
        row.addEventListener('click', () => mapView.flyTo(match.lon, match.lat, 6));
      }
      container.appendChild(row);
    }
  }

  // Triggered alert rules
  const triggered = getTriggeredAlerts();
  if (triggered.length > 0) {
    const ruleHeader = createElement('div', { className: 'nw-section-header', textContent: 'TRIGGERED RULES' });
    container.appendChild(ruleHeader);
    for (const alert of triggered.slice(0, 5)) {
      const row = createElement('div', { className: 'nw-alert-row' });
      const dot = createElement('span', { className: 'nw-alert-dot critical' });
      const text = createElement('span', { className: 'nw-alert-text', textContent: alert.message });
      const time = createElement('span', { className: 'nw-alert-time' });
      const ago = Math.floor((Date.now() - alert.timestamp) / 60000);
      time.textContent = ago < 1 ? 'now' : `${ago}m`;
      row.appendChild(dot);
      row.appendChild(text);
      row.appendChild(time);
      container.appendChild(row);
    }
  }

  // Geo-intelligence alerts
  const alertHeader = createElement('div', { className: 'nw-section-header', textContent: 'INTELLIGENCE' });
  container.appendChild(alertHeader);

  const items = getIntelItems();
  if (items.length === 0) {
    container.appendChild(
      createElement('div', { className: 'nw-placeholder', textContent: 'Monitoring — no alerts yet' }),
    );
  } else {
    for (const item of items.slice(0, 20)) {
      container.appendChild(createAlertRow(item, mapView));
    }
  }

  // Country index section
  const countryHeader = createElement('div', { className: 'nw-section-header', textContent: 'COUNTRY INDEX' });
  container.appendChild(countryHeader);

  const scores = getCachedScores();
  if (scores.length === 0) {
    for (let i = 0; i < 8; i++) {
      const sk = createElement('div', { className: 'nw-skeleton-row' });
      const bar1 = createElement('div', { className: 'nw-skeleton-bar' });
      bar1.style.width = '20px';
      bar1.style.flexShrink = '0';
      const bar2 = createElement('div', { className: 'nw-skeleton-bar' });
      bar2.style.flex = '1';
      const bar3 = createElement('div', { className: 'nw-skeleton-bar' });
      bar3.style.width = '32px';
      sk.appendChild(bar1);
      sk.appendChild(bar2);
      sk.appendChild(bar3);
      container.appendChild(sk);
    }
  } else {
    for (const score of scores) {
      container.appendChild(createCountryRow(score, mapView));
    }
  }

  // Layers section
  const layersHeader = createElement('div', { className: 'nw-section-header nw-section-collapsible' });
  layersHeader.textContent = `DATA LAYERS (${layerMgr.getAllLayers().length})`;
  let layersExpanded = true;
  layersHeader.addEventListener('click', () => {
    layersExpanded = !layersExpanded;
    layersBody.style.display = layersExpanded ? '' : 'none';
    layersHeader.classList.toggle('collapsed', !layersExpanded);
  });
  container.appendChild(layersHeader);

  const layersBody = createElement('div', {});
  const CATEGORY_ORDER: MapLayerCategory[] = ['natural', 'conflict', 'infrastructure', 'intelligence', 'weather'];
  const CATEGORY_LABELS: Record<string, string> = {
    natural: 'NATURAL',
    conflict: 'CONFLICT',
    infrastructure: 'INFRASTRUCTURE',
    intelligence: 'INTELLIGENCE',
    weather: 'WEATHER',
  };

  for (const cat of CATEGORY_ORDER) {
    const catLayers = layerMgr.getLayersByCategory(cat);
    if (catLayers.length === 0) continue;

    const catLabel = createElement('div', { className: 'nw-layer-cat-label', textContent: CATEGORY_LABELS[cat] });
    layersBody.appendChild(catLabel);

    for (const layer of catLayers) {
      const row = createElement('label', { className: 'nw-layer-row' });
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = layer.isEnabled();
      toggle.className = 'nw-layer-toggle';
      toggle.addEventListener('change', () => {
        layerMgr.toggle(layer.id);
      });

      const name = createElement('span', { className: 'nw-layer-name', textContent: layer.name });
      const count = createElement('span', { className: 'nw-layer-count' });
      if (layer.isEnabled() && layer.getFeatureCount() > 0) {
        count.textContent = String(layer.getFeatureCount());
      }

      row.appendChild(toggle);
      row.appendChild(name);
      row.appendChild(count);
      layersBody.appendChild(row);
    }
  }
  container.appendChild(layersBody);
}

function createAlertRow(item: IntelItem, mapView: MapView): HTMLElement {
  const row = createElement('div', { className: 'nw-alert-row' });

  const dot = createElement('span', { className: 'nw-alert-dot' });
  dot.classList.add(item.priority === 0 ? 'critical' : item.priority === 1 ? 'elevated' : 'monitor');

  const text = createElement('span', { className: 'nw-alert-text', textContent: item.text });

  row.appendChild(dot);
  row.appendChild(text);

  if (item.lat !== 0 || item.lon !== 0) {
    row.addEventListener('click', () => mapView.flyTo(item.lon, item.lat, 6));
  }

  return row;
}

function createCountryRow(score: CountryIntelScore, mapView: MapView): HTMLElement {
  const row = createElement('div', { className: 'nw-country-row' });
  const { label, color } = scoreToLabel(score.score);

  const flag = createElement('span', { className: 'nw-country-flag' });
  flag.textContent = countryFlag(score.code);

  const name = createElement('span', { className: 'nw-country-name', textContent: score.name });

  const labelEl = createElement('span', { className: 'nw-country-label' });
  labelEl.style.color = color;
  labelEl.textContent = label;

  const scoreEl = createElement('span', { className: 'nw-country-score' });
  scoreEl.style.color = color;
  scoreEl.textContent = String(score.score);

  row.appendChild(flag);
  row.appendChild(name);
  row.appendChild(labelEl);
  row.appendChild(scoreEl);

  // Fly to country on click
  const COORDS: Record<string, [number, number]> = {
    US: [-98.5, 39.8],
    RU: [105.3, 61.5],
    CN: [104.2, 35.9],
    UA: [31.2, 48.4],
    IL: [34.9, 31.0],
    IR: [53.7, 32.4],
    IN: [78.9, 20.6],
    GB: [-2.0, 54.0],
    FR: [2.2, 46.2],
    DE: [10.4, 51.2],
    JP: [138.3, 36.2],
    BR: [-51.9, -14.2],
    TR: [35.2, 38.9],
    SA: [45.1, 23.9],
    EG: [30.8, 26.8],
    PK: [69.3, 30.4],
    NG: [8.7, 9.1],
    MX: [-102.6, 23.6],
    KR: [127.8, 35.9],
    AU: [133.8, -25.3],
    SY: [38.9, 34.8],
    AF: [67.7, 33.9],
    IQ: [43.7, 33.2],
  };

  const coords = COORDS[score.code];
  if (coords) {
    row.addEventListener('click', () => mapView.flyTo(coords[0], coords[1], 5));
  }

  return row;
}

// ── Sitrep Overlay ──

function showSitrep(container: HTMLElement, text: string, generatedAt: string): void {
  container.querySelector('.nw-sitrep-overlay')?.remove();

  const overlay = createElement('div', { className: 'nw-sitrep-overlay' });

  const header = createElement('div', { className: 'nw-sitrep-header' });
  const title = createElement('span', { className: 'nw-sitrep-title', textContent: 'SITUATION REPORT' });
  const closeBtn = createElement('button', { className: 'nw-sitrep-close', textContent: 'X' });
  closeBtn.addEventListener('click', () => overlay.remove());
  header.appendChild(title);
  if (generatedAt) {
    const time = createElement('span', {});
    time.style.color = '#444444';
    time.style.fontSize = '9px';
    time.textContent = new Date(generatedAt).toLocaleTimeString();
    header.appendChild(time);
  }
  header.appendChild(closeBtn);

  const body = createElement('div', { className: 'nw-sitrep-body' });
  body.textContent = text;

  overlay.appendChild(header);
  overlay.appendChild(body);
  container.appendChild(overlay);
}

function showShortcutsHelp(container: HTMLElement): void {
  const text = [
    '1-7     Toggle first 7 layers',
    'S       Generate SITREP',
    'F       Fullscreen mode',
    'Esc     Close overlays / exit fullscreen',
    '?       This help',
    '',
    'Click   Layer chips to toggle',
    'Click   Country row to fly to location',
    'Click   Alert row to fly to event',
    'Hover   Map features for details',
  ].join('\n');
  showSitrep(container, text, '');
}

// ── Utils ──

function countryFlag(code: string): string {
  const OFFSET = 0x1f1e6 - 65;
  return String.fromCodePoint(code.charCodeAt(0) + OFFSET, code.charCodeAt(1) + OFFSET);
}
