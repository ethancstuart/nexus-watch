import type { EarthquakeFeature, GdeltArticle } from '../types/index.ts';
import { haversineKm } from '../utils/geo.ts';

export interface ThreatAlert {
  id: string;
  type: 'convergence' | 'surge' | 'anomaly';
  severity: 'critical' | 'elevated' | 'monitor';
  title: string;
  description: string;
  lat: number;
  lon: number;
  timestamp: number;
}

let alerts: ThreatAlert[] = [];
let lastCheck = 0;

export function getAutoAlerts(): ThreatAlert[] {
  return alerts;
}

export function runThreatDetection(layerData: Map<string, unknown>): ThreatAlert[] {
  const now = Date.now();
  // Only run every 60 seconds
  if (now - lastCheck < 60000) return alerts;
  lastCheck = now;

  const newAlerts: ThreatAlert[] = [];

  const earthquakes = (layerData.get('earthquakes') as EarthquakeFeature[]) || [];
  const fires = (layerData.get('fires') as { lat: number; lon: number }[]) || [];
  const news = (layerData.get('news') as GdeltArticle[]) || [];
  const acled = (layerData.get('acled') as { lat: number; lon: number; fatalities: number; country: string }[]) || [];
  const outages = (layerData.get('internet-outages') as { country: string; severity: string }[]) || [];

  // ── Multi-signal convergence: earthquake + fires in same region ──
  for (const eq of earthquakes.filter((e) => e.magnitude >= 5.0)) {
    const nearbyFires = fires.filter((f) => haversineKm(eq.lat, eq.lon, f.lat, f.lon) < 300);
    if (nearbyFires.length >= 5) {
      newAlerts.push({
        id: `converge-eq-fire-${eq.id}`,
        type: 'convergence',
        severity: 'critical',
        title: `CONVERGENCE: M${eq.magnitude} earthquake + ${nearbyFires.length} fires`,
        description: `Seismic event near ${eq.place} with active fire hotspots in proximity. Possible infrastructure damage cascade.`,
        lat: eq.lat,
        lon: eq.lon,
        timestamp: now,
      });
    }
  }

  // ── Conflict + internet outage convergence ──
  const conflictCountries = new Set(acled.map((e) => e.country));
  for (const outage of outages) {
    if (outage.severity === 'frequent' || outage.severity === 'permanent') {
      if (conflictCountries.has(outage.country)) {
        newAlerts.push({
          id: `converge-conflict-outage-${outage.country}`,
          type: 'convergence',
          severity: 'elevated',
          title: `CONVERGENCE: Active conflict + internet disruption in ${outage.country}`,
          description: `${outage.country} experiencing both armed conflict events and internet disruptions. Possible information blackout during military operations.`,
          lat: 0,
          lon: 0,
          timestamp: now,
        });
      }
    }
  }

  // ── High casualty surge detection ──
  const totalFatalities = acled.reduce((sum, e) => sum + (e.fatalities || 0), 0);
  if (totalFatalities > 100) {
    newAlerts.push({
      id: `surge-casualties-${now}`,
      type: 'surge',
      severity: totalFatalities > 500 ? 'critical' : 'elevated',
      title: `CASUALTY SURGE: ${totalFatalities} fatalities in last 7 days`,
      description: `ACLED data shows elevated fatality count across active conflict zones. Major theaters: ${[...new Set(acled.filter((e) => e.fatalities > 5).map((e) => e.country))].slice(0, 5).join(', ')}.`,
      lat: 0,
      lon: 0,
      timestamp: now,
    });
  }

  // ── Negative news sentiment surge ──
  if (news.length > 10) {
    const avgTone = news.reduce((sum, a) => sum + a.tone, 0) / news.length;
    if (avgTone < -5) {
      newAlerts.push({
        id: `surge-sentiment-${now}`,
        type: 'surge',
        severity: avgTone < -8 ? 'critical' : 'elevated',
        title: `SENTIMENT SURGE: Global news tone at ${avgTone.toFixed(1)}`,
        description: `GDELT analysis shows unusually negative global news sentiment. This often precedes or accompanies escalatory events.`,
        lat: 0,
        lon: 0,
        timestamp: now,
      });
    }
  }

  // ── Major earthquake alert ──
  for (const eq of earthquakes.filter((e) => e.magnitude >= 6.5)) {
    newAlerts.push({
      id: `anomaly-eq-major-${eq.id}`,
      type: 'anomaly',
      severity: eq.magnitude >= 7.0 ? 'critical' : 'elevated',
      title: `MAJOR EARTHQUAKE: M${eq.magnitude} — ${eq.place}`,
      description: `Significant seismic event detected. ${eq.tsunami ? 'TSUNAMI WARNING ISSUED.' : 'No tsunami warning.'} Depth: ${eq.depth.toFixed(1)}km.`,
      lat: eq.lat,
      lon: eq.lon,
      timestamp: eq.time,
    });
  }

  // Dedupe and update
  const seen = new Set<string>();
  alerts = newAlerts.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });

  if (alerts.length > 0) {
    document.dispatchEvent(new CustomEvent('dashview:auto-alerts', { detail: { alerts } }));
  }

  return alerts;
}
