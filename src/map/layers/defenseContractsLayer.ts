import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { updateProvenance } from '../../services/dataProvenance.ts';

/**
 * Defense Contracts Layer
 * Static curated list of major defense deliveries / FMS contracts.
 */

interface DefenseContract {
  item: string;
  buyer: string;
  seller: string;
  /** Delivery location. */
  lat: number;
  lon: number;
  /** Contract value in USD billions. */
  valueBillionsUsd: number;
  year: number;
  status: 'delivered' | 'in-delivery' | 'signed';
}

const CONTRACTS: DefenseContract[] = [
  {
    item: 'F-35A (35 units)',
    buyer: 'Germany',
    seller: 'Lockheed Martin (US)',
    lat: 50.02,
    lon: 8.54,
    valueBillionsUsd: 8.4,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'F-35B (48 units)',
    buyer: 'United Kingdom',
    seller: 'Lockheed Martin (US)',
    lat: 52.62,
    lon: -0.85,
    valueBillionsUsd: 11.0,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'F-35A (105 units)',
    buyer: 'Japan',
    seller: 'Lockheed Martin (US)',
    lat: 35.68,
    lon: 139.69,
    valueBillionsUsd: 23.1,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'Patriot PAC-3 (8 batteries)',
    buyer: 'Poland',
    seller: 'Raytheon (US)',
    lat: 52.23,
    lon: 21.01,
    valueBillionsUsd: 15.0,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'HIMARS (20 launchers)',
    buyer: 'Ukraine',
    seller: 'Lockheed Martin (US)',
    lat: 50.45,
    lon: 30.52,
    valueBillionsUsd: 1.2,
    year: 2025,
    status: 'delivered',
  },
  {
    item: 'Iron Dome tech transfer',
    buyer: 'Germany',
    seller: 'Rafael (IL)',
    lat: 52.52,
    lon: 13.4,
    valueBillionsUsd: 3.5,
    year: 2026,
    status: 'signed',
  },
  {
    item: 'F-35I (50 units)',
    buyer: 'Israel',
    seller: 'Lockheed Martin (US)',
    lat: 32.08,
    lon: 34.78,
    valueBillionsUsd: 7.0,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'Abrams M1A2 (250 units)',
    buyer: 'Poland',
    seller: 'General Dynamics (US)',
    lat: 52.23,
    lon: 21.01,
    valueBillionsUsd: 6.0,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'F-35A (40 units)',
    buyer: 'South Korea',
    seller: 'Lockheed Martin (US)',
    lat: 37.57,
    lon: 126.98,
    valueBillionsUsd: 5.8,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'Rafale F3R (26 units)',
    buyer: 'India',
    seller: 'Dassault (FR)',
    lat: 28.61,
    lon: 77.21,
    valueBillionsUsd: 8.9,
    year: 2026,
    status: 'signed',
  },
  {
    item: 'K2 Black Panther (180 tanks)',
    buyer: 'Poland',
    seller: 'Hyundai Rotem (KR)',
    lat: 52.4,
    lon: 16.93,
    valueBillionsUsd: 5.8,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'Tomahawk Block V (400)',
    buyer: 'Japan',
    seller: 'Raytheon (US)',
    lat: 35.68,
    lon: 139.69,
    valueBillionsUsd: 2.35,
    year: 2026,
    status: 'signed',
  },
  {
    item: 'NASAMS (3 batteries)',
    buyer: 'Ukraine',
    seller: 'Kongsberg (NO) / RTX',
    lat: 50.45,
    lon: 30.52,
    valueBillionsUsd: 1.1,
    year: 2025,
    status: 'delivered',
  },
  {
    item: 'Typhon Mid-Range system',
    buyer: 'Philippines',
    seller: 'US Army',
    lat: 18.2,
    lon: 120.58,
    valueBillionsUsd: 0.9,
    year: 2026,
    status: 'delivered',
  },
  {
    item: 'AUKUS Virginia-class SSN',
    buyer: 'Australia',
    seller: 'US / UK',
    lat: -32.05,
    lon: 115.77,
    valueBillionsUsd: 245.0,
    year: 2026,
    status: 'signed',
  },
  {
    item: 'Su-35 (24 units)',
    buyer: 'Iran',
    seller: 'UAC (RU)',
    lat: 35.69,
    lon: 51.39,
    valueBillionsUsd: 2.0,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'CH-4 combat UAVs (20)',
    buyer: 'Saudi Arabia',
    seller: 'CASC (CN)',
    lat: 24.71,
    lon: 46.67,
    valueBillionsUsd: 0.5,
    year: 2025,
    status: 'delivered',
  },
  {
    item: 'F-16 Block 70 (66)',
    buyer: 'Taiwan',
    seller: 'Lockheed Martin (US)',
    lat: 25.03,
    lon: 121.57,
    valueBillionsUsd: 8.0,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'THAAD battery',
    buyer: 'UAE',
    seller: 'Lockheed Martin (US)',
    lat: 24.47,
    lon: 54.37,
    valueBillionsUsd: 3.5,
    year: 2026,
    status: 'signed',
  },
  {
    item: 'Type 26 Frigate (9)',
    buyer: 'United Kingdom',
    seller: 'BAE Systems (UK)',
    lat: 55.86,
    lon: -4.25,
    valueBillionsUsd: 10.3,
    year: 2026,
    status: 'in-delivery',
  },
  {
    item: 'Stryker ICV (300)',
    buyer: 'Bulgaria',
    seller: 'General Dynamics (US)',
    lat: 42.7,
    lon: 23.32,
    valueBillionsUsd: 1.5,
    year: 2026,
    status: 'signed',
  },
];

