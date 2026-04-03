import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface Outbreak {
  disease: string;
  country: string;
  lat: number;
  lon: number;
  severity: string;
  cases: number;
  date: string;
}

const DISEASE_COLORS: Record<string, string> = {
  Ebola: '#dc2626',
  Marburg: '#dc2626',
  'Mpox (Clade I)': '#f97316',
  Cholera: '#3b82f6',
  Dengue: '#eab308',
  'Avian Influenza (H5N1)': '#8b5cf6',
  Measles: '#f59e0b',
  Polio: '#06b6d4',
  'Lassa Fever': '#ef4444',
  Diphtheria: '#6b7280',
};

const SEVERITY_SIZES: Record<string, number> = {
  high: 8,
  medium: 6,
  low: 4,
};

export class DiseaseLayer implements MapDataLayer {
  readonly id = 'diseases';
  readonly name = 'Disease Outbreaks';
  readonly category = 'natural' as const;
  readonly icon = '🦠';
  readonly description = 'WHO disease outbreaks and epidemics';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: Outbreak[] = [];
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
      const res = await fetchWithRetry('/api/disease-outbreaks');
      if (!res.ok) throw new Error('Disease API error');
      const result = (await res.json()) as { outbreaks: Outbreak[] };
      this.data = result.outbreaks;
      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Disease layer error:', err);
    }
  }

  getRefreshInterval(): number {
    return 3600_000;
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
      features: this.data
        .filter((o) => o.lat !== 0 || o.lon !== 0)
        .map((o) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [o.lon, o.lat] },
          properties: {
            disease: o.disease,
            country: o.country,
            severity: o.severity,
            cases: o.cases,
            date: o.date,
            color: DISEASE_COLORS[o.disease] || '#ef4444',
            radius: SEVERITY_SIZES[o.severity] || 6,
          },
        })),
    };

    this.map.addSource('diseases', { type: 'geojson', data: geojson });

    // Outbreak glow
    this.map.addLayer({
      id: 'diseases-glow',
      type: 'circle',
      source: 'diseases',
      paint: {
        'circle-radius': ['*', ['get', 'radius'], 3],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.12,
        'circle-blur': 0.6,
      },
    });

    this.map.addLayer({
      id: 'diseases-markers',
      type: 'circle',
      source: 'diseases',
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
        'circle-opacity': 0.9,
      },
    });

    this.map.addLayer({
      id: 'diseases-labels',
      type: 'symbol',
      source: 'diseases',
      minzoom: 3,
      layout: {
        'text-field': ['get', 'disease'],
        'text-size': 9,
        'text-offset': [0, 1.5],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'diseases-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'diseases-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'diseases-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `${String(p.severity).toUpperCase()} OUTBREAK`,
            typeColor: String(p.color),
            title: String(p.disease),
            fields: [
              { label: 'Country', value: String(p.country) },
              { label: 'Cases', value: Number(p.cases) > 0 ? Number(p.cases).toLocaleString() : 'Monitoring' },
              { label: 'Reported', value: String(p.date) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['diseases-labels', 'diseases-markers', 'diseases-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('diseases')) this.map.removeSource('diseases');
    this.popup?.remove();
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
