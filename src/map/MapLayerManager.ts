import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './layers/LayerDefinition.ts';
import type { MapLayerCategory } from '../types/index.ts';

const STORAGE_KEY = 'dashview:map-layers';

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
        // Increased from 300ms to 800ms spacing (2026-04-18 perf fix).
        // Heavy layers (flights, ships, satellites) get extra 3s delay.
        const heavyLayers = new Set(['flights', 'ships', 'satellites']);
        const layerDelay = heavyLayers.has(id) ? delay + 3000 : delay;
        setTimeout(() => {
          void layer.refresh();
          this.startRefreshCycle(layer);
        }, layerDelay);
        delay += 800;
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
    // Default: enable high-impact layers for a rich first experience.
    // These should make the map look alive and data-dense on first visit.
    return [
      // Core live data
      'earthquakes',
      'acled',
      'fires',
      'flights',
      'ships',
      'news',
      'weather-alerts',
      'cyber',
      // Reference data that looks good on the globe
      'conflict-zones',
      'frontlines',
      'military',
      'cables',
      // Intelligence layers
      'chokepoint-status',
      'internet-outages',
      'gdacs',
      'nuclear',
      'ports',
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
