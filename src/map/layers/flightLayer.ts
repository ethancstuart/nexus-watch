import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { fetchAircraft, type Aircraft } from '../../services/flights.ts';
import { flightPopup } from '../PopupCard.ts';

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
      if (this.enabled) {
        // Update source data in place for smooth transitions instead of full re-render
        if (this.map?.getSource('flights')) {
          const source = this.map.getSource('flights') as maplibregl.GeoJSONSource;
          source.setData(this.buildGeoJson());
        } else {
          this.renderLayer();
        }
      }
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

  private buildGeoJson(): GeoJSON.FeatureCollection {
    return {
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
          military: 'military' in a ? !!(a as unknown as { military: boolean }).military : false,
        },
      })),
    };
  }

  private renderLayer(): void {
    if (!this.map || this.data.length === 0) return;
    this.removeLayer();

    const geojson = this.buildGeoJson();

    this.map.addSource('flights', { type: 'geojson', data: geojson });

    // Civilian aircraft
    this.map.addLayer({
      id: 'flights-civilian',
      type: 'circle',
      source: 'flights',
      filter: ['!=', ['get', 'military'], true],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 1.5, 5, 3, 8, 4],
        'circle-color': '#818cf8',
        'circle-opacity': ['interpolate', ['linear'], ['zoom'], 2, 0.3, 5, 0.5, 8, 0.7],
        'circle-stroke-width': 0,
      },
    });

    // Military aircraft — larger, red, with glow
    this.map.addLayer({
      id: 'flights-military-glow',
      type: 'circle',
      source: 'flights',
      filter: ['==', ['get', 'military'], true],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 6, 5, 10, 8, 14],
        'circle-color': '#ef4444',
        'circle-opacity': 0.12,
        'circle-blur': 0.6,
      },
    });
    this.map.addLayer({
      id: 'flights-military',
      type: 'circle',
      source: 'flights',
      filter: ['==', ['get', 'military'], true],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 3, 5, 5, 8, 7],
        'circle-color': '#ef4444',
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
        'circle-opacity': 0.9,
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
    this.map.on('mouseenter', 'flights-civilian', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', 'flights-civilian', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });

    this.map.on('mousemove', 'flights-civilian', (e) => {
      if (!this.map || !e.features?.length) return;
      const props = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;

      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 12,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(flightPopup(props))
        .addTo(this.map);
    });

    // Military hover (same popup, different source layer)
    this.map.on('mouseenter', 'flights-military', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'flights-military', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'flights-military', (e) => {
      if (!this.map || !e.features?.length) return;
      const props = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 12,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(flightPopup(props))
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['flights-labels', 'flights-civilian', 'flights-military', 'flights-military-glow']) {
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
