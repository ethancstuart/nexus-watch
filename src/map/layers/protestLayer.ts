import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { renderPopupCard } from '../PopupCard.ts';
import { cacheLayerData, getCachedLayerData } from '../../utils/layerCache.ts';
import { updateProvenance, SOURCE_REGISTRY } from '../../services/dataProvenance.ts';

/**
 * Global Protest Index Layer
 *
 * Aggregates protest/riot events from existing ACLED and GDELT layer data
 * to produce a protest intensity heat map. Listens for layer-data events
 * from ACLED and GDELT, filters for protest/riot events, computes per-country
 * protest intensity scores, and renders a heat map + summary markers.
 */

interface ProtestEvent {
  lat: number;
  lon: number;
  country: string;
  type: string;
  date: string;
  notes: string;
  fatalities: number;
  source: 'acled' | 'gdelt';
}

interface CountryProtestIndex {
  country: string;
  lat: number;
  lon: number;
  eventCount: number;
  intensity: 'extreme' | 'high' | 'elevated' | 'moderate' | 'low';
  intensityScore: number;
  fatalityCount: number;
  recentEvents: string[];
}

// Country centroids for aggregated markers
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  Afghanistan: [33.9, 67.7],
  Argentina: [-34.6, -58.4],
  Bangladesh: [23.7, 90.4],
  Brazil: [-15.8, -47.9],
  Colombia: [4.6, -74.3],
  'DR Congo': [-1.5, 29.0],
  Egypt: [30.0, 31.2],
  Ethiopia: [9.1, 40.5],
  France: [48.9, 2.3],
  Germany: [52.5, 13.4],
  Haiti: [18.5, -72.3],
  India: [20.6, 78.9],
  Indonesia: [-2.5, 118.0],
  Iran: [32.4, 53.7],
  Iraq: [33.2, 43.7],
  Israel: [31.8, 35.2],
  Kenya: [-1.3, 36.8],
  Lebanon: [33.9, 35.5],
  Mexico: [19.4, -99.1],
  Myanmar: [19.8, 96.1],
  Nigeria: [9.1, 7.5],
  Pakistan: [30.4, 69.3],
  Palestine: [31.9, 35.2],
  Peru: [-12.0, -77.0],
  Philippines: [14.6, 121.0],
  Russia: [55.8, 37.6],
  Somalia: [2.0, 45.3],
  'South Africa': [-33.9, 18.4],
  Sudan: [15.5, 32.5],
  Syria: [34.8, 38.9],
  Thailand: [13.8, 100.5],
  Turkey: [39.9, 32.9],
  Ukraine: [50.4, 30.5],
  'United Kingdom': [51.5, -0.1],
  'United States': [38.9, -77.0],
  Venezuela: [8.0, -66.0],
  Yemen: [15.6, 48.5],
};

const INTENSITY_COLORS: Record<string, string> = {
  extreme: '#dc2626',
  high: '#f97316',
  elevated: '#eab308',
  moderate: '#6366f1',
  low: '#22c55e',
};

export class ProtestLayer implements MapDataLayer {
  readonly id = 'protests';
  readonly name = 'Global Protest Index';
  readonly category = 'conflict' as const;
  readonly icon = '✊';
  readonly description = 'Protest intensity heat map from ACLED + GDELT conflict/unrest events';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private events: ProtestEvent[] = [];
  private countryIndex: CountryProtestIndex[] = [];
  private popup: maplibregl.Popup | null = null;

  // Cached data from ACLED and GDELT layers
  private acledEvents: Array<{
    lat: number;
    lon: number;
    country: string;
    type: string;
    date: string;
    notes: string;
    fatalities: number;
  }> = [];
  private gdeltEvents: Array<{
    lat: number;
    lon: number;
    country: string;
    title: string;
  }> = [];

