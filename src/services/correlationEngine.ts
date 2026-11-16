/**
 * Cross-Domain Correlation Engine
 *
 * Detects connections between events across different data layers:
 * - Geographic proximity: earthquake near nuclear facility, conflict near chokepoint
 * - Temporal correlation: events within hours of each other
 * - Market impact: geopolitical events → price movements
 * - Severity escalation: multiple low-priority signals converge → high priority
 *
 * Extends the existing geoIntelligence.ts correlation system.
 */

import { haversineKm } from '../utils/geo.ts';

export interface Correlation {
  id: string;
  type: 'proximity' | 'temporal' | 'market' | 'escalation';
  severity: 'critical' | 'elevated' | 'monitor';
  title: string;
  description: string;
  events: CorrelationEvent[];
  lat: number;
  lon: number;
  timestamp: number;
}

interface CorrelationEvent {
  layer: string;
  text: string;
  lat: number;
  lon: number;
}

// Proximity rules: detect events from one layer near features from another
interface ProximityRule {
  sourceLayer: string;
  targetLayer: string;
  radiusKm: number;
  severity: Correlation['severity'];
  titleTemplate: string;
  descriptionTemplate: string;
  sourceFilter?: (item: Record<string, unknown>) => boolean;
}

const PROXIMITY_RULES: ProximityRule[] = [
  // Earthquakes near nuclear facilities
  {
    sourceLayer: 'earthquakes',
    targetLayer: 'nuclear',
    radiusKm: 100,
    severity: 'critical',
    titleTemplate: 'Seismic activity near nuclear facility',
    descriptionTemplate:
      'M{magnitude} earthquake detected {distance}km from {target_name}. Monitoring for structural impact.',
    sourceFilter: (item) => (Number(item.magnitude) || 0) >= 4.5,
  },
  // Conflicts near chokepoints
  {
    sourceLayer: 'acled',
    targetLayer: 'chokepoints',
    radiusKm: 200,
    severity: 'elevated',
    titleTemplate: 'Armed conflict near maritime chokepoint',
    descriptionTemplate: 'Conflict event detected {distance}km from {target_name}. Potential trade disruption risk.',
  },
  // Conflicts near energy infrastructure
  {
    sourceLayer: 'acled',
    targetLayer: 'energy',
    radiusKm: 50,
    severity: 'elevated',
    titleTemplate: 'Conflict near energy infrastructure',
    descriptionTemplate: 'Armed conflict {distance}km from {target_name}. Energy supply disruption possible.',
  },
  // Earthquakes near undersea cables
  {
    sourceLayer: 'earthquakes',
    targetLayer: 'cables',
    radiusKm: 150,
    severity: 'elevated',
    titleTemplate: 'Seismic activity near undersea cable',
    descriptionTemplate: 'M{magnitude} earthquake detected near {target_name}. Communications infrastructure at risk.',
    sourceFilter: (item) => (Number(item.magnitude) || 0) >= 5.0,
  },
  // Fires near military bases
  {
    sourceLayer: 'fires',
    targetLayer: 'military-bases',
    radiusKm: 30,
    severity: 'monitor',
    titleTemplate: 'Wildfire activity near military installation',
    descriptionTemplate: 'Active fire detected {distance}km from {target_name}.',
  },
  // Earthquakes near ports
  {
    sourceLayer: 'earthquakes',
    targetLayer: 'ports',
    radiusKm: 80,
    severity: 'elevated',
    titleTemplate: 'Seismic activity near strategic port',
    descriptionTemplate: 'M{magnitude} earthquake {distance}km from {target_name}. Port operations may be affected.',
    sourceFilter: (item) => (Number(item.magnitude) || 0) >= 4.0,
  },
  // Internet outages in election countries
  {
    sourceLayer: 'internet-outages',
    targetLayer: 'elections',
    radiusKm: 500,
    severity: 'elevated',
    titleTemplate: 'Internet disruption in election country',
    descriptionTemplate:
      'Internet {source_severity} detected near upcoming {target_type} election in {target_country}.',
  },
  // Disease outbreaks near displacement corridors
  {
    sourceLayer: 'diseases',
    targetLayer: 'displacement',
    radiusKm: 300,
    severity: 'elevated',
    titleTemplate: 'Disease outbreak in displacement corridor',
    descriptionTemplate:
      '{source_disease} outbreak detected near {target_origin}→{target_destination} displacement flow.',
  },
];

// Escalation rules: multiple signals in one area = severity upgrade
interface EscalationRule {
  requiredLayers: string[];
  minSignals: number;
  radiusKm: number;
  severity: Correlation['severity'];
  title: string;
}

const ESCALATION_RULES: EscalationRule[] = [
  {
    requiredLayers: ['acled', 'internet-outages', 'displacement'],
    minSignals: 2,
    radiusKm: 500,
    severity: 'critical',
    title: 'Multi-domain crisis convergence',
  },
  {
    requiredLayers: ['earthquakes', 'fires', 'weather-alerts'],
    minSignals: 2,
    radiusKm: 200,
    severity: 'elevated',
    title: 'Compound natural disaster',
  },
  {
    requiredLayers: ['acled', 'ships', 'chokepoints'],
    minSignals: 2,
    radiusKm: 300,
    severity: 'critical',
    title: 'Maritime security escalation',
  },
];

