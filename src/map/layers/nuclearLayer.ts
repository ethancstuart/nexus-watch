import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { nuclearPopup } from '../PopupCard.ts';

interface NuclearFacility {
  name: string;
  country: string;
  type: 'power' | 'enrichment' | 'research' | 'weapons' | 'waste';
  status: 'active' | 'construction' | 'decommissioned';
  lat: number;
  lon: number;
}

const FACILITIES: NuclearFacility[] = [
  // Power plants (major)
  { name: 'Zaporizhzhia NPP', country: 'UA', type: 'power', status: 'active', lat: 47.51, lon: 34.58 },
  { name: 'Fukushima Daiichi', country: 'JP', type: 'power', status: 'decommissioned', lat: 37.42, lon: 141.03 },
  { name: 'Bruce Power', country: 'CA', type: 'power', status: 'active', lat: 44.33, lon: -81.6 },
  { name: 'Kashiwazaki-Kariwa', country: 'JP', type: 'power', status: 'active', lat: 37.43, lon: 138.6 },
  { name: 'Gravelines', country: 'FR', type: 'power', status: 'active', lat: 51.01, lon: 2.11 },
  { name: 'Kori', country: 'KR', type: 'power', status: 'active', lat: 35.32, lon: 129.28 },
  { name: 'Taishan', country: 'CN', type: 'power', status: 'active', lat: 21.91, lon: 112.98 },
  { name: 'Barakah', country: 'AE', type: 'power', status: 'active', lat: 23.96, lon: 52.26 },
  { name: 'Kudankulam', country: 'IN', type: 'power', status: 'active', lat: 8.17, lon: 77.71 },
  { name: 'Palo Verde', country: 'US', type: 'power', status: 'active', lat: 33.39, lon: -112.86 },
  { name: 'Cattenom', country: 'FR', type: 'power', status: 'active', lat: 49.41, lon: 6.22 },
  { name: 'Hinkley Point C', country: 'GB', type: 'power', status: 'construction', lat: 51.21, lon: -3.13 },
  // Enrichment / Weapons
  { name: 'Natanz', country: 'IR', type: 'enrichment', status: 'active', lat: 33.72, lon: 51.73 },
  { name: 'Fordow', country: 'IR', type: 'enrichment', status: 'active', lat: 34.88, lon: 51.59 },
  { name: 'Yongbyon', country: 'KP', type: 'weapons', status: 'active', lat: 39.8, lon: 125.75 },
  { name: 'Dimona', country: 'IL', type: 'weapons', status: 'active', lat: 31.0, lon: 35.14 },
  { name: 'Kahuta', country: 'PK', type: 'enrichment', status: 'active', lat: 33.59, lon: 73.39 },
  { name: 'Los Alamos', country: 'US', type: 'weapons', status: 'active', lat: 35.84, lon: -106.29 },
  { name: 'Sellafield', country: 'GB', type: 'waste', status: 'active', lat: 54.42, lon: -3.5 },
  { name: 'La Hague', country: 'FR', type: 'waste', status: 'active', lat: 49.68, lon: -1.88 },
  { name: 'Seversk (Tomsk-7)', country: 'RU', type: 'enrichment', status: 'active', lat: 56.6, lon: 84.88 },
  { name: 'Bushehr', country: 'IR', type: 'power', status: 'active', lat: 28.83, lon: 50.89 },
];

const TYPE_COLORS: Record<string, string> = {
  power: '#eab308',
  enrichment: '#f97316',
  weapons: '#ef4444',
  research: '#8b5cf6',
  waste: '#6b7280',
};

export class NuclearLayer implements MapDataLayer {
  readonly id = 'nuclear';
  readonly name = 'Nuclear Facilities';
  readonly category = 'infrastructure' as const;
  readonly icon = '☢';
  readonly description = 'Nuclear power, enrichment, and weapons facilities';

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
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: FACILITIES } }));
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
    return FACILITIES.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: FACILITIES.map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [f.lon, f.lat] },
        properties: { name: f.name, country: f.country, type: f.type, status: f.status, color: TYPE_COLORS[f.type] },
      })),
    };

    this.map.addSource('nuclear', { type: 'geojson', data: geojson });

    // Radiation glow
    this.map.addLayer({
      id: 'nuclear-glow',
      type: 'circle',
      source: 'nuclear',
      paint: {
        'circle-radius': 16,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.1,
        'circle-blur': 0.8,
      },
    });

    this.map.addLayer({
      id: 'nuclear-markers',
      type: 'circle',
      source: 'nuclear',
      paint: {
        'circle-radius': 5,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
        'circle-opacity': 0.9,
      },
    });

    this.map.addLayer({
      id: 'nuclear-labels',
      type: 'symbol',
      source: 'nuclear',
      minzoom: 5,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 9,
        'text-offset': [0, 1.3],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'nuclear-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'nuclear-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'nuclear-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(nuclearPopup(p))
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['nuclear-labels', 'nuclear-markers', 'nuclear-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('nuclear')) this.map.removeSource('nuclear');
    this.popup?.remove();
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
