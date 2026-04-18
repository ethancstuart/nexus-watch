import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { updateProvenance } from '../../services/dataProvenance.ts';

/**
 * Dark Web / OSINT Signals Layer
 * Curated, indicative (not real-time) analytical markers derived from
 * public threat-intel reporting. Locations are approximate where
 * entities are geographically attributable — many are infrastructural
 * rather than physical.
 */

type SignalType = 'c2-server' | 'dark-market' | 'telegram-cluster' | 'ransomware-group' | 'leak-site';

interface OsintSignal {
  id: string;
  type: SignalType;
  label: string;
  /** Approximate coordinates (region/ASN-level, not precise). */
  lat: number;
  lon: number;
  description: string;
  firstSeen: string;
}

const SIGNALS: OsintSignal[] = [
  {
    id: 'sig-1',
    type: 'c2-server',
    label: 'Emotet C2 (Ukraine)',
    lat: 50.45,
    lon: 30.52,
    description: 'Known botnet command-and-control node cluster.',
    firstSeen: '2025-12-10',
  },
  {
    id: 'sig-2',
    type: 'c2-server',
    label: 'TrickBot C2 (Russia)',
    lat: 55.76,
    lon: 37.62,
    description: 'Active C2 infrastructure attributed to TrickBot operators.',
    firstSeen: '2025-11-02',
  },
  {
    id: 'sig-3',
    type: 'c2-server',
    label: 'Qakbot C2 (Bulgaria)',
    lat: 42.7,
    lon: 23.32,
    description: 'Post-takedown resurgence of Qakbot C2.',
    firstSeen: '2026-02-18',
  },
  {
    id: 'sig-4',
    type: 'dark-market',
    label: 'ASAP Market (Netherlands ASN)',
    lat: 52.37,
    lon: 4.9,
    description: 'Dark web marketplace hosted via NL colocation; drug and data listings.',
    firstSeen: '2025-09-30',
  },
  {
    id: 'sig-5',
    type: 'dark-market',
    label: 'Russian Market (RU ASN)',
    lat: 59.93,
    lon: 30.34,
    description: 'Stealer log marketplace; heavy credential trade.',
    firstSeen: '2025-08-12',
  },
  {
    id: 'sig-6',
    type: 'telegram-cluster',
    label: 'Pro-Russia milbloggers (Donbas)',
    lat: 48.02,
    lon: 37.8,
    description: 'Dense Telegram war-reporting channel cluster.',
    firstSeen: '2024-02-24',
  },
  {
    id: 'sig-7',
    type: 'telegram-cluster',
    label: 'Pro-Ukraine OSINT channels (Kyiv)',
    lat: 50.45,
    lon: 30.52,
    description: 'Volunteer geolocation / BDA channel cluster.',
    firstSeen: '2024-02-24',
  },
  {
    id: 'sig-8',
    type: 'telegram-cluster',
    label: 'Hamas-linked channels (Gaza/Beirut)',
    lat: 31.5,
    lon: 34.47,
    description: 'Coordinated war-update channel activity.',
    firstSeen: '2025-10-07',
  },
  {
    id: 'sig-9',
    type: 'telegram-cluster',
    label: 'Houthi maritime-ops channels (Sanaa)',
    lat: 15.37,
    lon: 44.19,
    description: 'Channels announcing Red Sea vessel strikes.',
    firstSeen: '2025-11-15',
  },
  {
    id: 'sig-10',
    type: 'ransomware-group',
    label: 'LockBit leak site (ASN rotation)',
    lat: 52.23,
    lon: 21.01,
    description: 'Ransomware leak portal; ASN frequently rotated to frustrate takedowns.',
    firstSeen: '2025-06-01',
  },
  {
    id: 'sig-11',
    type: 'ransomware-group',
    label: 'ALPHV/BlackCat affiliates (RU)',
    lat: 55.76,
    lon: 37.62,
    description: 'Russian-speaking RaaS affiliate coordination.',
    firstSeen: '2025-04-05',
  },
  {
    id: 'sig-12',
    type: 'ransomware-group',
    label: 'Akira ransomware (CIS)',
    lat: 59.93,
    lon: 30.34,
    description: 'Active data-exfil + encryption campaigns.',
    firstSeen: '2025-07-20',
  },
  {
    id: 'sig-13',
    type: 'leak-site',
    label: 'Clop leak site (TOR)',
    lat: 48.86,
    lon: 2.35,
    description: 'MOVEit-era data dumps continuing to surface.',
    firstSeen: '2025-05-14',
  },
  {
    id: 'sig-14',
    type: 'leak-site',
    label: 'Play leak site (TOR)',
    lat: 50.08,
    lon: 14.43,
    description: 'Municipal and enterprise victim listings.',
    firstSeen: '2025-10-22',
  },
  {
    id: 'sig-15',
    type: 'c2-server',
    label: 'Cobalt Strike beacons (NL ASN)',
    lat: 51.95,
    lon: 4.13,
    description: 'High concentration of Cobalt Strike C2 infrastructure.',
    firstSeen: '2026-01-09',
  },
  {
    id: 'sig-16',
    type: 'telegram-cluster',
    label: 'Sudan RSF milblogger channels',
    lat: 15.5,
    lon: 32.56,
    description: 'Dense war-ops Telegram channel activity.',
    firstSeen: '2024-04-15',
  },
];

