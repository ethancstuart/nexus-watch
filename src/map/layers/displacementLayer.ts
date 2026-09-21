import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';

interface DisplacementFlow {
  origin: string;
  destination: string;
  population: number;
  year: number;
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
}

export class DisplacementLayer implements MapDataLayer {
  readonly id = 'displacement';
  readonly name = 'Refugee Flows';
  readonly category = 'intelligence' as const;
  readonly icon = '🏃';
  readonly description = 'Major refugee and displacement corridors (UNHCR data)';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: DisplacementFlow[] = [];
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
    try {
      const res = await fetchWithRetry('/api/displacement');
      const json = await res.json();
      if (json.flows?.length > 0) {
        this.data = json.flows;
        this.lastUpdated = Date.now();
        if (this.enabled) this.renderLayer();
      }
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Displacement layer refresh error:', err);
    }
  }

  getRefreshInterval(): number {
    return 86400_000; // 24 hours
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

    const maxPop = Math.max(...this.data.map((f) => f.population));

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: this.generateArc(f.lon1, f.lat1, f.lon2, f.lat2, 30) },
        properties: {
          origin: f.origin,
          destination: f.destination,
          population: f.population,
          year: f.year,
          width: 1 + (f.population / maxPop) * 4,
          label: `${f.origin} → ${f.destination}`,
        },
      })),
    };

    this.map.addSource('displacement', { type: 'geojson', data: geojson });

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
              { label: 'Year', value: String(p.year) },
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