  private onLayerData = (e: Event) => {
    const detail = (e as CustomEvent).detail as { layerId: string; data: unknown[] };
    if (detail.layerId === 'acled') {
      this.acledEvents = (
        detail.data as Array<{
          lat: number;
          lon: number;
          country: string;
          type: string;
          date: string;
          notes: string;
          fatalities: number;
        }>
      ).filter(
        (d) => d.type === 'Protests' || d.type === 'Riots' || d.type?.includes('Protest') || d.type?.includes('Riot'),
      );
    } else if (detail.layerId === 'news') {
      // GDELT news events — filter for protest-related
      this.gdeltEvents = (
        detail.data as Array<{
          lat: number;
          lon: number;
          country: string;
          title: string;
          tone: number;
        }>
      ).filter((d) => {
        const title = (d.title || '').toLowerCase();
        return (
          title.includes('protest') ||
          title.includes('demonstrat') ||
          title.includes('riot') ||
          title.includes('unrest') ||
          title.includes('march') ||
          title.includes('rally')
        );
      });
    }
  };

  init(map: MaplibreMap): void {
    this.map = map;
    document.addEventListener('dashview:layer-data', this.onLayerData);
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
      this.events = this.aggregateEvents();
      this.countryIndex = this.computeCountryIndex();
      this.lastUpdated = Date.now();
      cacheLayerData(this.id, { events: this.events, countryIndex: this.countryIndex });
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.events.length,
          lastFetchOk: true,
        });
    } catch (err) {
      console.error('Protest layer compute error:', err);
      const cached = getCachedLayerData<{
        events: ProtestEvent[];
        countryIndex: CountryProtestIndex[];
      }>(this.id);
      if (cached) {
        this.events = cached.events;
        this.countryIndex = cached.countryIndex;
      }
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.events.length,
          lastFetchOk: false,
          lastError: err instanceof Error ? err.message : String(err),
        });
    }
    if (this.enabled && this.events.length > 0) this.renderLayer();
    document.dispatchEvent(
      new CustomEvent('dashview:layer-data', {
        detail: { layerId: this.id, data: this.events },
      }),
    );
  }

  getRefreshInterval(): number {
    return 3_600_000; // 1 hour
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getLastUpdated(): number | null {
    return this.lastUpdated;
  }

  getFeatureCount(): number {
    return this.events.length;
  }

  private aggregateEvents(): ProtestEvent[] {
    const events: ProtestEvent[] = [];

    // ACLED protest/riot events
    for (const e of this.acledEvents) {
      events.push({
        lat: e.lat,
        lon: e.lon,
        country: e.country,
        type: e.type,
        date: e.date,
        notes: e.notes,
        fatalities: e.fatalities,
        source: 'acled',
      });
    }

    // GDELT protest-related news
    for (const e of this.gdeltEvents) {
      events.push({
        lat: e.lat,
        lon: e.lon,
        country: e.country,
        type: 'Protest (news)',
        date: new Date().toISOString().slice(0, 10),
        notes: e.title,
        fatalities: 0,
        source: 'gdelt',
      });
    }

    return events;
  }

  private computeCountryIndex(): CountryProtestIndex[] {
    const byCountry = new Map<string, ProtestEvent[]>();
    for (const e of this.events) {
      const key = e.country;
      if (!byCountry.has(key)) byCountry.set(key, []);
      byCountry.get(key)!.push(e);
    }

    const index: CountryProtestIndex[] = [];
    for (const [country, events] of byCountry) {
      const coords = COUNTRY_CENTROIDS[country];
      if (!coords) continue;

      const eventCount = events.length;
      const fatalityCount = events.reduce((sum, e) => sum + e.fatalities, 0);
      // Score: event count weighted + fatality bonus
      const intensityScore = Math.min(eventCount * 5 + fatalityCount * 2, 100);

      let intensity: CountryProtestIndex['intensity'];
      if (intensityScore >= 80) intensity = 'extreme';
      else if (intensityScore >= 50) intensity = 'high';
      else if (intensityScore >= 30) intensity = 'elevated';
      else if (intensityScore >= 15) intensity = 'moderate';
      else intensity = 'low';

      index.push({
        country,
        lat: coords[0],
        lon: coords[1],
        eventCount,
        intensity,
        intensityScore,
        fatalityCount,
        recentEvents: events.slice(0, 3).map((e) => e.notes || e.type),
      });
    }

    return index.sort((a, b) => b.intensityScore - a.intensityScore);
  }

  private renderLayer(): void {
    if (!this.map || this.events.length === 0) return;
    this.removeLayer();

    // Individual protest event points for heatmap
    const heatGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.events.map((e) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [e.lon, e.lat] },
        properties: {
          weight: e.fatalities > 0 ? 1 + Math.min(e.fatalities / 10, 1) : 0.5,
        },
      })),
    };

    // Country-level summary markers
    const summaryGeoJson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: this.countryIndex.map((c) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
        properties: {
          country: c.country,
          eventCount: c.eventCount,
          intensity: c.intensity,
          intensityScore: c.intensityScore,
          fatalityCount: c.fatalityCount,
          recentEvents: c.recentEvents.join(' | '),
          color: INTENSITY_COLORS[c.intensity],
        },
      })),
    };

    this.map.addSource('protests-heat', { type: 'geojson', data: heatGeoJson });
    this.map.addSource('protests-summary', { type: 'geojson', data: summaryGeoJson });

    // Protest density heatmap
    this.map.addLayer({
      id: 'protests-heatmap',
      type: 'heatmap',
      source: 'protests-heat',
      paint: {
        'heatmap-weight': ['get', 'weight'],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.3, 4, 1, 8, 2],
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(0,0,0,0)',
          0.15,
          'rgba(234,179,8,0.15)',
          0.3,
          'rgba(234,179,8,0.3)',
          0.5,
          'rgba(249,115,22,0.45)',
          0.7,
          'rgba(239,68,68,0.6)',
          0.85,
          'rgba(220,38,38,0.75)',
          1,
          'rgba(185,28,28,0.9)',
        ],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 3, 16, 5, 28, 8, 40],
        'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 9, 0.4],
      },
    });

    // Country summary markers (visible at higher zoom or always)
    this.map.addLayer({
      id: 'protests-summary-glow',
      type: 'circle',
      source: 'protests-summary',
      minzoom: 2,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'intensityScore'], 10, 10, 30, 16, 60, 24, 100, 32],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.1,
        'circle-blur': 0.6,
      },
    });

    this.map.addLayer({
      id: 'protests-summary-dot',
      type: 'circle',
      source: 'protests-summary',
      minzoom: 2,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'eventCount'], 1, 5, 10, 8, 30, 12, 100, 18],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1.5,
        'circle-stroke-color': 'rgba(255,255,255,0.3)',
        'circle-opacity': 0.85,
      },
    });

    // Event count labels
    this.map.addLayer({
      id: 'protests-summary-labels',
      type: 'symbol',
      source: 'protests-summary',
      minzoom: 3,
      layout: {
        'text-field': ['concat', ['get', 'country'], '\n', ['to-string', ['get', 'eventCount']], ' events'],
        'text-size': 9,
        'text-offset': [0, 2],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': ['get', 'color'],
        'text-halo-color': '#000',
        'text-halo-width': 1,
      },
    });

    // Hover on summary dots
    this.map.on('mouseenter', 'protests-summary-dot', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });
    this.map.on('mouseleave', 'protests-summary-dot', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });
    this.map.on('mousemove', 'protests-summary-dot', (e) => {
      if (!this.map || !e.features?.length) return;
      const p = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 12,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(
          renderPopupCard({
            type: `${String(p.intensity).toUpperCase()} PROTEST ACTIVITY`,
            typeColor: String(p.color),
            title: String(p.country),
            fields: [
              { label: 'Events', value: String(p.eventCount), color: String(p.color) },
              { label: 'Intensity', value: `${p.intensityScore}/100` },
              {
                label: 'Fatalities',
                value: String(p.fatalityCount),
                color: Number(p.fatalityCount) > 0 ? '#ef4444' : undefined,
              },
              { label: 'Recent', value: String(p.recentEvents).slice(0, 120) },
            ],
          }),
        )
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['protests-summary-labels', 'protests-summary-dot', 'protests-summary-glow', 'protests-heatmap']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    for (const src of ['protests-heat', 'protests-summary']) {
      if (this.map.getSource(src)) this.map.removeSource(src);
    }
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    document.removeEventListener('dashview:layer-data', this.onLayerData);
    this.events = [];
    this.countryIndex = [];
    this.map = null;
  }
}
