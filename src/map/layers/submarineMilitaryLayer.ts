import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { updateProvenance } from '../../services/dataProvenance.ts';

/**
 * Submarine & Major Naval Base Layer
 * Curated list of major naval bases worldwide, flagged with sub-tenant info.
 */

interface NavalBase {
  name: string;
  country: string;
  iso: string;
  lat: number;
  lon: number;
  /** Key submarine tenants/classes based at this base. */
  submarines: string;
  /** Alliance hint for coloring. */
  alliance: 'nato' | 'russia' | 'china' | 'other';
}

const BASES: NavalBase[] = [
  // United States
  {
    name: 'Kitsap–Bangor',
    country: 'United States',
    iso: 'US',
    lat: 47.73,
    lon: -122.73,
    submarines: 'Ohio-class SSBN/SSGN; 8 SSBNs home-ported',
    alliance: 'nato',
  },
  {
    name: 'Naval Base Kings Bay',
    country: 'United States',
    iso: 'US',
    lat: 30.79,
    lon: -81.51,
    submarines: 'Ohio-class SSBN (Atlantic); 6 SSBNs home-ported',
    alliance: 'nato',
  },
  {
    name: 'Naval Station Norfolk',
    country: 'United States',
    iso: 'US',
    lat: 36.95,
    lon: -76.33,
    submarines: 'Virginia- / Los Angeles-class SSN',
    alliance: 'nato',
  },
  {
    name: 'Pearl Harbor NSB',
    country: 'United States',
    iso: 'US',
    lat: 21.35,
    lon: -157.97,
    submarines: 'Virginia-class + LA-class SSN (Pacific)',
    alliance: 'nato',
  },
  {
    name: 'NS San Diego (Pt. Loma)',
    country: 'United States',
    iso: 'US',
    lat: 32.7,
    lon: -117.24,
    submarines: 'Los Angeles-class SSN',
    alliance: 'nato',
  },
  {
    name: 'NSB New London (Groton)',
    country: 'United States',
    iso: 'US',
    lat: 41.39,
    lon: -72.09,
    submarines: 'Virginia- / Seawolf-class SSN; training',
    alliance: 'nato',
  },
  {
    name: 'NS Guam (Apra)',
    country: 'United States',
    iso: 'GU',
    lat: 13.44,
    lon: 144.65,
    submarines: 'LA-class SSN forward-deployed',
    alliance: 'nato',
  },
  // United Kingdom
  {
    name: 'HMNB Clyde (Faslane)',
    country: 'United Kingdom',
    iso: 'GB',
    lat: 56.07,
    lon: -4.82,
    submarines: 'Vanguard-class SSBN + Astute-class SSN',
    alliance: 'nato',
  },
  {
    name: 'HMNB Devonport',
    country: 'United Kingdom',
    iso: 'GB',
    lat: 50.38,
    lon: -4.18,
    submarines: 'Trafalgar-class + Astute refit',
    alliance: 'nato',
  },
  // France
  {
    name: 'Île Longue / Brest',
    country: 'France',
    iso: 'FR',
    lat: 48.32,
    lon: -4.6,
    submarines: 'Triomphant-class SSBN; Rubis/Suffren SSN',
    alliance: 'nato',
  },
  {
    name: 'BN Toulon',
    country: 'France',
    iso: 'FR',
    lat: 43.12,
    lon: 5.93,
    submarines: 'Suffren-class (Barracuda) SSN',
    alliance: 'nato',
  },
  // Russia
  {
    name: 'Gadzhievo (Kola)',
    country: 'Russia',
    iso: 'RU',
    lat: 69.25,
    lon: 33.33,
    submarines: 'Borei-class / Delta IV SSBN (Northern Fleet)',
    alliance: 'russia',
  },
  {
    name: 'Vilyuchinsk (Kamchatka)',
    country: 'Russia',
    iso: 'RU',
    lat: 52.92,
    lon: 158.4,
    submarines: 'Borei-class SSBN (Pacific Fleet)',
    alliance: 'russia',
  },
  {
    name: 'Severomorsk',
    country: 'Russia',
    iso: 'RU',
    lat: 69.07,
    lon: 33.42,
    submarines: 'Northern Fleet HQ; Oscar-II SSGN',
    alliance: 'russia',
  },
  {
    name: 'Vladivostok (Ulyss)',
    country: 'Russia',
    iso: 'RU',
    lat: 43.12,
    lon: 131.9,
    submarines: 'Kilo-class SSK; Pacific Fleet sub brigade',
    alliance: 'russia',
  },
  {
    name: 'Kronstadt',
    country: 'Russia',
    iso: 'RU',
    lat: 59.99,
    lon: 29.77,
    submarines: 'Baltic Fleet; training and maintenance',
    alliance: 'russia',
  },
  // China
  {
    name: 'Qingdao (Jiaonan)',
    country: 'China',
    iso: 'CN',
    lat: 36.07,
    lon: 120.38,
    submarines: 'Type 094 Jin-class SSBN; North Sea Fleet',
    alliance: 'china',
  },
  {
    name: 'Yulin (Hainan)',
    country: 'China',
    iso: 'CN',
    lat: 18.22,
    lon: 109.55,
    submarines: 'Type 094/096 SSBN; underground sub pens',
    alliance: 'china',
  },
  {
    name: 'Ningbo / Xiangshan',
    country: 'China',
    iso: 'CN',
    lat: 29.49,
    lon: 121.58,
    submarines: 'Type 093 SSN; East Sea Fleet',
    alliance: 'china',
  },
  // India
  {
    name: 'Visakhapatnam (Eastern NC)',
    country: 'India',
    iso: 'IN',
    lat: 17.69,
    lon: 83.3,
    submarines: 'INS Arihant SSBN; Sindhughosh/Kalvari SSK',
    alliance: 'other',
  },
  {
    name: 'Mumbai (Western NC)',
    country: 'India',
    iso: 'IN',
    lat: 18.92,
    lon: 72.82,
    submarines: 'Kalvari-class SSK',
    alliance: 'other',
  },
  {
    name: 'INS Varsha (Rambilli)',
    country: 'India',
    iso: 'IN',
    lat: 17.47,
    lon: 82.86,
    submarines: 'SSBN pen under construction',
    alliance: 'other',
  },
  // Pakistan
  {
    name: 'PNS Qasim (Karachi)',
    country: 'Pakistan',
    iso: 'PK',
    lat: 24.81,
    lon: 66.99,
    submarines: 'Agosta-90B SSK; Hangor-class (CN) incoming',
    alliance: 'other',
  },
  {
    name: 'PNS Himalaya / Ormara',
    country: 'Pakistan',
    iso: 'PK',
    lat: 25.21,
    lon: 64.65,
    submarines: 'Future Hangor basing',
    alliance: 'other',
  },
  // Japan
  {
    name: 'JMSDF Yokosuka',
    country: 'Japan',
    iso: 'JP',
    lat: 35.29,
    lon: 139.67,
    submarines: 'Sōryū / Taigei-class SSK',
    alliance: 'nato',
  },
  {
    name: 'JMSDF Kure',
    country: 'Japan',
    iso: 'JP',
    lat: 34.24,
    lon: 132.56,
    submarines: 'Submarine training squadron; Sōryū',
    alliance: 'nato',
  },
  // South Korea
  {
    name: 'ROKN Jinhae',
    country: 'South Korea',
    iso: 'KR',
    lat: 35.15,
    lon: 128.67,
    submarines: 'KSS-III Dosan Ahn Changho-class SSK',
    alliance: 'nato',
  },
  // Australia
  {
    name: 'HMAS Stirling (Perth)',
    country: 'Australia',
    iso: 'AU',
    lat: -32.23,
    lon: 115.68,
    submarines: 'Collins-class SSK; AUKUS SSN base',
    alliance: 'nato',
  },
  // Israel
  {
    name: 'Haifa Naval Base',
    country: 'Israel',
    iso: 'IL',
    lat: 32.82,
    lon: 34.99,
    submarines: 'Dolphin-class SSK',
    alliance: 'other',
  },
  // Iran
  {
    name: 'Bandar Abbas',
    country: 'Iran',
    iso: 'IR',
    lat: 27.18,
    lon: 56.27,
    submarines: 'Kilo-class + Fateh/Ghadir midget SSK',
    alliance: 'other',
  },
  // North Korea
  {
    name: 'Sinpo South Shipyard',
    country: 'North Korea',
    iso: 'KP',
    lat: 40.03,
    lon: 128.18,
    submarines: 'Sinpo-class ballistic-missile sub',
    alliance: 'other',
  },
];

