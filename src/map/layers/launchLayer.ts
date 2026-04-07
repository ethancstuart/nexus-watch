import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';

interface LaunchData {
  provider: string;
  country: string;
  lat: number;
  lon: number;
  date: string;
  vehicle: string;
  mission: string;
  status: string;
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

export class LaunchLayer implements MapDataLayer {
  readonly id = 'launches';
  readonly name = 'Space Launches';
  readonly category = 'infrastructure' as const;
  readonly icon = '🚀';
  readonly description = 'Upcoming rocket launches from Launch Library 2';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: LaunchData[] = [];
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
      const res = await fetchWithRetry('/api/launches');
      const json = await res.json();
      if (json.launches?.length > 0) {
        this.data = json.launches;
        this.lastUpdated = Date.now();
        if (this.enabled) this.renderLayer();
      }
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Launch layer refresh error:', err);
    }
  }

  getRefreshInterval(): number {
    return 300_000; // 5 minutes
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
      features: this.data.map((s) => {
        const days = daysUntil(s.date);
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] },
          properties: {
            provider: s.provider,
            country: s.country,
            vehicle: s.vehicle,
            mission: s.mission,
            date: s.date.split('T')[0],
            days,
            status: s.status,
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
              { label: 'Provider', value: String(p.provider) },
              { label: 'Status', value: String(p.status) },
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
