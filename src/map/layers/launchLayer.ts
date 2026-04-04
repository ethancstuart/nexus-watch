import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface LaunchSite {
  name: string;
  provider: string;
  country: string;
  lat: number;
  lon: number;
  nextLaunch: string;
  vehicle: string;
  mission: string;
}

const LAUNCH_SITES: LaunchSite[] = [
  {
    name: 'Kennedy Space Center',
    provider: 'SpaceX/NASA',
    country: 'US',
    lat: 28.57,
    lon: -80.65,
    nextLaunch: '2026-04-08',
    vehicle: 'Falcon 9',
    mission: 'Starlink Group 12-5',
  },
  {
    name: 'Cape Canaveral SFS',
    provider: 'ULA',
    country: 'US',
    lat: 28.49,
    lon: -80.58,
    nextLaunch: '2026-04-15',
    vehicle: 'Vulcan Centaur',
    mission: 'USSF-106',
  },
  {
    name: 'Vandenberg SFB',
    provider: 'SpaceX',
    country: 'US',
    lat: 34.63,
    lon: -120.57,
    nextLaunch: '2026-04-10',
    vehicle: 'Falcon 9',
    mission: 'NROL-167',
  },
  {
    name: 'Boca Chica (Starbase)',
    provider: 'SpaceX',
    country: 'US',
    lat: 25.99,
    lon: -97.16,
    nextLaunch: '2026-04-20',
    vehicle: 'Starship',
    mission: 'Flight Test 8',
  },
  {
    name: 'Guiana Space Centre',
    provider: 'Arianespace',
    country: 'FR',
    lat: 5.24,
    lon: -52.77,
    nextLaunch: '2026-04-12',
    vehicle: 'Ariane 6',
    mission: 'SES-26',
  },
  {
    name: 'Jiuquan Satellite Launch Center',
    provider: 'CASC',
    country: 'CN',
    lat: 40.96,
    lon: 100.28,
    nextLaunch: '2026-04-06',
    vehicle: 'Long March 2D',
    mission: 'Yaogan-43',
  },
  {
    name: 'Wenchang Space Launch Site',
    provider: 'CASC',
    country: 'CN',
    lat: 19.61,
    lon: 110.95,
    nextLaunch: '2026-04-18',
    vehicle: 'Long March 5B',
    mission: 'Tiangong module',
  },
  {
    name: 'Baikonur Cosmodrome',
    provider: 'Roscosmos',
    country: 'KZ',
    lat: 45.97,
    lon: 63.31,
    nextLaunch: '2026-04-14',
    vehicle: 'Soyuz 2.1a',
    mission: 'Progress MS-31',
  },
  {
    name: 'Satish Dhawan Space Centre',
    provider: 'ISRO',
    country: 'IN',
    lat: 13.73,
    lon: 80.23,
    nextLaunch: '2026-04-22',
    vehicle: 'PSLV-C60',
    mission: 'EOS-09',
  },
  {
    name: 'Tanegashima Space Center',
    provider: 'JAXA',
    country: 'JP',
    lat: 30.37,
    lon: 131.0,
    nextLaunch: '2026-05-01',
    vehicle: 'H3',
    mission: 'IGS Radar 8',
  },
  {
    name: 'Mahia Peninsula',
    provider: 'Rocket Lab',
    country: 'NZ',
    lat: -39.26,
    lon: 177.86,
    nextLaunch: '2026-04-11',
    vehicle: 'Electron',
    mission: 'Kineis IoT-10',
  },
];

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export class LaunchLayer implements MapDataLayer {
  readonly id = 'launches';
  readonly name = 'Space Launches';
  readonly category = 'infrastructure' as const;
  readonly icon = '🚀';
  readonly description = 'Upcoming rocket launches worldwide';

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
      new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: LAUNCH_SITES } }),
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
    return LAUNCH_SITES.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();
    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: LAUNCH_SITES.map((s) => {
        const days = daysUntil(s.nextLaunch);
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
          properties: {
            name: s.name,
            provider: s.provider,
            country: s.country,
            vehicle: s.vehicle,
            mission: s.mission,
            date: s.nextLaunch,
            days,
            color: days <= 3 ? '#ef4444' : days <= 7 ? '#f97316' : '#8b5cf6',
          },
        };
      }),
    };
    this.map.addSource('launches', { type: 'geojson', data: geojson });
    this.map.addLayer({
      id: 'launches-glow',
      type: 'circle',
      source: 'launches',
      paint: { 'circle-radius': 16, 'circle-color': ['get', 'color'], 'circle-opacity': 0.12, 'circle-blur': 0.6 },
    });
    this.map.addLayer({
      id: 'launches-markers',
      type: 'circle',
      source: 'launches',
      paint: {
        'circle-radius': 6,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.4)',
        'circle-opacity': 0.9,
      },
    });
    this.map.addLayer({
      id: 'launches-labels',
      type: 'symbol',
      source: 'launches',
      minzoom: 3,
      layout: {
        'text-field': ['concat', ['get', 'vehicle'], '\n', ['to-string', ['get', 'days']], 'd'],
        'text-size': 9,
        'text-offset': [0, 1.8],
        'text-font': ['Open Sans Bold'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#000', 'text-halo-width': 1 },
    });

    this.map.on('mouseenter', 'launches-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'launches-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'launches-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: 'LAUNCH',
            typeColor: String(p.color),
            title: `${p.vehicle} — ${p.mission}`,
            fields: [
              { label: 'Site', value: String(p.name) },
              { label: 'Provider', value: String(p.provider) },
              { label: 'Date', value: String(p.date) },
              { label: 'In', value: `${p.days} days` },
            ],
          }),
        )
        .addTo(this.map);
    });
  }
  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['launches-labels', 'launches-markers', 'launches-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('launches')) this.map.removeSource('launches');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
