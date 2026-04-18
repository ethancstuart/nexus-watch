import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { updateProvenance } from '../../services/dataProvenance.ts';

/**
 * Migration Corridors Layer
 * Static curated list of major migration corridors worldwide.
 * Arcs drawn between origin/destination, thickness ~ flow volume.
 */

interface MigrationCorridor {
  origin: string;
  destination: string;
  originLat: number;
  originLon: number;
  destLat: number;
  destLon: number;
  /** Approx. annual flow volume (people). */
  volume: number;
  driver: string;
}

const CORRIDORS: MigrationCorridor[] = [
  {
    origin: 'Mexico',
    destination: 'United States',
    originLat: 19.43,
    originLon: -99.13,
    destLat: 32.72,
    destLon: -117.17,
    volume: 2_500_000,
    driver: 'Economic / violence',
  },
  {
    origin: 'Venezuela',
    destination: 'Colombia',
    originLat: 10.49,
    originLon: -66.88,
    destLat: 4.71,
    destLon: -74.07,
    volume: 2_900_000,
    driver: 'Economic collapse',
  },
  {
    origin: 'Ukraine',
    destination: 'Poland',
    originLat: 50.45,
    originLon: 30.52,
    destLat: 52.23,
    destLon: 21.01,
    volume: 1_700_000,
    driver: 'War (Russian invasion)',
  },
  {
    origin: 'Syria',
    destination: 'Turkey',
    originLat: 33.51,
    originLon: 36.28,
    destLat: 37.06,
    destLon: 37.38,
    volume: 3_200_000,
    driver: 'Civil war',
  },
  {
    origin: 'Afghanistan',
    destination: 'Pakistan',
    originLat: 34.55,
    originLon: 69.21,
    destLat: 33.68,
    destLon: 73.05,
    volume: 1_400_000,
    driver: 'Taliban rule',
  },
  {
    origin: 'DR Congo',
    destination: 'Uganda',
    originLat: -1.68,
    originLon: 29.22,
    destLat: 0.34,
    destLon: 32.58,
    volume: 500_000,
    driver: 'Armed conflict (M23)',
  },
  {
    origin: 'Myanmar',
    destination: 'Bangladesh',
    originLat: 20.8,
    originLon: 92.37,
    destLat: 21.2,
    destLon: 92.17,
    volume: 960_000,
    driver: 'Rohingya persecution',
  },
  {
    origin: 'Honduras',
    destination: 'United States',
    originLat: 14.07,
    originLon: -87.19,
    destLat: 29.42,
    destLon: -98.49,
    volume: 250_000,
    driver: 'Gang violence / climate',
  },
  {
    origin: 'South Sudan',
    destination: 'Uganda',
    originLat: 4.85,
    originLon: 31.58,
    destLat: 3.31,
    destLon: 32.28,
    volume: 900_000,
    driver: 'Civil war',
  },
  {
    origin: 'Sudan',
    destination: 'Chad',
    originLat: 13.4,
    originLon: 23.4,
    destLat: 13.85,
    destLon: 20.83,
    volume: 700_000,
    driver: 'RSF/SAF war',
  },
  {
    origin: 'Somalia',
    destination: 'Kenya',
    originLat: 2.05,
    originLon: 45.33,
    destLat: 0.05,
    destLon: 40.92,
    volume: 280_000,
    driver: 'Al-Shabaab / drought',
  },
  {
    origin: 'Eritrea',
    destination: 'Ethiopia',
    originLat: 15.34,
    originLon: 38.93,
    destLat: 9.03,
    destLon: 38.74,
    volume: 165_000,
    driver: 'Political repression',
  },
  {
    origin: 'Haiti',
    destination: 'Dominican Republic',
    originLat: 18.59,
    originLon: -72.31,
    destLat: 18.47,
    destLon: -69.91,
    volume: 500_000,
    driver: 'Gang collapse',
  },
  {
    origin: 'Nicaragua',
    destination: 'Costa Rica',
    originLat: 12.11,
    originLon: -86.24,
    destLat: 9.93,
    destLon: -84.08,
    volume: 220_000,
    driver: 'Authoritarian crackdown',
  },
  {
    origin: 'Libya',
    destination: 'Italy',
    originLat: 32.88,
    originLon: 13.19,
    destLat: 37.07,
    destLon: 15.29,
    volume: 100_000,
    driver: 'Mediterranean crossing',
  },
];

export class MigrationCorridorsLayer implements MapDataLayer {
  readonly id = 'migration-corridors';
  readonly name = 'Migration Corridors (Reference)';
  readonly category = 'intelligence' as const;
  readonly icon = '🚶';
  readonly description = 'Major global migration corridors with approximate flow volumes';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: MigrationCorridor[] = CORRIDORS;
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
    this.data = CORRIDORS;
    this.lastUpdated = Date.now();
    updateProvenance(this.id, {
      source: 'NexusWatch Curated (UNHCR, IOM, Migration Policy Institute)',
      sourceUrl: 'https://www.unhcr.org/global-trends',
      refreshIntervalMs: 86_400_000,
      methodology:
        'Curated list of 15 major migration corridors. Flow volumes are approximate annual/cumulative displacement estimates from UNHCR and IOM public data.',
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

    const maxVol = Math.max(...this.data.map((c) => c.volume));

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((c) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: this.generateArc(c.originLon, c.originLat, c.destLon, c.destLat, 40),
        },
        properties: {
          origin: c.origin,
          destination: c.destination,
          volume: c.volume,
          driver: c.driver,
          width: 1 + (c.volume / maxVol) * 5,
          label: `${c.origin} → ${c.destination}`,
        },
      })),
    };

    this.map.addSource('migration-corridors', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'migration-corridors-glow',
      type: 'line',
      source: 'migration-corridors',
      paint: {
        'line-color': '#fbbf24',
        'line-width': ['*', ['get', 'width'], 3],
        'line-opacity': 0.08,
        'line-blur': 4,
      },
    });

    this.map.addLayer({
      id: 'migration-corridors-line',
      type: 'line',
      source: 'migration-corridors',
      paint: {
        'line-color': '#f59e0b',
        'line-width': ['get', 'width'],
        'line-opacity': 0.6,
        'line-dasharray': [3, 2],
      },
    });

    this.map.on('mouseenter', 'migration-corridors-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'migration-corridors-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'migration-corridors-line', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(
          renderPopupCard({
            type: 'MIGRATION CORRIDOR',
            typeColor: '#f59e0b',
            title: String(p.label),
            fields: [
              { label: 'Volume', value: Number(p.volume).toLocaleString() },
              { label: 'Driver', value: String(p.driver) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['migration-corridors-line', 'migration-corridors-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('migration-corridors')) this.map.removeSource('migration-corridors');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
