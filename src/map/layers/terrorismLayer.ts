import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { updateProvenance } from '../../services/dataProvenance.ts';

/**
 * Terrorism / Extremist Events Layer
 * Filters ACLED data for terrorism-classified events.
 */

interface TerrorEvent {
  lat: number;
  lon: number;
  event_type?: string;
  country?: string;
  fatalities?: number;
  actor?: string;
}

export class TerrorismLayer implements MapDataLayer {
  readonly id = 'terrorism';
  readonly name = 'Terrorism Events (Reference)';
  readonly category = 'conflict' as const;
  readonly icon = '⚠️';
  readonly description = 'Terrorism and extremist activity (filtered from ACLED)';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private data: TerrorEvent[] = [];

  init(map: MaplibreMap): void {
    this.map = map;
    document.addEventListener('dashview:layer-data', ((e: CustomEvent) => {
      const d = e.detail as { layerId: string; data: unknown };
      if (d.layerId === 'acled') {
        const acled = d.data as Array<Record<string, unknown>>;
        this.data = acled
          .filter((ev) => {
            const t = String(ev.event_type || '').toLowerCase();
            const notes = String(ev.notes || ev.actor1 || '').toLowerCase();
            return (
              t.includes('terror') ||
              t.includes('explosion') ||
              t.includes('remote violence') ||
              notes.includes('isis') ||
              notes.includes('taliban') ||
              notes.includes('al-shabaab') ||
              notes.includes('boko haram') ||
              notes.includes('al-qaeda') ||
              notes.includes('jihad')
            );
          })
          .map((ev) => ({
            lat: Number(ev.lat),
            lon: Number(ev.lon),
            event_type: String(ev.event_type || ''),
            country: String(ev.country || ''),
            fatalities: Number(ev.fatalities) || 0,
            actor: String(ev.actor1 || ''),
          }))
          .filter((e) => !isNaN(e.lat) && !isNaN(e.lon));

        updateProvenance(this.id, {
          source: 'ACLED (terrorism filter)',
          sourceUrl: 'https://acleddata.com/',
          refreshIntervalMs: 3_600_000,
          methodology: 'Derived from ACLED data — events matching terror/extremist keywords',
          dataPointCount: this.data.length,
          lastFetchOk: true,
        });

        if (this.enabled) this.renderLayer();
        document.dispatchEvent(
          new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }),
        );
      }
    }) as EventListener);
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
    /* passive — derives from acled layer */
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
    return this.data.length;
  }

  private renderLayer(): void {
    if (!this.map || this.data.length === 0) return;
    this.removeLayer();
    this.map.addSource('terrorism', {
      type: 'geojson',
      data: {
        type: 'FeatureCollection',
        features: this.data.map((e) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] },
          properties: { ...e },
        })),
      },
    });
    this.map.addLayer({
      id: 'terrorism-glow',
      type: 'circle',
      source: 'terrorism',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'fatalities'], 0, 8, 10, 14, 50, 22, 100, 32],
        'circle-color': '#b91c1c',
        'circle-opacity': 0.15,
        'circle-blur': 1.2,
      },
    });
    this.map.addLayer({
      id: 'terrorism-dot',
      type: 'circle',
      source: 'terrorism',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'fatalities'], 0, 3, 10, 5, 50, 8, 100, 12],
        'circle-color': '#dc2626',
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.5)',
      },
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['terrorism-dot', 'terrorism-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('terrorism')) this.map.removeSource('terrorism');
  }
  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
