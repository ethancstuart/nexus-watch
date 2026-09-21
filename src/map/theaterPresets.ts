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
  {
    id: 'balkans',
    name: 'Balkans',
    emoji: '🏔️',
    description: 'Serbia, Kosovo, Bosnia, Montenegro, North Macedonia, Albania',
    camera: { center: [20.5, 43], zoom: 5.5, pitch: 20, bearing: 0 },
    layers: ['acled', 'conflict-zones', 'military', 'elections', 'displacement', 'internet-outages'],
  },
  {
    id: 'gulf-states',
    name: 'Gulf States',
    emoji: '🛢️',
    description: 'Saudi Arabia, UAE, Qatar, Kuwait, Bahrain, Oman',
    camera: { center: [50, 24], zoom: 5, pitch: 15, bearing: 0 },
    layers: ['ships', 'chokepoints', 'energy', 'pipelines', 'ports', 'military', 'flights'],
  },
  {
    id: 'central-asia',
    name: 'Central Asia',
    emoji: '🏜️',
    description: 'Kazakhstan, Uzbekistan, Turkmenistan, Kyrgyzstan, Tajikistan',
    camera: { center: [65, 42], zoom: 4.5, pitch: 15, bearing: 0 },
    layers: ['acled', 'earthquakes', 'pipelines', 'internet-outages', 'military', 'elections'],
  },
  {
    id: 'southeast-asia',
    name: 'Southeast Asia',
    emoji: '🌴',
    description: 'Myanmar, Thailand, Vietnam, Philippines, Indonesia, Malaysia',
    camera: { center: [108, 10], zoom: 4, pitch: 15, bearing: 0 },
    layers: ['acled', 'ships', 'chokepoints', 'earthquakes', 'fires', 'displacement', 'cables'],
  },
  {
    id: 'central-america',
    name: 'Central America',
    emoji: '🌋',
    description: 'Guatemala, Honduras, El Salvador, Nicaragua, Panama, Costa Rica',
    camera: { center: [-86, 13], zoom: 5.5, pitch: 15, bearing: 0 },
    layers: ['earthquakes', 'fires', 'acled', 'displacement', 'diseases', 'trade-routes'],
  },
  {
    id: 'nordic-baltic',
    name: 'Nordic & Baltic',
    emoji: '❄️',
    description: 'Sweden, Finland, Norway, Estonia, Latvia, Lithuania — NATO frontier',
    camera: { center: [22, 60], zoom: 4.2, pitch: 15, bearing: 0 },
    layers: ['military', 'gps-jamming', 'ships', 'cables', 'flights', 'internet-outages'],
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
