import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import type { GdeltArticle } from '../../types/index.ts';

export class SentimentLayer implements MapDataLayer {
  readonly id = 'sentiment';
  readonly name = 'News Sentiment';
  readonly category = 'intelligence' as const;
  readonly icon = '📊';
  readonly description = 'GDELT news tone heatmap — red (negative) to green (positive)';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;

  init(map: MaplibreMap): void {
    this.map = map;
    // Listen for news layer data to build sentiment heatmap
    document.addEventListener('dashview:layer-data', ((e: CustomEvent) => {
      if (e.detail.layerId === 'news' && this.enabled) {
        this.renderFromData(e.detail.data as GdeltArticle[]);
      }
    }) as EventListener);
  }

  enable(): void {
    this.enabled = true;
    // Will render when news data arrives
  }
  disable(): void {
    this.enabled = false;
    this.removeLayer();
  }

  async refresh(): Promise<void> {
    // Data comes from the news layer — no independent fetch
  }

  getRefreshInterval(): number {
    return 0;
  }
  isEnabled(): boolean {
    return this.enabled;
  }
  getLastUpdated(): number | null {
    return this.lastUpdated;
  }
  getFeatureCount(): number {
    return 0; // derived layer
  }

  private renderFromData(articles: GdeltArticle[]): void {
    if (!this.map || articles.length === 0) return;
    this.removeLayer();

    // Split into negative and positive sentiment points
    const negativePoints = articles.filter((a) => a.tone < -2 && (a.lat !== 0 || a.lon !== 0));
    const positivePoints = articles.filter((a) => a.tone > 2 && (a.lat !== 0 || a.lon !== 0));

    // Negative sentiment heatmap (red)
    if (negativePoints.length > 0) {
      const negGeoJson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: negativePoints.map((a) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
          properties: { weight: Math.abs(a.tone) / 10 },
        })),
      };

      this.map.addSource('sentiment-neg', { type: 'geojson', data: negGeoJson });
      this.map.addLayer({
        id: 'sentiment-neg-heat',
        type: 'heatmap',
        source: 'sentiment-neg',
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.3, 5, 1],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(0,0,0,0)',
            0.3,
            'rgba(255,60,60,0.15)',
            0.6,
            'rgba(255,30,0,0.3)',
            1,
            'rgba(255,0,0,0.5)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 5, 20],
          'heatmap-opacity': 0.6,
        },
      });
    }

    // Positive sentiment heatmap (green)
    if (positivePoints.length > 0) {
      const posGeoJson: GeoJSON.FeatureCollection = {
        type: 'FeatureCollection',
        features: positivePoints.map((a) => ({
          type: 'Feature' as const,
          geometry: { type: 'Point' as const, coordinates: [a.lon, a.lat] },
          properties: { weight: a.tone / 10 },
        })),
      };

      this.map.addSource('sentiment-pos', { type: 'geojson', data: posGeoJson });
      this.map.addLayer({
        id: 'sentiment-pos-heat',
        type: 'heatmap',
        source: 'sentiment-pos',
        paint: {
          'heatmap-weight': ['get', 'weight'],
          'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 0.3, 5, 1],
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(0,0,0,0)',
            0.3,
            'rgba(0,255,0,0.1)',
            0.6,
            'rgba(0,255,0,0.2)',
            1,
            'rgba(0,255,0,0.35)',
          ],
          'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 8, 5, 20],
          'heatmap-opacity': 0.5,
        },
      });
    }

    this.lastUpdated = Date.now();
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['sentiment-neg-heat', 'sentiment-pos-heat']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('sentiment-neg')) this.map.removeSource('sentiment-neg');
    if (this.map.getSource('sentiment-pos')) this.map.removeSource('sentiment-pos');
  }

  destroy(): void {
    this.removeLayer();
    this.map = null;
  }
}
