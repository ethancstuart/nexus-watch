import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { fetchAircraft, type Aircraft } from '../../services/flights.ts';

export class FlightLayer implements MapDataLayer {
  readonly id = 'flights';
  readonly name = 'Live Aircraft';
  readonly category = 'infrastructure' as const;
  readonly icon = '✈️';
  readonly description = 'Live aircraft positions from OpenSky Network';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: Aircraft[] = [];
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
      this.data = await fetchAircraft();
      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Flight layer refresh error:', err);
    }
  }

  getRefreshInterval(): number {
    return 15_000; // 15 seconds
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

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((a) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
        properties: {
          icao: a.icao,
          callsign: a.callsign,
          country: a.country,
          altitude: a.altitude,
          velocity: a.velocity,
          heading: a.heading,
          verticalRate: a.verticalRate,
        },
      })),
    };

    this.map.addSource('flights', { type: 'geojson', data: geojson });

    // Aircraft icons as small triangles rotated by heading
    this.map.addLayer({
      id: 'flights-icons',
      type: 'circle',
      source: 'flights',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 1.5, 5, 3, 8, 5],
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'altitude'],
          0,
          '#60a5fa',
          5000,
          '#818cf8',
          10000,
          '#c084fc',
          15000,
          '#f472b6',
        ],
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.4, 5, 0.7, 8, 0.9],
        'circle-stroke-width': 0,
      },
    });

    // Callsign labels at higher zoom
    this.map.addLayer({
      id: 'flights-labels',
      type: 'symbol',
      source: 'flights',
      minzoom: 7,
      layout: {
        'text-field': ['get', 'callsign'],
        'text-size': 9,
        'text-offset': [0, 1.2],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': 'rgba(255, 255, 255, 0.5)',
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    });

    // Hover
    this.map.on('mouseenter', 'flights-icons', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', 'flights-icons', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });

    this.map.on('mousemove', 'flights-icons', (e) => {
      if (!this.map || !e.features?.length) return;
      const props = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;

      const alt = Number(props.altitude);
      const vel = Number(props.velocity);
      const altStr = alt > 0 ? `${(alt * 3.281).toFixed(0)}ft` : 'ground';
      const velStr = vel > 0 ? `${(vel * 1.944).toFixed(0)}kts` : '--';

      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 12,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          `<div class="eq-popup-content">
            <div class="eq-popup-mag" style="color:#818cf8">${props.callsign || props.icao}</div>
            <div class="eq-popup-place">${props.country}</div>
            <div class="eq-popup-meta">${altStr} · ${velStr} · HDG ${Number(props.heading).toFixed(0)}°</div>
          </div>`,
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['flights-labels', 'flights-icons']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('flights')) this.map.removeSource('flights');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
