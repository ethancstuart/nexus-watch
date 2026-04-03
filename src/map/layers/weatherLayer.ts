import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { weatherPopup } from '../PopupCard.ts';
import type { WeatherAlert } from '../../types/index.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';

export class WeatherAlertLayer implements MapDataLayer {
  readonly id = 'weather-alerts';
  readonly name = 'Weather Alerts';
  readonly category = 'weather' as const;
  readonly icon = '⚠️';
  readonly description = 'Extreme weather conditions from Open-Meteo';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: WeatherAlert[] = [];
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
      const res = await fetchWithRetry('/api/weather-alerts');
      if (!res.ok) throw new Error('Weather alerts API error');
      const data = (await res.json()) as { alerts: WeatherAlert[] };
      this.data = data.alerts;
      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Weather alert layer refresh error:', err);
    }
  }

  getRefreshInterval(): number {
    return 1_800_000; // 30 minutes
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

    const severityColors: Record<string, string> = {
      extreme: '#dc2626',
      severe: '#f97316',
      moderate: '#eab308',
    };

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((a) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
        properties: {
          type: a.type,
          severity: a.severity,
          city: a.city,
          country: a.country,
          description: a.description,
          value: a.value,
          unit: a.unit,
          color: severityColors[a.severity] || '#eab308',
        },
      })),
    };

    this.map.addSource('weather-alerts', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'weather-alerts-ring',
      type: 'circle',
      source: 'weather-alerts',
      paint: {
        'circle-radius': 20,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.12,
        'circle-blur': 0.6,
      },
    });

    this.map.addLayer({
      id: 'weather-alerts-core',
      type: 'circle',
      source: 'weather-alerts',
      paint: {
        'circle-radius': 6,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
        'circle-opacity': 0.9,
      },
    });

    this.map.addLayer({
      id: 'weather-alerts-labels',
      type: 'symbol',
      source: 'weather-alerts',
      layout: {
        'text-field': ['get', 'city'],
        'text-size': 10,
        'text-offset': [0, 1.5],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    });

    this.map.on('mouseenter', 'weather-alerts-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', 'weather-alerts-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });

    this.map.on('mousemove', 'weather-alerts-core', (e) => {
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
        .setHTML(weatherPopup(props))
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['weather-alerts-labels', 'weather-alerts-core', 'weather-alerts-ring']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('weather-alerts')) this.map.removeSource('weather-alerts');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
