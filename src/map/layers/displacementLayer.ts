import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface DisplacementFlow {
  origin: string;
  destination: string;
  population: number;
  cause: string;
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
}

// Top displacement corridors (UNHCR 2025-2026 data)
const FLOWS: DisplacementFlow[] = [
  {
    origin: 'Ukraine',
    destination: 'Poland',
    population: 1600000,
    cause: 'Russia-Ukraine war',
    lat1: 48.4,
    lon1: 31.2,
    lat2: 52.0,
    lon2: 20.0,
  },
  {
    origin: 'Ukraine',
    destination: 'Germany',
    population: 1100000,
    cause: 'Russia-Ukraine war',
    lat1: 48.4,
    lon1: 31.2,
    lat2: 52.5,
    lon2: 13.4,
  },
  {
    origin: 'Syria',
    destination: 'Turkey',
    population: 3500000,
    cause: 'Civil war',
    lat1: 34.8,
    lon1: 38.9,
    lat2: 39.9,
    lon2: 32.9,
  },
  {
    origin: 'Syria',
    destination: 'Lebanon',
    population: 800000,
    cause: 'Civil war',
    lat1: 34.8,
    lon1: 38.9,
    lat2: 33.9,
    lon2: 35.5,
  },
  {
    origin: 'Afghanistan',
    destination: 'Pakistan',
    population: 1700000,
    cause: 'Taliban rule',
    lat1: 33.9,
    lon1: 67.7,
    lat2: 30.4,
    lon2: 69.3,
  },
  {
    origin: 'Afghanistan',
    destination: 'Iran',
    population: 800000,
    cause: 'Taliban rule',
    lat1: 33.9,
    lon1: 67.7,
    lat2: 32.4,
    lon2: 53.7,
  },
  {
    origin: 'Venezuela',
    destination: 'Colombia',
    population: 2900000,
    cause: 'Economic crisis',
    lat1: 8.0,
    lon1: -66.0,
    lat2: 4.6,
    lon2: -74.3,
  },
  {
    origin: 'Venezuela',
    destination: 'Peru',
    population: 1500000,
    cause: 'Economic crisis',
    lat1: 8.0,
    lon1: -66.0,
    lat2: -12.0,
    lon2: -77.0,
  },
  {
    origin: 'Sudan',
    destination: 'Chad',
    population: 1200000,
    cause: 'Civil war',
    lat1: 15.5,
    lon1: 32.5,
    lat2: 12.1,
    lon2: 15.0,
  },
  {
    origin: 'Sudan',
    destination: 'South Sudan',
    population: 700000,
    cause: 'Civil war',
    lat1: 15.5,
    lon1: 32.5,
    lat2: 4.9,
    lon2: 31.6,
  },
  {
    origin: 'Myanmar',
    destination: 'Bangladesh',
    population: 960000,
    cause: 'Rohingya persecution',
    lat1: 19.8,
    lon1: 96.1,
    lat2: 21.4,
    lon2: 92.0,
  },
  {
    origin: 'DRC',
    destination: 'Uganda',
    population: 500000,
    cause: 'M23 conflict',
    lat1: -1.5,
    lon1: 29.0,
    lat2: 0.3,
    lon2: 32.6,
  },
  {
    origin: 'Somalia',
    destination: 'Kenya',
    population: 580000,
    cause: 'Al-Shabaab + drought',
    lat1: 2.0,
    lon1: 45.3,
    lat2: -1.3,
    lon2: 36.8,
  },
  {
    origin: 'South Sudan',
    destination: 'Uganda',
    population: 950000,
    cause: 'Civil war',
    lat1: 4.9,
    lon1: 31.6,
    lat2: 0.3,
    lon2: 32.6,
  },
  {
    origin: 'Eritrea',
    destination: 'Ethiopia',
    population: 200000,
    cause: 'Military conscription',
    lat1: 15.3,
    lon1: 39.0,
    lat2: 9.1,
    lon2: 40.5,
  },
  {
    origin: 'Yemen',
    destination: 'Saudi Arabia',
    population: 350000,
    cause: 'Houthi war',
    lat1: 15.6,
    lon1: 48.5,
    lat2: 24.7,
    lon2: 46.7,
  },
  {
    origin: 'Haiti',
    destination: 'Dominican Republic',
    population: 280000,
    cause: 'Gang violence + collapse',
    lat1: 18.5,
    lon1: -72.3,
    lat2: 18.5,
    lon2: -69.9,
  },
  {
    origin: 'DRC',
    destination: 'Tanzania',
    population: 300000,
    cause: 'Eastern DRC conflict',
    lat1: -1.5,
    lon1: 29.0,
    lat2: -6.8,
    lon2: 37.7,
  },
  {
    origin: 'Burkina Faso',
    destination: 'Ghana',
    population: 220000,
    cause: 'Sahel insurgency',
    lat1: 12.3,
    lon1: -1.5,
    lat2: 7.9,
    lon2: -1.0,
  },
  {
    origin: 'Nicaragua',
    destination: 'Costa Rica',
    population: 180000,
    cause: 'Political repression',
    lat1: 12.1,
    lon1: -86.3,
    lat2: 10.0,
    lon2: -84.0,
  },
  {
    origin: 'CAR',
    destination: 'Cameroon',
    population: 350000,
    cause: 'Armed group violence',
    lat1: 6.6,
    lon1: 20.9,
    lat2: 5.0,
    lon2: 12.4,
  },
  {
    origin: 'Ukraine',
    destination: 'Czech Republic',
    population: 380000,
    cause: 'Russia-Ukraine war',
    lat1: 48.4,
    lon1: 31.2,
    lat2: 50.1,
    lon2: 14.4,
  },
  {
    origin: 'Syria',
    destination: 'Germany',
    population: 850000,
    cause: 'Civil war',
    lat1: 34.8,
    lon1: 38.9,
    lat2: 52.5,
    lon2: 13.4,
  },
  {
    origin: 'Mozambique',
    destination: 'Malawi',
    population: 120000,
    cause: 'Cabo Delgado insurgency',
    lat1: -12.5,
    lon1: 40.5,
    lat2: -13.3,
    lon2: 33.8,
  },
];

