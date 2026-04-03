import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface GdacsAlert {
  id: string;
  title: string;
  type: string;
  severity: string;
  lat: number;
  lon: number;
  date: string;
  country: string;
  description: string;
}

const TYPE_COLORS: Record<string, string> = {
  earthquake: '#ff3c3c',
  tsunami: '#3b82f6',
  flood: '#06b6d4',
  cyclone: '#8b5cf6',
  volcano: '#f97316',
  drought: '#eab308',
  other: '#6b7280',
};

const SEVERITY_SIZES: Record<string, number> = {
  red: 10,
  orange: 7,
  green: 5,
};

export class GdacsLayer implements MapDataLayer {
  readonly id = 'gdacs';
  readonly name = 'Disaster Alerts (GDACS)';
  readonly category = 'natural' as const;
  readonly icon = '🌊';
  readonly description = 'Tsunamis, floods, volcanos, cyclones from GDACS';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: GdacsAlert[] = [];
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
    try {
      const res = await fetchWithRetry('/api/gdacs');
      if (!res.ok) throw new Error('GDACS API error');
      const result = (await res.json()) as { alerts: GdacsAlert[] };
      this.data = result.alerts;
      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('GDACS layer error:', err);
    }
  }

  getRefreshInterval(): number {
    return 1800_000;
  } // 30 min
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
      features: this.data.map((a) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
        properties: {
          ...a,
          color: TYPE_COLORS[a.type] || '#6b7280',
          radius: SEVERITY_SIZES[a.severity] || 5,
        },
      })),
    };

    this.map.addSource('gdacs', { type: 'geojson', data: geojson });

    // Alert glow
    this.map.addLayer({
      id: 'gdacs-glow',
      type: 'circle',
      source: 'gdacs',
      paint: {
        'circle-radius': ['*', ['get', 'radius'], 3],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.12,
        'circle-blur': 0.6,
      },
    });

    // Alert marker
    this.map.addLayer({
      id: 'gdacs-markers',
      type: 'circle',
      source: 'gdacs',
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
        'circle-opacity': 0.9,
      },
    });

    // Labels
    this.map.addLayer({
      id: 'gdacs-labels',
      type: 'symbol',
      source: 'gdacs',
      layout: {
        'text-field': ['get', 'type'],
        'text-size': 9,
        'text-offset': [0, 1.5],
        'text-font': ['Open Sans Bold'],
        'text-transform': 'uppercase',
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'gdacs-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'gdacs-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'gdacs-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `${String(p.severity).toUpperCase()} ${String(p.type).toUpperCase()}`,
            typeColor: String(p.color),
            title: String(p.title),
            fields: [{ label: 'Date', value: String(p.date) }],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['gdacs-labels', 'gdacs-markers', 'gdacs-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('gdacs')) this.map.removeSource('gdacs');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
