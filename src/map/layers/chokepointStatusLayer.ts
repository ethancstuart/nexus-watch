// maplibre-gl v6 is ESM-only and exports no default; a namespace import is
// the supported shape. v5, which did have a default, carried the CRITICAL
// advisory this restoration exists to avoid.
import * as maplibregl from 'maplibre-gl';
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

/**
 * `unknown` is a FIRST-CLASS state, not a missing one.
 *
 * There is no chokepoint-status feed in this repository. Every reading the
 * layer used to show was hardcoded (see computeStatuses). So the state the
 * layer is actually in, for every chokepoint, is `unknown` — and that has to
 * be representable, or the absence gets rounded to "normal" and the map
 * asserts something nobody measured.
 */
type Status = 'green' | 'yellow' | 'red' | 'unknown';

const STATUS_COLORS: Record<Status, string> = {
  green: '#00ff00',
  yellow: '#eab308',
  red: '#ef4444',
  // registerColors.textTertiary — deliberately NOT a fourth point on the
  // green/amber/red ramp. An unknown reading must not look like a mild one.
  unknown: '#9C958A',
};

const STATUS_LABELS: Record<Status, string> = {
  green: 'NORMAL',
  yellow: 'ELEVATED',
  red: 'DISRUPTED',
  // Says what is true: we have no feed for this. Not "normal", not "unknown
  // risk" — the instrument is absent, and the label names that.
  unknown: 'NO STATUS FEED',
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
          // No status is NOT 'green'. Defaulting an unknown reading to
          // "normal operations" asserts the thing we do not know.
          data: CHOKEPOINTS.map((c) => ({ ...c, status: this.statuses.get(c.name) ?? 'unknown' })),
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

  /**
   * THIS FUNCTION USED TO FABRICATE SIX THREAT LEVELS AND IT IS NOW EMPTY.
   *
   * It was named computeStatuses and it computed nothing. It set Bab el-Mandeb
   * to RED, Hormuz / Suez / the Turkish Straits to YELLOW and the rest to
   * GREEN, from a comment reading "for now, use known geopolitical context" —
   * a frozen judgement written once, rendered on a live map as though an
   * instrument had read it, and never updated again. The "Suez Canal ELEVATED"
   * label on the globe came from here, not from data.
   *
   * It is the same defect as the AIS layer that invented positions for real
   * warships when its key was unset, deleted 2026-09-21. A chokepoint status
   * is a claim about the world; this product does not publish claims it cannot
   * source. There is no chokepoint-status feed in the repository, so there is
   * no status — and the layer now draws the chokepoints as what they provably
   * are, locations, with no threat reading attached.
   *
   * If a real feed lands, set statuses from it here and restore the colour
   * ramp. Until then an absent reading is the honest one.
   */
  private computeStatuses(): void {
    this.statuses.clear();
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();
    this.computeStatuses();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: CHOKEPOINTS.map((c) => {
        const status = this.statuses.get(c.name) ?? 'unknown';
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
