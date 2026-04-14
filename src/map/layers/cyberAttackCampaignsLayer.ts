import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { updateProvenance } from '../../services/dataProvenance.ts';

/**
 * Cyber Attack Campaigns Layer
 * Composite: static APT group origin regions, boosted by live internet-outages
 * (each outage in an APT's region increments recent-activity score).
 */

interface AptGroup {
  id: string;
  name: string;
  country: string;
  lat: number;
  lon: number;
  /** Rough detection radius (degrees). */
  radius: number;
  targets: string;
  aka?: string;
}

const APT_GROUPS: AptGroup[] = [
  {
    id: 'apt28',
    name: 'APT28 (Fancy Bear)',
    country: 'Russia',
    lat: 55.76,
    lon: 37.62,
    radius: 8,
    targets: 'Governments, military, media (NATO)',
    aka: 'Sofacy, GRU 26165',
  },
  {
    id: 'apt29',
    name: 'APT29 (Cozy Bear)',
    country: 'Russia',
    lat: 55.76,
    lon: 37.62,
    radius: 8,
    targets: 'Govt, think tanks, healthcare',
    aka: 'SVR, NOBELIUM',
  },
  {
    id: 'sandworm',
    name: 'Sandworm',
    country: 'Russia',
    lat: 55.76,
    lon: 37.62,
    radius: 8,
    targets: 'Ukrainian critical infrastructure',
    aka: 'GRU 74455',
  },
  {
    id: 'lazarus',
    name: 'Lazarus Group',
    country: 'North Korea',
    lat: 39.02,
    lon: 125.75,
    radius: 4,
    targets: 'Crypto exchanges, banks, defense',
    aka: 'Hidden Cobra, APT38',
  },
  {
    id: 'apt40',
    name: 'APT40',
    country: 'China',
    lat: 30.59,
    lon: 114.3,
    radius: 7,
    targets: 'Maritime, research (SE Asia + US)',
    aka: 'Leviathan, MSS Hainan',
  },
  {
    id: 'apt41',
    name: 'APT41',
    country: 'China',
    lat: 22.27,
    lon: 114.16,
    radius: 6,
    targets: 'Healthcare, telecom, hotels',
    aka: 'Winnti, Barium',
  },
  {
    id: 'apt33',
    name: 'APT33',
    country: 'Iran',
    lat: 35.69,
    lon: 51.39,
    radius: 6,
    targets: 'Aviation, energy, petrochemical',
    aka: 'Elfin, Refined Kitten',
  },
  {
    id: 'muddywater',
    name: 'MuddyWater',
    country: 'Iran',
    lat: 35.69,
    lon: 51.39,
    radius: 6,
    targets: 'Telecom, govt (Middle East)',
    aka: 'Static Kitten, Mercury',
  },
];

interface OutageRecord {
  lat?: number;
  lon?: number;
  country?: string;
}

function distanceDegrees(lat1: number, lon1: number, lat2: number, lon2: number): number {
  return Math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2);
}

export class CyberAttackCampaignsLayer implements MapDataLayer {
  readonly id = 'cyber-attack-campaigns';
  readonly name = 'Cyber Attack Campaigns';
  readonly category = 'intelligence' as const;
  readonly icon = '🔓';
  readonly description = 'Known APT group origin regions, boosted by live internet outage correlation';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private outages: OutageRecord[] = [];
  private enriched: (AptGroup & { activity: number })[] = [];

  init(map: MaplibreMap): void {
    this.map = map;
    document.addEventListener('dashview:layer-data', ((e: CustomEvent) => {
      const d = e.detail as { layerId: string; data: unknown };
      if (d.layerId === 'internet-outages') {
        this.outages = (d.data as OutageRecord[]) || [];
        this.recompute();
        if (this.enabled) this.renderLayer();
        document.dispatchEvent(
          new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.enriched } }),
        );
      }
    }) as EventListener);
    // Compute initial values even before outages arrive
    this.recompute();
  }

  private recompute(): void {
    this.enriched = APT_GROUPS.map((g) => {
      let activity = 0;
      for (const o of this.outages) {
        if (typeof o.lat === 'number' && typeof o.lon === 'number') {
          if (distanceDegrees(g.lat, g.lon, o.lat, o.lon) < g.radius) activity += 1;
        }
      }
      return { ...g, activity };
    });
    this.lastUpdated = Date.now();
    updateProvenance(this.id, {
      source: 'NexusWatch Composite (MITRE ATT&CK + Cloudflare Radar)',
      sourceUrl: 'https://attack.mitre.org/groups/',
      refreshIntervalMs: 900_000,
      methodology:
        'Known APT group origin regions from MITRE ATT&CK, with a recent-activity score derived from live Cloudflare Radar internet-outage events falling inside each group radius.',
      dataPointCount: this.enriched.length,
      lastFetchOk: true,
    });
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
    this.recompute();
    if (this.enabled) this.renderLayer();
    document.dispatchEvent(
      new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.enriched } }),
    );
  }
  getRefreshInterval(): number {
    return 900_000;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
  getLastUpdated(): number | null {
    return this.lastUpdated;
  }
  getFeatureCount(): number {
    return this.enriched.length;
  }

  private renderLayer(): void {
    if (!this.map || this.enriched.length === 0) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.enriched.map((g) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [g.lon, g.lat] },
        properties: {
          id: g.id,
          name: g.name,
          aka: g.aka || '',
          country: g.country,
          targets: g.targets,
          activity: g.activity,
        },
      })),
    };

    this.map.addSource('cyber-attack-campaigns', { type: 'geojson', data: geojson });

    // Outer pulse
    this.map.addLayer({
      id: 'cyber-attack-campaigns-pulse',
      type: 'circle',
      source: 'cyber-attack-campaigns',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'activity'], 0, 24, 5, 40, 15, 64],
        'circle-color': '#ef4444',
        'circle-opacity': 0.1,
        'circle-blur': 1.4,
      },
    });

    this.map.addLayer({
      id: 'cyber-attack-campaigns-glow',
      type: 'circle',
      source: 'cyber-attack-campaigns',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'activity'], 0, 14, 5, 22, 15, 36],
        'circle-color': '#dc2626',
        'circle-opacity': 0.25,
        'circle-blur': 0.8,
      },
    });

    this.map.addLayer({
      id: 'cyber-attack-campaigns-core',
      type: 'circle',
      source: 'cyber-attack-campaigns',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'activity'], 0, 7, 5, 11, 15, 18],
        'circle-color': '#dc2626',
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.65)',
        'circle-opacity': 0.9,
      },
    });

    let popup: maplibregl.Popup | null = null;
    this.map.on('mouseenter', 'cyber-attack-campaigns-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'cyber-attack-campaigns-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      popup?.remove();
    });
    this.map.on('mousemove', 'cyber-attack-campaigns-core', (e) => {
      if (!this.map || !e.features?.length) return;
      const f = e.features[0];
      const p = f.properties!;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      popup?.remove();
      popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 12 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: 'APT GROUP',
            typeColor: '#dc2626',
            title: String(p.name),
            fields: [
              { label: 'Origin', value: String(p.country) },
              ...(p.aka ? [{ label: 'Aka', value: String(p.aka) }] : []),
              { label: 'Targets', value: String(p.targets) },
              { label: 'Recent signal', value: String(p.activity) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['cyber-attack-campaigns-core', 'cyber-attack-campaigns-glow', 'cyber-attack-campaigns-pulse']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('cyber-attack-campaigns')) this.map.removeSource('cyber-attack-campaigns');
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
