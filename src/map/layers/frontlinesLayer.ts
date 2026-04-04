import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface FrontlineZone {
  name: string;
  theater: string;
  control: string;
  color: string;
  fillColor: string;
  coords: [number, number][];
}

interface FrontlineTrace {
  name: string;
  theater: string;
  description: string;
  color: string;
  coords: [number, number][];
}

// Simplified control zones based on publicly available ISW/DeepState maps
const ZONES: FrontlineZone[] = [
  // Ukraine — Russian-occupied territory (approx Feb 2026)
  {
    name: 'Russian-Occupied Ukraine',
    theater: 'Ukraine',
    control: 'Russia',
    color: '#ef4444',
    fillColor: 'rgba(239, 68, 68, 0.12)',
    coords: [
      [36.0, 50.3],
      [38.5, 49.5],
      [39.5, 48.8],
      [39.0, 47.5],
      [38.0, 47.0],
      [37.5, 46.2],
      [36.5, 46.0],
      [35.5, 45.5],
      [35.0, 45.3],
      [33.5, 45.5],
      [33.0, 46.0],
      [33.5, 44.5],
      [36.5, 44.8],
      [40.0, 47.0],
      [40.2, 48.5],
      [39.8, 49.2],
      [38.0, 50.0],
      [36.0, 50.3],
    ],
  },
  // Gaza Strip
  {
    name: 'Gaza Conflict Zone',
    theater: 'Gaza',
    control: 'Contested',
    color: '#ef4444',
    fillColor: 'rgba(239, 68, 68, 0.15)',
    coords: [
      [34.22, 31.59],
      [34.56, 31.59],
      [34.56, 31.22],
      [34.28, 31.22],
      [34.22, 31.35],
      [34.22, 31.59],
    ],
  },
  // Sudan — Khartoum + Darfur
  {
    name: 'Khartoum Combat Zone',
    theater: 'Sudan',
    control: 'Contested (SAF vs RSF)',
    color: '#f97316',
    fillColor: 'rgba(249, 115, 22, 0.12)',
    coords: [
      [32.0, 16.0],
      [33.0, 16.0],
      [33.0, 15.2],
      [32.0, 15.2],
      [32.0, 16.0],
    ],
  },
  {
    name: 'Darfur Conflict Zone',
    theater: 'Sudan',
    control: 'RSF-controlled',
    color: '#f97316',
    fillColor: 'rgba(249, 115, 22, 0.10)',
    coords: [
      [22.0, 15.5],
      [27.0, 15.5],
      [27.0, 10.0],
      [22.0, 10.0],
      [22.0, 15.5],
    ],
  },
  // Myanmar — civil war zones
  {
    name: 'Myanmar Resistance Zones',
    theater: 'Myanmar',
    control: 'Contested (resistance vs junta)',
    color: '#eab308',
    fillColor: 'rgba(234, 179, 8, 0.08)',
    coords: [
      [94.0, 26.0],
      [98.5, 26.0],
      [98.5, 20.0],
      [97.0, 16.0],
      [94.0, 16.0],
      [94.0, 26.0],
    ],
  },
];

// Frontline traces — approximate contact lines
const TRACES: FrontlineTrace[] = [
  {
    name: 'Ukraine-Russia Contact Line',
    theater: 'Ukraine',
    description: 'Approximate frontline from Kharkiv to Zaporizhzhia (~1000km)',
    color: '#ff3333',
    coords: [
      [36.2, 50.3],
      [36.8, 49.8],
      [37.2, 49.3],
      [37.5, 49.0],
      [37.8, 48.7],
      [38.0, 48.4],
      [37.8, 48.0],
      [37.5, 47.7],
      [37.2, 47.4],
      [36.8, 47.1],
      [36.5, 46.8],
      [36.2, 46.5],
      [35.8, 46.2],
      [35.5, 45.8],
      [35.2, 45.5],
      [35.0, 45.3],
    ],
  },
  {
    name: 'Gaza Perimeter',
    theater: 'Gaza',
    description: 'Gaza Strip border and buffer zone',
    color: '#ff3333',
    coords: [
      [34.22, 31.59],
      [34.56, 31.59],
      [34.56, 31.22],
      [34.28, 31.22],
      [34.22, 31.35],
      [34.22, 31.59],
    ],
  },
  {
    name: 'Khartoum Siege Line',
    theater: 'Sudan',
    description: 'RSF encirclement of central Khartoum',
    color: '#f97316',
    coords: [
      [32.4, 15.7],
      [32.7, 15.7],
      [32.7, 15.5],
      [32.4, 15.5],
      [32.4, 15.7],
    ],
  },
];

