export interface CinemaProfile {
  id: string;
  name: string;
  shortKey: string;
  layers: string[];
  priorityRegions: { name: string; lng: number; lat: number; zoom: number }[];
  hudMetrics: { label: string; layerIds?: string[]; countType: 'features' | 'layers' }[];
  narrationFocus: string;
  cameraZoom: number;
}

// All 30 layer IDs for reference
const ALL_LAYERS = [
  'earthquakes',
  'news',
  'fires',
  'weather-alerts',
  'predictions',
  'flights',
  'cyber',
  'military-bases',
  'nuclear',
  'ports',
  'conflict-zones',
  'cables',
  'pipelines',
  'gps-jamming',
  'satellites',
  'ships',
  'acled',
  'gdacs',
  'chokepoints',
  'air-quality',
  'diseases',
  'displacement',
  'internet-outages',
  'sanctions',
  'elections',
  'trade-routes',
  'launches',
  'frontlines',
  'energy',
  'sentiment',
];

export const CINEMA_PROFILES: CinemaProfile[] = [
  {
    id: 'command-center',
    name: 'COMMAND CENTER',
    shortKey: 'CMD',
    layers: ALL_LAYERS,
    priorityRegions: [
      { name: 'Eastern Europe', lng: 35, lat: 48, zoom: 5 },
      { name: 'Middle East', lng: 50, lat: 28, zoom: 5 },
      { name: 'East Africa', lng: 45, lat: 8, zoom: 5 },
      { name: 'South China Sea', lng: 114, lat: 12, zoom: 5 },
      { name: 'Taiwan Strait', lng: 120, lat: 24, zoom: 6 },
      { name: 'Red Sea', lng: 42, lat: 15, zoom: 6 },
    ],
    hudMetrics: [
      { label: 'EVENTS', countType: 'features' },
      { label: 'LAYERS', countType: 'layers' },
      { label: 'CONFLICTS', layerIds: ['acled', 'conflict-zones'], countType: 'features' },
    ],
    narrationFocus: 'global security and intelligence',
    cameraZoom: 5,
  },
  {
    id: 'warfighter',
    name: 'WARFIGHTER',
    shortKey: 'WAR',
    layers: [
      'acled',
      'conflict-zones',
      'frontlines',
      'military-bases',
      'gps-jamming',
      'sanctions',
      'ships',
      'flights',
      'sentiment',
    ],
    priorityRegions: [
      { name: 'Ukraine Theater', lng: 35, lat: 48, zoom: 6 },
      { name: 'Gaza / Eastern Med', lng: 34, lat: 31, zoom: 7 },
      { name: 'Sudan', lng: 32, lat: 15, zoom: 6 },
      { name: 'Myanmar', lng: 96, lat: 20, zoom: 6 },
      { name: 'Red Sea / Bab el-Mandeb', lng: 43, lat: 13, zoom: 7 },
      { name: 'Taiwan Strait', lng: 120, lat: 24, zoom: 6 },
    ],
    hudMetrics: [
      { label: 'CONFLICTS', layerIds: ['acled'], countType: 'features' },
      { label: 'BASES', layerIds: ['military-bases'], countType: 'features' },
      { label: 'FRONTS', layerIds: ['frontlines'], countType: 'features' },
    ],
    narrationFocus: 'military operations and armed conflict',
    cameraZoom: 6,
  },
  {
    id: 'maritime-trade',
    name: 'MARITIME & TRADE',
    shortKey: 'SEA',
    layers: ['ships', 'ports', 'chokepoints', 'trade-routes', 'cables', 'energy', 'sanctions', 'gps-jamming'],
    priorityRegions: [
      { name: 'Strait of Hormuz', lng: 56, lat: 26, zoom: 7 },
      { name: 'Strait of Malacca', lng: 103, lat: 2, zoom: 7 },
      { name: 'Suez Canal', lng: 32, lat: 30, zoom: 7 },
      { name: 'Panama Canal', lng: -80, lat: 9, zoom: 7 },
      { name: 'Bab el-Mandeb', lng: 43, lat: 13, zoom: 7 },
      { name: 'Cape of Good Hope', lng: 18, lat: -34, zoom: 6 },
    ],
    hudMetrics: [
      { label: 'VESSELS', layerIds: ['ships'], countType: 'features' },
      { label: 'CHOKEPOINTS', layerIds: ['chokepoints'], countType: 'features' },
      { label: 'PORTS', layerIds: ['ports'], countType: 'features' },
    ],
    narrationFocus: 'maritime trade, shipping lanes, and supply chain disruption',
    cameraZoom: 7,
  },
  {
    id: 'crisis-response',
    name: 'CRISIS RESPONSE',
    shortKey: 'SOS',
    layers: ['earthquakes', 'fires', 'gdacs', 'weather-alerts', 'displacement', 'diseases', 'air-quality', 'news'],
    priorityRegions: [
      { name: 'Pacific Ring of Fire', lng: 140, lat: 35, zoom: 4 },
      { name: 'Mediterranean', lng: 25, lat: 37, zoom: 5 },
      { name: 'Central Africa', lng: 28, lat: -2, zoom: 5 },
      { name: 'South Asia', lng: 85, lat: 25, zoom: 5 },
      { name: 'Caribbean', lng: -75, lat: 18, zoom: 5 },
      { name: 'Southeast Asia', lng: 110, lat: 5, zoom: 5 },
    ],
    hudMetrics: [
      { label: 'DISASTERS', layerIds: ['earthquakes', 'fires', 'gdacs', 'weather-alerts'], countType: 'features' },
      { label: 'DISPLACED', layerIds: ['displacement'], countType: 'features' },
      { label: 'OUTBREAKS', layerIds: ['diseases'], countType: 'features' },
    ],
    narrationFocus: 'humanitarian crisis, natural disasters, and emergency response',
    cameraZoom: 5,
  },
  {
    id: 'infra-cyber',
    name: 'INFRASTRUCTURE',
    shortKey: 'INFRA',
    layers: [
      'cyber',
      'cables',
      'internet-outages',
      'gps-jamming',
      'nuclear',
      'energy',
      'ports',
      'satellites',
      'launches',
    ],
    priorityRegions: [
      { name: 'Northern Europe (Cables)', lng: 0, lat: 55, zoom: 5 },
      { name: 'Persian Gulf (Energy)', lng: 50, lat: 28, zoom: 6 },
      { name: 'East Asia (Infrastructure)', lng: 120, lat: 35, zoom: 5 },
      { name: 'US East Coast', lng: -75, lat: 37, zoom: 5 },
      { name: 'West Africa (Cables)', lng: -5, lat: 8, zoom: 5 },
    ],
    hudMetrics: [
      { label: 'OUTAGES', layerIds: ['internet-outages'], countType: 'features' },
      { label: 'FACILITIES', layerIds: ['nuclear', 'energy'], countType: 'features' },
      { label: 'SATELLITES', layerIds: ['satellites'], countType: 'features' },
    ],
    narrationFocus: 'critical infrastructure, cyber threats, and internet connectivity',
    cameraZoom: 5,
  },
  {
    id: 'geopolitical-risk',
    name: 'GEOPOLITICAL RISK',
    shortKey: 'GEO',
    layers: [
      'elections',
      'sanctions',
      'sentiment',
      'acled',
      'displacement',
      'news',
      'conflict-zones',
      'internet-outages',
      'predictions',
    ],
    priorityRegions: [
      { name: 'Brazil (Election)', lng: -48, lat: -16, zoom: 5 },
      { name: 'Middle East', lng: 45, lat: 30, zoom: 5 },
      { name: 'East Africa', lng: 37, lat: 0, zoom: 5 },
      { name: 'Eastern Europe', lng: 30, lat: 50, zoom: 5 },
      { name: 'South America', lng: -65, lat: -10, zoom: 4 },
      { name: 'Southeast Asia', lng: 105, lat: 15, zoom: 5 },
    ],
    hudMetrics: [
      { label: 'ELECTIONS', layerIds: ['elections'], countType: 'features' },
      { label: 'SANCTIONS', layerIds: ['sanctions'], countType: 'features' },
      { label: 'PREDICTIONS', layerIds: ['predictions'], countType: 'features' },
    ],
    narrationFocus: 'political risk, elections, sanctions, and geopolitical instability',
    cameraZoom: 5,
  },
  {
    id: 'space-aerospace',
    name: 'SPACE & AEROSPACE',
    shortKey: 'SPACE',
    layers: ['satellites', 'launches', 'flights', 'gps-jamming', 'nuclear', 'military-bases'],
    priorityRegions: [
      { name: 'Cape Canaveral / KSC', lng: -80.6, lat: 28.5, zoom: 8 },
      { name: 'Vandenberg SFB', lng: -120.6, lat: 34.6, zoom: 8 },
      { name: 'Boca Chica / Starbase', lng: -97.2, lat: 26.0, zoom: 8 },
      { name: 'Baikonur Cosmodrome', lng: 63.3, lat: 46.0, zoom: 7 },
      { name: 'Jiuquan / Wenchang', lng: 100, lat: 40, zoom: 6 },
      { name: 'Mahia Peninsula', lng: 177.9, lat: -39.3, zoom: 8 },
    ],
    hudMetrics: [
      { label: 'LAUNCHES', layerIds: ['launches'], countType: 'features' },
      { label: 'SATELLITES', layerIds: ['satellites'], countType: 'features' },
      { label: 'AIRCRAFT', layerIds: ['flights'], countType: 'features' },
    ],
    narrationFocus: 'space launches, satellite operations, and aerospace activity',
    cameraZoom: 7,
  },
  {
    id: 'minimal',
    name: 'MINIMAL',
    shortKey: 'MIN',
    layers: ['news', 'earthquakes'],
    priorityRegions: [{ name: 'Global View', lng: 0, lat: 20, zoom: 2.5 }],
    hudMetrics: [
      { label: 'QUAKES', layerIds: ['earthquakes'], countType: 'features' },
      { label: 'NEWS', layerIds: ['news'], countType: 'features' },
    ],
    narrationFocus: 'major global events and seismic activity',
    cameraZoom: 4,
  },
];

export function getProfile(id: string): CinemaProfile {
  return CINEMA_PROFILES.find((p) => p.id === id) || CINEMA_PROFILES[0];
}

export function getProfileIds(): string[] {
  return CINEMA_PROFILES.map((p) => p.id);
}
