import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { satellitePopup } from '../PopupCard.ts';

// Notable satellites with pre-computed approximate orbital parameters
// In production, these would be computed from TLE data using SGP4
interface SatelliteTrack {
  name: string;
  type: 'station' | 'military' | 'communication' | 'reconnaissance';
  country: string;
  inclination: number; // degrees
  altitude: number; // km
  period: number; // minutes
}

const SATELLITES: SatelliteTrack[] = [
  { name: 'ISS (ZARYA)', type: 'station', country: 'Intl', inclination: 51.6, altitude: 420, period: 93 },
  { name: 'Tiangong', type: 'station', country: 'CN', inclination: 41.5, altitude: 390, period: 92 },
  { name: 'USA-326 (KH-11)', type: 'reconnaissance', country: 'US', inclination: 97.4, altitude: 260, period: 90 },
  { name: 'Cosmos 2558', type: 'reconnaissance', country: 'RU', inclination: 97.3, altitude: 440, period: 93 },
  { name: 'Yaogan-39', type: 'reconnaissance', country: 'CN', inclination: 35, altitude: 600, period: 97 },
  { name: 'Lacrosse-5', type: 'reconnaissance', country: 'US', inclination: 57, altitude: 720, period: 99 },
  { name: 'USA-314 (NROL-82)', type: 'military', country: 'US', inclination: 63.4, altitude: 1000, period: 105 },
  { name: 'Cosmos 2542', type: 'military', country: 'RU', inclination: 65.4, altitude: 580, period: 96 },
  { name: 'Shijian-21', type: 'military', country: 'CN', inclination: 0.1, altitude: 35786, period: 1436 },
];

const TYPE_COLORS: Record<string, string> = {
  station: '#22c55e',
  military: '#ef4444',
  communication: '#3b82f6',
  reconnaissance: '#f59e0b',
};

export class SatelliteLayer implements MapDataLayer {
  readonly id = 'satellites';
  readonly name = 'Satellites';
  readonly category = 'intelligence' as const;
  readonly icon = '🛰';
  readonly description = 'Notable military and intelligence satellites';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private popup: maplibregl.Popup | null = null;
  private animFrame: number | null = null;

  init(map: MaplibreMap): void {
    this.map = map;
  }
  enable(): void {
    this.enabled = true;
    this.renderLayer();
    this.startAnimation();
  }
  disable(): void {
    this.enabled = false;
    this.stopAnimation();
    this.removeLayer();
  }
  async refresh(): Promise<void> {
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: SATELLITES } }));
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
    return SATELLITES.length;
  }

  private computePositions(): GeoJSON.FeatureCollection {
    const now = Date.now();
    return {
      type: 'FeatureCollection',
      features: SATELLITES.map((sat) => {
        // Simplified circular orbit model
        const angularRate = 360 / (sat.period * 60 * 1000); // degrees per ms
        const elapsed = now;
        const meanAnomaly = (elapsed * angularRate) % 360;
        const raan = (elapsed * angularRate * 0.1) % 360; // simplified RAAN precession

        // Convert orbital elements to lat/lon (simplified)
        const lat = sat.inclination * Math.sin((meanAnomaly * Math.PI) / 180);
        const lon = ((meanAnomaly + raan - 180) % 360) - 180;

        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [lon, lat] },
          properties: {
            name: sat.name,
            type: sat.type,
            country: sat.country,
            altitude: sat.altitude,
            color: TYPE_COLORS[sat.type],
          },
        };
      }),
    };
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    this.map.addSource('satellites', { type: 'geojson', data: this.computePositions() });

    // Orbit trail glow
    this.map.addLayer({
      id: 'satellites-glow',
      type: 'circle',
      source: 'satellites',
      paint: {
        'circle-radius': 12,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.1,
        'circle-blur': 0.8,
      },
    });

    this.map.addLayer({
      id: 'satellites-dot',
      type: 'circle',
      source: 'satellites',
      paint: {
        'circle-radius': 3,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.5)',
        'circle-opacity': 0.9,
      },
    });

    this.map.addLayer({
      id: 'satellites-labels',
      type: 'symbol',
      source: 'satellites',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 9,
        'text-offset': [0, 1.2],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'satellites-dot', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'satellites-dot', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'satellites-dot', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(satellitePopup(p))
        .addTo(this.map);
    });
  }

  private startAnimation(): void {
    const update = () => {
      if (!this.enabled || !this.map) return;
      const source = this.map.getSource('satellites') as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(this.computePositions());
      this.animFrame = requestAnimationFrame(update);
    };
    // Update every 2 seconds for performance
    const tick = () => {
      update();
      if (this.enabled) setTimeout(tick, 2000);
    };
    tick();
  }

  private stopAnimation(): void {
    if (this.animFrame) cancelAnimationFrame(this.animFrame);
    this.animFrame = null;
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['satellites-labels', 'satellites-dot', 'satellites-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('satellites')) this.map.removeSource('satellites');
    this.popup?.remove();
  }
  destroy(): void {
    this.stopAnimation();
    this.removeLayer();
    this.map = null;
  }
}
