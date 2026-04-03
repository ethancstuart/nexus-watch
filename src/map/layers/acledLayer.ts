import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';
import { renderPopupCard } from '../PopupCard.ts';

interface AcledEvent {
  id: string;
  date: string;
  type: string;
  subType: string;
  actor1: string;
  actor2: string;
  country: string;
  region: string;
  lat: number;
  lon: number;
  fatalities: number;
  notes: string;
}

const TYPE_COLORS: Record<string, string> = {
  Battles: '#ef4444',
  'Violence against civilians': '#dc2626',
  Explosions: '#f97316',
  'Remote violence': '#f97316',
  Protests: '#eab308',
  Riots: '#f59e0b',
  'Strategic developments': '#8b5cf6',
};

export class AcledLayer implements MapDataLayer {
  readonly id = 'acled';
  readonly name = 'Live Conflicts (ACLED)';
  readonly category = 'conflict' as const;
  readonly icon = '⚔';
  readonly description = 'Real-time armed conflict events from ACLED';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: AcledEvent[] = [];
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
      const res = await fetchWithRetry('/api/acled');
      if (!res.ok) throw new Error('ACLED API error');
      const result = (await res.json()) as { events: AcledEvent[] };
      this.data = result.events;
      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('ACLED layer error:', err);
    }
  }

  getRefreshInterval(): number {
    return 3600_000;
  } // 1 hour
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
          id: e.id,
          type: e.type,
          subType: e.subType,
          actor1: e.actor1,
          actor2: e.actor2,
          country: e.country,
          region: e.region,
          fatalities: e.fatalities,
          date: e.date,
          notes: e.notes,
          color: TYPE_COLORS[e.type] || '#ef4444',
        },
      })),
    };

    this.map.addSource('acled', {
      type: 'geojson',
      data: geojson,
      cluster: true,
      clusterMaxZoom: 8,
      clusterRadius: 40,
    });

    // Clusters
    this.map.addLayer({
      id: 'acled-clusters',
      type: 'circle',
      source: 'acled',
      filter: ['has', 'point_count'],
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 12, 10, 16, 50, 22, 100, 28],
        'circle-color': '#ef4444',
        'circle-opacity': 0.7,
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(239,68,68,0.3)',
      },
    });
    this.map.addLayer({
      id: 'acled-cluster-count',
      type: 'symbol',
      source: 'acled',
      filter: ['has', 'point_count'],
      layout: { 'text-field': '{point_count_abbreviated}', 'text-size': 10, 'text-font': ['Open Sans Bold'] },
      paint: { 'text-color': '#ffffff' },
    });

    // Individual events
    this.map.addLayer({
      id: 'acled-points',
      type: 'circle',
      source: 'acled',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'fatalities'], 0, 3, 5, 6, 20, 10, 100, 16],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.2)',
        'circle-opacity': 0.8,
      },
    });

    // Hover
    this.map.on('mouseenter', 'acled-points', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'acled-points', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'acled-points', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, className: 'eq-popup', offset: 10 })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: String(p.type),
            typeColor: String(p.color),
            title: `${p.actor1}${p.actor2 ? ` vs ${p.actor2}` : ''}`,
            fields: [
              { label: 'Location', value: `${p.region}, ${p.country}` },
              { label: 'Date', value: String(p.date) },
              {
                label: 'Fatalities',
                value: String(p.fatalities),
                color: Number(p.fatalities) > 0 ? '#ef4444' : undefined,
              },
            ],
          }),
        )
        .addTo(this.map);
    });

    // Click cluster to zoom
    this.map.on('click', 'acled-clusters', (e) => {
      if (!this.map || !e.features?.length) return;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.map.flyTo({ center: [coords[0], coords[1]], zoom: this.map.getZoom() + 2, duration: 500 });
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['acled-points', 'acled-cluster-count', 'acled-clusters']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('acled')) this.map.removeSource('acled');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
