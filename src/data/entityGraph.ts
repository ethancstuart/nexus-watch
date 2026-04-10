/**
 * Entity Relationship Graph — Static Data
 *
 * Defines the relationships between countries, infrastructure, chokepoints,
 * alliances, and conflict actors that power the investigation graph.
 */

export interface GraphNode {
  id: string;
  type: 'country' | 'chokepoint' | 'infrastructure' | 'alliance' | 'conflict' | 'resource';
  label: string;
  lat?: number;
  lon?: number;
  metadata?: Record<string, string | number>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: 'borders' | 'controls' | 'threatens' | 'depends' | 'member' | 'trades' | 'conflicts' | 'supplies';
  label?: string;
  weight?: number; // 1-10, affects edge thickness
}

// Core countries (same as CII monitored list)
const COUNTRIES: GraphNode[] = [
  { id: 'IR', type: 'country', label: 'Iran', lat: 32.4, lon: 53.7 },
  { id: 'SA', type: 'country', label: 'Saudi Arabia', lat: 24.7, lon: 46.7 },
  { id: 'YE', type: 'country', label: 'Yemen', lat: 15.6, lon: 48.5 },
  { id: 'SY', type: 'country', label: 'Syria', lat: 34.8, lon: 38.9 },
  { id: 'IQ', type: 'country', label: 'Iraq', lat: 33.2, lon: 43.7 },
  { id: 'IL', type: 'country', label: 'Israel', lat: 31.0, lon: 35.0 },
  { id: 'PS', type: 'country', label: 'Palestine', lat: 31.9, lon: 35.2 },
  { id: 'LB', type: 'country', label: 'Lebanon', lat: 33.9, lon: 35.5 },
  { id: 'UA', type: 'country', label: 'Ukraine', lat: 48.4, lon: 31.2 },
  { id: 'RU', type: 'country', label: 'Russia', lat: 55.8, lon: 37.6 },
  { id: 'CN', type: 'country', label: 'China', lat: 35.9, lon: 104.2 },
  { id: 'TW', type: 'country', label: 'Taiwan', lat: 23.5, lon: 121.0 },
  { id: 'KP', type: 'country', label: 'North Korea', lat: 40.0, lon: 127.0 },
  { id: 'KR', type: 'country', label: 'South Korea', lat: 37.6, lon: 127.0 },
  { id: 'JP', type: 'country', label: 'Japan', lat: 36.2, lon: 138.3 },
  { id: 'SD', type: 'country', label: 'Sudan', lat: 15.5, lon: 32.5 },
  { id: 'SS', type: 'country', label: 'South Sudan', lat: 4.9, lon: 31.6 },
  { id: 'ET', type: 'country', label: 'Ethiopia', lat: 9.1, lon: 40.5 },
  { id: 'SO', type: 'country', label: 'Somalia', lat: 2.0, lon: 45.3 },
  { id: 'CD', type: 'country', label: 'DR Congo', lat: -1.5, lon: 29.0 },
  { id: 'MM', type: 'country', label: 'Myanmar', lat: 19.8, lon: 96.1 },
  { id: 'AF', type: 'country', label: 'Afghanistan', lat: 33.9, lon: 67.7 },
  { id: 'PK', type: 'country', label: 'Pakistan', lat: 30.4, lon: 69.3 },
  { id: 'US', type: 'country', label: 'United States', lat: 39.8, lon: -98.5 },
  { id: 'GB', type: 'country', label: 'United Kingdom', lat: 51.5, lon: -0.1 },
  { id: 'DE', type: 'country', label: 'Germany', lat: 52.5, lon: 13.4 },
  { id: 'FR', type: 'country', label: 'France', lat: 48.9, lon: 2.3 },
  { id: 'TR', type: 'country', label: 'Turkey', lat: 39.9, lon: 32.9 },
  { id: 'EG', type: 'country', label: 'Egypt', lat: 30.0, lon: 31.2 },
  { id: 'LY', type: 'country', label: 'Libya', lat: 26.3, lon: 17.2 },
  { id: 'VE', type: 'country', label: 'Venezuela', lat: 8.0, lon: -66.0 },
  { id: 'NG', type: 'country', label: 'Nigeria', lat: 9.1, lon: 7.5 },
  { id: 'IN', type: 'country', label: 'India', lat: 20.6, lon: 78.9 },
];

