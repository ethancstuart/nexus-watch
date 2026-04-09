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
import { EnergyLayer } from '../map/layers/energyLayer.ts';
import { SentimentLayer } from '../map/layers/sentimentLayer.ts';
import {
  initGeoIntelligence,
  destroyGeoIntelligence,
  getIntelItems,
  getLayerData,
} from '../services/geoIntelligence.ts';
import { computeCountryScores, getCachedScores, scoreToLabel } from '../services/countryIndex.ts';
import { generateSitrep } from '../services/sitrep.ts';
import { loadRules, checkRules, getTriggeredAlerts } from '../services/alertRules.ts';
import { computeTensionIndex, tensionColor, tensionLabel } from '../services/tensionIndex.ts';
import { createSparkline } from '../ui/sparkline.ts';
import { runThreatDetection, getAutoAlerts } from '../services/aiMonitor.ts';
import {
  loadWatchlist,
  scanForMatches,
  getWatchMatches,
  getWatchlist,
  addWatchItem,
  removeWatchItem,
} from '../services/watchlist.ts';
import { createMarketsTab } from '../ui/sidebarMarkets.ts';
import { createFeedsTab } from '../ui/sidebarFeeds.ts';
import { createMapSearch } from '../map/MapSearch.ts';
import { showOnboarding } from '../ui/onboardingOverlay.ts';
import { createMapLegend } from '../ui/mapLegend.ts';
import { createAiTerminal } from '../ui/aiTerminal.ts';
import { animateCounter } from '../ui/animatedCounter.ts';
import { identifyRegion } from '../utils/geo.ts';
import { FloatingWidgetManager } from '../map/FloatingWidget.ts';
import { createLayerDrawer } from '../map/LayerDrawer.ts';
import { CinemaMode } from '../cinema/CinemaMode.ts';
import { computeCorrelations } from '../services/correlationEngine.ts';
import { evaluateAlerts, setRules } from '../services/alertEngine.ts';
import { loadRulesFromStorage, openAlertBuilder } from '../ui/alertBuilder.ts';
import '../styles/alert-builder.css';
import '../styles/timeline.css';
import '../styles/brief.css';
import '../styles/user-menu.css';
import '../styles/mobile.css';
import { createTimelineSlider } from '../ui/timelineSlider.ts';
import { openBriefPanel } from '../ui/briefPanel.ts';
import { createUserMenu } from '../ui/userMenu.ts';
import { copyShareUrl, getViewStateFromUrl, type ViewState } from '../services/shareView.ts';
import { canAccess, showUpgradePrompt } from '../services/tierGating.ts';
import '../styles/tier-gating.css';
import { createMapStyleToggle } from '../map/MapStyleToggle.ts';
import type { IntelItem, CountryIntelScore, MapLayerCategory } from '../types/index.ts';

let nwAbort: AbortController | null = null;