function colorForAlliance(a: NavalBase['alliance']): string {
  switch (a) {
    case 'nato':
      return '#3b82f6';
    case 'russia':
      return '#dc2626';
    case 'china':
      return '#eab308';
    case 'other':
      return '#a78bfa';
  }
}

export class SubmarineMilitaryLayer implements MapDataLayer {
  readonly id = 'submarine-military';
  readonly name = 'Submarines & Naval Bases';
  readonly category = 'conflict' as const;
  readonly icon = '🚢';
  readonly description = 'Major naval bases with submarine tenants (SSN/SSBN/SSK)';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: NavalBase[] = BASES;
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
    this.data = BASES;
    this.lastUpdated = Date.now();
    updateProvenance(this.id, {
      source: 'NexusWatch Curated (IISS Military Balance + public OSINT)',
      sourceUrl: 'https://www.iiss.org/publications/the-military-balance',
      refreshIntervalMs: 86_400_000,
      methodology:
        'Curated list of ~30 major naval bases worldwide with known submarine tenants. Data synthesized from IISS Military Balance and public open-source intelligence reporting.',
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
      features: this.data.map((b) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [b.lon, b.lat] },
        properties: {
          name: b.name,
          country: b.country,
          iso: b.iso,
          submarines: b.submarines,
          alliance: b.alliance,
          color: colorForAlliance(b.alliance),
        },
      })),
    };

    this.map.addSource('submarine-military', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'submarine-military-glow',
      type: 'circle',
      source: 'submarine-military',
      paint: {
        'circle-radius': 16,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.12,
        'circle-blur': 1,
      },
    });

    // Anchor symbol
    this.map.addLayer({
      id: 'submarine-military-symbol',
      type: 'symbol',
      source: 'submarine-military',
      layout: {
        'text-field': '⚓',
        'text-size': 18,
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000000',
        'text-halo-width': 1.2,
      },
    });

    this.map.addLayer({
      id: 'submarine-military-label',
      type: 'symbol',
      source: 'submarine-military',
      layout: {
        'text-field': ['get', 'iso'],
        'text-size': 10,
        'text-offset': [0, 1.4],
        'text-font': ['Open Sans Bold'],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#e2e8f0',
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    });

    this.map.on('mouseenter', 'submarine-military-symbol', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'submarine-military-symbol', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'submarine-military-symbol', (e) => {
      if (!this.map || !e.features?.length) return;
      const f = e.features[0];
      const p = f.properties!;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 12 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: 'NAVAL BASE',
            typeColor: String(p.color),
            title: String(p.name),
            fields: [
              { label: 'Country', value: String(p.country) },
              { label: 'Alliance', value: String(p.alliance) },
              { label: 'Submarines', value: String(p.submarines) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['submarine-military-label', 'submarine-military-symbol', 'submarine-military-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('submarine-military')) this.map.removeSource('submarine-military');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
