import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';
import * as satellite from 'satellite.js';

interface SatelliteData {
  name: string;
  noradId: number;
  type: string;
  country: string;
  inclination: number;
  eccentricity: number;
  period: number;
  raan: number;
  argPericenter: number;
  meanAnomaly: number;
  meanMotion: number;
  epoch: string;
  altitude: number;
  /** TLE lines for SGP4 propagation (if available from CelesTrak). */
  tle1?: string;
  tle2?: string;
  /** Parsed satellite record for SGP4. Cached after first computation. */
  satrec?: satellite.SatRec;
}

const TYPE_COLORS: Record<string, string> = {
  station: '#00ff00',
  communication: '#3b82f6',
  reconnaissance: '#f59e0b',
  navigation: '#8b5cf6',
};

export class SatelliteLayer implements MapDataLayer {
  readonly id = 'satellites';
  readonly name = 'Satellites';
  readonly category = 'intelligence' as const;
  readonly icon = '🛰';
  readonly description = 'Live satellite positions from CelesTrak orbital data';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: SatelliteData[] = [];
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
    try {
      const res = await fetchWithRetry('/api/satellites');
      const json = await res.json();
      if (json.satellites?.length > 0) {
        this.data = json.satellites;
        this.lastUpdated = Date.now();
      }
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Satellite layer refresh error:', err);
    }
  }

  getRefreshInterval(): number {
    return 7200_000; // 2 hours — matches CelesTrak update cadence
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

  private computePositions(): GeoJSON.FeatureCollection {
    const now = new Date();

    return {
      type: 'FeatureCollection',
      features: this.data
        .map((sat) => {
          let lat: number;
          let lon: number;
          let altKm: number = sat.altitude;

          // Use SGP4 propagation if TLE lines are available (±1km accuracy)
          if (sat.tle1 && sat.tle2) {
            try {
              if (!sat.satrec) {
                sat.satrec = satellite.twoline2satrec(sat.tle1, sat.tle2);
              }
              const posVel = satellite.propagate(sat.satrec, now);
              if (posVel.position && typeof posVel.position !== 'boolean') {
                const gmst = satellite.gstime(now);
                const geo = satellite.eciToGeodetic(posVel.position, gmst);
                lat = satellite.degreesLat(geo.latitude);
                lon = satellite.degreesLong(geo.longitude);
                altKm = geo.height;
              } else {
                // SGP4 propagation failed — skip this satellite
                return null;
              }
            } catch {
              // Invalid TLE or propagation error — skip
              return null;
            }
          } else {
            // Fallback to simplified Keplerian (legacy, ±10km accuracy)
            const toRad = Math.PI / 180;
            const epochMs = new Date(sat.epoch).getTime();
            const elapsedMin = (now.getTime() - epochMs) / 60000;
            const meanMotionDegPerMin = (sat.meanMotion * 360) / 1440;
            const currentMA = ((sat.meanAnomaly + meanMotionDegPerMin * elapsedMin) % 360) * toRad;
            const earthRotation = ((now.getTime() / 86164000) * 360) % 360;
            const raanRate = -1.5 * 0.00108263 * Math.cos(sat.inclination * toRad) * sat.meanMotion;
            const raan = (sat.raan + raanRate * (elapsedMin / 1440) - earthRotation) * toRad;
            const argLat = currentMA + sat.argPericenter * toRad;
            lat = Math.asin(Math.sin(sat.inclination * toRad) * Math.sin(argLat)) / toRad;
            lon =
              ((Math.atan2(Math.cos(sat.inclination * toRad) * Math.sin(argLat), Math.cos(argLat)) / toRad +
                raan / toRad +
                180) %
                360) -
              180;
          }

          return {
            type: 'Feature' as const,
            geometry: { type: 'Point' as const, coordinates: [lon, lat] },
            properties: {
              name: sat.name,
              type: sat.type,
              country: sat.country,
              altitude: Math.round(altKm),
              noradId: sat.noradId,
              color: TYPE_COLORS[sat.type] || '#6b7280',
              propagation: sat.tle1 ? 'SGP4' : 'Keplerian',
            },
          };
        })
        .filter(Boolean) as GeoJSON.Feature[],
    };
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    const positions =
      this.data.length > 0 ? this.computePositions() : { type: 'FeatureCollection' as const, features: [] };
    this.map.addSource('satellites', { type: 'geojson', data: positions });

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
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: String(p.type).toUpperCase(),
            typeColor: String(p.color),
            title: String(p.name),
            fields: [
              { label: 'Country', value: String(p.country) },
              { label: 'Altitude', value: `${p.altitude} km` },
              { label: 'NORAD ID', value: String(p.noradId) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private startAnimation(): void {
    const tick = () => {
      if (!this.enabled || !this.map || this.data.length === 0) return;
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
