import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { updateProvenance } from '../../services/dataProvenance.ts';

/**
 * Commodity Flows Layer
 * Major oil/gas/LNG/grain flow routes drawn as arcs.
 */

type Commodity = 'oil' | 'gas' | 'lng' | 'grain' | 'coal';

interface CommodityFlow {
  origin: string;
  destination: string;
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
  commodity: Commodity;
  /** Approx daily/annual flow — used for thickness normalization. */
  volume: number;
  /** Units label (e.g., "mb/d", "bcm/yr"). */
  unit: string;
  notes?: string;
}

const FLOWS: CommodityFlow[] = [
  {
    origin: 'Russia (Yamal)',
    destination: 'Germany',
    originLat: 66.95,
    originLon: 70.0,
    destLat: 53.55,
    destLon: 9.99,
    commodity: 'gas',
    volume: 55,
    unit: 'bcm/yr',
    notes: 'Nord Stream (halted)',
  },
  {
    origin: 'Russia (Sakhalin)',
    destination: 'Japan',
    originLat: 50.29,
    originLon: 142.83,
    destLat: 35.68,
    destLon: 139.69,
    commodity: 'lng',
    volume: 10,
    unit: 'mtpa',
  },
  {
    origin: 'Saudi Arabia (Ras Tanura)',
    destination: 'China',
    originLat: 26.64,
    originLon: 50.16,
    destLat: 23.13,
    destLon: 113.26,
    commodity: 'oil',
    volume: 1.7,
    unit: 'mb/d',
    notes: 'Via Hormuz + Malacca',
  },
  {
    origin: 'Saudi Arabia (Ras Tanura)',
    destination: 'India',
    originLat: 26.64,
    originLon: 50.16,
    destLat: 19.08,
    destLon: 72.88,
    commodity: 'oil',
    volume: 0.9,
    unit: 'mb/d',
  },
  {
    origin: 'Saudi Arabia (Ras Tanura)',
    destination: 'South Korea',
    originLat: 26.64,
    originLon: 50.16,
    destLat: 35.1,
    destLon: 129.04,
    commodity: 'oil',
    volume: 0.8,
    unit: 'mb/d',
  },
  {
    origin: 'USA (Sabine Pass)',
    destination: 'Netherlands',
    originLat: 29.73,
    originLon: -93.89,
    destLat: 51.95,
    destLon: 4.13,
    commodity: 'lng',
    volume: 20,
    unit: 'mtpa',
  },
  {
    origin: 'USA (Corpus Christi)',
    destination: 'UK (Isle of Grain)',
    originLat: 27.8,
    originLon: -97.4,
    destLat: 51.44,
    destLon: 0.72,
    commodity: 'lng',
    volume: 12,
    unit: 'mtpa',
  },
  {
    origin: 'Qatar (Ras Laffan)',
    destination: 'China',
    originLat: 25.91,
    originLon: 51.56,
    destLat: 31.23,
    destLon: 121.47,
    commodity: 'lng',
    volume: 18,
    unit: 'mtpa',
  },
  {
    origin: 'Qatar (Ras Laffan)',
    destination: 'India',
    originLat: 25.91,
    originLon: 51.56,
    destLat: 22.47,
    destLon: 69.06,
    commodity: 'lng',
    volume: 10,
    unit: 'mtpa',
  },
  {
    origin: 'Australia (Gladstone)',
    destination: 'Japan',
    originLat: -23.85,
    originLon: 151.26,
    destLat: 35.68,
    destLon: 139.69,
    commodity: 'lng',
    volume: 25,
    unit: 'mtpa',
  },
  {
    origin: 'Australia (Newcastle)',
    destination: 'China',
    originLat: -32.93,
    originLon: 151.78,
    destLat: 31.23,
    destLon: 121.47,
    commodity: 'coal',
    volume: 60,
    unit: 'mt/yr',
  },
  {
    origin: 'Australia (Port Hedland)',
    destination: 'China',
    originLat: -20.31,
    originLon: 118.6,
    destLat: 31.23,
    destLon: 121.47,
    commodity: 'oil',
    volume: 80,
    unit: 'mt/yr',
    notes: 'Iron ore corridor',
  },
  {
    origin: 'Ukraine (Odesa)',
    destination: 'Turkey',
    originLat: 46.48,
    originLon: 30.73,
    destLat: 41.01,
    destLon: 28.98,
    commodity: 'grain',
    volume: 30,
    unit: 'mt/yr',
    notes: 'Black Sea grain corridor',
  },
  {
    origin: 'Ukraine (Odesa)',
    destination: 'Egypt',
    originLat: 46.48,
    originLon: 30.73,
    destLat: 30.05,
    destLon: 31.25,
    commodity: 'grain',
    volume: 10,
    unit: 'mt/yr',
  },
  {
    origin: 'Russia (Novorossiysk)',
    destination: 'Egypt',
    originLat: 44.72,
    originLon: 37.77,
    destLat: 30.05,
    destLon: 31.25,
    commodity: 'grain',
    volume: 8,
    unit: 'mt/yr',
  },
  {
    origin: 'USA (New Orleans)',
    destination: 'China',
    originLat: 29.95,
    originLon: -90.07,
    destLat: 31.23,
    destLon: 121.47,
    commodity: 'grain',
    volume: 30,
    unit: 'mt/yr',
    notes: 'Soybean corridor',
  },
  {
    origin: 'Brazil (Santos)',
    destination: 'China',
    originLat: -23.96,
    originLon: -46.33,
    destLat: 31.23,
    destLon: 121.47,
    commodity: 'grain',
    volume: 50,
    unit: 'mt/yr',
  },
  {
    origin: 'Iraq (Basra)',
    destination: 'India',
    originLat: 30.51,
    originLon: 47.83,
    destLat: 19.08,
    destLon: 72.88,
    commodity: 'oil',
    volume: 1.0,
    unit: 'mb/d',
  },
  {
    origin: 'Nigeria (Bonny)',
    destination: 'Europe',
    originLat: 4.43,
    originLon: 7.17,
    destLat: 43.3,
    destLon: 5.4,
    commodity: 'oil',
    volume: 0.7,
    unit: 'mb/d',
  },
  {
    origin: 'Norway (Statfjord)',
    destination: 'UK',
    originLat: 61.25,
    originLon: 1.85,
    destLat: 54.5,
    destLon: -1.5,
    commodity: 'gas',
    volume: 40,
    unit: 'bcm/yr',
  },
  {
    origin: 'Azerbaijan (Baku)',
    destination: 'Italy',
    originLat: 40.41,
    originLon: 49.87,
    destLat: 40.13,
    destLon: 18.36,
    commodity: 'gas',
    volume: 10,
    unit: 'bcm/yr',
    notes: 'TANAP/TAP',
  },
  {
    origin: 'Indonesia (Kalimantan)',
    destination: 'China',
    originLat: -1.0,
    originLon: 114.0,
    destLat: 23.13,
    destLon: 113.26,
    commodity: 'coal',
    volume: 100,
    unit: 'mt/yr',
  },
];

