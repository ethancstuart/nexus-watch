import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';

interface SubseaCable {
  name: string;
  owner: string;
  year: number;
  points: [number, number][]; // [lon, lat] pairs
}

const CABLES: SubseaCable[] = [
  {
    name: 'TAT-14',
    owner: 'Consortium',
    year: 2001,
    points: [
      [-73.9, 40.5],
      [-50, 45],
      [-20, 50],
      [-5, 50],
      [1.5, 51],
    ],
  },
  {
    name: 'Apollo (US-UK)',
    owner: 'Apollo Submarine Cable',
    year: 2003,
    points: [
      [-73.5, 40.6],
      [-55, 44],
      [-30, 48],
      [-10, 50],
      [-5.5, 50.3],
    ],
  },
  {
    name: 'SEA-ME-WE 5',
    owner: 'Consortium',
    year: 2017,
    points: [
      [103.8, 1.3],
      [95, 5],
      [80, 10],
      [65, 15],
      [55, 22],
      [44, 28],
      [35, 31],
      [30, 31.3],
      [15, 37],
      [10, 43],
      [3, 43.3],
    ],
  },
  {
    name: 'AAE-1',
    owner: 'Consortium',
    year: 2017,
    points: [
      [114.2, 22.3],
      [105, 10],
      [80, 8],
      [65, 12],
      [55, 20],
      [44, 27],
      [35, 30],
      [30, 31],
    ],
  },
  {
    name: 'PEACE Cable',
    owner: 'PEACE Cable Intl',
    year: 2022,
    points: [
      [117, 23],
      [104, 1],
      [80, 7],
      [60, 12],
      [50, 20],
      [44, 28],
      [35, 31],
      [25, 33],
      [15, 37],
      [3, 43],
    ],
  },
  {
    name: 'Equiano (Google)',
    owner: 'Google',
    year: 2022,
    points: [
      [-9, 38],
      [-15, 28],
      [-17, 15],
      [-5, 5],
      [3, 5],
      [8, 4],
      [10, -6],
      [13, -23],
      [18, -34],
    ],
  },
  {
    name: 'BRUSA',
    owner: 'Telxius',
    year: 2018,
    points: [
      [-46, -23],
      [-40, -15],
      [-35, 0],
      [-45, 15],
      [-55, 25],
      [-65, 30],
      [-75, 35],
      [-80, 38],
    ],
  },
  {
    name: 'Pacific Light Cable',
    owner: 'Google',
    year: 2023,
    points: [
      [-122, 37],
      [-140, 30],
      [-160, 22],
      [-180, 15],
      [170, 10],
      [150, 8],
      [130, 10],
      [121, 14],
    ],
  },
  {
    name: 'Japan-US Cable',
    owner: 'Consortium',
    year: 2020,
    points: [
      [139.7, 35.5],
      [155, 35],
      [170, 38],
      [-170, 40],
      [-150, 42],
      [-135, 40],
      [-122, 37.7],
    ],
  },
  {
    name: 'DARE1',
    owner: 'Consortium',
    year: 2022,
    points: [
      [43.1, 11.6],
      [45.3, 2],
      [39.7, -4.1],
      [39.3, -6.8],
    ],
  },
  {
    name: 'ACS Alaska',
    owner: 'GCI/Quintillion',
    year: 2017,
    points: [
      [-122, 48],
      [-135, 55],
      [-145, 58],
      [-150, 60],
      [-155, 61],
      [-165, 64],
      [-170, 65],
    ],
  },
  {
    name: '2Africa (Meta)',
    owner: 'Meta',
    year: 2024,
    points: [
      [-9, 38],
      [-15, 28],
      [-17, 14],
      [-5, 5],
      [3, 6],
      [10, 0],
      [13, -5],
      [15, -15],
      [20, -26],
      [28, -33],
      [32, -30],
      [35, -25],
      [40, -12],
      [43, 11],
      [48, 15],
      [55, 22],
      [58, 25],
    ],
  },
];

export class CablesLayer implements MapDataLayer {
  readonly id = 'cables';
  readonly name = 'Undersea Cables';
  readonly category = 'infrastructure' as const;
  readonly icon = '🔌';
  readonly description = 'Major submarine telecommunications cables';

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
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: CABLES } }));
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
    return CABLES.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: CABLES.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: c.points },
        properties: { name: c.name, owner: c.owner, year: c.year },
      })),
    };

    this.map.addSource('cables', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'cables-glow',
      type: 'line',
      source: 'cables',
      paint: { 'line-color': '#06b6d4', 'line-width': 4, 'line-opacity': 0.08, 'line-blur': 3 },
    });

    this.map.addLayer({
      id: 'cables-line',
      type: 'line',
      source: 'cables',
      paint: { 'line-color': '#06b6d4', 'line-width': 1.5, 'line-opacity': 0.5 },
    });

    this.map.on('mouseenter', 'cables-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'cables-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'cables-line', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(
          `<div class="eq-popup-content"><div class="eq-popup-mag" style="color:#06b6d4">CABLE</div><div class="eq-popup-place">${p.name}</div><div class="eq-popup-meta">${p.owner} · ${p.year}</div></div>`,
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['cables-line', 'cables-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('cables')) this.map.removeSource('cables');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
