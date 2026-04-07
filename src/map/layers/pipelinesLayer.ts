import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { pipelinePopup } from '../PopupCard.ts';

interface Pipeline {
  name: string;
  type: 'oil' | 'gas';
  status: 'active' | 'disputed' | 'damaged';
  points: [number, number][];
}

const PIPELINES: Pipeline[] = [
  {
    name: 'Nord Stream (damaged)',
    type: 'gas',
    status: 'damaged',
    points: [
      [30.0, 59.9],
      [24, 59],
      [18, 56],
      [13, 54.5],
      [12.1, 54.1],
    ],
  },
  {
    name: 'TurkStream',
    type: 'gas',
    status: 'active',
    points: [
      [38.5, 44.6],
      [37, 44],
      [34, 42.5],
      [31, 41.5],
      [29, 41.2],
    ],
  },
  {
    name: 'Trans-Adriatic Pipeline',
    type: 'gas',
    status: 'active',
    points: [
      [40.5, 40],
      [29, 41],
      [26.5, 40.5],
      [23, 40],
      [20, 40.5],
      [18, 41],
    ],
  },
  {
    name: 'Druzhba Pipeline',
    type: 'oil',
    status: 'active',
    points: [
      [52, 52.3],
      [49, 52.5],
      [46, 52.3],
      [43, 52.5],
      [40, 53],
      [37, 52.8],
      [34, 52.5],
      [31, 52],
      [28, 51.2],
      [25, 51.5],
      [22, 52],
      [19, 52.3],
      [16, 52.1],
      [14, 51.8],
    ],
  },
  {
    name: 'BTC Pipeline',
    type: 'oil',
    status: 'active',
    points: [
      [50, 40],
      [47, 41],
      [44, 41.5],
      [42, 41.8],
      [40.5, 40],
      [36, 37],
    ],
  },
  {
    name: 'East-West Pipeline (Saudi)',
    type: 'oil',
    status: 'active',
    points: [
      [50, 26.5],
      [47, 26],
      [44, 25],
      [41, 24],
      [39, 22],
    ],
  },
  {
    name: 'TAPI Pipeline',
    type: 'gas',
    status: 'disputed',
    points: [
      [62, 36],
      [64, 35],
      [66, 33],
      [68, 30],
      [70, 27],
    ],
  },
  {
    name: 'Keystone XL',
    type: 'oil',
    status: 'disputed',
    points: [
      [-110, 51],
      [-107, 48],
      [-104, 44],
      [-100, 40],
      [-97, 37],
      [-96, 30],
    ],
  },
  {
    name: 'Power of Siberia',
    type: 'gas',
    status: 'active',
    points: [
      [112, 56],
      [115, 55],
      [118, 53.5],
      [121, 52],
      [124, 50.5],
      [126, 49],
      [128, 47.5],
      [129.5, 46],
      [128, 44.5],
      [127, 43],
    ],
  },
  {
    name: 'Trans-Saharan Pipeline',
    type: 'gas',
    status: 'disputed',
    points: [
      [3, 6],
      [3, 10],
      [2, 15],
      [1, 20],
      [0, 25],
      [0, 30],
      [1, 35],
    ],
  },
  // US domestic
  {
    name: 'Dakota Access (DAPL)',
    type: 'oil',
    status: 'active',
    points: [
      [-103.5, 47.5],
      [-101, 46],
      [-98, 44],
      [-97, 42],
      [-96, 40.5],
    ],
  },
  {
    name: 'Permian Basin Export',
    type: 'oil',
    status: 'active',
    points: [
      [-102, 31.5],
      [-100, 30.5],
      [-98, 29.5],
      [-96, 29],
    ],
  },
  {
    name: 'Colonial Pipeline',
    type: 'oil',
    status: 'active',
    points: [
      [-95, 29.5],
      [-90, 30.5],
      [-87, 32],
      [-84, 33.5],
      [-81, 34],
      [-78, 36],
      [-76, 37],
      [-74, 40],
    ],
  },
  {
    name: 'Mountain Valley Pipeline',
    type: 'gas',
    status: 'active',
    points: [
      [-80.5, 38],
      [-80, 37.5],
      [-79.5, 37],
    ],
  },
  // Canada
  {
    name: 'Trans Mountain Expansion',
    type: 'oil',
    status: 'active',
    points: [
      [-114.5, 53.5],
      [-116, 52.5],
      [-118, 51.5],
      [-120, 50],
      [-122.5, 49.3],
    ],
  },
  {
    name: 'Coastal GasLink',
    type: 'gas',
    status: 'active',
    points: [
      [-120, 56],
      [-124, 55],
      [-127, 54],
      [-129, 54],
    ],
  },
  {
    name: 'Enbridge Line 5',
    type: 'oil',
    status: 'active',
    points: [
      [-89, 46.5],
      [-86, 45.5],
      [-84, 44],
      [-83, 43],
    ],
  },
  // Central Asia
  {
    name: 'Central Asia-China Gas',
    type: 'gas',
    status: 'active',
    points: [
      [62, 38],
      [66, 39],
      [70, 40],
      [75, 41],
      [80, 42],
      [87, 43],
    ],
  },
  {
    name: 'Kazakhstan-China Oil',
    type: 'oil',
    status: 'active',
    points: [
      [53, 47],
      [60, 46],
      [68, 45],
      [75, 44],
      [82, 44],
    ],
  },
  // South America
  {
    name: 'Bolivia-Brazil Gas',
    type: 'gas',
    status: 'active',
    points: [
      [-63, -18],
      [-60, -19],
      [-55, -20],
      [-50, -21],
      [-47, -22],
    ],
  },
  {
    name: 'NorAndino Pipeline',
    type: 'oil',
    status: 'active',
    points: [
      [-72, 5],
      [-73, 4],
      [-74, 3],
      [-75, 2],
    ],
  },
  // Africa
  {
    name: 'Nigeria-Morocco Gas',
    type: 'gas',
    status: 'disputed',
    points: [
      [3, 6],
      [0, 8],
      [-5, 12],
      [-10, 16],
      [-12, 20],
      [-10, 25],
      [-8, 30],
      [-6, 34],
    ],
  },
  {
    name: 'East African Crude',
    type: 'oil',
    status: 'active',
    points: [
      [31, 1.5],
      [32, 0],
      [33, -1],
      [35, -3],
      [37, -5],
      [39, -6.5],
    ],
  },
  // Middle East
  {
    name: 'IPSA Pipeline (Iraq-Saudi)',
    type: 'oil',
    status: 'active',
    points: [
      [44, 31],
      [43, 30],
      [42, 28],
      [41, 26],
      [40, 24],
    ],
  },
  {
    name: 'Kirkuk-Ceyhan',
    type: 'oil',
    status: 'active',
    points: [
      [44, 35.5],
      [42, 36.5],
      [40, 37],
      [37, 37.5],
      [36, 37],
    ],
  },
  // Europe
  {
    name: 'Trans-Anatolian (TANAP)',
    type: 'gas',
    status: 'active',
    points: [
      [43, 41],
      [40, 40],
      [37, 39],
      [34, 38],
      [30, 38],
    ],
  },
  {
    name: 'Baltic Pipe',
    type: 'gas',
    status: 'active',
    points: [
      [8, 56],
      [10, 56.5],
      [12, 57],
      [14, 56],
      [16, 55],
    ],
  },
  {
    name: 'Yamal-Europe',
    type: 'gas',
    status: 'active',
    points: [
      [68, 66],
      [60, 62],
      [50, 58],
      [40, 56],
      [30, 54],
      [24, 52],
      [18, 52],
      [14, 52],
    ],
  },
];