function colorForType(t: SignalType): string {
  switch (t) {
    case 'c2-server':
      return '#a855f7';
    case 'dark-market':
      return '#7c3aed';
    case 'telegram-cluster':
      return '#c084fc';
    case 'ransomware-group':
      return '#9333ea';
    case 'leak-site':
      return '#d8b4fe';
  }
}

function labelForType(t: SignalType): string {
  switch (t) {
    case 'c2-server':
      return 'C2 server';
    case 'dark-market':
      return 'Dark market';
    case 'telegram-cluster':
      return 'Telegram cluster';
    case 'ransomware-group':
      return 'Ransomware group';
    case 'leak-site':
      return 'Leak site';
  }
}

export class DarkWebOsintLayer implements MapDataLayer {
  readonly id = 'dark-web-osint';
  readonly name = 'Cyber Threat Reference';
  readonly category = 'intelligence' as const;
  readonly icon = '🔒';
  readonly description =
    'Reference: Known threat infrastructure from CISA, abuse.ch, CERT-UA. Curated quarterly, not live detection.';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: OsintSignal[] = SIGNALS;
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
    this.data = SIGNALS;
    this.lastUpdated = Date.now();
    updateProvenance(this.id, {
      source: 'NexusWatch Curated OSINT (public threat-intel feeds)',
      sourceUrl: 'https://nexuswatch.dev/#/methodology',
      refreshIntervalMs: 86_400_000,
      methodology:
        'Curated, indicative markers derived from public threat-intel reporting (CISA, CERT-UA, abuse.ch, vendor blogs, Telegram channel observation). Locations are ASN/region-level approximations, not precise geo-locations.',
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
      features: this.data.map((s) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
        properties: {
          id: s.id,
          type: s.type,
          label: s.label,
          description: s.description,
          firstSeen: s.firstSeen,
          typeLabel: labelForType(s.type),
          color: colorForType(s.type),
        },
      })),
    };

    this.map.addSource('dark-web-osint', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'dark-web-osint-glow',
      type: 'circle',
      source: 'dark-web-osint',
      paint: {
        'circle-radius': 14,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.12,
        'circle-blur': 1,
      },
    });

    // Purple diamond marker
    this.map.addLayer({
      id: 'dark-web-osint-symbol',
      type: 'symbol',
      source: 'dark-web-osint',
      layout: {
        'text-field': '◆',
        'text-size': 14,
        'text-allow-overlap': true,
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000000',
        'text-halo-width': 1.2,
      },
    });

    this.map.on('mouseenter', 'dark-web-osint-symbol', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'dark-web-osint-symbol', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'dark-web-osint-symbol', (e) => {
      if (!this.map || !e.features?.length) return;
      const f = e.features[0];
      const p = f.properties!;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `OSINT · ${String(p.typeLabel).toUpperCase()}`,
            typeColor: String(p.color),
            title: String(p.label),
            fields: [
              { label: 'Description', value: String(p.description) },
              { label: 'First seen', value: String(p.firstSeen) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['dark-web-osint-symbol', 'dark-web-osint-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('dark-web-osint')) this.map.removeSource('dark-web-osint');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
