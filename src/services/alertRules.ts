import type { EarthquakeFeature, FireHotspot } from '../types/index.ts';

const STORAGE_KEY = 'nw:alert-rules';

export interface AlertRule {
  id: string;
  type: 'earthquake' | 'fire_cluster' | 'country_score';
  enabled: boolean;
  label: string;
  // Earthquake: magnitude threshold
  minMagnitude?: number;
  // Proximity: lat/lon + radius in km
  lat?: number;
  lon?: number;
  radiusKm?: number;
  locationName?: string;
  // Country score: threshold
  countryCode?: string;
  scoreThreshold?: number;
  // Fire cluster: min count in area
  minFireCount?: number;
}

export interface TriggeredAlert {
  ruleId: string;
  message: string;
  timestamp: number;
}

let rules: AlertRule[] = [];
let triggeredAlerts: TriggeredAlert[] = [];

export function loadRules(): AlertRule[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) rules = JSON.parse(raw) as AlertRule[];
  } catch {
    rules = [];
  }
  if (rules.length === 0) {
    // Default rules
    rules = [
      {
        id: 'eq-major',
        type: 'earthquake',
        enabled: true,
        label: 'Major earthquake (M6+)',
        minMagnitude: 6.0,
      },
      {
        id: 'eq-significant',
        type: 'earthquake',
        enabled: true,
        label: 'Significant earthquake (M5+)',
        minMagnitude: 5.0,
      },
      {
        id: 'fire-cluster-50',
        type: 'fire_cluster',
        enabled: true,
        label: 'Large fire cluster (50+ hotspots)',
        minFireCount: 50,
      },
    ];
    saveRules();
  }
  return rules;
}

export function getRules(): AlertRule[] {
  return rules;
}

export function saveRules(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
}

export function addRule(rule: AlertRule): void {
  rules.push(rule);
  saveRules();
}

export function removeRule(id: string): void {
  rules = rules.filter((r) => r.id !== id);
  saveRules();
}

export function toggleRule(id: string): void {
  const rule = rules.find((r) => r.id === id);
  if (rule) {
    rule.enabled = !rule.enabled;
    saveRules();
  }
}

export function getTriggeredAlerts(): TriggeredAlert[] {
  return triggeredAlerts;
}

export function checkRules(layerData: Map<string, unknown>): TriggeredAlert[] {
  const newAlerts: TriggeredAlert[] = [];
  const now = Date.now();

  for (const rule of rules) {
    if (!rule.enabled) continue;

    if (rule.type === 'earthquake') {
      const quakes = (layerData.get('earthquakes') as EarthquakeFeature[]) || [];
      for (const eq of quakes) {
        if (rule.minMagnitude && eq.magnitude >= rule.minMagnitude) {
          // Check proximity if set
          if (rule.lat !== undefined && rule.lon !== undefined && rule.radiusKm) {
            const dist = haversineKm(rule.lat, rule.lon, eq.lat, eq.lon);
            if (dist > rule.radiusKm) continue;
          }
          const alertId = `${rule.id}-${eq.id}`;
          if (!triggeredAlerts.some((a) => a.ruleId === alertId)) {
            newAlerts.push({
              ruleId: alertId,
              message: `ALERT: M${eq.magnitude} earthquake — ${eq.place}`,
              timestamp: now,
            });
          }
        }
      }
    }

    if (rule.type === 'fire_cluster') {
      const fires = (layerData.get('fires') as FireHotspot[]) || [];
      if (rule.minFireCount && fires.length >= rule.minFireCount) {
        const alertId = `${rule.id}-${now}`;
        // Only alert once per 30 minutes
        const recent = triggeredAlerts.find((a) => a.ruleId.startsWith(rule.id) && now - a.timestamp < 1800000);
        if (!recent) {
          newAlerts.push({
            ruleId: alertId,
            message: `ALERT: ${fires.length} fire hotspots detected globally`,
            timestamp: now,
          });
        }
      }
    }
  }

  // Send browser notifications
  for (const alert of newAlerts) {
    sendNotification(alert.message);
  }

  triggeredAlerts = [...newAlerts, ...triggeredAlerts].slice(0, 50);
  return newAlerts;
}

function sendNotification(message: string): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification('NexusWatch Alert', { body: message, icon: '/icons/icon-192.svg' });
  }
}

export function requestNotificationPermission(): void {
  if ('Notification' in window && Notification.permission === 'default') {
    void Notification.requestPermission();
  }
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
