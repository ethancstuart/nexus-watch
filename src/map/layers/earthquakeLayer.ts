import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import type { EarthquakeFeature } from '../../types/index.ts';
import { fetchEarthquakes } from '../../services/earthquakes.ts';
import { earthquakePopup } from '../PopupCard.ts';
import { cacheLayerData, getCachedLayerData } from '../../utils/layerCache.ts';

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
      cacheLayerData(this.id, this.data);
    } catch (err) {
      console.error('Earthquake layer refresh error:', err);
      const cached = getCachedLayerData<EarthquakeFeature[]>(this.id);
      if (cached && cached.length > 0) this.data = cached;
    }
    if (this.enabled && this.data.length > 0) this.renderLayer();
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
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

    this.map.addSource('earthquakes', {
      type: 'geojson',
      data: geojson,
      cluster: true,
      clusterMaxZoom: 8,
      clusterRadius: 50,
    });

    // Cluster circles
    this.map.addLayer({
      id: 'earthquakes-clusters',
      type: 'circle',
      source: 'earthquakes',
      filter: ['has', 'point_count'],
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 24, 30, 32, 50, 40],
        'circle-color': '#ff3c3c',
        'circle-opacity': 0.7,
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,60,60,0.3)',
      },
    });

    // Cluster count labels
    this.map.addLayer({
      id: 'earthquakes-cluster-count',
      type: 'symbol',
      source: 'earthquakes',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': '{point_count_abbreviated}',
        'text-size': 11,
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': '#ffffff' },
    });

    // Outer glow (unclustered only)
    this.map.addLayer({
      id: 'earthquakes-glow',
      type: 'circle',
      source: 'earthquakes',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 2.5, 10, 4, 18, 5, 30, 6, 45, 7, 60, 8, 80],
        'circle-color': [
          'interpolate',
          ['linear'],
          ['get', 'depth'],
          0,
          'rgba(255, 60, 60, 0.15)',
          70,
          'rgba(255, 165, 0, 0.15)',
          300,
          'rgba(60, 120, 255, 0.15)',
        ],
        'circle-blur': 1,
      },
    });

    // Core dot (unclustered only)
    this.map.addLayer({
      id: 'earthquakes-core',
      type: 'circle',
      source: 'earthquakes',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'magnitude'], 2.5, 5, 4, 10, 5, 16, 6, 24, 7, 36, 8, 48],
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
      filter: ['all', ['!', ['has', 'point_count']], ['>=', ['get', 'magnitude'], 4.5]],
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

      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 12,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(earthquakePopup(props))
        .addTo(this.map);
    });

    this.map.on('click', 'earthquakes-core', (e) => {
      if (!e.features?.length) return;
      const url = e.features[0].properties?.url as string;
      if (url) window.open(url, '_blank', 'noopener');
    });

    // Click cluster to zoom in
    this.map.on('click', 'earthquakes-clusters', (e) => {
      if (!this.map || !e.features?.length) return;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.map.flyTo({ center: [coords[0], coords[1]], zoom: this.map.getZoom() + 2, duration: 500 });
    });

    this.map.on('mouseenter', 'earthquakes-clusters', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'earthquakes-clusters', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of [
      'earthquakes-labels',
      'earthquakes-core',
      'earthquakes-glow',
      'earthquakes-cluster-count',
      'earthquakes-clusters',
    ]) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('earthquakes')) this.map.removeSource('earthquakes');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
