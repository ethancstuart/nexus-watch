import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { updateProvenance } from '../../services/dataProvenance.ts';

/**
 * Food Security Layer — countries at IPC Phase 3 (Crisis) or worse.
 * IPC Phases: 1 Minimal, 2 Stressed, 3 Crisis, 4 Emergency, 5 Famine.
 */

interface FoodSecurityEntry {
  country: string;
  iso: string;
  lat: number;
  lon: number;
  /** IPC phase: 3=Crisis, 4=Emergency, 5=Famine. */
  ipc: 3 | 4 | 5;
  /** Estimated population in Phase 3+ (millions). */
  affectedMillions: number;
  notes: string;
}

const ENTRIES: FoodSecurityEntry[] = [
  {
    country: 'Sudan',
    iso: 'SD',
    lat: 15.5,
    lon: 32.56,
    ipc: 5,
    affectedMillions: 25.6,
    notes: 'Famine (El Fasher, Darfur)',
  },
  {
    country: 'South Sudan',
    iso: 'SS',
    lat: 6.88,
    lon: 31.3,
    ipc: 4,
    affectedMillions: 7.1,
    notes: 'Conflict + flooding',
  },
  { country: 'Yemen', iso: 'YE', lat: 15.55, lon: 48.52, ipc: 4, affectedMillions: 17.0, notes: 'Civil war, blockade' },
  {
    country: 'Haiti',
    iso: 'HT',
    lat: 18.97,
    lon: -72.28,
    ipc: 4,
    affectedMillions: 4.97,
    notes: 'Gang collapse, economic',
  },
  { country: 'Gaza', iso: 'PS', lat: 31.52, lon: 34.45, ipc: 5, affectedMillions: 1.1, notes: 'War, blockaded aid' },
  {
    country: 'Burkina Faso',
    iso: 'BF',
    lat: 12.37,
    lon: -1.52,
    ipc: 3,
    affectedMillions: 2.7,
    notes: 'Jihadist insurgency',
  },
  {
    country: 'Madagascar',
    iso: 'MG',
    lat: -18.77,
    lon: 46.87,
    ipc: 3,
    affectedMillions: 1.4,
    notes: 'Climate-driven drought',
  },
  { country: 'Somalia', iso: 'SO', lat: 5.15, lon: 46.2, ipc: 4, affectedMillions: 6.6, notes: 'Drought + Al-Shabaab' },
  {
    country: 'Ethiopia',
    iso: 'ET',
    lat: 9.15,
    lon: 40.49,
    ipc: 3,
    affectedMillions: 15.8,
    notes: 'Tigray aftermath + drought',
  },
  {
    country: 'Nigeria',
    iso: 'NG',
    lat: 10.4,
    lon: 9.08,
    ipc: 3,
    affectedMillions: 26.5,
    notes: 'Northeast insurgency',
  },
  {
    country: 'DR Congo',
    iso: 'CD',
    lat: -2.88,
    lon: 23.66,
    ipc: 3,
    affectedMillions: 25.8,
    notes: 'M23, displacement',
  },
  {
    country: 'Afghanistan',
    iso: 'AF',
    lat: 33.94,
    lon: 67.71,
    ipc: 3,
    affectedMillions: 15.8,
    notes: 'Taliban economic collapse',
  },
  { country: 'Syria', iso: 'SY', lat: 34.8, lon: 38.99, ipc: 3, affectedMillions: 12.9, notes: 'Post-war, sanctions' },
  { country: 'Mali', iso: 'ML', lat: 17.57, lon: -3.99, ipc: 3, affectedMillions: 1.4, notes: 'Junta / insurgency' },
  {
    country: 'Chad',
    iso: 'TD',
    lat: 15.45,
    lon: 18.73,
    ipc: 3,
    affectedMillions: 3.4,
    notes: 'Refugee influx from Sudan',
  },
  {
    country: 'Niger',
    iso: 'NE',
    lat: 17.61,
    lon: 8.08,
    ipc: 3,
    affectedMillions: 3.3,
    notes: 'Coup, Sahel insurgency',
  },
  {
    country: 'Central African Rep.',
    iso: 'CF',
    lat: 6.61,
    lon: 20.94,
    ipc: 3,
    affectedMillions: 2.4,
    notes: 'Armed conflict',
  },
  {
    country: 'Mozambique',
    iso: 'MZ',
    lat: -18.67,
    lon: 35.53,
    ipc: 3,
    affectedMillions: 3.3,
    notes: 'Cabo Delgado insurgency',
  },
  { country: 'Zimbabwe', iso: 'ZW', lat: -19.02, lon: 29.15, ipc: 3, affectedMillions: 7.7, notes: 'El Niño drought' },
  {
    country: 'Malawi',
    iso: 'MW',
    lat: -13.25,
    lon: 34.3,
    ipc: 3,
    affectedMillions: 4.4,
    notes: 'Drought, Cyclone impact',
  },
  { country: 'Myanmar', iso: 'MM', lat: 21.91, lon: 95.96, ipc: 3, affectedMillions: 13.3, notes: 'Civil war' },
  {
    country: 'Lebanon',
    iso: 'LB',
    lat: 33.85,
    lon: 35.86,
    ipc: 3,
    affectedMillions: 1.6,
    notes: 'Economic collapse, war',
  },
];

