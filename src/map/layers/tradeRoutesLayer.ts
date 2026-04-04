import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface TradeRoute {
  name: string;
  volume: string;
  commodity: string;
  points: [number, number][];
}

const ROUTES: TradeRoute[] = [
  {
    name: 'Asia → Europe (Suez)',
    volume: '$1T+/yr',
    commodity: 'Manufactured goods, electronics',
    points: [
      [104, 1],
      [95, 5],
      [80, 10],
      [65, 15],
      [55, 22],
      [44, 28],
      [35, 31],
      [30, 31.3],
      [15, 37],
      [5, 43],
      [-5, 50],
    ],
  },
  {
    name: 'Persian Gulf → Asia (Oil)',
    volume: '$500B+/yr',
    commodity: 'Crude oil, LNG',
    points: [
      [50, 26],
      [56, 25],
      [65, 18],
      [75, 12],
      [85, 8],
      [95, 4],
      [104, 1],
      [115, 5],
      [125, 15],
    ],
  },
  {
    name: 'Trans-Pacific (Asia → N.America)',
    volume: '$800B+/yr',
    commodity: 'Consumer goods, auto parts',
    points: [
      [121, 14],
      [130, 20],
      [145, 30],
      [160, 35],
      [175, 38],
      [-170, 40],
      [-155, 42],
      [-140, 40],
      [-125, 38],
    ],
  },
  {
    name: 'Trans-Atlantic (Europe → N.America)',
    volume: '$600B+/yr',
    commodity: 'Machinery, chemicals, pharma',
    points: [
      [-5, 50],
      [-15, 48],
      [-30, 46],
      [-45, 43],
      [-60, 41],
      [-73, 40],
    ],
  },
  {
    name: 'Cape Route (Asia → Europe alt)',
    volume: '$200B+/yr',
    commodity: 'Oil, bulk cargo (Suez bypass)',
    points: [
      [104, 1],
      [95, -5],
      [80, -10],
      [60, -20],
      [40, -30],
      [20, -35],
      [18, -34],
      [15, -25],
      [10, -10],
      [5, 5],
      [-5, 35],
      [-5, 50],
    ],
  },
  {
    name: 'S.America → Europe (Grain)',
    volume: '$100B+/yr',
    commodity: 'Soybeans, iron ore, coffee',
    points: [
      [-43, -23],
      [-38, -15],
      [-30, -5],
      [-25, 10],
      [-20, 25],
      [-15, 35],
      [-5, 45],
    ],
  },
  {
    name: 'Persian Gulf → Europe (LNG)',
    volume: '$150B+/yr',
    commodity: 'LNG, crude oil',
    points: [
      [50, 26],
      [56, 25],
      [44, 28],
      [35, 31],
      [25, 33],
      [15, 37],
      [5, 43],
    ],
  },
  {
    name: 'W.Africa → China (Oil)',
    volume: '$80B+/yr',
    commodity: 'Crude oil',
    points: [
      [3, 5],
      [10, -5],
      [20, -15],
      [35, -25],
      [50, -20],
      [65, -10],
      [80, 0],
      [95, 5],
      [110, 15],
    ],
  },
];

export class TradeRoutesLayer implements MapDataLayer {
  readonly id = 'trade-routes';
  readonly name = 'Trade Routes';
  readonly category = 'infrastructure' as const;
  readonly icon = '📦';
  readonly description = 'Major global shipping and trade lanes';

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
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: ROUTES } }));
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
    return ROUTES.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: ROUTES.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: r.points },
        properties: { name: r.name, volume: r.volume, commodity: r.commodity },
      })),
    };
    this.map.addSource('trade-routes', { type: 'geojson', data: geojson });
    this.map.addLayer({
      id: 'trade-routes-glow',
      type: 'line',
      source: 'trade-routes',
      paint: { 'line-color': '#f59e0b', 'line-width': 6, 'line-opacity': 0.06, 'line-blur': 4 },
    });
    this.map.addLayer({
      id: 'trade-routes-line',
      type: 'line',
      source: 'trade-routes',
      paint: { 'line-color': '#f59e0b', 'line-width': 2, 'line-opacity': 0.5, 'line-dasharray': [8, 4] },
    });

    this.map.on('mouseenter', 'trade-routes-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'trade-routes-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'trade-routes-line', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(
          renderPopupCard({
            type: 'TRADE ROUTE',
            typeColor: '#f59e0b',
            title: String(p.name),
            fields: [
              { label: 'Volume', value: String(p.volume) },
              { label: 'Cargo', value: String(p.commodity) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }
  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['trade-routes-line', 'trade-routes-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('trade-routes')) this.map.removeSource('trade-routes');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
