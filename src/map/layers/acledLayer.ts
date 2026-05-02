import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer, LayerFilterSchema } from './LayerDefinition.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { cacheLayerData, getCachedLayerData } from '../../utils/layerCache.ts';
import { updateProvenance, SOURCE_REGISTRY } from '../../services/dataProvenance.ts';

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
    const reg = SOURCE_REGISTRY[this.id];
    try {
      const res = await fetchWithRetry('/api/acled');
      if (!res.ok) throw new Error('ACLED API error');
      const result = (await res.json()) as { events: AcledEvent[] };
      this.data = result.events;
      this.lastUpdated = Date.now();
      cacheLayerData(this.id, this.data);
      if (reg) updateProvenance(this.id, { ...reg, dataPointCount: this.data.length, lastFetchOk: true });
    } catch (err) {
      console.error('ACLED layer error:', err);
      const cached = getCachedLayerData<AcledEvent[]>(this.id);
      if (cached && cached.length > 0) this.data = cached;
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.data.length,
          lastFetchOk: false,
          lastError: err instanceof Error ? err.message : String(err),
        });
    }
    if (this.enabled && this.data.length > 0) this.renderLayer();
    document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
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

  /**
   * 2026-05-02 W4: per-layer filter schema. Two axes:
   *   - time: rolling window for events to display (1h/24h/7d/30d/all)
   *   - severity: minimum fatality threshold to display
   */
  getFilterSchema(): LayerFilterSchema {
    return {
      controls: [
        {
          id: 'time',
          label: 'Time window',
          defaultValue: 'all',
          options: [
            { value: '24h', label: '24h' },
            { value: '7d', label: '7d' },
            { value: '30d', label: '30d' },
            { value: 'all', label: 'All' },
          ],
        },
        {
          id: 'severity',
          label: 'Min fatalities',
          defaultValue: '0',
          options: [
            { value: '0', label: 'All' },
            { value: '1', label: '≥1' },
            { value: '5', label: '≥5' },
            { value: '20', label: '≥20' },
          ],
        },
      ],
    };
  }

  applyFilter(filters: Record<string, string>): void {
    if (!this.map) return;
    const time = filters.time || 'all';
    const minFatal = parseInt(filters.severity || '0', 10);
    const cutoffMs =
      time === 'all' ? 0 : Date.now() - (time === '24h' ? 86400e3 : time === '7d' ? 7 * 86400e3 : 30 * 86400e3);
    const filterExpr: maplibregl.FilterSpecification = [
      'all',
      ['>=', ['get', 'fatalities'], minFatal],
      cutoffMs > 0 ? ['>=', ['to-number', ['slice', ['get', 'date'], 0, 10]], 0] : ['>=', ['get', 'fatalities'], 0],
    ];
    // For time we re-render the geojson source filtered, since 'date' is a
    // string and MapLibre filter expression handling for date math is brittle.
    if (cutoffMs > 0 && this.data.length > 0) {
      const filtered = this.data.filter((e) => new Date(e.date).getTime() >= cutoffMs && e.fatalities >= minFatal);
      const src = this.map.getSource('acled') as { setData?: (d: unknown) => void } | undefined;
      const heatSrc = this.map.getSource('acled-heat') as { setData?: (d: unknown) => void } | undefined;
      const fc = {
        type: 'FeatureCollection',
        features: filtered.map((e) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [e.lon, e.lat] },
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
      src?.setData?.(fc);
      heatSrc?.setData?.(fc);
    } else {
      // No time filter — push the severity filter through MapLibre directly
      // so re-rendering is cheap.
      try {
        if (this.map.getLayer('acled-points')) this.map.setFilter('acled-points', filterExpr);
      } catch {
        /* ignore */
      }
    }
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

    // Separate non-clustered source for heatmap
    this.map.addSource('acled-heat', { type: 'geojson', data: geojson });

    // Casualty heatmap (visible at low zoom)
    this.map.addLayer({
      id: 'acled-heatmap',
      type: 'heatmap',
      source: 'acled-heat',
      maxzoom: 7,
      paint: {
        'heatmap-weight': ['interpolate', ['linear'], ['get', 'fatalities'], 0, 0.1, 5, 0.4, 20, 0.7, 100, 1],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.3, 5, 1, 7, 2],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(0,0,0,0)',
          0.2,
          'rgba(255,60,60,0.2)',
          0.4,
          'rgba(255,60,60,0.4)',
          0.6,
          'rgba(255,30,0,0.6)',
          0.8,
          'rgba(255,0,0,0.8)',
          1,
          'rgba(255,0,0,1)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 4, 3, 10, 5, 20, 7, 30],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 7, 0.4],
      },
    });

    // Clusters
    this.map.addLayer({
      id: 'acled-clusters',
      type: 'circle',
      source: 'acled',
      filter: ['has', 'point_count'],
      paint: {
        'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 30, 100, 40],
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
        'circle-radius': ['interpolate', ['linear'], ['get', 'fatalities'], 0, 5, 5, 10, 20, 18, 100, 28],
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
    for (const id of ['acled-points', 'acled-cluster-count', 'acled-clusters', 'acled-heatmap']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('acled')) this.map.removeSource('acled');
    if (this.map.getSource('acled-heat')) this.map.removeSource('acled-heat');
    this.popup?.remove();
  }
  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