const STATUS_COLORS: Record<string, string> = {
  active: '#888888',
  disputed: '#6b7280',
  damaged: '#ef4444',
};

export class PipelinesLayer implements MapDataLayer {
  readonly id = 'pipelines';
  readonly name = 'Oil & Gas Pipelines';
  readonly category = 'infrastructure' as const;
  readonly icon = '🛢';
  readonly description = 'Major oil and gas pipelines (curated 2026-04)';

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
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: PIPELINES } }));
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
    return PIPELINES.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: PIPELINES.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: p.points },
        properties: { name: p.name, type: p.type, status: p.status, color: STATUS_COLORS[p.status] },
      })),
    };

    this.map.addSource('pipelines', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'pipelines-line',
      type: 'line',
      source: 'pipelines',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['match', ['get', 'status'], 'damaged', 2.5, 'active', 1.5, 1],
        'line-opacity': 0.6,
        'line-dasharray': [
          'match',
          ['get', 'status'],
          'damaged',
          ['literal', [4, 4]],
          'disputed',
          ['literal', [2, 2]],
          ['literal', [1]],
        ],
      },
    });

    this.map.on('mouseenter', 'pipelines-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'pipelines-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'pipelines-line', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(pipelinePopup(p))
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    if (this.map.getLayer('pipelines-line')) this.map.removeLayer('pipelines-line');
    if (this.map.getSource('pipelines')) this.map.removeSource('pipelines');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
