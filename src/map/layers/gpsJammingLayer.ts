import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';

interface JammingZone {
  name: string;
  region: string;
  severity: 'high' | 'medium' | 'low';
  lat: number;
  lon: number;
  radiusKm: number;
}

// Known GPS/GNSS jamming and spoofing hotspots (public reporting from GPSJam.org, OPSGROUP, etc.)
const ZONES: JammingZone[] = [
  { name: 'Eastern Mediterranean', region: 'Middle East', severity: 'high', lat: 34.5, lon: 34, radiusKm: 400 },
  { name: 'Black Sea', region: 'Eastern Europe', severity: 'high', lat: 43, lon: 35, radiusKm: 300 },
  { name: 'Baltic Sea (Kaliningrad)', region: 'Northern Europe', severity: 'high', lat: 55, lon: 20, radiusKm: 350 },
  { name: 'Northern Finland/Norway', region: 'Arctic', severity: 'medium', lat: 69, lon: 28, radiusKm: 200 },
  { name: 'Iraq/Syria Border', region: 'Middle East', severity: 'high', lat: 35, lon: 42, radiusKm: 300 },
  { name: 'Iran (Western)', region: 'Middle East', severity: 'medium', lat: 34, lon: 48, radiusKm: 200 },
  { name: 'Red Sea (Houthi)', region: 'Middle East', severity: 'high', lat: 15, lon: 42, radiusKm: 250 },
  { name: 'Ukraine Frontline', region: 'Eastern Europe', severity: 'high', lat: 48.5, lon: 37, radiusKm: 400 },
  { name: 'South China Sea', region: 'Asia-Pacific', severity: 'medium', lat: 10, lon: 114, radiusKm: 300 },
  { name: 'North Korea Border', region: 'East Asia', severity: 'medium', lat: 38, lon: 127, radiusKm: 150 },
  { name: 'Strait of Hormuz', region: 'Persian Gulf', severity: 'medium', lat: 26.5, lon: 56, radiusKm: 150 },
];

const SEVERITY_COLORS: Record<string, string> = {
  high: '#ef4444',
  medium: '#f97316',
  low: '#eab308',
};

export class GpsJammingLayer implements MapDataLayer {
  readonly id = 'gps-jamming';
  readonly name = 'GPS Jamming';
  readonly category = 'intelligence' as const;
  readonly icon = '📡';
  readonly description = 'Known GPS/GNSS jamming and spoofing zones';

  private map: MaplibreMap | null = null;
  private enabled = false;
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
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: ZONES } }));
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
    return ZONES.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: ZONES.map((z) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [z.lon, z.lat] },
        properties: {
          name: z.name,
          region: z.region,
          severity: z.severity,
          color: SEVERITY_COLORS[z.severity],
          radius: z.radiusKm,
        },
      })),
    };

    this.map.addSource('gps-jamming', { type: 'geojson', data: geojson });

    // Large jamming zone overlay
    this.map.addLayer({
      id: 'gps-jamming-zone',
      type: 'circle',
      source: 'gps-jamming',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2,
          ['/', ['get', 'radius'], 30],
          5,
          ['/', ['get', 'radius'], 8],
          8,
          ['/', ['get', 'radius'], 2],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.06,
        'circle-blur': 0.6,
      },
    });

    // Hatching effect — dashed ring
    this.map.addLayer({
      id: 'gps-jamming-ring',
      type: 'circle',
      source: 'gps-jamming',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2,
          ['/', ['get', 'radius'], 30],
          5,
          ['/', ['get', 'radius'], 8],
          8,
          ['/', ['get', 'radius'], 2],
        ],
        'circle-color': 'transparent',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-opacity': 0.25,
      },
    });

    // Center marker
    this.map.addLayer({
      id: 'gps-jamming-center',
      type: 'circle',
      source: 'gps-jamming',
      paint: {
        'circle-radius': 4,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.9,
      },
    });

    // Labels
    this.map.addLayer({
      id: 'gps-jamming-labels',
      type: 'symbol',
      source: 'gps-jamming',
      minzoom: 3,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 9,
        'text-offset': [0, 1.5],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'gps-jamming-center', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'gps-jamming-center', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'gps-jamming-center', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          `<div class="eq-popup-content"><div class="eq-popup-mag" style="color:${p.color}">GPS JAMMING · ${String(p.severity).toUpperCase()}</div><div class="eq-popup-place">${p.name}</div><div class="eq-popup-meta">${p.region} · ~${p.radius}km radius</div></div>`,
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['gps-jamming-labels', 'gps-jamming-center', 'gps-jamming-ring', 'gps-jamming-zone']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('gps-jamming')) this.map.removeSource('gps-jamming');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
