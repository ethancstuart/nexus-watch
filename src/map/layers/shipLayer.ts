import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { fetchVessels, type Vessel } from '../../services/ships.ts';
import { renderPopupCard } from '../PopupCard.ts';

const TYPE_COLORS: Record<string, string> = {
  cargo: '#3b82f6',
  tanker: '#f59e0b',
  passenger: '#00ff00',
  military: '#ef4444',
};

export class ShipLayer implements MapDataLayer {
  readonly id = 'ships';
  readonly name = 'Ship Tracking';
  readonly category = 'infrastructure' as const;
  readonly icon = '🚢';
  readonly description = 'Vessel positions in major shipping lanes';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: Vessel[] = [];
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
    try {
      this.data = await fetchVessels();
      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Ship layer refresh error:', err);
    }
  }

  getRefreshInterval(): number {
    return 30_000; // 30 seconds
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
      features: this.data.map((v) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [v.lon, v.lat] },
        properties: {
          name: v.name,
          type: v.type,
          flag: v.flag,
          heading: v.heading,
          speed: v.speed,
          mmsi: v.mmsi,
          color: TYPE_COLORS[v.type] || '#6b7280',
        },
      })),
    };

    this.map.addSource('ships', { type: 'geojson', data: geojson });

    // Ship trail glow
    this.map.addLayer({
      id: 'ships-glow',
      type: 'circle',
      source: 'ships',
      paint: {
        'circle-radius': 10,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.1,
        'circle-blur': 0.6,
      },
    });

    // Ship markers — military are larger
    this.map.addLayer({
      id: 'ships-markers',
      type: 'circle',
      source: 'ships',
      paint: {
        'circle-radius': ['match', ['get', 'type'], 'military', 5, 4],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.85,
      },
    });

    // Labels at higher zoom
    this.map.addLayer({
      id: 'ships-labels',
      type: 'symbol',
      source: 'ships',
      minzoom: 5,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 9,
        'text-offset': [0, 1.3],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000',
        'text-halo-width': 1,
      },
    });

    // Hover
    this.map.on('mouseenter', 'ships-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'ships-markers', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'ships-markers', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 10,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `${String(p.type).toUpperCase()} VESSEL`,
            typeColor: String(p.color),
            title: String(p.name),
            fields: [
              { label: 'Flag', value: String(p.flag) },
              { label: 'Speed', value: `${Number(p.speed).toFixed(0)} kts` },
              { label: 'Heading', value: `${Number(p.heading).toFixed(0)}°` },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['ships-labels', 'ships-markers', 'ships-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('ships')) this.map.removeSource('ships');
    this.popup?.remove();
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
