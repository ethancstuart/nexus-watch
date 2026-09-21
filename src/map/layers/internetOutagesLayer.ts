import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface InternetOutage {
  country: string;
  code: string;
  lat: number;
  lon: number;
  severity: string;
  type: string;
  description: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#ef4444',
  moderate: '#f97316',
  normal: '#22c55e',
};

export class InternetOutagesLayer implements MapDataLayer {
  readonly id = 'internet-outages';
  readonly name = 'Internet Outages';
  readonly category = 'infrastructure' as const;
  readonly icon = '🌐';
  readonly description = 'Live internet connectivity monitoring via IODA BGP analysis';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: InternetOutage[] = [];
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
      const res = await fetchWithRetry('/api/internet-outages');
      if (!res.ok) throw new Error('Internet outages API error');
      const result = (await res.json()) as { outages: InternetOutage[] };
      this.data = result.outages;
      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Internet outages layer error:', err);
    }
  }

  getRefreshInterval(): number {
    return 300_000; // 5 minutes — matches IODA cache
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
      features: this.data.map((o) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [o.lon, o.lat] },
        properties: { ...o, color: SEVERITY_COLORS[o.severity] || '#eab308' },
      })),
    };

    this.map.addSource('internet-outages', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'internet-outages-glow',
      type: 'circle',
      source: 'internet-outages',
      paint: { 'circle-radius': 18, 'circle-color': ['get', 'color'], 'circle-opacity': 0.1, 'circle-blur': 0.6 },
    });
    this.map.addLayer({
      id: 'internet-outages-markers',
      type: 'circle',
      source: 'internet-outages',
      paint: {
        'circle-radius': ['match', ['get', 'severity'], 'critical', 8, 'high', 7, 'moderate', 6, 4],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.85,
      },
    });
    this.map.addLayer({
      id: 'internet-outages-labels',
      type: 'symbol',
      source: 'internet-outages',
      minzoom: 3,
      layout: {
        'text-field': ['get', 'country'],
        'text-size': 9,
        'text-offset': [0, 1.5],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'internet-outages-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'internet-outages-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'internet-outages-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `${String(p.severity).toUpperCase()} · ${String(p.type).toUpperCase()}`,
            typeColor: String(p.color),
            title: `${p.country} Internet Disruption`,
            fields: [{ label: 'Details', value: String(p.description) }],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['internet-outages-labels', 'internet-outages-markers', 'internet-outages-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('internet-outages')) this.map.removeSource('internet-outages');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
