import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { cablePopup } from '../PopupCard.ts';

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
    name: 'Pacific Light Cable (East)',
    owner: 'Google',
    year: 2023,
    points: [
      [-122, 37],
      [-135, 32],
      [-150, 26],
      [-165, 20],
      [-179, 15],
    ],
  },
  {
    name: 'Pacific Light Cable (West)',
    owner: 'Google',
    year: 2023,
    points: [
      [179, 14],
      [165, 10],
      [150, 8],
      [135, 10],
      [121, 14],
    ],
  },
  {
    name: 'Japan-US Cable (West)',
    owner: 'Consortium',
    year: 2020,
    points: [
      [139.7, 35.5],
      [150, 36],
      [160, 37],
      [170, 38],
      [179, 39],
    ],
  },
  {
    name: 'Japan-US Cable (East)',
    owner: 'Consortium',
    year: 2020,
    points: [
      [-179, 39],
      [-165, 41],
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
  // Caribbean & Americas
  {
    name: 'ARCOS-1',
    owner: 'Consortium',
    year: 2001,
    points: [
      [-80, 25.8],
      [-82, 22],
      [-86, 19],
      [-79, 18],
      [-77, 18],
      [-72, 20],
      [-66, 18],
    ],
  },
  {
    name: 'Americas-II',
    owner: 'Consortium',
    year: 2000,
    points: [
      [-74, 40],
      [-66, 18],
      [-62, 10],
      [-50, -3],
      [-43, -23],
    ],
  },
  {
    name: 'CARCIP',
    owner: 'World Bank',
    year: 2016,
    points: [
      [-61, 14],
      [-60, 13],
      [-59, 12],
      [-61, 10],
    ],
  },
  {
    name: 'Maya-1',
    owner: 'Meta',
    year: 2022,
    points: [
      [-80, 25.8],
      [-86, 21],
      [-87, 14],
      [-79, 10],
      [-77, 9],
    ],
  },
  // Africa coastal
  {
    name: 'ACE (Africa Coast to Europe)',
    owner: 'Consortium',
    year: 2012,
    points: [
      [-6, 43],
      [-10, 38],
      [-15, 28],
      [-17, 15],
      [-16, 12],
      [-14, 10],
      [-8, 5],
      [3, 5],
    ],
  },
  {
    name: 'SAT-3/WASC',
    owner: 'Consortium',
    year: 2002,
    points: [
      [-9, 38],
      [-10, 33],
      [-15, 28],
      [-17, 14],
      [-4, 5],
      [3, 5],
      [8, 4],
      [10, -6],
      [18, -34],
    ],
  },
  {
    name: 'EASSy',
    owner: 'Consortium',
    year: 2010,
    points: [
      [32, -30],
      [35, -25],
      [40, -15],
      [43, -4],
      [43, 11],
      [45, 2],
      [47, 0],
    ],
  },
  {
    name: 'SEACOM',
    owner: 'SEACOM',
    year: 2009,
    points: [
      [18, -34],
      [28, -33],
      [35, -25],
      [40, -12],
      [43, 11],
      [48, 15],
      [55, 22],
      [72, 19],
    ],
  },
  // Indian Ocean
  {
    name: 'IMEWE',
    owner: 'Consortium',
    year: 2010,
    points: [
      [72, 19],
      [65, 15],
      [55, 22],
      [44, 28],
      [35, 31],
      [15, 38],
      [3, 43],
    ],
  },
  {
    name: 'i2i Cable',
    owner: 'Consortium',
    year: 2023,
    points: [
      [72, 19],
      [80, 12],
      [100, 5],
      [103.8, 1.3],
    ],
  },
  {
    name: 'Maldives-Sri Lanka Cable',
    owner: 'Consortium',
    year: 2006,
    points: [
      [73, 4],
      [75, 5],
      [79, 7],
    ],
  },
  // Pacific
  {
    name: 'SJC (Southeast Asia-Japan)',
    owner: 'Consortium',
    year: 2013,
    points: [
      [103.8, 1.3],
      [108, 10],
      [115, 15],
      [120, 20],
      [128, 30],
      [135, 34],
    ],
  },
  {
    name: 'APG (Asia Pacific Gateway)',
    owner: 'Consortium',
    year: 2016,
    points: [
      [103.8, 1.3],
      [106, 10],
      [110, 15],
      [114, 22],
      [117, 23],
      [121, 25],
      [135, 34],
    ],
  },
  {
    name: 'Unity (US-Japan)',
    owner: 'Google/KDDI',
    year: 2010,
    points: [
      [-122, 37],
      [-140, 32],
      [-155, 28],
      [-170, 25],
      [175, 22],
      [165, 25],
      [155, 28],
      [140, 32],
      [135, 34],
    ],
  },
  {
    name: 'Southern Cross NEXT',
    owner: 'Spark/Telstra',
    year: 2022,
    points: [
      [-122, 34],
      [-135, 25],
      [-150, 15],
      [-160, -5],
      [-170, -15],
      [175, -35],
      [173, -41],
    ],
  },
  {
    name: 'Hawaiki',
    owner: 'Hawaiki',
    year: 2018,
    points: [
      [-122, 34],
      [-140, 25],
      [-155, 20],
      [-170, -10],
      [175, -35],
      [173, -41],
    ],
  },
  {
    name: 'JGA-N (Japan-Guam-Australia)',
    owner: 'RTI',
    year: 2020,
    points: [
      [135, 34],
      [140, 28],
      [144, 13],
      [150, -5],
      [152, -28],
    ],
  },
  // Arctic
  {
    name: 'Far North Fiber',
    owner: 'Far North Digital',
    year: 2026,
    points: [
      [-5, 60],
      [-15, 65],
      [-35, 67],
      [-55, 63],
      [-70, 60],
      [-90, 70],
      [-130, 72],
      [-170, 65],
      [175, 63],
      [160, 60],
      [140, 55],
    ],
  },
  // Middle East
  {
    name: 'FLAG (Fiber Optic Link Around Globe)',
    owner: 'Reliance',
    year: 1997,
    points: [
      [-5, 50],
      [5, 43],
      [15, 37],
      [30, 31],
      [35, 31],
      [44, 28],
      [55, 22],
      [65, 15],
      [72, 19],
      [80, 10],
      [95, 5],
      [104, 1],
      [114, 22],
      [121, 25],
    ],
  },
  {
    name: 'Gulf Bridge International',
    owner: 'GBI',
    year: 2012,
    points: [
      [50, 26],
      [52, 25],
      [55, 24],
      [57, 23],
      [60, 22],
    ],
  },
  // Additional hyperscale
  {
    name: 'Grace Hopper (Google)',
    owner: 'Google',
    year: 2022,
    points: [
      [-74, 40],
      [-40, 48],
      [-15, 50],
      [-5, 51],
    ],
  },
  {
    name: 'Dunant (Google)',
    owner: 'Google',
    year: 2020,
    points: [
      [-74, 40],
      [-50, 45],
      [-20, 48],
      [-5, 47],
    ],
  },
  {
    name: 'Firmina (Google)',
    owner: 'Google',
    year: 2023,
    points: [
      [-74, 40],
      [-55, 20],
      [-43, -23],
      [-40, -32],
    ],
  },
  {
    name: 'Echo (Google/Meta)',
    owner: 'Google/Meta',
    year: 2023,
    points: [
      [-122, 37],
      [-140, 30],
      [-155, 22],
      [-165, 15],
      [170, 8],
      [150, 5],
      [130, 5],
      [103.8, 1.3],
    ],
  },
  {
    name: 'Bifrost (Meta)',
    owner: 'Meta',
    year: 2024,
    points: [
      [-122, 34],
      [-140, 25],
      [-155, 15],
      [165, 8],
      [145, 5],
      [125, 10],
      [121, 14],
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

  // Generate great circle arc between two points
  private generateArc(lon1: number, lat1: number, lon2: number, lat2: number, n: number): [number, number][] {
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;
    const p1 = lat1 * toRad;
    const l1 = lon1 * toRad;
    const p2 = lat2 * toRad;
    const l2 = lon2 * toRad;
    const d =
      2 *
      Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
    if (d < 0.001)
      return [
        [lon1, lat1],
        [lon2, lat2],
      ]; // Too close, skip arc
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const a = Math.sin((1 - f) * d) / Math.sin(d);
      const b = Math.sin(f * d) / Math.sin(d);
      const x = a * Math.cos(p1) * Math.cos(l1) + b * Math.cos(p2) * Math.cos(l2);
      const y = a * Math.cos(p1) * Math.sin(l1) + b * Math.cos(p2) * Math.sin(l2);
      const z = a * Math.sin(p1) + b * Math.sin(p2);
      pts.push([Math.atan2(y, x) * toDeg, Math.atan2(z, Math.sqrt(x ** 2 + y ** 2)) * toDeg]);
    }
    return pts;
  }

  // Split cable into segments at dateline crossings, interpolate each segment as arc
  private cableToFeatures(c: {
    name: string;
    owner: string;
    year: number;
    points: [number, number][];
  }): GeoJSON.Feature[] {
    const features: GeoJSON.Feature[] = [];
    let currentSegment: [number, number][] = [];

    for (let i = 0; i < c.points.length - 1; i++) {
      const lonDiff = Math.abs(c.points[i][0] - c.points[i + 1][0]);

      if (lonDiff > 160) {
        // Dateline crossing — finalize current segment, start new one
        if (currentSegment.length === 0) currentSegment.push(c.points[i]);
        if (currentSegment.length > 1) {
          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: this.arcInterpolate(currentSegment) },
            properties: { name: c.name, owner: c.owner, year: c.year },
          });
        }
        currentSegment = [c.points[i + 1]];
      } else {
        if (currentSegment.length === 0) currentSegment.push(c.points[i]);
        currentSegment.push(c.points[i + 1]);
      }
    }

    if (currentSegment.length > 1) {
      features.push({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: this.arcInterpolate(currentSegment) },
        properties: { name: c.name, owner: c.owner, year: c.year },
      });
    }

    return features;
  }

  // Interpolate waypoints into smooth arcs
  private arcInterpolate(points: [number, number][]): [number, number][] {
    const result: [number, number][] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const arc = this.generateArc(points[i][0], points[i][1], points[i + 1][0], points[i + 1][1], 15);
      result.push(...(i === 0 ? arc : arc.slice(1)));
    }
    return result;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    // Split dateline-crossing cables into separate segments
    const allFeatures: GeoJSON.Feature[] = [];
    for (const cable of CABLES) {
      allFeatures.push(...this.cableToFeatures(cable));
    }

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: allFeatures,
    };

    this.map.addSource('cables', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'cables-glow',
      type: 'line',
      source: 'cables',
      paint: { 'line-color': '#06b6d4', 'line-width': 2, 'line-opacity': 0.04, 'line-blur': 2 },
    });

    this.map.addLayer({
      id: 'cables-line',
      type: 'line',
      source: 'cables',
      paint: { 'line-color': '#06b6d4', 'line-width': 0.8, 'line-opacity': 0.3 },
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
        .setHTML(cablePopup(p))
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
