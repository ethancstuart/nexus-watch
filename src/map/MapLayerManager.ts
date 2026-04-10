import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './layers/LayerDefinition.ts';
import type { MapLayerCategory } from '../types/index.ts';

const STORAGE_KEY = 'dashview:map-layers';

export class MapLayerManager {
  private layers = new Map<string, MapDataLayer>();
  private intervals = new Map<string, ReturnType<typeof setInterval>>();
  private map: MaplibreMap | null = null;

  setMap(map: MaplibreMap): void {
    this.map = map;
  }

  register(layer: MapDataLayer): void {
    this.layers.set(layer.id, layer);
    if (this.map) {
      layer.init(this.map);
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
        // Stagger API calls to avoid thundering herd on page load
        setTimeout(() => {
          void layer.refresh();
          this.startRefreshCycle(layer);
        }, delay);
        delay += 200;
      }
    }
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
    // Default: enable high-impact layers
    return [
      'earthquakes',
      'news',
      'fires',
      'weather-alerts',
      'conflicts',
      'military',
      'cables',
      'cyber',
      'flights',
      'ships',
      'acled',
      'frontlines',
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