export async function renderNexusWatch(root: HTMLElement): Promise<void> {
  if (nwAbort) nwAbort.abort();
  nwAbort = new AbortController();
  const signal = nwAbort.signal;

  root.textContent = '';

  // ── Loading overlay (shown until map loads) ──
  const loadingOverlay = createElement('div', { className: 'nw-loading-overlay' });
  loadingOverlay.innerHTML = `
    <div class="nw-loading-content">
      <div class="nw-loading-logo">NexusWatch</div>
      <div class="nw-loading-text">Initializing intelligence layers...</div>
      <div class="nw-loading-spinner"></div>
    </div>
  `;
  root.appendChild(loadingOverlay);

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
  sitrepBtn.title = 'Generate situation report (S)';
  const briefBtn = createElement('button', { className: 'nw-sitrep-btn', textContent: 'MY BRIEF' });
  briefBtn.title = 'Daily intelligence briefing';
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

  const cinemaBtn = createElement('button', { className: 'nw-sitrep-btn nw-essential', textContent: 'CINEMA' });
  cinemaBtn.title = 'Immersive intelligence broadcast (C)';
  const alertBtn = createElement('button', { className: 'nw-sitrep-btn', textContent: 'ALERTS' });
  alertBtn.title = 'Natural language alert builder (A)';
  alertBtn.addEventListener('click', () => {
    if (canAccess('nl-alerts-1')) openAlertBuilder(mapContainer);
    else showUpgradePrompt('Natural Language Alerts');
  });

  const shareBtn = createElement('button', { className: 'nw-sitrep-btn', textContent: 'SHARE' });
  shareBtn.title = 'Copy shareable link to clipboard';
  shareBtn.addEventListener('click', () => {
    const state: ViewState = {
      c: mapView.getViewState().center,
      z: mapView.getViewState().zoom,
      p: mapView.getViewState().pitch,
      b: mapView.getViewState().bearing,
      l: layerManager.getEnabledLayers().map((l) => l.id),
      pr: cinema.isActive() ? cinema.getActiveProfile().id : undefined,
    };
    void copyShareUrl(state).then((ok) => {
      shareBtn.textContent = ok ? 'COPIED!' : 'FAILED';
      setTimeout(() => { shareBtn.textContent = 'SHARE'; }, 2000);
    });
  });

  // Mobile sidebar toggle
  const mobileToggle = createElement('button', { className: 'nw-mobile-sidebar-toggle', textContent: '☰' });

  const userMenuSlot = createElement('div', {});

  topRight.appendChild(drawerToggleSlot);
  topRight.appendChild(sitrepBtn);
  topRight.appendChild(briefBtn);
  topRight.appendChild(popoutSlot);
  topRight.appendChild(mobileToggle);
  topRight.appendChild(alertBtn);
  topRight.appendChild(shareBtn);
  topRight.appendChild(cinemaBtn);
  topRight.appendChild(styleToggle);
  topRight.appendChild(userMenuSlot);
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
    new EnergyLayer(),
    new SentimentLayer(),
  ];

  for (const layer of allLayers) {
    layerManager.register(layer);
  }

  map.on('load', () => {
    layerManager.initAll();
    // Remove loading overlay
    loadingOverlay.classList.add('fade-out');
    setTimeout(() => loadingOverlay.remove(), 600);
  });

  // ── User Menu ──
  createUserMenu(userMenuSlot);

  // ── Upgrade confirmation (after Stripe checkout) ──
  if (window.location.search.includes('upgraded=true')) {
    const toast = createElement('div', { className: 'nw-upgrade-toast' });
    toast.innerHTML = '<span class="nw-upgrade-toast-text"><strong>Welcome to NexusWatch Pro!</strong> All features unlocked.</span><button class="nw-upgrade-toast-close" onclick="this.parentElement.remove()">✕</button>';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 6000);
    // Clean URL
    history.replaceState(null, '', window.location.pathname + window.location.hash);
  }

  // ── Persistent help button (bottom-right) ──
  const helpBtn = createElement('button', { className: 'nw-help-btn' });
  helpBtn.textContent = '?';
  helpBtn.title = 'Keyboard shortcuts & help';
  helpBtn.addEventListener('click', () => showShortcutsHelp(mapContainer));
  mapContainer.appendChild(helpBtn);

  // ── Mobile Sidebar Toggle ──
  mobileToggle.addEventListener('click', () => {
    sidebar.classList.toggle('mobile-open');
  });

  // ── Restore shared view state from URL ──
  const sharedView = getViewStateFromUrl();
  if (sharedView) {
    map.on('load', () => {
      mapView.getMap()?.flyTo({
        center: sharedView.c,
        zoom: sharedView.z,
        pitch: sharedView.p,
        bearing: sharedView.b,
        duration: 0,
      });
      // Enable shared layers
      for (const layer of layerManager.getAllLayers()) {
        if (sharedView.l.includes(layer.id) && !layer.isEnabled()) {
          layerManager.enable(layer.id);
        } else if (!sharedView.l.includes(layer.id) && layer.isEnabled()) {
          layerManager.disable(layer.id);
        }
      }
      // Enter cinema mode if shared with a profile
      if (sharedView.pr) {
        setTimeout(() => {
          cinema.enter();
          cinema.setProfile(sharedView.pr!);
        }, 2000);
      }
    });
  }

  // ── Timeline ──
  const timeline = createTimelineSlider(mapContainer);

  // ── Cinema Mode ──
  const cinema = new CinemaMode({
    app,
    mapContainer,
    mapView,
    layerManager,
    getLayerData,
    signal,
  });
  cinemaBtn.addEventListener('click', () => cinema.toggle());

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

  // ── Contextual AI narration on map click ──
  const mapInst = mapView.getMap();
  if (mapInst) {
    mapInst.on('click', (e) => {
      const features = mapInst.queryRenderedFeatures(e.point);
      const hasLayerFeature = features.some((f) => f.source && !f.source.startsWith('carto'));
      if (hasLayerFeature) return;

      // Show region context in sidebar
      const lat = e.lngLat.lat;
      const lon = e.lngLat.lng;
      const region = identifyRegion(lat, lon);
      if (region && activeTab === 'intel') {
        // Add a contextual note at the top of the sidebar
        const contextNote = sidebarContent.querySelector('.nw-context-note');
        if (contextNote) contextNote.remove();
        const note = createElement('div', { className: 'nw-context-note' });
        note.innerHTML = `<span class="nw-context-label">VIEWING</span><span class="nw-context-region">${region}</span><span class="nw-context-coords">${lat.toFixed(2)}°, ${lon.toFixed(2)}°</span>`;
        sidebarContent.insertBefore(note, sidebarContent.firstChild);
      }
    });
  }

  // ── Map Legend ──
  const legend = createMapLegend(layerManager);
  mapContainer.appendChild(legend);

  // ── AI Terminal ──
  const terminal = createAiTerminal({ mapView, layerManager, getLayerData });
  mapContainer.appendChild(terminal);

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

  // Load NL alert rules from storage
  const savedNLRules = loadRulesFromStorage();
  if (savedNLRules.length > 0) setRules(savedNLRules);
  // Notification permission requested on first alert trigger, not page load

  document.addEventListener(
    'dashview:layer-data',
    ((e: CustomEvent) => {
      const ld = getLayerData();
      computeCountryScores(ld);
      computeCorrelations(ld);
      evaluateAlerts(ld);

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
      // Apply severity class for badge glow
      tensionSlot.classList.remove('elevated', 'critical');
      if (tension.global >= 75) tensionSlot.classList.add('critical');
      else if (tension.global >= 50) tensionSlot.classList.add('elevated');
      // Sparkline for tension history
      const existingSpark = tensionSlot.querySelector('.nw-sparkline');
      if (existingSpark) existingSpark.remove();
      if (tension.history.length > 2) {
        const sparkValues = tension.history.slice(-24).map((h) => h.value);
        tensionSlot.appendChild(createSparkline(sparkValues, 40, 14, tensionColor(tension.global)));
      }
      layerDrawer.refresh();
      if (activeTab === 'intel') debouncedSidebarRender();

      // Check alert rules + watchlist + auto threat detection
      checkRules(getLayerData());
      scanForMatches(getLayerData());
      runThreatDetection(getLayerData());

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

  document.addEventListener(
    'dashview:watchlist-changed',
    () => {
      if (activeTab === 'intel') renderSidebarContent();
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

  // ── Personal brief button — opens daily intelligence brief panel ──
  briefBtn.addEventListener('click', () => openBriefPanel(mapContainer));

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
        case 'a':
          if (!e.ctrlKey && !e.metaKey) {
            if (canAccess('nl-alerts-1')) openAlertBuilder(mapContainer);
            else showUpgradePrompt('Natural Language Alerts');
          }
          break;
        case 'l':
          if (!e.ctrlKey && !e.metaKey) {
            const logEl = document.querySelector('.cinema-event-log') as HTMLElement;
            if (logEl) logEl.style.display = logEl.style.display === 'none' ? '' : 'none';
          }
          break;
        case 't':
          if (!e.ctrlKey && !e.metaKey) {
            if (canAccess('timeline-48hr')) timeline.show();
            else showUpgradePrompt('Timeline Playback');
          }
          break;
        case 'c':
          if (!e.ctrlKey && !e.metaKey) cinema.toggle();
          break;
        case 'Escape':
          if (cinema.isActive()) {
            cinema.exit();
            break;
          }
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
    cinema.destroy();
    timeline.destroy();
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
    const valueEl = createElement('span', { className: 'nw-stat-value' });
    valueEl.style.color = stat.color;
    valueEl.textContent = String(count);
    valueEl.dataset.statId = stat.id;
    const labelEl = createElement('span', { className: 'nw-stat-label', textContent: stat.label });
    cell.appendChild(valueEl);
    cell.appendChild(labelEl);

    // Animate if we have a previous value
    const prevEl = document.querySelector(`.nw-stat-value[data-stat-id="${stat.id}"]`);
    if (prevEl && prevEl !== valueEl) {
      const prevCount = parseInt(prevEl.textContent || '0', 10);
      if (prevCount !== count) {
        valueEl.textContent = String(prevCount);
        requestAnimationFrame(() => animateCounter(valueEl, count));
      }
    }
    summary.appendChild(cell);
  }
  container.appendChild(summary);

  // Auto-generated threat alerts
  const autoAlerts = getAutoAlerts();
  if (autoAlerts.length > 0) {
    const autoHeader = createElement('div', { className: 'nw-section-header', textContent: 'THREAT DETECTION' });
    container.appendChild(autoHeader);
    for (const alert of autoAlerts.slice(0, 5)) {
      const row = createElement('div', { className: 'nw-alert-row' });
      const dot = createElement('span', { className: 'nw-alert-dot' });
      dot.classList.add(
        alert.severity === 'critical' ? 'critical' : alert.severity === 'elevated' ? 'elevated' : 'monitor',
      );
      const text = createElement('span', { className: 'nw-alert-text' });
      text.textContent = `[${alert.type.toUpperCase()}] ${alert.title}`;
      row.appendChild(dot);
      row.appendChild(text);
      if (alert.lat !== 0 || alert.lon !== 0) {
        row.addEventListener('click', () => mapView.flyTo(alert.lon, alert.lat, 6));
      }
      container.appendChild(row);
    }
  }

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

  // Watchlist management
  const watchMgmt = createElement('div', { className: 'nw-watch-mgmt' });
  const watchItems = getWatchlist();
  for (const item of watchItems) {
    const row = createElement('div', { className: 'nw-watch-item' });
    const label = createElement('span', { className: 'nw-watch-item-label', textContent: item.label });
    const removeBtn = createElement('button', { className: 'nw-watch-remove', textContent: '×' });
    removeBtn.addEventListener('click', () => {
      removeWatchItem(item.id);
      document.dispatchEvent(new CustomEvent('dashview:watchlist-changed'));
    });
    row.appendChild(label);
    row.appendChild(removeBtn);
    watchMgmt.appendChild(row);
  }
  // Add new item form
  const addRow = createElement('div', { className: 'nw-watch-add' });
  const addInput = document.createElement('input');
  addInput.type = 'text';
  addInput.className = 'nw-watch-input';
  addInput.placeholder = 'Add keyword...';
  const addBtn = createElement('button', { className: 'nw-watch-add-btn', textContent: '+' });
  addBtn.addEventListener('click', () => {
    const val = addInput.value.trim();
    if (val) {
      addWatchItem({ id: `w-${Date.now()}`, type: 'keyword', value: val.toLowerCase(), label: val });
      addInput.value = '';
      document.dispatchEvent(new CustomEvent('dashview:watchlist-changed'));
    }
  });
  addInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addBtn.click();
  });
  addRow.appendChild(addInput);
  addRow.appendChild(addBtn);
  watchMgmt.appendChild(addRow);
  container.appendChild(watchMgmt);

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
    'C       Cinema Mode (immersive broadcast)',
    'A       Alert Builder (natural language)',
    'T       Timeline Playback (historical)',
    'L       Toggle Event Log (in Cinema)',
    'S       Generate SITREP',
    'F       Fullscreen mode',
    '1-7     Toggle first 7 layers',
    'Esc     Close overlays / exit mode',
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

// identifyRegion moved to src/utils/geo.ts

function countryFlag(code: string): string {
  const OFFSET = 0x1f1e6 - 65;
  return String.fromCodePoint(code.charCodeAt(0) + OFFSET, code.charCodeAt(1) + OFFSET);
}
