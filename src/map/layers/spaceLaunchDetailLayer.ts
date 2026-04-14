import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { updateProvenance } from '../../services/dataProvenance.ts';

/**
 * Space Launch Detail Layer
 * Curated upcoming/recent launches from major agencies.
 * Each entry: pad coordinates + date.
 */

interface LaunchEntry {
  mission: string;
  vehicle: string;
  provider: string;
  pad: string;
  lat: number;
  lon: number;
  /** ISO date of planned launch (YYYY-MM-DD). */
  date: string;
  payload: string;
}

const LAUNCHES: LaunchEntry[] = [
  {
    mission: 'Starlink 10-12',
    vehicle: 'Falcon 9',
    provider: 'SpaceX',
    pad: 'Cape Canaveral SLC-40',
    lat: 28.56,
    lon: -80.58,
    date: '2026-04-15',
    payload: 'Internet constellation',
  },
  {
    mission: 'Crew-11 ISS',
    vehicle: 'Falcon 9 + Dragon',
    provider: 'SpaceX/NASA',
    pad: 'KSC LC-39A',
    lat: 28.61,
    lon: -80.6,
    date: '2026-04-22',
    payload: 'Crew rotation',
  },
  {
    mission: 'Starship IFT-13',
    vehicle: 'Starship',
    provider: 'SpaceX',
    pad: 'Starbase Boca Chica',
    lat: 25.99,
    lon: -97.19,
    date: '2026-05-05',
    payload: 'Orbital test',
  },
  {
    mission: 'Artemis II',
    vehicle: 'SLS Block 1',
    provider: 'NASA',
    pad: 'KSC LC-39B',
    lat: 28.63,
    lon: -80.62,
    date: '2026-09-10',
    payload: 'Crewed lunar flyby',
  },
  {
    mission: 'Soyuz MS-28',
    vehicle: 'Soyuz-2.1a',
    provider: 'Roscosmos',
    pad: 'Baikonur LC-1/5',
    lat: 45.92,
    lon: 63.34,
    date: '2026-04-30',
    payload: 'ISS crew',
  },
  {
    mission: 'Angara-A5 KVTK',
    vehicle: 'Angara A5',
    provider: 'Roscosmos',
    pad: 'Plesetsk',
    lat: 62.93,
    lon: 40.58,
    date: '2026-06-12',
    payload: 'Military GSO',
  },
  {
    mission: 'Ariane 6 VA265',
    vehicle: 'Ariane 6',
    provider: 'ESA/Arianespace',
    pad: 'Kourou ELA-4',
    lat: 5.24,
    lon: -52.77,
    date: '2026-05-20',
    payload: 'Galileo GPS sats',
  },
  {
    mission: 'Vega-C VV28',
    vehicle: 'Vega-C',
    provider: 'ESA',
    pad: 'Kourou ZLV',
    lat: 5.24,
    lon: -52.76,
    date: '2026-07-02',
    payload: 'Sentinel EO sat',
  },
  {
    mission: 'Chandrayaan-4',
    vehicle: 'LVM3',
    provider: 'ISRO',
    pad: 'Satish Dhawan SLP',
    lat: 13.72,
    lon: 80.24,
    date: '2026-12-15',
    payload: 'Lunar sample return',
  },
  {
    mission: 'Gaganyaan G1',
    vehicle: 'HLVM3',
    provider: 'ISRO',
    pad: 'Satish Dhawan',
    lat: 13.73,
    lon: 80.23,
    date: '2026-08-08',
    payload: 'Crewed orbital test',
  },
  {
    mission: 'H3-TF8',
    vehicle: 'H3',
    provider: 'JAXA',
    pad: 'Tanegashima Y2',
    lat: 30.4,
    lon: 130.97,
    date: '2026-06-25',
    payload: 'HTV-X cargo',
  },
  {
    mission: 'Long March 5B Y9',
    vehicle: 'Long March 5B',
    provider: 'CNSA',
    pad: 'Wenchang LC-101',
    lat: 19.61,
    lon: 110.95,
    date: '2026-05-28',
    payload: 'Tiangong module',
  },
  {
    mission: 'Shenzhou-22',
    vehicle: 'Long March 2F',
    provider: 'CNSA',
    pad: 'Jiuquan LA-4',
    lat: 40.96,
    lon: 100.28,
    date: '2026-04-28',
    payload: 'Tiangong crew',
  },
  {
    mission: 'Long March 7A',
    vehicle: 'Long March 7A',
    provider: 'CNSA',
    pad: 'Wenchang LC-201',
    lat: 19.62,
    lon: 110.95,
    date: '2026-07-18',
    payload: 'Military GSO',
  },
  {
    mission: 'New Glenn NG-3',
    vehicle: 'New Glenn',
    provider: 'Blue Origin',
    pad: 'Cape Canaveral LC-36',
    lat: 28.47,
    lon: -80.54,
    date: '2026-06-20',
    payload: 'Project Kuiper',
  },
  {
    mission: 'Electron "Mission X"',
    vehicle: 'Electron',
    provider: 'Rocket Lab',
    pad: 'Mahia LC-1',
    lat: -39.26,
    lon: 177.86,
    date: '2026-05-12',
    payload: 'Smallsat cluster',
  },
  {
    mission: 'Terran R-1',
    vehicle: 'Terran R',
    provider: 'Relativity Space',
    pad: 'Cape Canaveral LC-16',
    lat: 28.51,
    lon: -80.56,
    date: '2026-10-05',
    payload: 'Commercial demo',
  },
  {
    mission: 'Nuri TLV-4',
    vehicle: 'Nuri',
    provider: 'KARI',
    pad: 'Naro Space Center',
    lat: 34.43,
    lon: 127.53,
    date: '2026-06-05',
    payload: 'Korean EO sat',
  },
  {
    mission: 'Zhuque-3',
    vehicle: 'Zhuque-3',
    provider: 'LandSpace',
    pad: 'Jiuquan LandSpace',
    lat: 41.12,
    lon: 100.3,
    date: '2026-09-22',
    payload: 'Reusable demo',
  },
  {
    mission: 'Falcon Heavy USSF-106',
    vehicle: 'Falcon Heavy',
    provider: 'SpaceX/USSF',
    pad: 'KSC LC-39A',
    lat: 28.61,
    lon: -80.6,
    date: '2026-07-15',
    payload: 'Classified DoD',
  },
  {
    mission: 'Soyuz MS-29',
    vehicle: 'Soyuz-2.1a',
    provider: 'Roscosmos',
    pad: 'Baikonur LC-1/5',
    lat: 45.92,
    lon: 63.34,
    date: '2026-10-20',
    payload: 'ISS crew',
  },
];