let cachedCorrelations: Correlation[] = [];
let lastCompute = 0;
const COMPUTE_INTERVAL = 30_000; // 30 seconds

export function getCorrelations(): Correlation[] {
  return cachedCorrelations;
}

/**
 * Run all correlation rules against current layer data.
 * Call this on a 30-second cycle from the main page orchestrator.
 */
export function computeCorrelations(layerData: Map<string, unknown>): Correlation[] {
  if (Date.now() - lastCompute < COMPUTE_INTERVAL && cachedCorrelations.length > 0) {
    return cachedCorrelations;
  }

  const correlations: Correlation[] = [];
  const seen = new Set<string>();

  // Run proximity rules
  for (const rule of PROXIMITY_RULES) {
    const sourceData = layerData.get(rule.sourceLayer) as Array<Record<string, unknown>> | undefined;
    const targetData = layerData.get(rule.targetLayer) as Array<Record<string, unknown>> | undefined;
    if (!sourceData || !targetData) continue;

    for (const source of sourceData) {
      const sLat = Number(source.lat);
      const sLon = Number(source.lon);
      if (!sLat || !sLon) continue;
      if (rule.sourceFilter && !rule.sourceFilter(source)) continue;

      for (const target of targetData) {
        const tLat = Number(target.lat);
        const tLon = Number(target.lon);
        if (!tLat || !tLon) continue;

        const dist = haversineKm(sLat, sLon, tLat, tLon);
        if (dist > rule.radiusKm) continue;

        const dedup = `${rule.sourceLayer}-${rule.targetLayer}-${Math.round(sLat)}-${Math.round(sLon)}`;
        if (seen.has(dedup)) continue;
        seen.add(dedup);

        const description = rule.descriptionTemplate
          .replace('{magnitude}', String(source.magnitude || '?'))
          .replace('{distance}', String(Math.round(dist)))
          .replace('{target_name}', String(target.name || target.country || ''))
          .replace('{target_type}', String(target.type || ''))
          .replace('{target_country}', String(target.country || ''))
          .replace('{target_origin}', String(target.origin || ''))
          .replace('{target_destination}', String(target.destination || ''))
          .replace('{source_severity}', String(source.severity || 'disruption'))
          .replace('{source_disease}', String(source.disease || 'Disease'));

        correlations.push({
          id: dedup,
          type: 'proximity',
          severity: rule.severity,
          title: rule.titleTemplate,
          description,
          events: [
            {
              layer: rule.sourceLayer,
              text: String(source.place || source.event_type || source.disease || rule.sourceLayer),
              lat: sLat,
              lon: sLon,
            },
            {
              layer: rule.targetLayer,
              text: String(target.name || target.country || rule.targetLayer),
              lat: tLat,
              lon: tLon,
            },
          ],
          lat: (sLat + tLat) / 2,
          lon: (sLon + tLon) / 2,
          timestamp: Date.now(),
        });
      }
    }
  }

  // Run escalation rules
  for (const rule of ESCALATION_RULES) {
    // Collect all events from required layers
    const allEvents: Array<{ lat: number; lon: number; layer: string; text: string }> = [];
    for (const layerId of rule.requiredLayers) {
      const data = layerData.get(layerId) as Array<Record<string, unknown>> | undefined;
      if (!data) continue;
      for (const item of data.slice(0, 50)) {
        const lat = Number(item.lat);
        const lon = Number(item.lon);
        if (lat && lon) {
          allEvents.push({
            lat,
            lon,
            layer: layerId,
            text: String(item.place || item.event_type || item.country || layerId),
          });
        }
      }
    }

    // Check for clusters of events from different layers
    for (const anchor of allEvents) {
      const nearby = allEvents.filter(
        (e) => e.layer !== anchor.layer && haversineKm(anchor.lat, anchor.lon, e.lat, e.lon) < rule.radiusKm,
      );

      const uniqueLayers = new Set(nearby.map((e) => e.layer));
      uniqueLayers.add(anchor.layer);

      if (uniqueLayers.size >= rule.minSignals) {
        const dedup = `esc-${rule.title}-${Math.round(anchor.lat)}-${Math.round(anchor.lon)}`;
        if (seen.has(dedup)) continue;
        seen.add(dedup);

        const involvedLayers = Array.from(uniqueLayers).join(' + ');
        correlations.push({
          id: dedup,
          type: 'escalation',
          severity: rule.severity,
          title: rule.title,
          description: `${uniqueLayers.size} signal types converging: ${involvedLayers}. Elevated monitoring recommended.`,
          events: [anchor, ...nearby.slice(0, 3)],
          lat: anchor.lat,
          lon: anchor.lon,
          timestamp: Date.now(),
        });
      }
    }
  }

  // Sort by severity
  const severityOrder: Record<string, number> = { critical: 0, elevated: 1, monitor: 2 };
  correlations.sort((a, b) => (severityOrder[a.severity] ?? 2) - (severityOrder[b.severity] ?? 2));

  cachedCorrelations = correlations;
  lastCompute = Date.now();

  // Dispatch event for consumers (Cinema Mode, Alert Engine, etc.)
  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('dashview:correlations', { detail: { correlations } }));
  }

  return correlations;
}
