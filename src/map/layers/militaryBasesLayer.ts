import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { militaryPopup } from '../PopupCard.ts';

interface MilitaryBase {
  name: string;
  country: string;
  type: 'naval' | 'air' | 'army' | 'joint' | 'missile';
  alliance: 'nato' | 'russia' | 'china' | 'other';
  lat: number;
  lon: number;
}

const BASES: MilitaryBase[] = [
  // NATO / US
  { name: 'Ramstein AB', country: 'DE', type: 'air', alliance: 'nato', lat: 49.44, lon: 7.6 },
  { name: 'Aviano AB', country: 'IT', type: 'air', alliance: 'nato', lat: 46.03, lon: 12.6 },
  { name: 'Incirlik AB', country: 'TR', type: 'air', alliance: 'nato', lat: 37.0, lon: 35.43 },
  { name: 'Camp Humphreys', country: 'KR', type: 'army', alliance: 'nato', lat: 36.96, lon: 127.03 },
  { name: 'Yokosuka Naval', country: 'JP', type: 'naval', alliance: 'nato', lat: 35.28, lon: 139.67 },
  { name: 'Kadena AB', country: 'JP', type: 'air', alliance: 'nato', lat: 26.35, lon: 127.77 },
  { name: 'Diego Garcia', country: 'IO', type: 'joint', alliance: 'nato', lat: -7.32, lon: 72.42 },
  { name: 'Al Udeid AB', country: 'QA', type: 'air', alliance: 'nato', lat: 25.12, lon: 51.31 },
  { name: 'Camp Lemonnier', country: 'DJ', type: 'joint', alliance: 'nato', lat: 11.55, lon: 43.15 },
  { name: 'Naval Station Rota', country: 'ES', type: 'naval', alliance: 'nato', lat: 36.64, lon: -6.35 },
  { name: 'RAF Lakenheath', country: 'GB', type: 'air', alliance: 'nato', lat: 52.41, lon: 0.56 },
  { name: 'Thule AB', country: 'GL', type: 'air', alliance: 'nato', lat: 76.53, lon: -68.7 },
  { name: 'Fort Liberty', country: 'US', type: 'army', alliance: 'nato', lat: 35.14, lon: -79.0 },
  { name: 'Norfolk Naval', country: 'US', type: 'naval', alliance: 'nato', lat: 36.95, lon: -76.33 },
  { name: 'Pearl Harbor', country: 'US', type: 'naval', alliance: 'nato', lat: 21.35, lon: -157.97 },
  // Russia
  { name: 'Kaliningrad', country: 'RU', type: 'missile', alliance: 'russia', lat: 54.71, lon: 20.51 },
  { name: 'Severomorsk', country: 'RU', type: 'naval', alliance: 'russia', lat: 69.07, lon: 33.42 },
  { name: 'Tartus', country: 'SY', type: 'naval', alliance: 'russia', lat: 34.89, lon: 35.89 },
  { name: 'Hmeimim AB', country: 'SY', type: 'air', alliance: 'russia', lat: 35.41, lon: 35.95 },
  { name: 'Vladivostok', country: 'RU', type: 'naval', alliance: 'russia', lat: 43.12, lon: 131.9 },
  { name: 'Plesetsk Cosmodrome', country: 'RU', type: 'missile', alliance: 'russia', lat: 62.93, lon: 40.58 },
  { name: 'Engels-2 AB', country: 'RU', type: 'air', alliance: 'russia', lat: 51.48, lon: 46.2 },
  // China
  { name: 'Yulin Naval', country: 'CN', type: 'naval', alliance: 'china', lat: 18.22, lon: 109.55 },
  { name: 'Djibouti Support', country: 'DJ', type: 'naval', alliance: 'china', lat: 11.59, lon: 43.14 },
  { name: 'Fiery Cross Reef', country: 'CN', type: 'joint', alliance: 'china', lat: 9.55, lon: 112.89 },
  { name: 'Subi Reef', country: 'CN', type: 'joint', alliance: 'china', lat: 10.92, lon: 114.08 },
  { name: 'Mischief Reef', country: 'CN', type: 'joint', alliance: 'china', lat: 9.9, lon: 115.53 },
  { name: 'Jiuquan Launch', country: 'CN', type: 'missile', alliance: 'china', lat: 40.96, lon: 100.28 },
  // NATO / US — additional
  { name: 'Lajes Field', country: 'PT', type: 'air', alliance: 'nato', lat: 38.76, lon: -27.09 },
  { name: 'Sigonella NAS', country: 'IT', type: 'naval', alliance: 'nato', lat: 37.4, lon: 14.92 },
  { name: 'Souda Bay', country: 'GR', type: 'naval', alliance: 'nato', lat: 35.49, lon: 24.12 },
  { name: 'Grafenwöhr', country: 'DE', type: 'army', alliance: 'nato', lat: 49.69, lon: 11.94 },
  { name: 'Osan AB', country: 'KR', type: 'air', alliance: 'nato', lat: 37.09, lon: 127.03 },
  { name: 'Misawa AB', country: 'JP', type: 'air', alliance: 'nato', lat: 40.7, lon: 141.37 },
  { name: 'Guam (Andersen AFB)', country: 'GU', type: 'air', alliance: 'nato', lat: 13.58, lon: 144.92 },
  { name: 'Bahrain NSA', country: 'BH', type: 'naval', alliance: 'nato', lat: 26.21, lon: 50.62 },
  { name: 'AFRICOM (Stuttgart)', country: 'DE', type: 'joint', alliance: 'nato', lat: 48.73, lon: 9.1 },
  { name: 'Camp Bondsteel', country: 'XK', type: 'army', alliance: 'nato', lat: 42.37, lon: 21.25 },
  { name: 'Keflavik', country: 'IS', type: 'air', alliance: 'nato', lat: 63.99, lon: -22.61 },
  { name: 'Deveselu', country: 'RO', type: 'missile', alliance: 'nato', lat: 44.05, lon: 24.28 },
  { name: 'Redzikowo', country: 'PL', type: 'missile', alliance: 'nato', lat: 54.48, lon: 17.1 },
  { name: 'Tapa', country: 'EE', type: 'army', alliance: 'nato', lat: 59.26, lon: 25.96 },
  { name: 'Pine Gap', country: 'AU', type: 'joint', alliance: 'nato', lat: -23.8, lon: 133.74 },
  // Russia — additional
  { name: 'Murmansk', country: 'RU', type: 'naval', alliance: 'russia', lat: 68.97, lon: 33.07 },
  { name: 'Kamchatka (Rybachiy)', country: 'RU', type: 'naval', alliance: 'russia', lat: 53.02, lon: 158.65 },
  { name: 'Novosibirsk', country: 'RU', type: 'missile', alliance: 'russia', lat: 55.03, lon: 82.92 },
  { name: 'Baltiisk', country: 'RU', type: 'naval', alliance: 'russia', lat: 54.64, lon: 19.89 },
  { name: 'Khmeimim (expanded)', country: 'SY', type: 'air', alliance: 'russia', lat: 35.41, lon: 35.95 },
  { name: 'Gyumri 102nd', country: 'AM', type: 'army', alliance: 'russia', lat: 40.78, lon: 43.85 },
  { name: 'Kant AB', country: 'KG', type: 'air', alliance: 'russia', lat: 42.85, lon: 74.85 },
  { name: 'Erebuni AB', country: 'AM', type: 'air', alliance: 'russia', lat: 40.1, lon: 44.47 },
  // China — additional
  { name: 'Woody Island', country: 'CN', type: 'joint', alliance: 'china', lat: 16.83, lon: 112.33 },
  { name: 'Haikou Naval', country: 'CN', type: 'naval', alliance: 'china', lat: 20.0, lon: 110.35 },
  { name: 'Zhanjiang Naval', country: 'CN', type: 'naval', alliance: 'china', lat: 21.27, lon: 110.35 },
  { name: 'Korla Test Range', country: 'CN', type: 'missile', alliance: 'china', lat: 41.76, lon: 86.13 },
  { name: 'Ream Naval (Cambodia)', country: 'KH', type: 'naval', alliance: 'china', lat: 10.52, lon: 103.63 },
  // India
  { name: 'INS Kadamba', country: 'IN', type: 'naval', alliance: 'other', lat: 14.79, lon: 74.13 },
  { name: 'Agra AB', country: 'IN', type: 'air', alliance: 'other', lat: 27.16, lon: 77.96 },
  { name: 'Siachen Base Camp', country: 'IN', type: 'army', alliance: 'other', lat: 35.22, lon: 77.11 },
  { name: 'Andaman & Nicobar Command', country: 'IN', type: 'joint', alliance: 'other', lat: 11.75, lon: 92.72 },
  // Other
  { name: 'Djibouti (French)', country: 'DJ', type: 'joint', alliance: 'other', lat: 11.55, lon: 43.15 },
  { name: 'HMAS Stirling', country: 'AU', type: 'naval', alliance: 'other', lat: -32.23, lon: 115.69 },
  { name: 'Yokota AB (Japan ASDF)', country: 'JP', type: 'air', alliance: 'other', lat: 35.75, lon: 139.35 },
  { name: 'Al Dhafra AB', country: 'AE', type: 'air', alliance: 'other', lat: 24.25, lon: 54.55 },
  { name: 'Prince Sultan AB', country: 'SA', type: 'air', alliance: 'other', lat: 24.06, lon: 47.58 },
  { name: 'Changi Naval', country: 'SG', type: 'naval', alliance: 'other', lat: 1.33, lon: 104.0 },
  { name: 'RNZAF Ohakea', country: 'NZ', type: 'air', alliance: 'other', lat: -40.21, lon: 175.39 },
  { name: 'Natal Naval', country: 'BR', type: 'naval', alliance: 'other', lat: -5.91, lon: -35.25 },
  { name: 'Simon Bolivar AB', country: 'VE', type: 'air', alliance: 'other', lat: 10.28, lon: -67.65 },
  { name: 'Ndjili AB', country: 'CD', type: 'air', alliance: 'other', lat: -4.39, lon: 15.45 },
  { name: 'Thies AB', country: 'SN', type: 'air', alliance: 'other', lat: 14.79, lon: -16.96 },
  { name: 'Agadez Drone Base', country: 'NE', type: 'air', alliance: 'nato', lat: 16.97, lon: 7.99 },
];

