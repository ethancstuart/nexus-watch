import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface EnergyFacility {
  name: string;
  type: 'rig' | 'refinery' | 'lng_terminal' | 'field';
  country: string;
  region: string;
  lat: number;
  lon: number;
  capacity?: string;
}

const TYPE_COLORS: Record<string, string> = {
  rig: '#f59e0b',
  refinery: '#ef4444',
  lng_terminal: '#06b6d4',
  field: '#f97316',
};

const FACILITIES: EnergyFacility[] = [
  // Gulf of Mexico offshore rigs
  {
    name: 'Thunder Horse',
    type: 'rig',
    country: 'US',
    region: 'Gulf of Mexico',
    lat: 28.2,
    lon: -88.5,
    capacity: '250K bpd',
  },
  {
    name: 'Mars-Ursa',
    type: 'rig',
    country: 'US',
    region: 'Gulf of Mexico',
    lat: 28.7,
    lon: -89.2,
    capacity: '100K bpd',
  },
  {
    name: 'Perdido',
    type: 'rig',
    country: 'US',
    region: 'Gulf of Mexico',
    lat: 26.1,
    lon: -94.9,
    capacity: '100K bpd',
  },
  {
    name: 'Mad Dog',
    type: 'rig',
    country: 'US',
    region: 'Gulf of Mexico',
    lat: 27.2,
    lon: -90.3,
    capacity: '140K bpd',
  },
  {
    name: 'Appomattox',
    type: 'rig',
    country: 'US',
    region: 'Gulf of Mexico',
    lat: 28.8,
    lon: -88.6,
    capacity: '175K bpd',
  },
  {
    name: 'Atlantis',
    type: 'rig',
    country: 'US',
    region: 'Gulf of Mexico',
    lat: 27.2,
    lon: -90.0,
    capacity: '200K bpd',
  },
  { name: 'Na Kika', type: 'rig', country: 'US', region: 'Gulf of Mexico', lat: 27.9, lon: -89.7 },
  // North Sea
  {
    name: 'Johan Sverdrup',
    type: 'rig',
    country: 'NO',
    region: 'North Sea',
    lat: 58.8,
    lon: 2.5,
    capacity: '755K bpd',
  },
  { name: 'Ekofisk', type: 'rig', country: 'NO', region: 'North Sea', lat: 56.5, lon: 3.2, capacity: '100K bpd' },
  { name: 'Buzzard', type: 'rig', country: 'GB', region: 'North Sea', lat: 57.5, lon: -1.4, capacity: '200K bpd' },
  { name: 'Forties', type: 'rig', country: 'GB', region: 'North Sea', lat: 57.7, lon: 0.9 },
  { name: 'Brent', type: 'rig', country: 'GB', region: 'North Sea', lat: 61.0, lon: 1.7 },
  // Persian Gulf
  { name: 'Ghawar', type: 'field', country: 'SA', region: 'Persian Gulf', lat: 25.5, lon: 49.5, capacity: '3.8M bpd' },
  {
    name: 'Safaniyah',
    type: 'field',
    country: 'SA',
    region: 'Persian Gulf',
    lat: 28.2,
    lon: 49.2,
    capacity: '1.5M bpd',
  },
  {
    name: 'Upper Zakum',
    type: 'field',
    country: 'AE',
    region: 'Persian Gulf',
    lat: 25.3,
    lon: 53.8,
    capacity: '750K bpd',
  },
  { name: 'Burgan', type: 'field', country: 'KW', region: 'Persian Gulf', lat: 29.1, lon: 48.0, capacity: '1.7M bpd' },
  {
    name: 'South Pars',
    type: 'field',
    country: 'IR',
    region: 'Persian Gulf',
    lat: 27.5,
    lon: 52.5,
    capacity: 'Largest gas field',
  },
  { name: 'Khurais', type: 'field', country: 'SA', region: 'Persian Gulf', lat: 25.0, lon: 48.0, capacity: '1.2M bpd' },
  // West Africa
  { name: 'Jubilee', type: 'rig', country: 'GH', region: 'West Africa', lat: 4.5, lon: -3.1, capacity: '120K bpd' },
  { name: 'Egina', type: 'rig', country: 'NG', region: 'West Africa', lat: 5.0, lon: 4.5, capacity: '200K bpd' },
  { name: 'Bonga', type: 'rig', country: 'NG', region: 'West Africa', lat: 4.3, lon: 4.7, capacity: '225K bpd' },
  { name: 'Dalia', type: 'rig', country: 'AO', region: 'West Africa', lat: -7.5, lon: 12.0, capacity: '240K bpd' },
  // Brazil pre-salt
  {
    name: 'Tupi (Lula)',
    type: 'rig',
    country: 'BR',
    region: 'Brazil Pre-Salt',
    lat: -25.3,
    lon: -42.8,
    capacity: '1M bpd',
  },
  {
    name: 'Búzios',
    type: 'rig',
    country: 'BR',
    region: 'Brazil Pre-Salt',
    lat: -24.5,
    lon: -41.5,
    capacity: '600K bpd',
  },
  { name: 'Sapinhoá', type: 'rig', country: 'BR', region: 'Brazil Pre-Salt', lat: -24.0, lon: -42.0 },
  // Southeast Asia
  { name: 'Erawan', type: 'rig', country: 'TH', region: 'Southeast Asia', lat: 8.5, lon: 102.5 },
  { name: 'Kikeh', type: 'rig', country: 'MY', region: 'Southeast Asia', lat: 6.3, lon: 114.5 },
  // Russia
  { name: 'Prirazlomnoye', type: 'rig', country: 'RU', region: 'Arctic', lat: 69.2, lon: 57.3 },
  { name: 'Sakhalin-1', type: 'rig', country: 'RU', region: 'Far East', lat: 52.8, lon: 143.5 },
  // Major refineries
  {
    name: 'Jamnagar Refinery',
    type: 'refinery',
    country: 'IN',
    region: 'Gujarat',
    lat: 22.3,
    lon: 70.0,
    capacity: '1.2M bpd (largest)',
  },
  {
    name: 'Paraguana Refinery',
    type: 'refinery',
    country: 'VE',
    region: 'Venezuela',
    lat: 11.8,
    lon: -70.2,
    capacity: '940K bpd',
  },
  {
    name: 'SK Ulsan',
    type: 'refinery',
    country: 'KR',
    region: 'South Korea',
    lat: 35.5,
    lon: 129.4,
    capacity: '840K bpd',
  },
  {
    name: 'Ruwais Refinery',
    type: 'refinery',
    country: 'AE',
    region: 'Abu Dhabi',
    lat: 24.1,
    lon: 52.7,
    capacity: '837K bpd',
  },
  {
    name: 'Port Arthur Refinery',
    type: 'refinery',
    country: 'US',
    region: 'Texas',
    lat: 29.9,
    lon: -93.9,
    capacity: '630K bpd',
  },
  {
    name: 'Ras Tanura Refinery',
    type: 'refinery',
    country: 'SA',
    region: 'Saudi Arabia',
    lat: 26.6,
    lon: 50.2,
    capacity: '550K bpd',
  },
  {
    name: 'Rotterdam Europoort',
    type: 'refinery',
    country: 'NL',
    region: 'Netherlands',
    lat: 51.9,
    lon: 4.0,
    capacity: '404K bpd',
  },
  {
    name: 'Jurong Island',
    type: 'refinery',
    country: 'SG',
    region: 'Singapore',
    lat: 1.3,
    lon: 103.7,
    capacity: '592K bpd',
  },
  // LNG terminals
  {
    name: 'Sabine Pass LNG',
    type: 'lng_terminal',
    country: 'US',
    region: 'Louisiana',
    lat: 29.7,
    lon: -93.9,
    capacity: '30 MTPA export',
  },
  {
    name: 'Freeport LNG',
    type: 'lng_terminal',
    country: 'US',
    region: 'Texas',
    lat: 28.9,
    lon: -95.3,
    capacity: '15 MTPA export',
  },
  {
    name: 'Ras Laffan',
    type: 'lng_terminal',
    country: 'QA',
    region: 'Qatar',
    lat: 25.9,
    lon: 51.5,
    capacity: '77 MTPA (largest)',
  },
  {
    name: 'Yamal LNG',
    type: 'lng_terminal',
    country: 'RU',
    region: 'Arctic',
    lat: 71.3,
    lon: 72.1,
    capacity: '17.4 MTPA',
  },
  {
    name: 'Hammerfest LNG',
    type: 'lng_terminal',
    country: 'NO',
    region: 'Norway',
    lat: 70.7,
    lon: 23.7,
    capacity: '4.2 MTPA',
  },
  {
    name: 'Incheon LNG',
    type: 'lng_terminal',
    country: 'KR',
    region: 'South Korea',
    lat: 37.5,
    lon: 126.6,
    capacity: '40 MTPA import',
  },
  {
    name: 'Dahej LNG',
    type: 'lng_terminal',
    country: 'IN',
    region: 'Gujarat',
    lat: 21.7,
    lon: 72.6,
    capacity: '17.5 MTPA import',
  },
];

