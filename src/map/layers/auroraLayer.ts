import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';

/**
 * NOAA SWPC Aurora forecast — green/purple polar ovals from the OVATION model.
 *
 * Renders as a circle layer where each point is a 1°×1° grid cell. Strength
 * (0-100) drives opacity and color; cells <5 are filtered to keep the
 * globe legible.
 *
 * 2026-05-02 W7a: spectacle layer — looks visually stunning over poles.
 */

const SOURCE_ID = 'nw-aurora-source';
const LAYER_ID = 'nw-aurora-layer';

interface AuroraResponse {
  'Forecast Time'?: string;
  coordinates: Array<[number, number, number]>; // [lon, lat, strength 0-100]
}

export class AuroraLayer implements MapDataLayer {
  readonly id = 'aurora';
  readonly name = 'Aurora Forecast (NOAA)';
  readonly category = 'natural' as const;
  readonly icon = '✦';
  readonly description = 'Live aurora oval — NOAA SWPC OVATION model, 30-min refresh';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private points: Array<[number, number, number]> = [];

  init(map: MaplibreMap): void {
    this.map = map;
  }

  enable(): void {
    this.enabled = true;
    this.ensureSourceAndLayer();
    this.applyData();
  }

  disable(): void {
    this.enabled = false;
    if (!this.map) return;
    if (this.map.getLayer(LAYER_ID)) this.map.removeLayer(LAYER_ID);
    if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
  }

  async refresh(): Promise<void> {
    try {
      const res = await fetch('/api/aurora');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as AuroraResponse;
      this.points = (data.coordinates || []).filter((p) => p[2] >= 5);
      this.lastUpdated = Date.now();
      if (this.enabled) this.applyData();
      document.dispatchEvent(
        new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.points } }),
      );
    } catch (err) {
      console.error('[aurora] refresh failed', err);
    }
  }

  getRefreshInterval(): number {
    return 5 * 60 * 1000;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getLastUpdated(): number | null {
    return this.lastUpdated;
  }

  getFeatureCount(): number {
    return this.points.length;
  }

  destroy(): void {
    this.disable();
  }

  private ensureSourceAndLayer(): void {
    if (!this.map) return;
    if (!this.map.getSource(SOURCE_ID)) {
      this.map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
    }
    if (!this.map.getLayer(LAYER_ID)) {
      this.map.addLayer({
        id: LAYER_ID,
        type: 'circle',
        source: SOURCE_ID,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['get', 'strength'], 5, 4, 100, 14],
          'circle-color': [
            'interpolate',
            ['linear'],
            ['get', 'strength'],
            5,
            '#3b82f6',
            30,
            '#10b981',
            60,
            '#a855f7',
            90,
            '#ec4899',
          ],
          'circle-opacity': ['interpolate', ['linear'], ['get', 'strength'], 5, 0.18, 100, 0.7],
          'circle-blur': 0.6,
        },
      });
    }
  }

  private applyData(): void {
    if (!this.map) return;
    const src = this.map.getSource(SOURCE_ID) as { setData?: (d: unknown) => void } | undefined;
    if (!src?.setData) return;
    src.setData({
      type: 'FeatureCollection',
      features: this.points.map(([lon, lat, strength]) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [lon, lat] },
        properties: { strength },
      })),
    });
  }
}