// Strategic infrastructure
const INFRASTRUCTURE: GraphNode[] = [
  {
    id: 'hormuz',
    type: 'chokepoint',
    label: 'Strait of Hormuz',
    lat: 26.56,
    lon: 56.25,
    metadata: { oilTransit: '20%' },
  },
  {
    id: 'bab-el-mandeb',
    type: 'chokepoint',
    label: 'Bab el-Mandeb',
    lat: 12.58,
    lon: 43.33,
    metadata: { oilTransit: '4.8M bbl/day' },
  },
  {
    id: 'suez',
    type: 'chokepoint',
    label: 'Suez Canal',
    lat: 30.46,
    lon: 32.34,
    metadata: { tradeVolume: '12% global' },
  },
  {
    id: 'malacca',
    type: 'chokepoint',
    label: 'Malacca Strait',
    lat: 2.5,
    lon: 101.8,
    metadata: { tradeVolume: '25% global' },
  },
  {
    id: 'taiwan-strait',
    type: 'chokepoint',
    label: 'Taiwan Strait',
    lat: 24.0,
    lon: 119.0,
    metadata: { chipExport: '90% advanced' },
  },
  { id: 'panama', type: 'chokepoint', label: 'Panama Canal', lat: 9.08, lon: -79.68 },
  {
    id: 'zaporizhzhia',
    type: 'infrastructure',
    label: 'Zaporizhzhia NPP',
    lat: 47.51,
    lon: 34.58,
    metadata: { type: 'nuclear' },
  },
  {
    id: 'bushehr',
    type: 'infrastructure',
    label: 'Bushehr NPP',
    lat: 28.83,
    lon: 50.89,
    metadata: { type: 'nuclear' },
  },
  {
    id: 'kharg',
    type: 'infrastructure',
    label: 'Kharg Island Terminal',
    lat: 29.23,
    lon: 50.31,
    metadata: { type: 'oil terminal', capacity: '90% Iran export' },
  },
  {
    id: 'ras-tanura',
    type: 'infrastructure',
    label: 'Ras Tanura Terminal',
    lat: 26.64,
    lon: 50.15,
    metadata: { type: 'oil terminal', capacity: '6.5M bbl/day' },
  },
  {
    id: 'druzhba',
    type: 'infrastructure',
    label: 'Druzhba Pipeline Hub',
    lat: 52.1,
    lon: 23.7,
    metadata: { type: 'pipeline', routes: 'Russia→Europe' },
  },
  {
    id: 'nordstream',
    type: 'infrastructure',
    label: 'Nord Stream (damaged)',
    lat: 55.5,
    lon: 15.0,
    metadata: { type: 'pipeline', status: 'damaged' },
  },
];

// Alliances and organizations
const ALLIANCES: GraphNode[] = [
  { id: 'nato', type: 'alliance', label: 'NATO' },
  { id: 'quad', type: 'alliance', label: 'QUAD' },
  { id: 'opec', type: 'alliance', label: 'OPEC+' },
  { id: 'brics', type: 'alliance', label: 'BRICS' },
  { id: 'axis-resistance', type: 'alliance', label: 'Axis of Resistance' },
  { id: 'five-eyes', type: 'alliance', label: 'Five Eyes' },
];

// Conflict actors / proxy groups
const CONFLICTS: GraphNode[] = [
  { id: 'houthis', type: 'conflict', label: 'Houthis (Ansar Allah)' },
  { id: 'hezbollah', type: 'conflict', label: 'Hezbollah' },
  { id: 'hamas', type: 'conflict', label: 'Hamas' },
  { id: 'rsf', type: 'conflict', label: 'RSF (Rapid Support Forces)' },
  { id: 'saf', type: 'conflict', label: 'SAF (Sudanese Armed Forces)' },
  { id: 'wagner', type: 'conflict', label: 'Wagner Group / Africa Corps' },
  { id: 'isis', type: 'conflict', label: 'ISIS/ISIL' },
  { id: 'pmu', type: 'conflict', label: 'PMU (Iraq Shia Militias)' },
  { id: 'taliban', type: 'conflict', label: 'Taliban' },
];

// Resources
const RESOURCES: GraphNode[] = [
  { id: 'oil', type: 'resource', label: 'Crude Oil' },
  { id: 'lng', type: 'resource', label: 'LNG' },
  { id: 'semiconductors', type: 'resource', label: 'Semiconductors' },
  { id: 'rare-earth', type: 'resource', label: 'Rare Earth Minerals' },
];

