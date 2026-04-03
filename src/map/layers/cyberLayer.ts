import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { cyberPopup } from '../PopupCard.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';

interface ThreatCorridor {
  source: string;
  target: string;
  lat1: number;
  lon1: number;
  lat2: number;
  lon2: number;
  level: 'critical' | 'high' | 'elevated' | 'moderate';
}

const LEVEL_COLORS: Record<string, string> = {
  critical: '#dc2626',
  high: '#f97316',
  elevated: '#eab308',
  moderate: '#6366f1',
};

export class CyberLayer implements MapDataLayer {
  readonly id = 'cyber';
  readonly name = 'Cyber Threats';
  readonly category = 'infrastructure' as const;
  readonly icon = '🛡️';
  readonly description = 'Cyber threat corridors and DDoS attack vectors';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: ThreatCorridor[] = [];
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
      const res = await fetchWithRetry('/api/cyber');
      if (!res.ok) throw new Error('Cyber API error');

      const result = (await res.json()) as { corridors: ThreatCorridor[] };
      this.data = result.corridors;
      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Cyber layer refresh error:', err);
    }
  }

  getRefreshInterval(): number {
    return 3_600_000; // 1 hour
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

  private renderLayer(): void {
    if (!this.map || this.data.length === 0) return;
    this.removeLayer();

    // Create arc lines between source and target
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((c) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'LineString' as const,
          coordinates: this.generateArc(c.lon1, c.lat1, c.lon2, c.lat2, 30),
        },
        properties: {
          source: c.source,
          target: c.target,
          level: c.level,
          color: LEVEL_COLORS[c.level] || '#6366f1',
          label: `${c.source} → ${c.target}`,
        },
      })),
    };

    // Source points
    const sourcePoints: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon1, c.lat1] },
        properties: {
          country: c.source,
          level: c.level,
          color: LEVEL_COLORS[c.level] || '#6366f1',
        },
      })),
    };

    // Target points
    const targetPoints: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon2, c.lat2] },
        properties: {
          country: c.target,
          level: c.level,
          color: LEVEL_COLORS[c.level] || '#6366f1',
        },
      })),
    };

    this.map.addSource('cyber-arcs', { type: 'geojson', data: geojson });
    this.map.addSource('cyber-sources', { type: 'geojson', data: sourcePoints });
    this.map.addSource('cyber-targets', { type: 'geojson', data: targetPoints });

    // Arc lines
    this.map.addLayer({
      id: 'cyber-arcs-line',
      type: 'line',
      source: 'cyber-arcs',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': ['match', ['get', 'level'], 'critical', 2.5, 'high', 2, 'elevated', 1.5, 1],
        'line-opacity': 0.6,
        'line-dasharray': [2, 2],
      },
    });

    // Arc glow
    this.map.addLayer(
      {
        id: 'cyber-arcs-glow',
        type: 'line',
        source: 'cyber-arcs',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': ['match', ['get', 'level'], 'critical', 8, 'high', 6, 'elevated', 4, 3],
          'line-opacity': 0.1,
          'line-blur': 4,
        },
      },
      'cyber-arcs-line',
    );

    // Source dots (attackers — red tint)
    this.map.addLayer({
      id: 'cyber-source-dots',
      type: 'circle',
      source: 'cyber-sources',
      paint: {
        'circle-radius': 5,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.8,
      },
    });

    // Target dots (defenders — blue tint)
    this.map.addLayer({
      id: 'cyber-target-dots',
      type: 'circle',
      source: 'cyber-targets',
      paint: {
        'circle-radius': 5,
        'circle-color': '#3b82f6',
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.8,
      },
    });

    // Hover on arcs
    this.map.on('mouseenter', 'cyber-arcs-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', 'cyber-arcs-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });

    this.map.on('mousemove', 'cyber-arcs-line', (e) => {
      if (!this.map || !e.features?.length) return;
      const props = e.features[0].properties!;

      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 12,
      })
        .setLngLat(e.lngLat)
        .setHTML(cyberPopup(props))
        .addTo(this.map);
    });
  }

  // Generate great circle arc points between two coordinates
  private generateArc(lon1: number, lat1: number, lon2: number, lat2: number, numPoints: number): [number, number][] {
    const points: [number, number][] = [];
    const toRad = Math.PI / 180;
    const toDeg = 180 / Math.PI;

    const φ1 = lat1 * toRad;
    const λ1 = lon1 * toRad;
    const φ2 = lat2 * toRad;
    const λ2 = lon2 * toRad;

    const d =
      2 *
      Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));

    for (let i = 0; i <= numPoints; i++) {
      const f = i / numPoints;
      const a = Math.sin((1 - f) * d) / Math.sin(d);
      const b = Math.sin(f * d) / Math.sin(d);
      const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2);
      const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2);
      const z = a * Math.sin(φ1) + b * Math.sin(φ2);
      const lat = Math.atan2(z, Math.sqrt(x ** 2 + y ** 2)) * toDeg;
      const lon = Math.atan2(y, x) * toDeg;
      points.push([lon, lat]);
    }

    return points;
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['cyber-target-dots', 'cyber-source-dots', 'cyber-arcs-line', 'cyber-arcs-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    for (const src of ['cyber-arcs', 'cyber-sources', 'cyber-targets']) {
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
