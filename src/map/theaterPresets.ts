import type maplibregl from 'maplibre-gl';
import type { MapLayerManager } from './MapLayerManager.ts';

export interface TheaterPreset {
  id: string;
  name: string;
  emoji: string;
  description: string;
  camera: {
    center: [number, number]; // [lng, lat]
    zoom: number;
    pitch: number;
    bearing: number;
  };
  layers: string[]; // layer IDs to enable
}

export const THEATER_PRESETS: TheaterPreset[] = [
  {
    id: 'middle-east',
    name: 'Middle East',
    emoji: '🕌',
    description: 'Syria, Yemen, Iran, Iraq, Israel/Palestine',
    camera: { center: [44, 30], zoom: 4.2, pitch: 25, bearing: 0 },
    layers: ['conflicts', 'acled', 'ships', 'energy', 'chokepoints', 'pipelines', 'military', 'displacement'],
  },
  {
    id: 'indo-pacific',
    name: 'Indo-Pacific',
    emoji: '🌏',
    description: 'Taiwan Strait, South China Sea, Korean Peninsula',
    camera: { center: [125, 15], zoom: 3.8, pitch: 20, bearing: -10 },
    layers: ['ships', 'flights', 'military', 'earthquakes', 'cables', 'chokepoints', 'nuclear'],
  },
  {
    id: 'eastern-europe',
    name: 'Eastern Europe',
    emoji: '🏛️',
    description: 'Ukraine, Russia, Baltic states',
    camera: { center: [32, 50], zoom: 4.5, pitch: 20, bearing: 5 },
    layers: ['conflicts', 'acled', 'flights', 'military', 'frontlines', 'pipelines', 'gps-jamming'],
  },
  {
    id: 'africa-sahel',
    name: 'Africa / Sahel',
    emoji: '🌍',
    description: 'Sudan, Ethiopia, Somalia, DRC, Nigeria',
    camera: { center: [20, 10], zoom: 3.8, pitch: 15, bearing: 0 },
    layers: ['conflicts', 'acled', 'displacement', 'diseases', 'fires', 'internet-outages'],
  },
  {
    id: 'energy-chokepoints',
    name: 'Energy Chokepoints',
    emoji: '⛽',
    description: 'Hormuz, Bab el-Mandeb, Suez, Malacca, Panama',
    camera: { center: [55, 20], zoom: 3.2, pitch: 10, bearing: 0 },
    layers: ['ships', 'chokepoints', 'energy', 'pipelines', 'ports', 'trade-routes', 'cables'],
  },
  {
    id: 'western-hemisphere',
    name: 'Western Hemisphere',
    emoji: '🌎',
    description: 'Venezuela, Colombia, Mexico, Caribbean',
    camera: { center: [-75, 10], zoom: 3.8, pitch: 15, bearing: 0 },
    layers: ['earthquakes', 'fires', 'displacement', 'diseases', 'conflicts'],
  },
  {
    id: 'space-cyber',
    name: 'Space & Cyber',
    emoji: '🛰️',
    description: 'Satellites, launches, GPS jamming, internet outages, cyber',
    camera: { center: [0, 20], zoom: 2.5, pitch: 0, bearing: 0 },
    layers: ['satellites', 'launches', 'gps-jamming', 'internet-outages', 'cyber', 'cables'],
  },
];

/**
 * Apply a theater preset: fly camera to position, enable specified layers, disable others.
 */
export function applyTheaterPreset(preset: TheaterPreset, map: maplibregl.Map, layerManager: MapLayerManager): void {
  // Fly to camera position
  map.flyTo({
    center: preset.camera.center,
    zoom: preset.camera.zoom,
    pitch: preset.camera.pitch,
    bearing: preset.camera.bearing,
    duration: 2000,
    essential: true,
  });

  // Disable all layers first
  for (const layer of layerManager.getAllLayers()) {
    if (layer.isEnabled()) {
      layerManager.disable(layer.id);
    }
  }

  // Enable preset layers
  for (const layerId of preset.layers) {
    layerManager.enable(layerId);
  }

  // Dispatch event for UI updates (layer panel, etc.)
  document.dispatchEvent(new CustomEvent('dashview:theater-change', { detail: { theaterId: preset.id, preset } }));
}

/**
 * Get a theater preset by ID, or null if not found.
 */
export function getTheaterPreset(id: string): TheaterPreset | null {
  return THEATER_PRESETS.find((p) => p.id === id) ?? null;
}
