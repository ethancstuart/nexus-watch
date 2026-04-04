import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface SanctionedCountry {
  country: string;
  code: string;
  lat: number;
  lon: number;
  programs: string[];
  severity: 'comprehensive' | 'targeted' | 'sectoral';
}

const SANCTIONED: SanctionedCountry[] = [
  {
    country: 'Russia',
    code: 'RU',
    lat: 55.8,
    lon: 37.6,
    programs: ['Ukraine-related', 'Cyber', 'Election interference'],
    severity: 'comprehensive',
  },
  {
    country: 'Iran',
    code: 'IR',
    lat: 32.4,
    lon: 53.7,
    programs: ['Nuclear', 'Terrorism', 'Human rights'],
    severity: 'comprehensive',
  },
  {
    country: 'North Korea',
    code: 'KP',
    lat: 39.0,
    lon: 125.8,
    programs: ['WMD proliferation', 'Human rights'],
    severity: 'comprehensive',
  },
  {
    country: 'Syria',
    code: 'SY',
    lat: 34.8,
    lon: 38.9,
    programs: ['Chemical weapons', 'Human rights'],
    severity: 'comprehensive',
  },
  { country: 'Cuba', code: 'CU', lat: 21.5, lon: -80.0, programs: ['Trade embargo'], severity: 'comprehensive' },
  {
    country: 'Venezuela',
    code: 'VE',
    lat: 8.0,
    lon: -66.0,
    programs: ['Narcotics', 'Anti-democratic actions'],
    severity: 'targeted',
  },
  {
    country: 'Myanmar',
    code: 'MM',
    lat: 19.8,
    lon: 96.1,
    programs: ['Military coup', 'Human rights'],
    severity: 'targeted',
  },
  {
    country: 'China',
    code: 'CN',
    lat: 35.9,
    lon: 104.2,
    programs: ['Xinjiang', 'Hong Kong', 'Military-industrial'],
    severity: 'sectoral',
  },
  {
    country: 'Belarus',
    code: 'BY',
    lat: 53.9,
    lon: 27.6,
    programs: ['Support for Russia', 'Election fraud'],
    severity: 'targeted',
  },
  {
    country: 'Nicaragua',
    code: 'NI',
    lat: 12.9,
    lon: -85.2,
    programs: ['Anti-democratic actions'],
    severity: 'targeted',
  },
  { country: 'Ethiopia', code: 'ET', lat: 9.1, lon: 40.5, programs: ['Tigray conflict'], severity: 'targeted' },
  {
    country: 'Mali',
    code: 'ML',
    lat: 12.6,
    lon: -8.0,
    programs: ['Military coup', 'Wagner Group'],
    severity: 'targeted',
  },
  {
    country: 'Afghanistan',
    code: 'AF',
    lat: 33.9,
    lon: 67.7,
    programs: ['Taliban', 'Terrorism'],
    severity: 'comprehensive',
  },
];

const SEVERITY_COLORS: Record<string, string> = {
  comprehensive: '#dc2626',
  targeted: '#f97316',
  sectoral: '#eab308',
};

export class SanctionsLayer implements MapDataLayer {
  readonly id = 'sanctions';
  readonly name = 'OFAC Sanctions';
  readonly category = 'intelligence' as const;
  readonly icon = '🚫';
  readonly description = 'US/EU sanctioned countries and programs';

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
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: SANCTIONED } }));
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
    return SANCTIONED.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: SANCTIONED.map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: {
          country: s.country,
          programs: s.programs.join(', '),
          severity: s.severity,
          color: SEVERITY_COLORS[s.severity],
        },
      })),
    };
    this.map.addSource('sanctions', { type: 'geojson', data: geojson });
    this.map.addLayer({
      id: 'sanctions-glow',
      type: 'circle',
      source: 'sanctions',
      paint: { 'circle-radius': 20, 'circle-color': ['get', 'color'], 'circle-opacity': 0.08, 'circle-blur': 0.5 },
    });
    this.map.addLayer({
      id: 'sanctions-markers',
      type: 'circle',
      source: 'sanctions',
      paint: {
        'circle-radius': ['match', ['get', 'severity'], 'comprehensive', 7, 'targeted', 5, 4],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.85,
      },
    });
    this.map.addLayer({
      id: 'sanctions-labels',
      type: 'symbol',
      source: 'sanctions',
      minzoom: 3,
      layout: {
        'text-field': ['get', 'country'],
        'text-size': 9,
        'text-offset': [0, 1.5],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });
    this.map.on('mouseenter', 'sanctions-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'sanctions-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'sanctions-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `${String(p.severity).toUpperCase()} SANCTIONS`,
            typeColor: String(p.color),
            title: String(p.country),
            fields: [{ label: 'Programs', value: String(p.programs) }],
          }),
        )
        .addTo(this.map);
    });
  }
  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['sanctions-labels', 'sanctions-markers', 'sanctions-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('sanctions')) this.map.removeSource('sanctions');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