const ALLIANCE_COLORS: Record<string, string> = {
  nato: '#3b82f6',
  russia: '#ef4444',
  china: '#f59e0b',
  other: '#6b7280',
};

export class MilitaryBasesLayer implements MapDataLayer {
  readonly id = 'military';
  readonly name = 'Military Bases';
  readonly category = 'conflict' as const;
  readonly icon = '⚔';
  readonly description = 'Major military installations worldwide';

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
    // Static data, no refresh needed
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: BASES } }));
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
    return BASES.length;
  }

  private renderLayer(): void {
    if (!this.map) return;
    this.removeLayer();

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: BASES.map((b) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [b.lon, b.lat] },
        properties: {
          name: b.name,
          country: b.country,
          type: b.type,
          alliance: b.alliance,
          color: ALLIANCE_COLORS[b.alliance],
        },
      })),
    };

    this.map.addSource('military', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'military-markers',
      type: 'circle',
      source: 'military',
      paint: {
        'circle-radius': 5,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.85,
      },
    });

    this.map.addLayer({
      id: 'military-labels',
      type: 'symbol',
      source: 'military',
      minzoom: 5,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 9,
        'text-offset': [0, 1.3],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    });

    this.map.on('mouseenter', 'military-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'military-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'military-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(militaryPopup(p))
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['military-labels', 'military-markers']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('military')) this.map.removeSource('military');
    this.popup?.remove();
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
