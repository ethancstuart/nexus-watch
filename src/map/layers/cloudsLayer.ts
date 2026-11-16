import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapDataLayer } from './LayerDefinition.ts';

/**
 * NASA GIBS — animated cloud cover overlay.
 *
 * Pulls MODIS Terra TrueColor tiles from NASA's WMTS service. Tiles are
 * already CORS-friendly and can be added directly to MapLibre as a raster
 * source. We use yesterday's date to guarantee a complete granule.
 *
 * 2026-05-02 W7a: spectacle layer — gives the globe live-Earth feel.
 */

const SOURCE_ID = 'nw-clouds-source';
const LAYER_ID = 'nw-clouds-layer';

function yesterdayISO(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export class CloudsLayer implements MapDataLayer {
  readonly id = 'clouds';
  readonly name = 'Cloud Cover (NASA)';
  readonly category = 'weather' as const;
  readonly icon = '☁';
  readonly description = "MODIS Terra TrueColor — yesterday's cloud cover from NASA GIBS";

  private map: MaplibreMap | null = null;
  private enabled = false;
  private lastUpdated: number | null = null;
  private currentDate = '';

  init(map: MaplibreMap): void {
    this.map = map;
  }

  enable(): void {
    this.enabled = true;
    this.addToMap();
  }

  disable(): void {
    this.enabled = false;
    this.removeFromMap();
  }

  async refresh(): Promise<void> {
    if (!this.enabled || !this.map) return;
    const newDate = yesterdayISO();
    if (newDate !== this.currentDate) {
      this.removeFromMap();
      this.addToMap();
    }
    this.lastUpdated = Date.now();
  }

  getRefreshInterval(): number {
    return 60 * 60 * 1000; // refresh date hourly; tiles change once a day
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getLastUpdated(): number | null {
    return this.lastUpdated;
  }

  getFeatureCount(): number {
    return this.enabled ? 1 : 0;
  }

  destroy(): void {
    this.removeFromMap();
  }

  private addToMap(): void {
    if (!this.map) return;
    const date = yesterdayISO();
    this.currentDate = date;
    if (!this.map.getSource(SOURCE_ID)) {
      this.map.addSource(SOURCE_ID, {
        type: 'raster',
        tiles: [
          `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${date}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
        ],
        tileSize: 256,
        attribution: 'Imagery courtesy of NASA EOSDIS GIBS',
      });
    }
    if (!this.map.getLayer(LAYER_ID)) {
      // Insert just above the basemap so country fills, conflict zones, etc.
      // remain readable. Reasonable opacity so clouds enrich without hiding.
      this.map.addLayer({
        id: LAYER_ID,
        type: 'raster',
        source: SOURCE_ID,
        paint: {
          'raster-opacity': 0.55,
          'raster-fade-duration': 0,
        },
      });
    }
    this.lastUpdated = Date.now();
  }

  private removeFromMap(): void {
    if (!this.map) return;
    if (this.map.getLayer(LAYER_ID)) this.map.removeLayer(LAYER_ID);
    if (this.map.getSource(SOURCE_ID)) this.map.removeSource(SOURCE_ID);
  }
}
