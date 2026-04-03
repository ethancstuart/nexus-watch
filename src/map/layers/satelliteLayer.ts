import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface SatelliteOrbit {
  name: string;
  type: string;
  country: string;
  inclination: number; // degrees
  altitude: number; // km
  period: number; // minutes
  raan0: number; // initial right ascension of ascending node
  phase0: number; // initial phase offset
}

const SATELLITES: SatelliteOrbit[] = [
  {
    name: 'ISS (ZARYA)',
    type: 'station',
    country: 'Intl',
    inclination: 51.6,
    altitude: 420,
    period: 93,
    raan0: 208,
    phase0: 35,
  },
  {
    name: 'TIANGONG',
    type: 'station',
    country: 'CN',
    inclination: 41.5,
    altitude: 390,
    period: 92,
    raan0: 60,
    phase0: 280,
  },
  {
    name: 'STARLINK-1007',
    type: 'communication',
    country: 'US',
    inclination: 53.0,
    altitude: 550,
    period: 96,
    raan0: 120,
    phase0: 90,
  },
  {
    name: 'COSMOS 2558',
    type: 'reconnaissance',
    country: 'RU',
    inclination: 97.3,
    altitude: 440,
    period: 93,
    raan0: 45,
    phase0: 200,
  },
  {
    name: 'USA-326 (KH-11)',
    type: 'reconnaissance',
    country: 'US',
    inclination: 97.4,
    altitude: 260,
    period: 90,
    raan0: 80,
    phase0: 150,
  },
  {
    name: 'YAOGAN-39',
    type: 'reconnaissance',
    country: 'CN',
    inclination: 35.0,
    altitude: 600,
    period: 97,
    raan0: 200,
    phase0: 100,
  },
  {
    name: 'GPS IIF-12',
    type: 'navigation',
    country: 'US',
    inclination: 55.0,
    altitude: 20200,
    period: 718,
    raan0: 150,
    phase0: 50,
  },
  {
    name: 'GLONASS-M 751',
    type: 'navigation',
    country: 'RU',
    inclination: 64.8,
    altitude: 19130,
    period: 676,
    raan0: 90,
    phase0: 270,
  },
];

const TYPE_COLORS: Record<string, string> = {
  station: '#22c55e',
  communication: '#3b82f6',
  reconnaissance: '#f59e0b',
  navigation: '#8b5cf6',
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
  private tickTimer: ReturnType<typeof setTimeout> | null = null;

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
    const toRad = Math.PI / 180;

    return {
      type: 'FeatureCollection',
      features: SATELLITES.map((sat) => {
        // Simplified Keplerian orbit model
        const angularRate = 360 / (sat.period * 60 * 1000); // deg/ms
        const meanAnomaly = ((now * angularRate + sat.phase0) % 360) * toRad;

        // Earth rotation: ~360 deg / 86164s (sidereal day)
        const earthRotation = ((now / 86164000) * 360) % 360;

        // RAAN precession (simplified): J2 perturbation
        const raanRate = -1.5 * 0.00108263 * Math.cos(sat.inclination * toRad) * (360 / sat.period); // deg/orbit
        const raan = (sat.raan0 + (now / (sat.period * 60000)) * raanRate - earthRotation) * toRad;

        // Latitude from inclination and mean anomaly
        const lat = Math.asin(Math.sin(sat.inclination * toRad) * Math.sin(meanAnomaly)) / toRad;
        // Longitude from RAAN and position in orbit
        const lon =
          ((Math.atan2(Math.cos(sat.inclination * toRad) * Math.sin(meanAnomaly), Math.cos(meanAnomaly)) / toRad +
            raan / toRad +
            180) %
            360) -
          180;

        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [lon, lat] },
          properties: {
            name: sat.name,
            type: sat.type,
            country: sat.country,
            altitude: sat.altitude,
            color: TYPE_COLORS[sat.type] || '#6b7280',
          },
        };
      }),
    };
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    this.map.addSource('satellites', { type: 'geojson', data: this.computePositions() });

    this.map.addLayer({
      id: 'satellites-glow',
      type: 'circle',
      source: 'satellites',
      paint: { 'circle-radius': 12, 'circle-color': ['get', 'color'], 'circle-opacity': 0.15, 'circle-blur': 0.8 },
    });
    this.map.addLayer({
      id: 'satellites-dot',
      type: 'circle',
      source: 'satellites',
      paint: {
        'circle-radius': 4,
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
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 10,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: String(p.type).toUpperCase(),
            typeColor: String(p.color),
            title: String(p.name),
            fields: [
              { label: 'Country', value: String(p.country) },
              { label: 'Altitude', value: `${p.altitude} km` },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private startAnimation(): void {
    const tick = () => {
      if (!this.enabled || !this.map) return;
      const source = this.map.getSource('satellites') as maplibregl.GeoJSONSource | undefined;
      if (source) source.setData(this.computePositions());
      this.tickTimer = setTimeout(tick, 3000);
    };
    tick();
  }

  private stopAnimation(): void {
    if (this.tickTimer) clearTimeout(this.tickTimer);
    this.tickTimer = null;
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