function colorForIpc(ipc: 3 | 4 | 5): string {
  if (ipc === 5) return '#7f1d1d';
  if (ipc === 4) return '#dc2626';
  return '#eab308';
}

function labelForIpc(ipc: 3 | 4 | 5): string {
  if (ipc === 5) return 'Famine (IPC 5)';
  if (ipc === 4) return 'Emergency (IPC 4)';
  return 'Crisis (IPC 3)';
}

export class FoodSecurityLayer implements MapDataLayer {
  readonly id = 'food-security';
  readonly name = 'Food Security';
  readonly category = 'intelligence' as const;
  readonly icon = '🌾';
  readonly description = 'Countries at IPC Phase 3+ (Crisis, Emergency, Famine)';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: FoodSecurityEntry[] = ENTRIES;
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
    this.data = ENTRIES;
    this.lastUpdated = Date.now();
    updateProvenance(this.id, {
      source: 'IPC / FEWS NET (curated)',
      sourceUrl: 'https://www.ipcinfo.org/',
      refreshIntervalMs: 86_400_000,
      methodology:
        'Curated list of countries at IPC Phase 3+ (Crisis), Phase 4 (Emergency), or Phase 5 (Famine). Sourced from IPC Global and FEWS NET classifications.',
      dataPointCount: this.data.length,
      lastFetchOk: true,
    });
    if (this.enabled) this.renderLayer();
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
  }
  getRefreshInterval(): number {
    return 86_400_000;
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
      features: this.data.map((e) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] },
        properties: {
          country: e.country,
          iso: e.iso,
          ipc: e.ipc,
          affectedMillions: e.affectedMillions,
          notes: e.notes,
          color: colorForIpc(e.ipc),
          label: labelForIpc(e.ipc),
        },
      })),
    };

    this.map.addSource('food-security', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'food-security-glow',
      type: 'circle',
      source: 'food-security',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'affectedMillions'], 0, 14, 5, 22, 15, 36, 30, 52],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.18,
        'circle-blur': 1.1,
      },
    });

    this.map.addLayer({
      id: 'food-security-circle',
      type: 'circle',
      source: 'food-security',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'affectedMillions'], 0, 6, 5, 10, 15, 16, 30, 24],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.6)',
        'circle-opacity': 0.75,
      },
    });

    this.map.on('mouseenter', 'food-security-circle', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'food-security-circle', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'food-security-circle', (e) => {
      if (!this.map || !e.features?.length) return;
      const f = e.features[0];
      const p = f.properties!;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 12 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: 'FOOD SECURITY',
            typeColor: String(p.color),
            title: String(p.country),
            fields: [
              { label: 'Phase', value: String(p.label), color: String(p.color) },
              { label: 'Affected', value: `${Number(p.affectedMillions).toFixed(1)}M` },
              { label: 'Driver', value: String(p.notes) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['food-security-circle', 'food-security-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('food-security')) this.map.removeSource('food-security');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
