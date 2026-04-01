import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';

interface StrategicPort {
  name: string;
  country: string;
  type: 'commercial' | 'military' | 'energy' | 'chokepoint';
  lat: number;
  lon: number;
}

const PORTS: StrategicPort[] = [
  // Major commercial
  { name: 'Shanghai', country: 'CN', type: 'commercial', lat: 31.35, lon: 121.63 },
  { name: 'Singapore', country: 'SG', type: 'commercial', lat: 1.26, lon: 103.84 },
  { name: 'Rotterdam', country: 'NL', type: 'commercial', lat: 51.95, lon: 4.14 },
  { name: 'Busan', country: 'KR', type: 'commercial', lat: 35.06, lon: 129.04 },
  { name: 'Los Angeles', country: 'US', type: 'commercial', lat: 33.73, lon: -118.27 },
  { name: 'Hamburg', country: 'DE', type: 'commercial', lat: 53.53, lon: 9.97 },
  { name: 'Dubai (Jebel Ali)', country: 'AE', type: 'commercial', lat: 25.0, lon: 55.06 },
  { name: 'Hong Kong', country: 'HK', type: 'commercial', lat: 22.34, lon: 114.15 },
  // Chokepoints
  { name: 'Suez Canal', country: 'EG', type: 'chokepoint', lat: 30.46, lon: 32.35 },
  { name: 'Panama Canal', country: 'PA', type: 'chokepoint', lat: 9.08, lon: -79.68 },
  { name: 'Strait of Hormuz', country: 'OM', type: 'chokepoint', lat: 26.57, lon: 56.25 },
  { name: 'Strait of Malacca', country: 'MY', type: 'chokepoint', lat: 2.5, lon: 101.8 },
  { name: 'Bab el-Mandeb', country: 'DJ', type: 'chokepoint', lat: 12.58, lon: 43.33 },
  { name: 'Turkish Straits', country: 'TR', type: 'chokepoint', lat: 41.12, lon: 29.05 },
  // Energy
  { name: 'Ras Tanura', country: 'SA', type: 'energy', lat: 26.64, lon: 50.16 },
  { name: 'Kharg Island', country: 'IR', type: 'energy', lat: 29.24, lon: 50.31 },
  { name: 'Novorossiysk', country: 'RU', type: 'energy', lat: 44.72, lon: 37.78 },
  { name: 'Houston Ship Channel', country: 'US', type: 'energy', lat: 29.73, lon: -95.27 },
];

const TYPE_COLORS: Record<string, string> = {
  commercial: '#3b82f6',
  military: '#ef4444',
  energy: '#f59e0b',
  chokepoint: '#ff6600',
};

export class PortsLayer implements MapDataLayer {
  readonly id = 'ports';
  readonly name = 'Strategic Ports';
  readonly category = 'infrastructure' as const;
  readonly icon = '⚓';
  readonly description = 'Major ports and maritime chokepoints';

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
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: PORTS } }));
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
    return PORTS.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: PORTS.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        properties: { name: p.name, country: p.country, type: p.type, color: TYPE_COLORS[p.type] },
      })),
    };

    this.map.addSource('ports', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'ports-markers',
      type: 'circle',
      source: 'ports',
      paint: {
        'circle-radius': ['match', ['get', 'type'], 'chokepoint', 7, 5],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.8,
      },
    });

    this.map.addLayer({
      id: 'ports-labels',
      type: 'symbol',
      source: 'ports',
      minzoom: 4,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 9,
        'text-offset': [0, 1.3],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'ports-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'ports-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'ports-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          `<div class="eq-popup-content"><div class="eq-popup-mag" style="color:${p.color}">${String(p.type).toUpperCase()}</div><div class="eq-popup-place">${p.name}</div><div class="eq-popup-meta">${p.country}</div></div>`,
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['ports-labels', 'ports-markers']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('ports')) this.map.removeSource('ports');
    this.popup?.remove();
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
