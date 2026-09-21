import type { Map as MaplibreMap } from 'maplibre-gl';
import type { MapLayerCategory } from '../../types/index.ts';

/** A single filter key the user can adjust from the drawer's expanded row. */
export interface LayerFilterControl {
  /** Stable key (e.g. 'severity', 'time-range', 'magnitude'). */
  id: string;
  /** Human label shown above the chips (e.g. 'Severity'). */
  label: string;
  /** Each option is a chip; the user picks one (single-select). */
  options: Array<{ value: string; label: string }>;
  /** The default-selected option value. */
  defaultValue: string;
}

export interface LayerFilterSchema {
  /** One or more filter axes. Renders top-to-bottom in the drawer row. */
  controls: LayerFilterControl[];
}

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

  /**
   * Optional: layers that opt into the per-layer filter UI return a schema.
   * Layers without filters omit this method and the drawer renders no chevron.
   */
  getFilterSchema?(): LayerFilterSchema;

  /**
   * Optional: called by LayerDrawer when the user picks a filter chip.
   * Layer is responsible for translating filter state into a MapLibre
   * `setFilter()` expression or re-querying its data source.
   */
  applyFilter?(filters: Record<string, string>): void;
}
