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

// Curated from IFES ElectionGuide + Wikipedia. Last updated: 2026-04-14.
// No free global election API exists — this is the standard approach.
// Past elections automatically filtered out at render time.
const LAST_CURATED = '2026-04-14';

const ALL_ELECTIONS: Election[] = [
  // 2026 — upcoming within the year
  { country: 'Brazil', type: 'presidential', date: '2026-10-04', lat: -15.8, lon: -47.9, significance: 'high' },
  { country: 'Hungary', type: 'parliamentary', date: '2026-04-12', lat: 47.5, lon: 19.0, significance: 'high' },
  { country: 'Peru', type: 'presidential', date: '2026-04-12', lat: -9.2, lon: -75.0, significance: 'high' },
  { country: 'Sweden', type: 'parliamentary', date: '2026-09-13', lat: 59.3, lon: 18.1, significance: 'medium' },
  { country: 'Nicaragua', type: 'presidential', date: '2026-11-01', lat: 12.1, lon: -86.3, significance: 'medium' },
  { country: 'Netherlands', type: 'parliamentary', date: '2026-03-22', lat: 52.4, lon: 4.9, significance: 'medium' },
  // 2027
  { country: 'Argentina', type: 'presidential', date: '2027-10-24', lat: -34.6, lon: -58.4, significance: 'high' },
  { country: 'Mexico', type: 'parliamentary', date: '2027-06-06', lat: 19.4, lon: -99.1, significance: 'high' },
  { country: 'South Korea', type: 'presidential', date: '2027-03-03', lat: 37.6, lon: 127.0, significance: 'high' },
  { country: 'France', type: 'presidential', date: '2027-04-10', lat: 48.9, lon: 2.3, significance: 'high' },
  { country: 'Nigeria', type: 'presidential', date: '2027-02-18', lat: 9.1, lon: 7.5, significance: 'high' },
  { country: 'Turkey', type: 'presidential', date: '2028-06-18', lat: 39.9, lon: 32.9, significance: 'high' },
  { country: 'Kenya', type: 'presidential', date: '2027-08-10', lat: -1.3, lon: 36.8, significance: 'medium' },
  // 2028+
  { country: 'United States', type: 'presidential', date: '2028-11-07', lat: 38.9, lon: -77.0, significance: 'high' },
  { country: 'Germany', type: 'parliamentary', date: '2029-02-23', lat: 52.5, lon: 13.4, significance: 'high' },
  { country: 'United Kingdom', type: 'parliamentary', date: '2029-07-01', lat: 51.5, lon: -0.1, significance: 'high' },
  { country: 'India', type: 'parliamentary', date: '2029-05-01', lat: 28.6, lon: 77.2, significance: 'high' },
  { country: 'Indonesia', type: 'presidential', date: '2029-02-14', lat: -6.2, lon: 106.8, significance: 'high' },
  { country: 'Pakistan', type: 'parliamentary', date: '2029-02-08', lat: 30.4, lon: 69.3, significance: 'high' },
];

/**
 * Filter out past elections. Called at render time so the list is
 * always fresh relative to today — no manual curation decay.
 */
function getUpcomingElections(): Election[] {
  const now = Date.now();
  return ALL_ELECTIONS.filter((e) => new Date(e.date).getTime() > now);
}
const ELECTIONS = getUpcomingElections();

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