export class EnergyLayer implements MapDataLayer {
  readonly id = 'energy';
  readonly name = 'Energy Infrastructure';
  readonly category = 'infrastructure' as const;
  readonly icon = '⛽';
  readonly description = 'Oil rigs, refineries, LNG terminals, and major fields';

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
        properties: {
          name: f.name,
          type: f.type,
          country: f.country,
          region: f.region,
          capacity: f.capacity || '',
          color: TYPE_COLORS[f.type],
        },
      })),
    };

    this.map.addSource('energy', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'energy-glow',
      type: 'circle',
      source: 'energy',
      paint: { 'circle-radius': 12, 'circle-color': ['get', 'color'], 'circle-opacity': 0.1, 'circle-blur': 0.5 },
    });
    this.map.addLayer({
      id: 'energy-markers',
      type: 'circle',
      source: 'energy',
      paint: {
        'circle-radius': ['match', ['get', 'type'], 'field', 6, 'refinery', 5, 'lng_terminal', 5, 4],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.85,
      },
    });
    this.map.addLayer({
      id: 'energy-labels',
      type: 'symbol',
      source: 'energy',
      minzoom: 5,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 9,
        'text-offset': [0, 1.3],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'energy-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'energy-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'energy-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `${String(p.type).replace('_', ' ').toUpperCase()}`,
            typeColor: String(p.color),
            title: String(p.name),
            fields: [
              { label: 'Country', value: String(p.country) },
              { label: 'Region', value: String(p.region) },
              ...(p.capacity ? [{ label: 'Capacity', value: String(p.capacity) }] : []),
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['energy-labels', 'energy-markers', 'energy-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('energy')) this.map.removeSource('energy');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
