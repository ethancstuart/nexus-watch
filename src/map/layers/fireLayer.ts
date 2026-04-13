import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { firePopup } from '../PopupCard.ts';
import type { FireHotspot } from '../../types/index.ts';
import { fetchFireHotspots } from '../../services/fires.ts';
import { updateProvenance, SOURCE_REGISTRY } from '../../services/dataProvenance.ts';

export class FireLayer implements MapDataLayer {
  readonly id = 'fires';
  readonly name = 'Wildfires';
  readonly category = 'natural' as const;
  readonly icon = '🔥';
  readonly description = 'Active fire hotspots from NASA FIRMS';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: FireHotspot[] = [];
  private popup: maplibregl.Popup | null = null;

  init(map: MaplibreMap): void {
    this.map = map;
  }

  enable(): void {
    this.enabled = true;
    this.renderLayer();
  }

  disable(): void {
    this.enabled = false;
    this.removeLayer();
  }

  async refresh(): Promise<void> {
    const reg = SOURCE_REGISTRY[this.id];
    try {
      this.data = await fetchFireHotspots();
      this.lastUpdated = Date.now();
      if (reg) updateProvenance(this.id, { ...reg, dataPointCount: this.data.length, lastFetchOk: true });
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Fire layer refresh error:', err);
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.data.length,
          lastFetchOk: false,
          lastError: err instanceof Error ? err.message : String(err),
        });
    }
  }

  getRefreshInterval(): number {
    return 600_000; // 10 minutes
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getLastUpdated(): number | null {
    return this.lastUpdated;
  }

  getFeatureCount(): number {
    return this.data.length;
  }

  private renderLayer(): void {
    if (!this.map || this.data.length === 0) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [f.lon, f.lat] },
        properties: {
          brightness: f.brightness,
          confidence: f.confidence,
          frp: f.frp,
          satellite: f.satellite,
          acqDate: f.acqDate,
          acqTime: f.acqTime,
        },
      })),
    };

    this.map.addSource('fires', { type: 'geojson', data: geojson });

    // Heatmap layer for zoomed-out view
    this.map.addLayer({
      id: 'fires-heat',
      type: 'heatmap',
      source: 'fires',
      maxzoom: 8,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'frp'], 0, 0.1, 50, 0.5, 200, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.5, 8, 2],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(0,0,0,0)',
          0.2,
          'rgba(255,140,0,0.3)',
          0.4,
          'rgba(255,100,0,0.5)',
          0.6,
          'rgba(255,60,0,0.7)',
          0.8,
          'rgba(255,30,0,0.85)',
          1,
          'rgba(255,0,0,1)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 2, 4, 6, 8, 20],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.9, 8, 0.6],
      },
    });

    // Point layer for zoomed-in view
    this.map.addLayer({
      id: 'fires-points',
      type: 'circle',
      source: 'fires',
      minzoom: 5,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'frp'], 0, 2, 50, 5, 200, 10],
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'brightness'],
          300,
          '#ff8c00',
          350,
          '#ff4500',
          400,
          '#ff0000',
        ],
        'circle-stroke-width': 0.5,
        'circle-stroke-color': 'rgba(255,255,255,0.2)',
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.3, 6, 0.5, 7, 0.65, 8, 0.85],
      },
    });

    // Hover
    this.map.on('mouseenter', 'fires-points', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', 'fires-points', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });

    this.map.on('mousemove', 'fires-points', (e) => {
      if (!this.map || !e.features?.length) return;
      const props = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;

      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 12,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(firePopup(props))
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['fires-points', 'fires-heat']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('fires')) this.map.removeSource('fires');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
