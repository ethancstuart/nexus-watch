/**
 * Alert Engine
 *
 * Evaluates parsed alert rules against live layer data.
 * Supports: magnitude thresholds, count thresholds, fatality thresholds,
 * severity matching, proximity alerts (near_layer), country filtering.
 *
 * Rules are stored in Neon Postgres and evaluated every refresh cycle.
 */

import { haversineKm } from '../utils/geo.ts';

export interface AlertRule {
  id: string;
  ruleText: string;
  parsed: ParsedRule;
  active: boolean;
}

export interface ParsedRule {
  layer: string;
  condition: string;
  threshold: number | null;
  location: string | null;
  radiusKm: number | null;
  comparisonLayer: string | null;
  humanReadable: string;
}

export interface TriggeredAlert {
  ruleId: string;
  ruleText: string;
  humanReadable: string;
  matchedEvents: Array<{ text: string; lat: number; lon: number }>;
  severity: 'critical' | 'elevated' | 'monitor';
  timestamp: number;
}

// In-memory rule store (loaded from API on init)
let rules: AlertRule[] = [];
let triggeredAlerts: TriggeredAlert[] = [];
const recentTriggers = new Map<string, number>(); // ruleId → last trigger timestamp
const COOLDOWN = 300_000; // 5 minutes between re-triggers of same rule

export function getRules(): AlertRule[] {
  return rules;
}

export function getTriggeredNLAlerts(): TriggeredAlert[] {
  return triggeredAlerts;
}

export function setRules(newRules: AlertRule[]): void {
  rules = newRules;
}

export function addRule(rule: AlertRule): void {
  rules.push(rule);
}

export function removeRule(ruleId: string): void {
  rules = rules.filter((r) => r.id !== ruleId);
}

/**
 * Evaluate all active rules against current layer data.
 * Call this on each layer data refresh cycle.
 */
export function evaluateAlerts(layerData: Map<string, unknown>): TriggeredAlert[] {
  const newAlerts: TriggeredAlert[] = [];

  for (const rule of rules) {
    if (!rule.active) continue;

    // Cooldown check
    const lastTrigger = recentTriggers.get(rule.id);
    if (lastTrigger && Date.now() - lastTrigger < COOLDOWN) continue;

    const matches = evaluateRule(rule.parsed, layerData);
    if (matches.length > 0) {
      const severity = classifySeverity(rule.parsed, matches);
      const alert: TriggeredAlert = {
        ruleId: rule.id,
        ruleText: rule.ruleText,
        humanReadable: rule.parsed.humanReadable,
        matchedEvents: matches.slice(0, 5),
        severity,
        timestamp: Date.now(),
      };
      newAlerts.push(alert);
      recentTriggers.set(rule.id, Date.now());
    }
  }

  // Keep last 50 alerts
  triggeredAlerts = [...newAlerts, ...triggeredAlerts].slice(0, 50);

  if (newAlerts.length > 0 && typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent('dashview:nl-alerts', { detail: { alerts: newAlerts } }));

    // Browser notifications for critical/elevated alerts
    if ('Notification' in window && Notification.permission === 'granted') {
      for (const alert of newAlerts.filter((a) => a.severity !== 'monitor')) {
        new Notification(`NexusWatch Alert: ${alert.severity.toUpperCase()}`, {
          body: alert.humanReadable,
          icon: '/favicon.svg',
          tag: alert.ruleId,
        });
      }
    }
  }

  return newAlerts;
}

