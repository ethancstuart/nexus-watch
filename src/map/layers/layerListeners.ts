import type { Map as MaplibreMap, MapLayerEventType } from 'maplibre-gl';

type LayerEvent = keyof MapLayerEventType;
type LayerHandler = (e: MapLayerEventType[LayerEvent] & object) => void;

interface TrackedListener {
  event: LayerEvent;
  layerId: string;
  handler: LayerHandler;
}

/**
 * Tracks MapLibre event listeners per layer so they can be removed in removeLayer().
 * Usage:
 *   const listeners = new LayerListeners(map);
 *   listeners.on('mouseenter', 'my-layer', handler);
 *   listeners.removeAll(); // call in removeLayer()
 */
export class LayerListeners {
  private map: MaplibreMap;
  private tracked: TrackedListener[] = [];

  constructor(map: MaplibreMap) {
    this.map = map;
  }

  on(event: LayerEvent, layerId: string, handler: LayerHandler): void {
    this.map.on(event, layerId, handler);
    this.tracked.push({ event, layerId, handler });
  }

  removeAll(): void {
    for (const { event, layerId, handler } of this.tracked) {
      try {
        this.map.off(event, layerId, handler);
      } catch {
        // Layer may already be removed from the map — safe to ignore.
      }
    }
    this.tracked = [];
  }
}
