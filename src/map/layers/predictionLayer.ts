import maplibregl from 'maplibre-gl';
import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';
import { predictionPopup } from '../PopupCard.ts';
import { fetchWithRetry } from '../../utils/fetch.ts';

interface PredictionEvent {
  id: string;
  question: string;
  probability: number;
  volume: number;
  source: string;
  url: string;
  lat: number;
  lon: number;
}

// Map prediction market questions to approximate world locations via keyword matching
const LOCATION_KEYWORDS: { pattern: RegExp; lat: number; lon: number }[] = [
  { pattern: /china|beijing|xi jinping/i, lat: 39.9, lon: 116.4 },
  { pattern: /russia|moscow|putin|ukraine|kremlin/i, lat: 55.8, lon: 37.6 },
  { pattern: /ukraine|kyiv|zelensky/i, lat: 50.4, lon: 30.5 },
  { pattern: /iran|tehran/i, lat: 35.7, lon: 51.4 },
  { pattern: /israel|gaza|hamas|netanyahu|tel aviv/i, lat: 31.8, lon: 35.2 },
  { pattern: /taiwan|taipei/i, lat: 25.0, lon: 121.5 },
  { pattern: /north korea|pyongyang|kim jong/i, lat: 39.0, lon: 125.8 },
  { pattern: /india|modi|new delhi/i, lat: 28.6, lon: 77.2 },
  { pattern: /brazil|lula|brasilia/i, lat: -15.8, lon: -47.9 },
  { pattern: /uk|britain|london|parliament/i, lat: 51.5, lon: -0.1 },
  { pattern: /france|macron|paris/i, lat: 48.9, lon: 2.3 },
  { pattern: /germany|berlin|scholz/i, lat: 52.5, lon: 13.4 },
  { pattern: /japan|tokyo/i, lat: 35.7, lon: 139.7 },
  { pattern: /mexico|mexico city/i, lat: 19.4, lon: -99.1 },
  { pattern: /trump|biden|congress|senate|white house|fed|us election|united states/i, lat: 38.9, lon: -77.0 },
  { pattern: /nato|eu|europe/i, lat: 50.8, lon: 4.4 },
  { pattern: /opec|oil|saudi/i, lat: 24.7, lon: 46.7 },
  { pattern: /bitcoin|crypto|ethereum/i, lat: 40.7, lon: -74.0 },
  { pattern: /s&p|nasdaq|dow|stock market|wall street/i, lat: 40.7, lon: -74.0 },
];

function geocodePrediction(question: string): { lat: number; lon: number } | null {
  for (const { pattern, lat, lon } of LOCATION_KEYWORDS) {
    if (pattern.test(question)) return { lat, lon };
  }
  return null;
}

export class PredictionLayer implements MapDataLayer {
  readonly id = 'predictions';
  readonly name = 'Prediction Markets';
  readonly category = 'intelligence' as const;
  readonly icon = '🎯';
  readonly description = 'Polymarket & Kalshi prediction markets';

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private data: PredictionEvent[] = [];
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
      const res = await fetchWithRetry('/api/prediction');
      if (!res.ok) throw new Error('Prediction API error');

      const raw = (await res.json()) as {
        markets: { id: string; question: string; probability: number; volume: number; source: string; url: string }[];
      };

      // Geocode predictions
      this.data = raw.markets
        .map((m) => {
          const loc = geocodePrediction(m.question);
          if (!loc) return null;
          return { ...m, ...loc };
        })
        .filter((m): m is PredictionEvent => m !== null);

      this.lastUpdated = Date.now();
      if (this.enabled) this.renderLayer();
      document.dispatchEvent(new CustomEvent('dashview:layer-data', { detail: { layerId: this.id, data: this.data } }));
    } catch (err) {
      console.error('Prediction layer refresh error:', err);
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
      features: this.data.map((p) => ({
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [p.lon, p.lat] },
        properties: {
          question: p.question,
          probability: p.probability,
          volume: p.volume,
          source: p.source,
          url: p.url,
          color: probToColor(p.probability),
        },
      })),
    };

    this.map.addSource('predictions', { type: 'geojson', data: geojson });

    // Diamond marker ring
    this.map.addLayer({
      id: 'predictions-ring',
      type: 'circle',
      source: 'predictions',
      paint: {
        'circle-radius': 14,
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.12,
        'circle-blur': 0.4,
      },
    });

    // Core
    this.map.addLayer({
      id: 'predictions-core',
      type: 'circle',
      source: 'predictions',
      paint: {
        'circle-radius': 7,
        'circle-color': ['get', 'color'],
        'circle-stroke-width': 2,
        'circle-stroke-color': 'rgba(255,255,255,0.5)',
        'circle-opacity': 0.9,
      },
    });

    // Probability label
    this.map.addLayer({
      id: 'predictions-labels',
      type: 'symbol',
      source: 'predictions',
      layout: {
        'text-field': ['concat', ['to-string', ['get', 'probability']], '%'],
        'text-size': 10,
        'text-offset': [0, -1.5],
        'text-font': ['Open Sans Bold'],
      },
      paint: {
        'text-color': '#ffffff',
        'text-halo-color': '#000000',
        'text-halo-width': 1,
      },
    });

    // Hover
    this.map.on('mouseenter', 'predictions-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = 'pointer';
    });

    this.map.on('mouseleave', 'predictions-core', () => {
      if (this.map) this.map.getCanvas().style.cursor = '';
      this.popup?.remove();
    });

    this.map.on('mousemove', 'predictions-core', (e) => {
      if (!this.map || !e.features?.length) return;
      const props = e.features[0].properties!;
      const coords = (e.features[0].geometry as GeoJSON.Point).coordinates;
      this.popup?.remove();
      this.popup = new maplibregl.Popup({
        closeButton: false,
        closeOnClick: false,
        className: 'eq-popup',
        offset: 12,
      })
        .setLngLat([coords[0], coords[1]])
        .setHTML(predictionPopup(props))
        .addTo(this.map);
    });

    this.map.on('click', 'predictions-core', (e) => {
      if (!e.features?.length) return;
      const url = e.features[0].properties?.url as string;
      if (url) window.open(url, '_blank', 'noopener');
    });
  }

  private removeLayer(): void {
    if (!this.map) return;
    for (const id of ['predictions-labels', 'predictions-core', 'predictions-ring']) {
      if (this.map.getLayer(id)) this.map.removeLayer(id);
    }
    if (this.map.getSource('predictions')) this.map.removeSource('predictions');
    this.popup?.remove();
    this.popup = null;
  }

  destroy(): void {
    this.removeLayer();
    this.data = [];
    this.map = null;
  }
}

function probToColor(prob: number): string {
  if (prob >= 80) return '#22c55e'; // Very likely — green
  if (prob >= 60) return '#84cc16'; // Likely — lime
  if (prob >= 40) return '#eab308'; // Toss-up — yellow
  if (prob >= 20) return '#f97316'; // Unlikely — orange
  return '#ef4444'; // Very unlikely — red
}