export class DisplacementLayer implements MapDataLayer {
  readonly id = 'displacement';
  readonly name = 'Refugee Flows';
  readonly category = 'intelligence' as const;
  readonly icon = '🏃';
  readonly description = 'Major refugee and displacement corridors (UNHCR)';

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
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: FLOWS } }));
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
    return FLOWS.length;
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
    if (!this.map) return;
    this.removeLayer();

    const maxPop = Math.max(...FLOWS.map((f) => f.population));

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: FLOWS.map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: this.generateArc(f.lon1, f.lat1, f.lon2, f.lat2, 30) },
        properties: {
          origin: f.origin,
          destination: f.destination,
          population: f.population,
          cause: f.cause,
          width: 1 + (f.population / maxPop) * 4,
          label: `${f.origin} → ${f.destination}`,
        },
      })),
    };

    this.map.addSource('displacement', { type: 'geojson', data: geojson });

    // Flow glow
    this.map.addLayer({
      id: 'displacement-glow',
      type: 'line',
      source: 'displacement',
      paint: {
        'line-color': '#38bdf8',
        'line-width': ['*', ['get', 'width'], 3],
        'line-opacity': 0.06,
        'line-blur': 4,
      },
    });

    // Flow line
    this.map.addLayer({
      id: 'displacement-line',
      type: 'line',
      source: 'displacement',
      paint: {
        'line-color': '#38bdf8',
        'line-width': ['get', 'width'],
        'line-opacity': 0.5,
        'line-dasharray': [2, 2],
      },
    });

    // Hover
    this.map.on('mouseenter', 'displacement-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'displacement-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'displacement-line', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(
          renderPopupCard({
            type: 'DISPLACEMENT CORRIDOR',
            typeColor: '#38bdf8',
            title: String(p.label),
            fields: [
              { label: 'Displaced', value: Number(p.population).toLocaleString() },
              { label: 'Cause', value: String(p.cause) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['displacement-line', 'displacement-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('displacement')) this.map.removeSource('displacement');
    this.popup?.remove();
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
