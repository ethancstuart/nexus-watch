import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';
import { cacheLayerData, getCachedLayerData } from '../../utils/layerCache.ts';
import { updateProvenance, SOURCE_REGISTRY } from '../../services/dataProvenance.ts';

interface RefugeeFlow {
  origin: string;
  destination: string;
  population: number;
  year: number;
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
}

/**
 * Refugee Displacement Layer (UNHCR)
 *
 * Upgrades the basic displacement layer with:
 * - Animated arc rendering with dash-offset animation
 * - Provenance tracking and layer cache
 * - Scaled arrow indicators showing flow direction
 * - Origin/destination endpoint markers
 * - Population-proportional arc thickness and glow
 */
export class RefugeeLayer implements MapDataLayer {
  readonly id = 'refugees';
  readonly name = 'Refugee Displacement';
  readonly category = 'intelligence' as const;
  readonly icon = '🏃';
  readonly description = 'UNHCR refugee flows between countries with animated displacement arcs';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: RefugeeFlow[] = [];
  private popup: maplibregl.Popup | null = null;
  private animationFrame: number | null = null;
  private dashOffset = 0;

  init(map: MaplibreMap): void {
    this.map = map;
  }

  enable(): void {
    this.enabled = true;
    this.renderLayer();
  }

  disable(): void {
    this.enabled = false;
    this.stopAnimation();
    this.removeLayer();
  }

  async refresh(): Promise<void> {
    const reg = SOURCE_REGISTRY[this.id];
    try {
      const res = await fetchWithRetry('/api/displacement');
      const json = (await res.json()) as { flows: RefugeeFlow[] };
      if (json.flows?.length > 0) {
        this.data = json.flows;
        this.lastUpdated = Date.now();
        cacheLayerData(this.id, this.data);
        if (reg)
          updateProvenance(this.id, {
            ...reg,
            dataPointCount: this.data.length,
            lastFetchOk: true,
          });
      }
    } catch (err) {
      console.error('Refugee layer refresh error:', err);
      const cached = getCachedLayerData<RefugeeFlow[]>(this.id);
      if (cached && cached.length > 0) this.data = cached;
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.data.length,
          lastFetchOk: false,
          lastError: err instanceof Error ? err.message : String(err),
        });
    }
    if (this.enabled && this.data.length > 0) this.renderLayer();
    document.dispatchEvent(
      new CustomEvent('dashview:layer-data', {
        detail: { layerId: this.id, data: this.data },
      }),
    );
  }

  getRefreshInterval(): number {
    return 86_400_000; // 24 hours
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

    // Arc lines
    const arcGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((f) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: this.generateArc(f.lon1, f.lat1, f.lon2, f.lat2, 40),
        },
        properties: {
          origin: f.origin,
          destination: f.destination,
          population: f.population,
          year: f.year,
          width: 1 + (f.population / maxPop) * 5,
          label: `${f.origin} → ${f.destination}`,
          popFormatted: f.population.toLocaleString(),
        },
      })),
    };

    // Origin points (red — crisis locations)
    const originPoints: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [f.lon1, f.lat1] },
        properties: {
          name: f.origin,
          type: 'origin',
          population: f.population,
          radius: 4 + (f.population / maxPop) * 8,
        },
      })),
    };

    // Destination points (blue — receiving countries)
    const destPoints: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((f) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [f.lon2, f.lat2] },
        properties: {
          name: f.destination,
          type: 'destination',
          population: f.population,
          radius: 4 + (f.population / maxPop) * 8,
        },
      })),
    };

    this.map.addSource('refugees-arcs', { type: 'geojson', data: arcGeoJson });
    this.map.addSource('refugees-origins', { type: 'geojson', data: originPoints });
    this.map.addSource('refugees-destinations', { type: 'geojson', data: destPoints });

    // Arc glow
    this.map.addLayer({
      id: 'refugees-glow',
      type: 'line',
      source: 'refugees-arcs',
      paint: {
        'line-color': '#f59e0b',
        'line-width': ['*', ['get', 'width'], 3],
        'line-opacity': 0.08,
        'line-blur': 5,
      },
    });

    // Main arc lines — animated dash
    this.map.addLayer({
      id: 'refugees-line',
      type: 'line',
      source: 'refugees-arcs',
      paint: {
        'line-color': [
          'interpolate',
          ['linear'],
          ['get', 'population'],
          50000,
          '#fbbf24',
          200000,
          '#f59e0b',
          500000,
          '#d97706',
          1000000,
          '#b45309',
        ],
        'line-width': ['get', 'width'],
        'line-opacity': 0.65,
        'line-dasharray': [2, 2],
      },
    });

    // Origin dots (red pulse — crisis)
    this.map.addLayer({
      id: 'refugees-origin-glow',
      type: 'circle',
      source: 'refugees-origins',
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': '#ef4444',
        'circle-opacity': 0.15,
        'circle-blur': 0.6,
      },
    });

    this.map.addLayer({
      id: 'refugees-origin-dot',
      type: 'circle',
      source: 'refugees-origins',
      paint: {
        'circle-radius': 4,
        'circle-color': '#ef4444',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
        'circle-opacity': 0.9,
      },
    });

    // Destination dots (blue — receiving)
    this.map.addLayer({
      id: 'refugees-dest-glow',
      type: 'circle',
      source: 'refugees-destinations',
      paint: {
        'circle-radius': ['get', 'radius'],
        'circle-color': '#38bdf8',
        'circle-opacity': 0.15,
        'circle-blur': 0.6,
      },
    });

    this.map.addLayer({
      id: 'refugees-dest-dot',
      type: 'circle',
      source: 'refugees-destinations',
      paint: {
        'circle-radius': 4,
        'circle-color': '#38bdf8',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
        'circle-opacity': 0.9,
      },
    });

    // Hover on arcs
    this.map.on('mouseenter', 'refugees-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'refugees-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'refugees-line', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 10,
      })
        .setLngLat(e.lngLat)
        .setHTML(
          renderPopupCard({
            type: 'REFUGEE CORRIDOR',
            typeColor: '#f59e0b',
            title: String(p.label),
            fields: [
              { label: 'Displaced', value: String(p.popFormatted) },
              { label: 'Year', value: String(p.year) },
            ],
          }),
        )
        .addTo(this.map);
    });

    // Start dash animation
    this.startAnimation();
  }

  private startAnimation(): void {
    this.stopAnimation();
    const animate = () => {
      this.dashOffset += 0.5;
      if (this.map?.getLayer('refugees-line')) {
        this.map.setPaintProperty('refugees-line', 'line-dasharray', [2, 2 + Math.sin(this.dashOffset * 0.05) * 0.5]);
      }
      this.animationFrame = requestAnimationFrame(animate);
    };
    this.animationFrame = requestAnimationFrame(animate);
  }

  private stopAnimation(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
  }

  private removeLayer(): void {
    if (!this.map) return;
    this.stopAnimation();
    for (const id of [
      'refugees-dest-dot',
      'refugees-dest-glow',
      'refugees-origin-dot',
      'refugees-origin-glow',
      'refugees-line',
      'refugees-glow',
    ]) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    for (const src of ['refugees-arcs', 'refugees-origins', 'refugees-destinations']) {
      if (this.map.getSource(src)) this.map.removeSource(src);
    }
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
