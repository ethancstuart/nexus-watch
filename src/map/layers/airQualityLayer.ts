import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface AqiReading {
  name: string;
  country: string;
  lat: number;
  lon: number;
  aqi: number;
  pm25: number;
  pm10: number;
}

function aqiColor(aqi: number): string {
  if (aqi <= 50) return '#00ff00'; // Good
  if (aqi <= 100) return '#eab308'; // Moderate
  if (aqi <= 150) return '#f97316'; // Unhealthy for sensitive
  if (aqi <= 200) return '#ef4444'; // Unhealthy
  if (aqi <= 300) return '#8b5cf6'; // Very unhealthy
  return '#7f1d1d'; // Hazardous
}

function aqiLabel(aqi: number): string {
  if (aqi <= 50) return 'GOOD';
  if (aqi <= 100) return 'MODERATE';
  if (aqi <= 150) return 'SENSITIVE';
  if (aqi <= 200) return 'UNHEALTHY';
  if (aqi <= 300) return 'VERY UNHEALTHY';
  return 'HAZARDOUS';
}

export class AirQualityLayer implements MapDataLayer {
  readonly id = 'air-quality';
  readonly name = 'Air Quality (AQI)';
  readonly category = 'weather' as const;
  readonly icon = '💨';
  readonly description = 'US AQI and PM2.5 levels for 30 major cities';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: AqiReading[] = [];
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
      const res = await fetchWithRetry('/api/air-quality');
      if (!res.ok) throw new Error('AQI API error');
      const result = (await res.json()) as { readings: AqiReading[] };
      this.data = result.readings;
      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('AQI layer error:', err);
    }
  }

  getRefreshInterval(): number {
    return 1800_000;
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
      features: this.data.map((r) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [r.lon, r.lat] },
        properties: {
          name: r.name,
          country: r.country,
          aqi: r.aqi,
          pm25: r.pm25,
          pm10: r.pm10,
          color: aqiColor(r.aqi),
          label: aqiLabel(r.aqi),
        },
      })),
    };

    this.map.addSource('air-quality', { type: 'geojson', data: geojson });

    // AQI glow
    this.map.addLayer({
      id: 'aqi-glow',
      type: 'circle',
      source: 'air-quality',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'aqi'], 0, 8, 100, 14, 200, 22, 300, 30],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.1,
        'circle-blur': 0.6,
      },
    });

    this.map.addLayer({
      id: 'aqi-markers',
      type: 'circle',
      source: 'air-quality',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'aqi'], 0, 4, 100, 6, 200, 9, 300, 12],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.85,
      },
    });

    // AQI value labels
    this.map.addLayer({
      id: 'aqi-labels',
      type: 'symbol',
      source: 'air-quality',
      minzoom: 3,
      layout: {
        'text-field': ['to-string', ['get', 'aqi']],
        'text-size': 9,
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000',
        'text-halo-width': 1,
      },
    });

    this.map.on('mouseenter', 'aqi-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'aqi-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'aqi-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `AQI ${p.aqi} · ${p.label}`,
            typeColor: String(p.color),
            title: `${p.name}, ${p.country}`,
            fields: [
              { label: 'PM2.5', value: `${Number(p.pm25).toFixed(1)} µg/m³` },
              { label: 'PM10', value: `${Number(p.pm10).toFixed(1)} µg/m³` },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['aqi-labels', 'aqi-markers', 'aqi-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('air-quality')) this.map.removeSource('air-quality');
    this.popup?.remove();
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
