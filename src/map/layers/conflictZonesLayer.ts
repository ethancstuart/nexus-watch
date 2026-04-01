import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';

interface ConflictZone {
  name: string;
  region: string;
  intensity: 'war' | 'high' | 'medium' | 'low';
  lat: number;
  lon: number;
  radius: number; // km approximate
}

const ZONES: ConflictZone[] = [
  { name: 'Ukraine-Russia War', region: 'Eastern Europe', intensity: 'war', lat: 48.5, lon: 36.0, radius: 400 },
  { name: 'Gaza Conflict', region: 'Middle East', intensity: 'war', lat: 31.4, lon: 34.4, radius: 50 },
  { name: 'Sudan Civil War', region: 'East Africa', intensity: 'war', lat: 15.5, lon: 32.5, radius: 500 },
  { name: 'Myanmar Civil War', region: 'Southeast Asia', intensity: 'war', lat: 19.8, lon: 96.1, radius: 400 },
  { name: 'Sahel Insurgency', region: 'West Africa', intensity: 'high', lat: 14.5, lon: 1.0, radius: 800 },
  { name: 'DR Congo - M23', region: 'Central Africa', intensity: 'high', lat: -1.5, lon: 29.0, radius: 200 },
  { name: 'Somalia - Al-Shabaab', region: 'East Africa', intensity: 'high', lat: 2.0, lon: 45.3, radius: 300 },
  { name: 'Syria (remnant)', region: 'Middle East', intensity: 'medium', lat: 35.2, lon: 38.9, radius: 200 },
  { name: 'Yemen - Houthi', region: 'Middle East', intensity: 'high', lat: 15.5, lon: 44.2, radius: 300 },
  {
    name: 'Afghanistan - Taliban/ISIS-K',
    region: 'Central Asia',
    intensity: 'medium',
    lat: 34.5,
    lon: 69.2,
    radius: 300,
  },
  { name: 'Ethiopia - Amhara', region: 'East Africa', intensity: 'medium', lat: 11.6, lon: 37.4, radius: 200 },
  { name: 'Haiti Gang Violence', region: 'Caribbean', intensity: 'medium', lat: 18.5, lon: -72.3, radius: 50 },
  { name: 'Nagorno-Karabakh', region: 'Caucasus', intensity: 'low', lat: 39.8, lon: 46.8, radius: 100 },
  { name: 'Pakistan - Balochistan', region: 'South Asia', intensity: 'medium', lat: 29.0, lon: 66.0, radius: 200 },
  { name: 'Colombia - ELN', region: 'South America', intensity: 'low', lat: 7.1, lon: -73.1, radius: 200 },
];

const INTENSITY_COLORS: Record<string, string> = {
  war: '#dc2626',
  high: '#f97316',
  medium: '#eab308',
  low: '#6b7280',
};

export class ConflictZonesLayer implements MapDataLayer {
  readonly id = 'conflicts';
  readonly name = 'Conflict Zones';
  readonly category = 'conflict' as const;
  readonly icon = '💥';
  readonly description = 'Active armed conflicts and insurgencies';

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
          intensity: z.intensity,
          color: INTENSITY_COLORS[z.intensity],
          radius: z.radius,
        },
      })),
    };

    this.map.addSource('conflicts', { type: 'geojson', data: geojson });

    // Large translucent zone
    this.map.addLayer({
      id: 'conflicts-zone',
      type: 'circle',
      source: 'conflicts',
      paint: {
        'circle-radius': [
          'interpolate',
          ['linear'],
          ['zoom'],
          2,
          ['/', ['get', 'radius'], 40],
          5,
          ['/', ['get', 'radius'], 10],
          8,
          ['/', ['get', 'radius'], 3],
        ],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.08,
        'circle-blur': 0.5,
      },
    });

    // Core dot
    this.map.addLayer({
      id: 'conflicts-core',
      type: 'circle',
      source: 'conflicts',
      paint: {
        'circle-radius': ['match', ['get', 'intensity'], 'war', 8, 'high', 6, 'medium', 5, 4],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.2)',
        'circle-opacity': 0.8,
      },
    });

    // Labels
    this.map.addLayer({
      id: 'conflicts-labels',
      type: 'symbol',
      source: 'conflicts',
      minzoom: 3,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': ['match', ['get', 'intensity'], 'war', 11, 'high', 10, 9],
        'text-offset': [0, 1.5],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'conflicts-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'conflicts-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'conflicts-core', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          `<div class="eq-popup-content"><div class="eq-popup-mag" style="color:${p.color}">${String(p.intensity).toUpperCase()}</div><div class="eq-popup-place">${p.name}</div><div class="eq-popup-meta">${p.region}</div></div>`,
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['conflicts-labels', 'conflicts-core', 'conflicts-zone']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('conflicts')) this.map.removeSource('conflicts');
    this.popup?.remove();
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