function colorForCommodity(c: Commodity): string {
  switch (c) {
    case 'oil':
      return '#0f172a';
    case 'gas':
      return '#38bdf8';
    case 'lng':
      return '#22d3ee';
    case 'grain':
      return '#eab308';
    case 'coal':
      return '#64748b';
  }
}

export class CommodityFlowsLayer implements MapDataLayer {
  readonly id = 'commodity-flows';
  readonly name = 'Commodity Flows';
  readonly category = 'infrastructure' as const;
  readonly icon = '⛽';
  readonly description = 'Global oil, gas, LNG, grain, and coal flow routes';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: CommodityFlow[] = FLOWS;
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
    this.data = FLOWS;
    this.lastUpdated = Date.now();
    updateProvenance(this.id, {
      source: 'NexusWatch Curated (EIA + IEA + USDA FAS)',
      sourceUrl: 'https://www.eia.gov/international/',
      refreshIntervalMs: 86_400_000,
      methodology:
        'Curated list of major oil, gas, LNG, grain, and coal flow routes. Source data: US EIA international statistics, IEA commodity reports, USDA Foreign Ag Service.',
      dataPointCount: this.data.length,
      lastFetchOk: true,
    });
    if (this.enabled) this.renderLayer();
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
  }
  getRefreshInterval(): number {
    return 86_400_000;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
  getLastUpdated(): number | null {
    return this.lastUpdated;
  }
  getFeatureCount(): number {
    return this.data.length;
  }

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
    if (d === 0)
      return [
        [lon1, lat1],
        [lon2, lat2],
      ];
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

  private renderLayer(): void {
    if (!this.map || this.data.length === 0) return;
    this.removeLayer();

    const maxVol = Math.max(...this.data.map((f) => f.volume));

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((f) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: this.generateArc(f.originLon, f.originLat, f.destLon, f.destLat, 40),
        },
        properties: {
          origin: f.origin,
          destination: f.destination,
          commodity: f.commodity,
          volume: f.volume,
          unit: f.unit,
          notes: f.notes || '',
          color: colorForCommodity(f.commodity),
          width: 1 + (f.volume / maxVol) * 4,
          label: `${f.origin} → ${f.destination}`,
        },
      })),
    };

    this.map.addSource('commodity-flows', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'commodity-flows-glow',
      type: 'line',
      source: 'commodity-flows',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['*', ['get', 'width'], 3],
        'line-opacity': 0.08,
        'line-blur': 4,
      },
    });

    this.map.addLayer({
      id: 'commodity-flows-line',
      type: 'line',
      source: 'commodity-flows',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['get', 'width'],
        'line-opacity': 0.7,
      },
    });

    this.map.on('mouseenter', 'commodity-flows-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'commodity-flows-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'commodity-flows-line', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(
          renderPopupCard({
            type: `${String(p.commodity).toUpperCase()} FLOW`,
            typeColor: String(p.color),
            title: String(p.label),
            fields: [
              { label: 'Volume', value: `${Number(p.volume)} ${String(p.unit)}` },
              ...(p.notes ? [{ label: 'Notes', value: String(p.notes) }] : []),
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['commodity-flows-line', 'commodity-flows-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('commodity-flows')) this.map.removeSource('commodity-flows');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