export class SpaceLaunchDetailLayer implements MapDataLayer {
  readonly id = 'space-launch-detail';
  readonly name = 'Space Launches (Detail)';
  readonly category = 'intelligence' as const;
  readonly icon = '🚀';
  readonly description = 'Curated upcoming & recent launches with pad coordinates and countdowns';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: LaunchEntry[] = LAUNCHES;
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
    this.data = LAUNCHES;
    this.lastUpdated = Date.now();
    updateProvenance(this.id, {
      source: 'NexusWatch Curated (SpaceX, NASA, Roscosmos, ESA, ISRO, JAXA, CNSA)',
      sourceUrl: 'https://nexuswatch.dev/#/methodology',
      refreshIntervalMs: 86_400_000,
      methodology:
        'Curated list of upcoming and recent launches across global providers. Includes vehicle, pad coordinates, and planned launch date.',
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

  private daysUntil(dateIso: string): number {
    const t = new Date(dateIso + 'T00:00:00Z').getTime();
    return Math.round((t - Date.now()) / 86_400_000);
  }

  private renderLayer(): void {
    if (!this.map || this.data.length === 0) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.data.map((l) => {
        const days = this.daysUntil(l.date);
        const countdown = days === 0 ? 'T-0' : days > 0 ? `T-${days}d` : `T+${Math.abs(days)}d`;
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [l.lon, l.lat] },
          properties: {
            mission: l.mission,
            vehicle: l.vehicle,
            provider: l.provider,
            pad: l.pad,
            date: l.date,
            payload: l.payload,
            countdown,
            upcoming: days >= 0,
          },
        };
      }),
    };

    this.map.addSource('space-launch-detail', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'space-launch-detail-glow',
      type: 'circle',
      source: 'space-launch-detail',
      paint: {
        'circle-radius': 14,
        'circle-color': ['case', ['get', 'upcoming'], '#60a5fa', '#94a3b8'],
        'circle-opacity': 0.18,
        'circle-blur': 0.8,
      },
    });

    this.map.addLayer({
      id: 'space-launch-detail-symbol',
      type: 'symbol',
      source: 'space-launch-detail',
      layout: {
        'text-field': '🚀',
        'text-size': 18,
        'text-allow-overlap': true,
      },
    });

    this.map.addLayer({
      id: 'space-launch-detail-label',
      type: 'symbol',
      source: 'space-launch-detail',
      layout: {
        'text-field': ['get', 'countdown'],
        'text-size': 11,
        'text-offset': [0, 1.4],
        'text-font': ['Open Sans Bold'],
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#93c5fd',
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    });

    this.map.on('mouseenter', 'space-launch-detail-symbol', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'space-launch-detail-symbol', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'space-launch-detail-symbol', (e) => {
      if (!this.map || !e.features?.length) return;
      const f = e.features[0];
      const p = f.properties!;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 12 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: 'LAUNCH',
            typeColor: '#60a5fa',
            title: String(p.mission),
            fields: [
              { label: 'Vehicle', value: String(p.vehicle) },
              { label: 'Provider', value: String(p.provider) },
              { label: 'Pad', value: String(p.pad) },
              { label: 'Date', value: String(p.date) },
              { label: 'T−', value: String(p.countdown) },
              { label: 'Payload', value: String(p.payload) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['space-launch-detail-label', 'space-launch-detail-symbol', 'space-launch-detail-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('space-launch-detail')) this.map.removeSource('space-launch-detail');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
