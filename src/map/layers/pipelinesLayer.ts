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
];

const STATUS_COLORS: Record<string, string> = {
  active: '#f59e0b',
  disputed: '#6b7280',
  damaged: '#ef4444',
};

export class PipelinesLayer implements MapDataLayer {
  readonly id = 'pipelines';
  readonly name = 'Oil & Gas Pipelines';
  readonly category = 'infrastructure' as const;
  readonly icon = '🛢';
  readonly description = 'Major oil and gas pipelines';

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
