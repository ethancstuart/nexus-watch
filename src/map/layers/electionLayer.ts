import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface Election {
  country: string;
  type: 'presidential' | 'parliamentary' | 'referendum' | 'local';
  date: string;
  lat: number;
  lon: number;
  significance: 'high' | 'medium';
}

// Curated from IFES ElectionGuide + Wikipedia. Last updated: 2026-04-07.
// No free global election API exists — this is the standard approach.
const LAST_CURATED = '2026-04-07';

const ELECTIONS: Election[] = [
  // 2026 upcoming
  { country: 'Brazil', type: 'presidential', date: '2026-10-04', lat: -15.8, lon: -47.9, significance: 'high' },
  { country: 'Colombia', type: 'parliamentary', date: '2026-03-08', lat: 4.6, lon: -74.3, significance: 'high' },
  { country: 'Mexico', type: 'parliamentary', date: '2027-06-01', lat: 19.4, lon: -99.1, significance: 'high' },
  { country: 'Philippines', type: 'parliamentary', date: '2025-05-12', lat: 14.6, lon: 121.0, significance: 'medium' },
  { country: 'Australia', type: 'parliamentary', date: '2025-05-17', lat: -33.9, lon: 151.2, significance: 'medium' },
  { country: 'Chile', type: 'presidential', date: '2025-11-16', lat: -33.4, lon: -70.6, significance: 'medium' },
  { country: 'Iraq', type: 'parliamentary', date: '2025-10-01', lat: 33.2, lon: 43.7, significance: 'high' },
  { country: 'Norway', type: 'parliamentary', date: '2025-09-08', lat: 59.9, lon: 10.8, significance: 'medium' },
  {
    country: 'Czech Republic',
    type: 'parliamentary',
    date: '2025-10-10',
    lat: 50.1,
    lon: 14.4,
    significance: 'medium',
  },
  { country: 'Argentina', type: 'parliamentary', date: '2025-10-26', lat: -34.6, lon: -58.4, significance: 'high' },
  { country: 'Japan', type: 'parliamentary', date: '2025-07-27', lat: 35.7, lon: 139.7, significance: 'high' },
  { country: 'Bolivia', type: 'presidential', date: '2025-08-17', lat: -16.5, lon: -68.1, significance: 'medium' },
  { country: 'Ivory Coast', type: 'presidential', date: '2025-10-25', lat: 5.3, lon: -4.0, significance: 'medium' },
  { country: 'Tanzania', type: 'presidential', date: '2025-10-01', lat: -6.8, lon: 39.3, significance: 'medium' },
  { country: 'Honduras', type: 'presidential', date: '2025-11-30', lat: 14.1, lon: -87.2, significance: 'medium' },
  { country: 'Guinea', type: 'presidential', date: '2025-12-01', lat: 9.5, lon: -13.7, significance: 'medium' },
  // 2027+
  { country: 'South Korea', type: 'presidential', date: '2027-03-09', lat: 37.6, lon: 127.0, significance: 'high' },
  { country: 'France', type: 'presidential', date: '2027-04-10', lat: 48.9, lon: 2.3, significance: 'high' },
  { country: 'Nigeria', type: 'presidential', date: '2027-02-18', lat: 9.1, lon: 7.5, significance: 'high' },
  { country: 'Germany', type: 'parliamentary', date: '2029-02-23', lat: 52.5, lon: 13.4, significance: 'high' },
  { country: 'United Kingdom', type: 'parliamentary', date: '2029-07-01', lat: 51.5, lon: -0.1, significance: 'high' },
  { country: 'United States', type: 'presidential', date: '2028-11-05', lat: 38.9, lon: -77.0, significance: 'high' },
  { country: 'India', type: 'parliamentary', date: '2029-05-01', lat: 28.6, lon: 77.2, significance: 'high' },
  { country: 'Indonesia', type: 'presidential', date: '2029-02-14', lat: -6.2, lon: 106.8, significance: 'high' },
];

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export class ElectionLayer implements MapDataLayer {
  readonly id = 'elections';
  readonly name = 'Election Calendar';
  readonly category = 'intelligence' as const;
  readonly icon = '🗳';
  readonly description = `Upcoming elections worldwide (curated ${LAST_CURATED})`;

  private map: MaplibreMap | null = null;
  private enabled = false;
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
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: ELECTIONS } }));
  }
  getRefreshInterval(): number {
    return 0;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
  getLastUpdated(): number | null {
    return Date.now();
  }
  getFeatureCount(): number {
    return ELECTIONS.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: ELECTIONS.map((e) => {
        const days = daysUntil(e.date);
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] },
          properties: {
            country: e.country,
            type: e.type,
            date: e.date,
            days,
            significance: e.significance,
            color: days <= 30 ? '#ef4444' : days <= 90 ? '#f97316' : '#8b5cf6',
          },
        };
      }),
    };
    this.map.addSource('elections', { type: 'geojson', data: geojson });
    this.map.addLayer({
      id: 'elections-glow',
      type: 'circle',
      source: 'elections',
      paint: { 'circle-radius': 16, 'circle-color': ['get', 'color'], 'circle-opacity': 0.1, 'circle-blur': 0.5 },
    });
    this.map.addLayer({
      id: 'elections-markers',
      type: 'circle',
      source: 'elections',
      paint: {
        'circle-radius': 6,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
        'circle-opacity': 0.9,
      },
    });
    this.map.addLayer({
      id: 'elections-labels',
      type: 'symbol',
      source: 'elections',
      minzoom: 2,
      layout: {
        'text-field': ['concat', ['get', 'country'], '\n', ['to-string', ['get', 'days']], 'd'],
        'text-size': 9,
        'text-offset': [0, 1.8],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'elections-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'elections-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'elections-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `${String(p.type).toUpperCase()} ELECTION`,
            typeColor: String(p.color),
            title: String(p.country),
            fields: [
              { label: 'Date', value: String(p.date) },
              { label: 'In', value: `${p.days} days` },
            ],
          }),
        )
        .addTo(this.map);
    });
  }
  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['elections-labels', 'elections-markers', 'elections-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('elections')) this.map.removeSource('elections');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
