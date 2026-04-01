import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapLayerCategory } from '../../types/index.ts';

export interface MapDataLayer {
  readonly id: string;
  readonly name: string;
  readonly category: MapLayerCategory;
  readonly icon: string;
  readonly description: string;

  init(map: MaplibreMap): void;
  enable(): void;
  disable(): void;
  destroy(): void;

  refresh(): Promise<void>;
  getRefreshInterval(): number;

  isEnabled(): boolean;
  getLastUpdated(): number | null;
  getFeatureCount(): number;
}
