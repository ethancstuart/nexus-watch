import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface Chokepoint {
  name: string;
  lat: number;
  lon: number;
  radiusKm: number;
  description: string;
}

const CHOKEPOINTS: Chokepoint[] = [
  { name: 'Strait of Hormuz', lat: 26.57, lon: 56.25, radiusKm: 150, description: '21% of global oil transit' },
  { name: 'Suez Canal', lat: 30.46, lon: 32.35, radiusKm: 100, description: '12% of global trade' },
  { name: 'Panama Canal', lat: 9.08, lon: -79.68, radiusKm: 80, description: '5% of global trade' },
  { name: 'Strait of Malacca', lat: 2.5, lon: 101.8, radiusKm: 200, description: '25% of global trade' },
  { name: 'Bab el-Mandeb', lat: 12.58, lon: 43.33, radiusKm: 120, description: '9% of global oil, Houthi threat zone' },
  { name: 'Turkish Straits', lat: 41.12, lon: 29.05, radiusKm: 80, description: 'Black Sea access, grain corridor' },
];

type Status = 'green' | 'yellow' | 'red';

const STATUS_COLORS: Record<Status, string> = {
  green: '#00ff00',
  yellow: '#eab308',
  red: '#ef4444',
};

const STATUS_LABELS: Record<Status, string> = {
  green: 'NORMAL',
  yellow: 'ELEVATED',
  red: 'DISRUPTED',
};

export class ChokepointStatusLayer implements MapDataLayer {
  readonly id = 'chokepoints';
  readonly name = 'Chokepoint Status';
  readonly category = 'infrastructure' as const;
  readonly icon = '🚢';
  readonly description = 'Maritime chokepoint threat assessment (curated 2026-04)';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private popup: maplibregl.Popup | null = null;
  private statuses: Map<string, Status> = new Map();

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
    this.computeStatuses();
    if (this.enabled) this.renderLayer();
    document.dispatchEvent(
      new CustomEvent('dashview:layer-data', {
        detail: {
          layerId: this.id,
          data: CHOKEPOINTS.map((c) => ({ ...c, status: this.statuses.get(c.name) || 'green' })),
        },
      }),
    );
  }

  getRefreshInterval(): number {
    return 300_000; // 5 min
  }
  isEnabled(): boolean {
    return this.enabled;
  }
  getLastUpdated(): number | null {
    return Date.now();
  }
  getFeatureCount(): number {
    return CHOKEPOINTS.length;
  }

  private computeStatuses(): void {
    // Listen for existing layer data to compute threat levels
    // For now, use known geopolitical context for initial status
    // Bab el-Mandeb: RED (Houthi attacks on shipping)
    // Strait of Hormuz: YELLOW (Iran tensions)
    // Others: GREEN (normal operations)
    this.statuses.set('Bab el-Mandeb', 'red');
    this.statuses.set('Strait of Hormuz', 'yellow');
    this.statuses.set('Suez Canal', 'yellow');
    this.statuses.set('Panama Canal', 'green');
    this.statuses.set('Strait of Malacca', 'green');
    this.statuses.set('Turkish Straits', 'yellow');
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();
    this.computeStatuses();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: CHOKEPOINTS.map((c) => {
        const status = this.statuses.get(c.name) || 'green';
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
          properties: {
            name: c.name,
            description: c.description,
            status,
            color: STATUS_COLORS[status],
            label: STATUS_LABELS[status],
            radius: c.radiusKm,
          },
        };
      }),
    };

    this.map.addSource('chokepoints', { type: 'geojson', data: geojson });

    // Threat zone ring
    this.map.addLayer({
      id: 'chokepoints-zone',
      type: 'circle',
      source: 'chokepoints',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 12, 5, 24, 8, 40],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.08,
        'circle-blur': 0.4,
      },
    });

    // Status ring border
    this.map.addLayer({
      id: 'chokepoints-ring',
      type: 'circle',
      source: 'chokepoints',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 2, 12, 5, 24, 8, 40],
        'circle-color': 'transparent',
        'circle-stroke-width': 2,
        'circle-stroke-color': ['get', 'color'],
        'circle-stroke-opacity': 0.4,
      },
    });

    // Center dot
    this.map.addLayer({
      id: 'chokepoints-dot',
      type: 'circle',
      source: 'chokepoints',
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
      id: 'chokepoints-labels',
      type: 'symbol',
      source: 'chokepoints',
      layout: {
        'text-field': ['concat', ['get', 'name'], '\n', ['get', 'label']],
        'text-size': 10,
        'text-offset': [0, 2],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000',
        'text-halo-width': 1,
      },
    });

    // Hover
    this.map.on('mouseenter', 'chokepoints-dot', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'chokepoints-dot', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'chokepoints-dot', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `CHOKEPOINT · ${p.label}`,
            typeColor: String(p.color),
            title: String(p.name),
            fields: [{ label: 'Importance', value: String(p.description) }],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['chokepoints-labels', 'chokepoints-dot', 'chokepoints-ring', 'chokepoints-zone']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('chokepoints')) this.map.removeSource('chokepoints');
    this.popup?.remove();
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
