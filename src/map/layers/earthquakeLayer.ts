import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import type { EarthquakeFeature } from '../../types/index.ts';
import { fetchEarthquakes } from '../../services/earthquakes.ts';

export class EarthquakeLayer implements MapDataLayer {
  readonly id = 'earthquakes';
  readonly name = 'Earthquakes';
  readonly category = 'natural' as const;
  readonly icon = '🔴';
  readonly description = 'Real-time earthquake data from USGS';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: EarthquakeFeature[] = [];
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
      this.data = await fetchEarthquakes('day', 2.5);
      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(
        new CustomEvent('dashview:layer-data', {
          detail: { layerId: this.id, data: this.data },
        }),
      );
    } catch (err) {
      console.error('Earthquake layer refresh error:', err);
    }
  }

  getRefreshInterval(): number {
    return 60_000;
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

  getData(): EarthquakeFeature[] {
    return this.data;
  }

  private renderLayer(): void {
    if (!this.map || this.data.length === 0) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((eq) => ({
        type: 'Feature' as const,
        geometry: {
          type: 'Point' as const,
          coordinates: [eq.lon, eq.lat],
        },
        properties: {
          id: eq.id,
          magnitude: eq.magnitude,
          depth: eq.depth,
          place: eq.place,
          time: eq.time,
          url: eq.url,
          tsunami: eq.tsunami,
        },
      })),
    };

    this.map.addSource('earthquakes', { type: 'geojson', data: geojson });

    // Outer glow
    this.map.addLayer({
      id: 'earthquakes-glow',
      type: 'circle',
      source: 'earthquakes',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 2.5, 6, 4, 12, 5, 20, 6, 32, 7, 48, 8, 64],
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'depth'],
          0, 'rgba(255, 60, 60, 0.15)',
          70, 'rgba(255, 165, 0, 0.15)',
          300, 'rgba(60, 120, 255, 0.15)',
        ],
        'circle-blur': 1,
      },
    });

    // Core dot
    this.map.addLayer({
      id: 'earthquakes-core',
      type: 'circle',
      source: 'earthquakes',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 2.5, 3, 4, 6, 5, 10, 6, 16, 7, 24, 8, 32],
        'circle-color': ['interpolate', ['linear'], ['get', 'depth'], 0, '#ff3c3c', 70, '#ffa500', 300, '#3c78ff'],
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255, 255, 255, 0.3)',
        'circle-opacity': 0.85,
      },
    });

    // Labels for M >= 4.5
    this.map.addLayer({
      id: 'earthquakes-labels',
      type: 'symbol',
      source: 'earthquakes',
      filter: ['>=', ['get', 'magnitude'], 4.5],
      layout: {
        'text-field': ['concat', 'M', ['to-string', ['get', 'magnitude']]],
        'text-size': 11,
        'text-offset': [0, -1.5],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    });

    // Interactivity
    this.map.on('mouseenter', 'earthquakes-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', 'earthquakes-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });

    this.map.on('mousemove', 'earthquakes-core', (e) => {
      if (!this.map || !e.features?.length) return;
      const f = e.features[0];
      const props = f.properties!;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      const timeAgo = this.formatTimeAgo(props.time as number);

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
            <div class="eq-popup-mag">M${props.magnitude}</div>
            <div class="eq-popup-place">${props.place}</div>
            <div class="eq-popup-meta">${timeAgo} · ${Number(props.depth).toFixed(1)}km deep${props.tsunami ? ' · TSUNAMI' : ''}</div>
          </div>`,
        )
        .addTo(this.map);
    });

    this.map.on('click', 'earthquakes-core', (e) => {
      if (!e.features?.length) return;
      const url = e.features[0].properties?.url as string;
      if (url) window.open(url, '_blank', 'noopener');
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['earthquakes-labels', 'earthquakes-core', 'earthquakes-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('earthquakes')) this.map.removeSource('earthquakes');
    this.popup?.remove();
    this.popup = null;
  }

  private formatTimeAgo(ts: number): string {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