function colorForValue(v: number): string {
  if (v >= 20) return '#dc2626';
  if (v >= 5) return '#f97316';
  if (v >= 1) return '#eab308';
  return '#a3e635';
}

export class DefenseContractsLayer implements MapDataLayer {
  readonly id = 'defense-contracts';
  readonly name = 'Defense Contracts (Reference)';
  readonly category = 'intelligence' as const;
  readonly icon = '🎯';
  readonly description = 'Major defense contracts and arms deliveries by location';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: DefenseContract[] = CONTRACTS;
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
    this.data = CONTRACTS;
    this.lastUpdated = Date.now();
    updateProvenance(this.id, {
      source: 'NexusWatch Curated (SIPRI + DSCA FMS + public filings)',
      sourceUrl: 'https://www.sipri.org/databases/armstransfers',
      refreshIntervalMs: 86_400_000,
      methodology:
        'Curated list of major defense contracts drawn from SIPRI arms transfer database, US DSCA foreign military sales filings, and public corporate disclosures.',
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
      features: this.data.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
        properties: {
          item: c.item,
          buyer: c.buyer,
          seller: c.seller,
          value: c.valueBillionsUsd,
          year: c.year,
          status: c.status,
          color: colorForValue(c.valueBillionsUsd),
        },
      })),
    };

    this.map.addSource('defense-contracts', { type: 'geojson', data: geojson });

    this.map.addLayer({
      id: 'defense-contracts-glow',
      type: 'circle',
      source: 'defense-contracts',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'value'], 0, 12, 10, 20, 100, 32],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.15,
        'circle-blur': 1,
      },
    });

    // Diamond via symbol
    this.map.addLayer({
      id: 'defense-contracts-symbol',
      type: 'symbol',
      source: 'defense-contracts',
      layout: {
        'text-field': '◆',
        'text-size': ['interpolate', ['linear'], ['get', 'value'], 0, 14, 10, 22, 100, 32],
        'text-allow-overlap': true,
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000000',
        'text-halo-width': 1.2,
      },
    });

    this.map.on('mouseenter', 'defense-contracts-symbol', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'defense-contracts-symbol', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'defense-contracts-symbol', (e) => {
      if (!this.map || !e.features?.length) return;
      const f = e.features[0];
      const p = f.properties!;
      const coords = (f.geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 12 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: 'DEFENSE CONTRACT',
            typeColor: String(p.color),
            title: String(p.item),
            fields: [
              { label: 'Buyer', value: String(p.buyer) },
              { label: 'Seller', value: String(p.seller) },
              { label: 'Value', value: `$${Number(p.value).toFixed(1)}B` },
              { label: 'Year', value: String(p.year) },
              { label: 'Status', value: String(p.status) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['defense-contracts-symbol', 'defense-contracts-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('defense-contracts')) this.map.removeSource('defense-contracts');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
