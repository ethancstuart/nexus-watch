import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import type { WeatherAlert } from '../../types/index.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';

// Major world cities to check for extreme weather
const MONITOR_POINTS = [
  { lat: 40.7, lon: -74.0, city: 'New York', country: 'US' },
  { lat: 51.5, lon: -0.1, city: 'London', country: 'GB' },
  { lat: 35.7, lon: 139.7, city: 'Tokyo', country: 'JP' },
  { lat: 48.9, lon: 2.3, city: 'Paris', country: 'FR' },
  { lat: 55.8, lon: 37.6, city: 'Moscow', country: 'RU' },
  { lat: 28.6, lon: 77.2, city: 'New Delhi', country: 'IN' },
  { lat: -23.5, lon: -46.6, city: 'São Paulo', country: 'BR' },
  { lat: 31.2, lon: 121.5, city: 'Shanghai', country: 'CN' },
  { lat: -33.9, lon: 18.4, city: 'Cape Town', country: 'ZA' },
  { lat: 30.0, lon: 31.2, city: 'Cairo', country: 'EG' },
  { lat: 19.4, lon: -99.1, city: 'Mexico City', country: 'MX' },
  { lat: -33.9, lon: 151.2, city: 'Sydney', country: 'AU' },
  { lat: 37.6, lon: 127.0, city: 'Seoul', country: 'KR' },
  { lat: 1.3, lon: 103.8, city: 'Singapore', country: 'SG' },
  { lat: 25.3, lon: 55.3, city: 'Dubai', country: 'AE' },
  { lat: 41.0, lon: 29.0, city: 'Istanbul', country: 'TR' },
  { lat: 6.5, lon: 3.4, city: 'Lagos', country: 'NG' },
  { lat: -1.3, lon: 36.8, city: 'Nairobi', country: 'KE' },
  { lat: 13.8, lon: 100.5, city: 'Bangkok', country: 'TH' },
  { lat: 52.5, lon: 13.4, city: 'Berlin', country: 'DE' },
];

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
      this.data = await fetchWeatherAlerts();
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

    // Pulsing warning ring
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

    // Core marker
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

    // Labels
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

    // Hover
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
        .setHTML(
          `<div class="eq-popup-content">
            <div class="eq-popup-mag" style="color:${props.color}">${String(props.severity).toUpperCase()}</div>
            <div class="eq-popup-place">${props.description}</div>
            <div class="eq-popup-meta">${props.city}, ${props.country}</div>
          </div>`,
        )
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

async function fetchWeatherAlerts(): Promise<WeatherAlert[]> {
  // Batch fetch current weather for all monitor points using Open-Meteo (no key needed)
  const latitudes = MONITOR_POINTS.map((p) => p.lat).join(',');
  const longitudes = MONITOR_POINTS.map((p) => p.lon).join(',');

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitudes}&longitude=${longitudes}&current=temperature_2m,wind_speed_10m,rain,snowfall,weather_code&temperature_unit=celsius&wind_speed_unit=kmh`;

  const res = await fetchWithRetry(url);
  if (!res.ok) throw new Error('Open-Meteo API error');

  const data = (await res.json()) as
    | {
        current: {
          temperature_2m: number;
          wind_speed_10m: number;
          rain: number;
          snowfall: number;
          weather_code: number;
        };
      }[]
    | {
        current: {
          temperature_2m: number;
          wind_speed_10m: number;
          rain: number;
          snowfall: number;
          weather_code: number;
        };
      };

  const results = Array.isArray(data) ? data : [data];
  const alerts: WeatherAlert[] = [];

  for (let i = 0; i < results.length && i < MONITOR_POINTS.length; i++) {
    const point = MONITOR_POINTS[i];
    const current = results[i].current;
    if (!current) continue;

    const temp = current.temperature_2m;
    const wind = current.wind_speed_10m;
    const rain = current.rain;
    const snow = current.snowfall;

    // Extreme heat (>40°C / 104°F)
    if (temp > 40) {
      alerts.push({
        ...point,
        type: 'extreme_heat',
        severity: temp > 45 ? 'extreme' : 'severe',
        value: temp,
        unit: '°C',
        description: `Extreme heat: ${temp}°C`,
      });
    }

    // Extreme cold (<-20°C / -4°F)
    if (temp < -20) {
      alerts.push({
        ...point,
        type: 'extreme_cold',
        severity: temp < -35 ? 'extreme' : 'severe',
        value: temp,
        unit: '°C',
        description: `Extreme cold: ${temp}°C`,
      });
    }

    // Heavy rain (>10mm/hr)
    if (rain > 10) {
      alerts.push({
        ...point,
        type: 'heavy_rain',
        severity: rain > 30 ? 'extreme' : rain > 20 ? 'severe' : 'moderate',
        value: rain,
        unit: 'mm/hr',
        description: `Heavy rain: ${rain}mm/hr`,
      });
    }

    // Heavy snow (>5cm/hr)
    if (snow > 5) {
      alerts.push({
        ...point,
        type: 'heavy_snow',
        severity: snow > 15 ? 'extreme' : snow > 10 ? 'severe' : 'moderate',
        value: snow,
        unit: 'cm/hr',
        description: `Heavy snowfall: ${snow}cm/hr`,
      });
    }

    // High wind (>80 km/h / 50 mph)
    if (wind > 80) {
      alerts.push({
        ...point,
        type: 'high_wind',
        severity: wind > 120 ? 'extreme' : wind > 100 ? 'severe' : 'moderate',
        value: wind,
        unit: 'km/h',
        description: `High winds: ${wind}km/h`,
      });
    }
  }

  return alerts;
}