// Relationships
const EDGES: GraphEdge[] = [
  // Chokepoint control/adjacency
  { source: 'IR', target: 'hormuz', type: 'controls', label: 'Northern shore', weight: 9 },
  { source: 'SA', target: 'hormuz', type: 'depends', label: 'Oil export route', weight: 8 },
  { source: 'YE', target: 'bab-el-mandeb', type: 'threatens', label: 'Houthi attacks', weight: 9 },
  { source: 'houthis', target: 'bab-el-mandeb', type: 'threatens', label: 'Anti-ship operations', weight: 9 },
  { source: 'EG', target: 'suez', type: 'controls', label: 'Operator', weight: 10 },
  { source: 'CN', target: 'malacca', type: 'depends', label: '80% oil imports', weight: 9 },
  { source: 'CN', target: 'taiwan-strait', type: 'threatens', label: 'Reunification claims', weight: 8 },
  { source: 'TW', target: 'taiwan-strait', type: 'controls', label: 'De facto control', weight: 7 },

  // Iran proxy network
  { source: 'IR', target: 'houthis', type: 'supplies', label: 'Arms + funding', weight: 8 },
  { source: 'IR', target: 'hezbollah', type: 'supplies', label: 'Arms + funding + training', weight: 9 },
  { source: 'IR', target: 'hamas', type: 'supplies', label: 'Funding + rockets', weight: 7 },
  { source: 'IR', target: 'pmu', type: 'supplies', label: 'Training + command', weight: 8 },
  { source: 'IR', target: 'axis-resistance', type: 'member', weight: 10 },
  { source: 'houthis', target: 'axis-resistance', type: 'member', weight: 7 },
  { source: 'hezbollah', target: 'axis-resistance', type: 'member', weight: 9 },
  { source: 'hamas', target: 'axis-resistance', type: 'member', weight: 6 },

  // Hezbollah/Hamas theater
  { source: 'hezbollah', target: 'LB', type: 'controls', label: 'Southern Lebanon', weight: 8 },
  { source: 'hamas', target: 'PS', type: 'controls', label: 'Gaza Strip', weight: 8 },
  { source: 'IL', target: 'PS', type: 'conflicts', label: 'Active conflict', weight: 10 },
  { source: 'IL', target: 'hezbollah', type: 'conflicts', label: 'Active conflict', weight: 9 },
  { source: 'SY', target: 'hezbollah', type: 'supplies', label: 'Transit corridor', weight: 6 },

  // Ukraine/Russia
  { source: 'RU', target: 'UA', type: 'conflicts', label: 'Active war', weight: 10 },
  { source: 'RU', target: 'zaporizhzhia', type: 'controls', label: 'Occupied', weight: 9 },
  { source: 'RU', target: 'nordstream', type: 'supplies', label: 'Gas export (damaged)', weight: 3 },
  { source: 'RU', target: 'druzhba', type: 'supplies', label: 'Oil pipeline', weight: 7 },
  { source: 'DE', target: 'nordstream', type: 'depends', label: 'Gas import (disrupted)', weight: 4 },
  { source: 'DE', target: 'druzhba', type: 'depends', label: 'Oil import', weight: 6 },

  // NATO members
  { source: 'US', target: 'nato', type: 'member', weight: 10 },
  { source: 'GB', target: 'nato', type: 'member', weight: 8 },
  { source: 'DE', target: 'nato', type: 'member', weight: 7 },
  { source: 'FR', target: 'nato', type: 'member', weight: 7 },
  { source: 'TR', target: 'nato', type: 'member', weight: 6 },
  { source: 'US', target: 'UA', type: 'supplies', label: 'Military aid', weight: 8 },
  { source: 'GB', target: 'UA', type: 'supplies', label: 'Military aid', weight: 6 },

  // QUAD
  { source: 'US', target: 'quad', type: 'member', weight: 8 },
  { source: 'JP', target: 'quad', type: 'member', weight: 7 },
  { source: 'IN', target: 'quad', type: 'member', weight: 6 },

  // Five Eyes
  { source: 'US', target: 'five-eyes', type: 'member', weight: 9 },
  { source: 'GB', target: 'five-eyes', type: 'member', weight: 8 },

  // BRICS
  { source: 'RU', target: 'brics', type: 'member', weight: 7 },
  { source: 'CN', target: 'brics', type: 'member', weight: 8 },
  { source: 'IN', target: 'brics', type: 'member', weight: 6 },
  { source: 'IR', target: 'brics', type: 'member', weight: 5 },
  { source: 'EG', target: 'brics', type: 'member', weight: 4 },
  { source: 'ET', target: 'brics', type: 'member', weight: 3 },

  // OPEC+
  { source: 'SA', target: 'opec', type: 'member', weight: 9 },
  { source: 'IR', target: 'opec', type: 'member', weight: 7 },
  { source: 'IQ', target: 'opec', type: 'member', weight: 6 },
  { source: 'RU', target: 'opec', type: 'member', label: 'OPEC+ partner', weight: 7 },
  { source: 'VE', target: 'opec', type: 'member', weight: 5 },
  { source: 'NG', target: 'opec', type: 'member', weight: 5 },
  { source: 'LY', target: 'opec', type: 'member', weight: 4 },

  // Sudan conflict
  { source: 'rsf', target: 'SD', type: 'conflicts', label: 'Civil war', weight: 9 },
  { source: 'saf', target: 'SD', type: 'controls', label: 'Government forces', weight: 8 },
  { source: 'rsf', target: 'saf', type: 'conflicts', label: 'Civil war', weight: 10 },
  { source: 'wagner', target: 'rsf', type: 'supplies', label: 'Alleged support', weight: 5 },
  { source: 'RU', target: 'wagner', type: 'supplies', label: 'State-linked', weight: 7 },

  // Wagner in Africa
  { source: 'wagner', target: 'LY', type: 'controls', label: 'Eastern Libya', weight: 6 },
  { source: 'wagner', target: 'CD', type: 'controls', label: 'Mining operations', weight: 4 },

  // Korea
  { source: 'KP', target: 'KR', type: 'conflicts', label: 'Armistice', weight: 7 },
  { source: 'CN', target: 'KP', type: 'supplies', label: 'Economic lifeline', weight: 8 },
  { source: 'US', target: 'KR', type: 'supplies', label: 'Mutual defense', weight: 8 },
  { source: 'US', target: 'JP', type: 'supplies', label: 'Mutual defense', weight: 8 },

  // Energy infrastructure
  { source: 'IR', target: 'kharg', type: 'controls', label: '90% oil export', weight: 10 },
  { source: 'IR', target: 'bushehr', type: 'controls', label: 'Nuclear energy', weight: 7 },
  { source: 'SA', target: 'ras-tanura', type: 'controls', label: 'Oil export hub', weight: 10 },
  { source: 'oil', target: 'hormuz', type: 'depends', label: '20% global transit', weight: 10 },
  { source: 'oil', target: 'bab-el-mandeb', type: 'depends', label: 'Red Sea route', weight: 8 },
  { source: 'oil', target: 'suez', type: 'depends', label: 'Europe route', weight: 8 },
  { source: 'lng', target: 'hormuz', type: 'depends', label: 'Qatar LNG export', weight: 9 },
  { source: 'semiconductors', target: 'taiwan-strait', type: 'depends', label: 'TSMC supply chain', weight: 10 },
  { source: 'TW', target: 'semiconductors', type: 'supplies', label: '90% advanced chips', weight: 10 },
  { source: 'rare-earth', target: 'CN', type: 'depends', label: '60% global processing', weight: 9 },
  { source: 'CD', target: 'rare-earth', type: 'supplies', label: 'Cobalt mining', weight: 7 },

  // Afghanistan/Pakistan
  { source: 'taliban', target: 'AF', type: 'controls', label: 'Government', weight: 9 },
  { source: 'isis', target: 'AF', type: 'conflicts', label: 'ISKP attacks', weight: 6 },
  { source: 'isis', target: 'SY', type: 'conflicts', label: 'Remnant cells', weight: 5 },
  { source: 'isis', target: 'IQ', type: 'conflicts', label: 'Remnant cells', weight: 5 },

  // Horn of Africa
  { source: 'SO', target: 'bab-el-mandeb', type: 'threatens', label: 'Piracy risk', weight: 5 },
  { source: 'ET', target: 'SD', type: 'borders', label: 'Refugee flows', weight: 6 },
  { source: 'SS', target: 'SD', type: 'borders', label: 'Refugee flows', weight: 6 },

  // Turkey
  { source: 'TR', target: 'SY', type: 'conflicts', label: 'Northern Syria ops', weight: 6 },
  { source: 'TR', target: 'IQ', type: 'conflicts', label: 'PKK operations', weight: 5 },

  // India-Pakistan
  { source: 'IN', target: 'PK', type: 'conflicts', label: 'Kashmir dispute', weight: 6 },
  { source: 'CN', target: 'PK', type: 'supplies', label: 'CPEC + military', weight: 7 },
  { source: 'CN', target: 'IN', type: 'conflicts', label: 'Border tensions', weight: 5 },
];

export const GRAPH_DATA = {
  nodes: [...COUNTRIES, ...INFRASTRUCTURE, ...ALLIANCES, ...CONFLICTS, ...RESOURCES] as GraphNode[],
  edges: EDGES,
};

/** Get all nodes connected to a given node ID (1 degree) */
export function getConnectedNodes(nodeId: string): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const connectedEdges = EDGES.filter((e) => e.source === nodeId || e.target === nodeId);
  const connectedIds = new Set<string>();
  connectedIds.add(nodeId);
  for (const e of connectedEdges) {
    connectedIds.add(e.source);
    connectedIds.add(e.target);
  }
  const allNodes = GRAPH_DATA.nodes;
  const connectedNodes = allNodes.filter((n) => connectedIds.has(n.id));
  return { nodes: connectedNodes, edges: connectedEdges };
}

/** Get the full subgraph for a set of node IDs (all connections between them) */
export function getSubgraph(nodeIds: string[]): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const idSet = new Set(nodeIds);
  const nodes = GRAPH_DATA.nodes.filter((n) => idSet.has(n.id));
  const edges = EDGES.filter((e) => idSet.has(e.source) && idSet.has(e.target));
  return { nodes, edges };
}