export class FrontlinesLayer implements MapDataLayer {
  readonly id = 'frontlines';
  readonly name = 'Conflict Frontlines';
  readonly category = 'conflict' as const;
  readonly icon = '⚔';
  readonly description = 'Active conflict zones and frontline traces';

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
    document.dispatchEvent(
      new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: [...ZONES, ...TRACES] } }),
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
    return ZONES.length + TRACES.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    // Zone polygons
    const zoneGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: ZONES.map((z) => ({
        type: 'Feature' as const,
        geometry: { type: 'Polygon' as const, coordinates: [z.coords] },
        properties: { name: z.name, theater: z.theater, control: z.control, color: z.color, fillColor: z.fillColor },
      })),
    };

    this.map.addSource('frontline-zones', { type: 'geojson', data: zoneGeoJson });

    // Zone fill
    this.map.addLayer({
      id: 'frontline-zones-fill',
      type: 'fill',
      source: 'frontline-zones',
      paint: {
        'fill-color': ['get', 'fillColor'],
        'fill-opacity': 1,
      },
    });

    // Zone border
    this.map.addLayer({
      id: 'frontline-zones-border',
      type: 'line',
      source: 'frontline-zones',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 1.5,
        'line-opacity': 0.5,
        'line-dasharray': [1],
      },
    });

    // Zone labels
    this.map.addLayer({
      id: 'frontline-zones-labels',
      type: 'symbol',
      source: 'frontline-zones',
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 10,
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000',
        'text-halo-width': 1,
        'text-opacity': 0.7,
      },
    });

    // Frontline traces
    const traceGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: TRACES.map((t) => ({
        type: 'Feature' as const,
        geometry: { type: 'LineString' as const, coordinates: t.coords },
        properties: { name: t.name, theater: t.theater, description: t.description, color: t.color },
      })),
    };

    this.map.addSource('frontline-traces', { type: 'geojson', data: traceGeoJson });

    // Trace glow
    this.map.addLayer({
      id: 'frontline-traces-glow',
      type: 'line',
      source: 'frontline-traces',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 6,
        'line-opacity': 0.15,
        'line-blur': 3,
      },
    });

    // Trace line
    this.map.addLayer({
      id: 'frontline-traces-line',
      type: 'line',
      source: 'frontline-traces',
      paint: {
        'line-color': ['get', 'color'],
        'line-width': 2,
        'line-opacity': 0.8,
      },
    });

    // Hover on zones
    this.map.on('mouseenter', 'frontline-zones-fill', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'frontline-zones-fill', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('click', 'frontline-zones-fill', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: true, className: 'eq-popup', offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(
          renderPopupCard({
            type: 'CONFLICT ZONE',
            typeColor: String(p.color),
            title: String(p.name),
            fields: [
              { label: 'Theater', value: String(p.theater) },
              { label: 'Control', value: String(p.control) },
            ],
          }),
        )
        .addTo(this.map);
    });

    // Hover on traces
    this.map.on('mouseenter', 'frontline-traces-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'frontline-traces-line', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'frontline-traces-line', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat(e.lngLat)
        .setHTML(
          renderPopupCard({
            type: 'FRONTLINE',
            typeColor: String(p.color),
            title: String(p.name),
            fields: [{ label: 'Details', value: String(p.description) }],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of [
      'frontline-zones-labels',
      'frontline-zones-border',
      'frontline-zones-fill',
      'frontline-traces-line',
      'frontline-traces-glow',
    ]) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('frontline-zones')) this.map.removeSource('frontline-zones');
    if (this.map.getSource('frontline-traces')) this.map.removeSource('frontline-traces');
    this.popup?.remove();
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