function evaluateRule(
  parsed: ParsedRule,
  layerData: Map<string, unknown>,
): Array<{ text: string; lat: number; lon: number }> {
  const data = layerData.get(parsed.layer) as Array<Record<string, unknown>> | undefined;
  if (!data || !Array.isArray(data)) return [];

  const matches: Array<{ text: string; lat: number; lon: number }> = [];

  switch (parsed.condition) {
    case 'magnitude_above': {
      if (parsed.threshold === null) return [];
      for (const item of data) {
        const mag = Number(item.magnitude);
        if (mag >= parsed.threshold) {
          const lat = Number(item.lat);
          const lon = Number(item.lon);
          if (lat && lon) {
            if (parsed.location && !matchesLocation(item, parsed.location)) continue;
            matches.push({ text: `M${mag.toFixed(1)} — ${item.place || 'Unknown'}`, lat, lon });
          }
        }
      }
      break;
    }

    case 'count_above': {
      if (parsed.threshold === null) return [];
      let filtered = data;
      if (parsed.location) {
        filtered = data.filter((item) => matchesLocation(item, parsed.location!));
      }
      if (filtered.length >= parsed.threshold) {
        const center = computeCentroid(filtered);
        matches.push({ text: `${filtered.length} events (threshold: ${parsed.threshold})`, ...center });
      }
      break;
    }

    case 'fatalities_above': {
      if (parsed.threshold === null) return [];
      for (const item of data) {
        const fat = Number(item.fatalities);
        if (fat >= parsed.threshold) {
          const lat = Number(item.lat);
          const lon = Number(item.lon);
          if (lat && lon) {
            matches.push({ text: `${fat} casualties — ${item.event_type || item.country || 'Unknown'}`, lat, lon });
          }
        }
      }
      break;
    }

    case 'severity_equals': {
      for (const item of data) {
        if (String(item.severity) === String(parsed.threshold)) {
          const lat = Number(item.lat);
          const lon = Number(item.lon);
          if (lat && lon) {
            matches.push({ text: `${item.country || item.name || 'Event'} — severity: ${item.severity}`, lat, lon });
          }
        }
      }
      break;
    }

    case 'near_layer': {
      if (!parsed.comparisonLayer || !parsed.radiusKm) return [];
      const compData = layerData.get(parsed.comparisonLayer) as Array<Record<string, unknown>> | undefined;
      if (!compData) return [];

      for (const source of data) {
        const sLat = Number(source.lat);
        const sLon = Number(source.lon);
        if (!sLat || !sLon) continue;
        if (parsed.threshold !== null && parsed.layer === 'earthquakes') {
          if ((Number(source.magnitude) || 0) < parsed.threshold) continue;
        }

        for (const target of compData) {
          const tLat = Number(target.lat);
          const tLon = Number(target.lon);
          if (!tLat || !tLon) continue;
          const dist = haversineKm(sLat, sLon, tLat, tLon);
          if (dist < parsed.radiusKm) {
            matches.push({
              text: `${source.place || source.name || parsed.layer} — ${Math.round(dist)}km from ${target.name || parsed.comparisonLayer}`,
              lat: sLat,
              lon: sLon,
            });
            break; // One match per source is enough
          }
        }
      }
      break;
    }

    case 'country_equals': {
      for (const item of data) {
        if (matchesLocation(item, parsed.location || '')) {
          const lat = Number(item.lat);
          const lon = Number(item.lon);
          if (lat && lon) {
            matches.push({ text: `${item.event_type || item.name || parsed.layer} in ${parsed.location}`, lat, lon });
          }
        }
      }
      break;
    }

    case 'any_new': {
      // Alert on any new data in the layer
      if (data.length > 0) {
        const first = data[0];
        const lat = Number(first.lat) || 0;
        const lon = Number(first.lon) || 0;
        matches.push({ text: `New ${parsed.layer} data: ${data.length} events`, lat, lon });
      }
      break;
    }
  }

  return matches;
}

function matchesLocation(item: Record<string, unknown>, location: string): boolean {
  const loc = location.toLowerCase();
  const fields = [item.country, item.place, item.region, item.code, item.name];
  return fields.some((f) => typeof f === 'string' && f.toLowerCase().includes(loc));
}

function computeCentroid(items: Array<Record<string, unknown>>): { lat: number; lon: number } {
  let totalLat = 0;
  let totalLon = 0;
  let count = 0;
  for (const item of items) {
    const lat = Number(item.lat);
    const lon = Number(item.lon);
    if (lat && lon) {
      totalLat += lat;
      totalLon += lon;
      count++;
    }
  }
  return count > 0 ? { lat: totalLat / count, lon: totalLon / count } : { lat: 0, lon: 0 };
}

function classifySeverity(parsed: ParsedRule, matches: Array<{ text: string }>): 'critical' | 'elevated' | 'monitor' {
  // High-severity conditions
  if (parsed.condition === 'near_layer' && parsed.comparisonLayer === 'nuclear') return 'critical';
  if (parsed.condition === 'fatalities_above' && (parsed.threshold || 0) >= 50) return 'critical';
  if (parsed.condition === 'magnitude_above' && (parsed.threshold || 0) >= 6.0) return 'critical';

  // Medium
  if (matches.length >= 3) return 'elevated';
  if (parsed.condition === 'near_layer') return 'elevated';

  return 'monitor';
}
