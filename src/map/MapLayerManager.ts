import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './layers/LayerDefinition.ts';
import type { MapLayerCategory } from '../types/index.ts';

const STORAGE_KEY = 'dashview:map-layers';

const MAX_CONCURRENT_REFRESHES = 12;

export class MapLayerManager {
  private layers = new Map<string, MapDataLayer>();
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private map: MaplibreMap | null = null;
  private initDone = false;

  setMap(map: MaplibreMap): void {
    this.map = map;
  }

  register(layer: MapDataLayer): void {
    this.layers.set(layer.id, layer);
    if (this.map) {
      layer.init(this.map);

      // If initAll() already ran (lazy layer arriving late), check if
      // this layer should be auto-enabled based on saved/default list.
      if (this.initDone) {
        const enabledIds = this.loadEnabledLayers();
        if (enabledIds.includes(layer.id)) {
          layer.enable();
          // Stagger: small delay so lazy layers don't all fire at once
          const delay = Math.random() * 2000 + 500;
          setTimeout(() => {
            void layer.refresh();
            this.startRefreshCycle(layer);
          }, delay);
        }
      }
    }
  }

  initAll(): void {
    if (!this.map) return;
    const enabledIds = this.loadEnabledLayers();
    let delay = 0;
    for (const [id, layer] of this.layers) {
      layer.init(this.map);
      if (enabledIds.includes(id)) {
        layer.enable();
        // Stagger API calls to avoid thundering herd on page load.
        // 2026-05-02 perf pass: dropped base 800→250ms, heavy +3000→+750ms.
        // Total boot for 18 default layers: ~5s → ~1.8s.
        const heavyLayers = new Set(['flights', 'ships', 'satellites', 'clouds', 'aurora']);
        const layerDelay = heavyLayers.has(id) ? delay + 750 : delay;
        setTimeout(() => {
          void layer.refresh();
          this.startRefreshCycle(layer);
        }, layerDelay);
        delay += 250;
      }
    }
    // Mark init as done so late-registering lazy layers can auto-enable
    this.initDone = true;
  }

  toggle(layerId: string): boolean {
    const layer = this.layers.get(layerId);
    if (!layer) return false;

    if (layer.isEnabled()) {
      layer.disable();
      this.stopRefreshCycle(layerId);
    } else {
      layer.enable();
      void layer.refresh();
      this.startRefreshCycle(layer);
    }

    this.saveEnabledLayers();
    document.dispatchEvent(
      new CustomEvent('dashview:layer-toggle', { detail: { layerId, enabled: layer.isEnabled() } }),
    );
    return layer.isEnabled();
  }

  enable(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer || layer.isEnabled()) return;
    layer.enable();
    void layer.refresh();
    this.startRefreshCycle(layer);
    this.saveEnabledLayers();
  }

  disable(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (!layer || !layer.isEnabled()) return;
    layer.disable();
    this.stopRefreshCycle(layerId);
    this.saveEnabledLayers();
  }

  getLayer(id: string): MapDataLayer | undefined {
    return this.layers.get(id);
  }

  getAllLayers(): MapDataLayer[] {
    return Array.from(this.layers.values());
  }

  getLayersByCategory(category: MapLayerCategory): MapDataLayer[] {
    return this.getAllLayers().filter((l) => l.category === category);
  }

  getEnabledLayers(): MapDataLayer[] {
    return this.getAllLayers().filter((l) => l.isEnabled());
  }

  private startRefreshCycle(layer: MapDataLayer): void {
    this.stopRefreshCycle(layer.id);
    // Guard: limit concurrent refresh intervals to prevent CPU/memory bloat
    // when user enables all 45+ layers
    if (this.intervals.size >= MAX_CONCURRENT_REFRESHES) {
      // Layer is enabled and got its initial refresh, but won't auto-refresh.
      // This is acceptable — it'll show data from its last fetch, and the
      // layer will get a refresh cycle when another layer is disabled.
      return;
    }
    const interval = layer.getRefreshInterval();
    if (interval > 0) {
      this.intervals.set(
        layer.id,
        setInterval(() => void layer.refresh(), interval),
      );
    }
  }

  private stopRefreshCycle(layerId: string): void {
    const id = this.intervals.get(layerId);
    if (id !== undefined) {
      clearInterval(id);
      this.intervals.delete(layerId);
    }
  }

  private loadEnabledLayers(): string[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored) as string[];
    } catch {
      // ignore
    }
    // Default first-load layer set — varies by viewport.
    // Mobile (<= 768px): 2 layers only. The MapLibre globe is GPU-heavy on
    //   phones and 6 simultaneous data layers tank first paint. Users can
    //   open the LAYERS drawer and toggle more once the map is interactive.
    // Desktop: 6 curated layers (Chairman D-1, Apr 19) — clean first
    //   impression without overwhelming new users.
    // Returning users (any viewport) get their saved preferences from
    // localStorage instead.
    const isMobile =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(max-width: 768px)').matches;

    if (isMobile) {
      return [
        'earthquakes', // USGS seismic — pulsing circles
        'acled', // Active conflicts — red clusters
        'fires', // NASA FIRMS — orange hotspots
        'news', // GDELT events — blue markers
      ];
    }

    // 2026-05-02: bumped from 6 → 18 default desktop layers (Chairman D-11).
    // Globe is now rich on first paint without overwhelming. Heavy layers
    // (ships, satellites) get +750ms boot delay via initAll() stagger.
    return [
      // Hazards
      'earthquakes',
      'fires',
      'gdacs',
      'weather-alerts',
      // Conflict & military
      'acled',
      'conflicts',
      'frontlines',
      'sanctions',
      // Intelligence
      'news',
      'sentiment',
      'predictions',
      'internet-outages',
      // Infrastructure
      'chokepoints',
      'ports',
      'ships',
      'pipelines',
      'cables',
      'satellites',
    ];
  }

  /** Re-enable layers from localStorage (used by theater preset reset) */
  restoreSavedLayers(): void {
    const saved = this.loadEnabledLayers();
    for (const id of saved) {
      this.enable(id);
    }
  }

  private saveEnabledLayers(): void {
    const ids = this.getAllLayers()
      .filter((l) => l.isEnabled())
      .map((l) => l.id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }

  destroy(): void {
    for (const [id, layer] of this.layers) {
      this.stopRefreshCycle(id);
      layer.destroy();
    }
    this.layers.clear();
    this.intervals.clear();
    this.map = null;
  }
}
