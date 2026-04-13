import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { newsPopup } from '../PopupCard.ts';
import type { GdeltArticle } from '../../types/index.ts';
import { fetchGdeltArticles } from '../../services/gdelt.ts';
import { updateProvenance, SOURCE_REGISTRY } from '../../services/dataProvenance.ts';

// Tone → color (negative=red, neutral=yellow, positive=green)
function toneToColor(tone: number): string {
  if (tone < -3) return '#ef4444';
  if (tone < -1) return '#f97316';
  if (tone < 1) return '#eab308';
  if (tone < 3) return '#84cc16';
  return '#00ff00';
}

export class NewsLayer implements MapDataLayer {
  readonly id = 'news';
  readonly name = 'Global News';
  readonly category = 'intelligence' as const;
  readonly icon = '📰';
  readonly description = 'Geolocated news events from GDELT';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: GdeltArticle[] = [];
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
      this.data = await fetchGdeltArticles();
      this.lastUpdated = Date.now();
      if (reg) updateProvenance(this.id, { ...reg, dataPointCount: this.data.length, lastFetchOk: true });
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('News layer refresh error:', err);
      if (reg)
        updateProvenance(this.id, {
          ...reg,
          dataPointCount: this.data.length,
          lastFetchOk: false,
          lastError: err instanceof Error ? err.message : String(err),
        });
    }
  }

  getRefreshInterval(): number {
    return 900_000; // 15 minutes
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

    // Cluster articles by location (round to ~1 degree grid)
    const clusters = new Map<string, { lat: number; lon: number; articles: GdeltArticle[] }>();
    for (const article of this.data) {
      if (article.lat === 0 && article.lon === 0) continue;
      const key = `${Math.round(article.lat)},${Math.round(article.lon)}`;
      if (!clusters.has(key)) {
        clusters.set(key, { lat: article.lat, lon: article.lon, articles: [] });
      }
      clusters.get(key)!.articles.push(article);
    }

    const geojson: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: Array.from(clusters.values()).map((c) => {
        const avgTone = c.articles.reduce((sum, a) => sum + a.tone, 0) / c.articles.length;
        return {
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [c.lon, c.lat] },
          properties: {
            count: c.articles.length,
            tone: avgTone,
            title: c.articles[0].title,
            source: c.articles[0].source,
            country: c.articles[0].sourceCountry,
            color: toneToColor(avgTone),
          },
        };
      }),
    };

    this.map.addSource('news-events', { type: 'geojson', data: geojson });

    // Glow ring
    this.map.addLayer({
      id: 'news-glow',
      type: 'circle',
      source: 'news-events',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 8, 5, 16, 10, 24, 20, 36],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.15,
        'circle-blur': 0.8,
      },
    });

    // Core dot
    this.map.addLayer({
      id: 'news-core',
      type: 'circle',
      source: 'news-events',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 4, 5, 8, 10, 12, 20, 18],
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 1,
        'circle-stroke-color': 'rgba(255,255,255,0.2)',
        'circle-opacity': 0.8,
      },
    });

    // Count labels for clusters with 3+ articles
    this.map.addLayer({
      id: 'news-labels',
      type: 'symbol',
      source: 'news-events',
      filter: ['>=', ['get', 'count'], 3],
      layout: {
        'text-field': ['to-string', ['get', 'count']],
        'text-size': 10,
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    });

    // Hover popup
    this.map.on('mouseenter', 'news-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', 'news-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });

    this.map.on('mousemove', 'news-core', (e) => {
      if (!this.map || !e.features?.length) return;
      const f = e.features[0];
      const props = f.properties!;
      const coords = (f.geometry as GeoJSON.Point).coordinates;

      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 12,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(newsPopup(props))
        .addTo(this.map);
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['news-labels', 'news-core', 'news-glow']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('news-events')) this.map.removeSource('news-events');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}
