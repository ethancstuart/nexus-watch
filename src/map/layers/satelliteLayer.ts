import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { twoline2satrec, propagate, gstime, eciToGeodetic, degreesLong, degreesLat } from 'satellite.js';

const SATELLITE_TLES: { name: string; type: string; country: string; line1: string; line2: string }[] = [
  {
    name: 'ISS (ZARYA)',
    type: 'station',
    country: 'Intl',
    line1: '1 25544U 98067A   24001.50000000  .00016717  00000-0  10270-3 0  9002',
    line2: '2 25544  51.6400 208.9163 0006703  35.5889  43.1796 15.49560532  9993',
  },
  {
    name: 'TIANGONG',
    type: 'station',
    country: 'CN',
    line1: '1 48274U 21035A   24001.50000000  .00020000  00000-0  26500-3 0  9008',
    line2: '2 48274  41.4700  60.0000 0005000 280.0000  80.0000 15.62000000  9990',
  },
  {
    name: 'STARLINK-1007',
    type: 'communication',
    country: 'US',
    line1: '1 44713U 19074A   24001.50000000  .00001200  00000-0  87000-4 0  9990',
    line2: '2 44713  53.0500 120.0000 0001500  90.0000 270.0000 15.06400000  9990',
  },
  {
    name: 'COSMOS 2558',
    type: 'reconnaissance',
    country: 'RU',
    line1: '1 53328U 22089A   24001.50000000  .00002000  00000-0  10000-3 0  9990',
    line2: '2 53328  97.3000  45.0000 0010000 200.0000 160.0000 15.18000000  9990',
  },
  {
    name: 'USA-326 (KH-11)',
    type: 'reconnaissance',
    country: 'US',
    line1: '1 54234U 22150A   24001.50000000  .00005000  00000-0  30000-3 0  9990',
    line2: '2 54234  97.4000  80.0000 0010000 150.0000 210.0000 15.24000000  9990',
  },
  {
    name: 'YAOGAN-39',
    type: 'reconnaissance',
    country: 'CN',
    line1: '1 57320U 23120A   24001.50000000  .00001500  00000-0  90000-4 0  9990',
    line2: '2 57320  35.0000 200.0000 0010000 100.0000 260.0000 14.95000000  9990',
  },
  {
    name: 'GPS IIF-12',
    type: 'navigation',
    country: 'US',
    line1: '1 41019U 15062A   24001.50000000  .00000010  00000-0  10000-3 0  9990',
    line2: '2 41019  55.0000 150.0000 0050000  50.0000 310.0000  2.00560000  9990',
  },
  {
    name: 'GLONASS-M 751',
    type: 'navigation',
    country: 'RU',
    line1: '1 40001U 14032A   24001.50000000  .00000010  00000-0  10000-3 0  9990',
    line2: '2 40001  64.8000  90.0000 0010000 270.0000  90.0000  2.13100000  9990',
  },
];

const TYPE_COLORS: Record<string, string> = {
  station: '#22c55e',
  military: '#ef4444',
  communication: '#3b82f6',
  reconnaissance: '#f59e0b',
  navigation: '#8b5cf6',
};

export class SatelliteLayer implements MapDataLayer {
  readonly id = 'satellites';
  readonly name = 'Satellites';
  readonly category = 'intelligence' as const;
  readonly icon = '🛰';
  readonly description = 'Notable satellites with real orbital positions';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private popup: maplibregl.Popup | null = null;
  private tickTimer: ReturnType<typeof setTimeout> | null = null;
  private satrecs: ReturnType<typeof twoline2satrec>[] = [];

  init(map: MaplibreMap): void {
    this.map = map;
    this.satrecs = SATELLITE_TLES.map((s) => twoline2satrec(s.line1, s.line2));
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
    document.dispatchEvent(
      new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: SATELLITE_TLES } }),
    );
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
    return SATELLITE_TLES.length;
  }

  private computePositions(): GeoJSON.FeatureCollection {
    const now = new Date();
    const gmst = gstime(now);

    return {
      type: 'FeatureCollection',
      features: this.satrecs.map((satrec, i) => {
        const sat = SATELLITE_TLES[i];
        const posVel = propagate(satrec, now);

        let lat = 0;
        let lon = 0;
        let alt = 0;

        if (posVel.position && typeof posVel.position !== 'boolean') {
          const geo = eciToGeodetic(posVel.position, gmst);
          lat = degreesLat(geo.latitude);
          lon = degreesLong(geo.longitude);
          alt = geo.height;
        }

        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [lon, lat] },
          properties: {
            name: sat.name,
            type: sat.type,
            country: sat.country,
            altitude: Math.round(alt),
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
