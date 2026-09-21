import type { IntelItem, EarthquakeFeature, FireHotspot, WeatherAlert, GdeltArticle } from '../types/index.ts';
import { haversineKm } from '../utils/geo.ts';

const layerData = new Map<string, unknown>();
let intelItems: IntelItem[] = [];
let intervalId: ReturnType<typeof setInterval> | null = null;

export function initGeoIntelligence(signal?: AbortSignal): void {
  document.addEventListener(
    'dashview:layer-data',
    (e) => {
      const detail = (e as CustomEvent).detail;
      if (detail.layerId && detail.data) {
        layerData.set(detail.layerId, detail.data);
      }
    },
    signal ? { signal } : undefined,
  );

  runGeoCorrelation();
  intervalId = setInterval(runGeoCorrelation, 30_000);
}

export function destroyGeoIntelligence(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  layerData.clear();
}

export function getIntelItems(): IntelItem[] {
  return intelItems;
}

export function getLayerData(): Map<string, unknown> {
  return layerData;
}

function runGeoCorrelation(): void {
  const items: IntelItem[] = [];

  // ── Earthquake alerts ──
  const earthquakes = layerData.get('earthquakes') as EarthquakeFeature[] | undefined;
  if (earthquakes) {
    // Major earthquakes (M >= 5.0)
    for (const eq of earthquakes) {
      if (eq.magnitude >= 6.0) {
        items.push({
          id: `eq-major-${eq.id}`,
          type: 'earthquake',
          priority: 0,
          text: `M${eq.magnitude} — ${eq.place}`,
          icon: '🔴',
          lat: eq.lat,
          lon: eq.lon,
          layerId: 'earthquakes',
        });
      } else if (eq.magnitude >= 5.0) {
        items.push({
          id: `eq-sig-${eq.id}`,
          type: 'earthquake',
          priority: 1,
          text: `M${eq.magnitude} — ${eq.place}`,
          icon: '🟠',
          lat: eq.lat,
          lon: eq.lon,
          layerId: 'earthquakes',
        });
      }
    }

    // Earthquake cluster detection (3+ within 200km)
    const clusters = detectClusters(
      earthquakes.map((e) => ({ lat: e.lat, lon: e.lon })),
      200,
      3,
    );
    for (const cluster of clusters) {
      items.push({
        id: `eq-cluster-${cluster.lat.toFixed(0)}-${cluster.lon.toFixed(0)}`,
        type: 'earthquake',
        priority: 1,
        text: `Seismic cluster: ${cluster.count} quakes near ${earthquakes.find((e) => Math.abs(e.lat - cluster.lat) < 2)?.place || 'unknown'}`,
        icon: '⚡',
        lat: cluster.lat,
        lon: cluster.lon,
        layerId: 'earthquakes',
      });
    }
  }

  // ── Fire alerts ──
  const fires = layerData.get('fires') as FireHotspot[] | undefined;
  if (fires) {
    // Large fire clusters
    const fireClusters = detectClusters(
      fires.map((f) => ({ lat: f.lat, lon: f.lon })),
      100,
      10,
    );
    for (const cluster of fireClusters) {
      items.push({
        id: `fire-cluster-${cluster.lat.toFixed(0)}-${cluster.lon.toFixed(0)}`,
        type: 'fire',
        priority: cluster.count > 50 ? 0 : 1,
        text: `${cluster.count} fire hotspots detected`,
        icon: '🔥',
        lat: cluster.lat,
        lon: cluster.lon,
        layerId: 'fires',
      });
    }
  }

  // ── Weather alerts ──
  const weather = layerData.get('weather-alerts') as WeatherAlert[] | undefined;
  if (weather) {
    for (const alert of weather) {
      items.push({
        id: `wx-${alert.type}-${alert.city}`,
        type: 'weather',
        priority: alert.severity === 'extreme' ? 0 : alert.severity === 'severe' ? 1 : 2,
        text: `${alert.description} — ${alert.city}`,
        icon: alert.type === 'extreme_heat' ? '🌡️' : alert.type === 'extreme_cold' ? '❄️' : '⚠️',
        lat: alert.lat,
        lon: alert.lon,
        layerId: 'weather-alerts',
      });
    }
  }

  // ── News velocity ──
  const news = layerData.get('news') as GdeltArticle[] | undefined;
  if (news) {
    // Detect negative tone surge by country
    const countryTones = new Map<string, { total: number; count: number }>();
    for (const article of news) {
      const cc = article.sourceCountry;
      if (!cc) continue;
      const entry = countryTones.get(cc) || { total: 0, count: 0 };
      entry.total += article.tone;
      entry.count++;
      countryTones.set(cc, entry);
    }

    for (const [cc, { total, count }] of countryTones) {
      if (count < 3) continue;
      const avgTone = total / count;
      if (avgTone < -5) {
        items.push({
          id: `news-neg-${cc}`,
          type: 'news',
          priority: avgTone < -8 ? 0 : 1,
          text: `Negative news surge: ${cc} (tone: ${avgTone.toFixed(1)})`,
          icon: '📰',
          lat: 0,
          lon: 0,
          layerId: 'news',
        });
      }
    }
  }

  // ── Multi-signal convergence ──
  if (earthquakes && fires) {
    for (const eq of earthquakes.filter((e) => e.magnitude >= 4.5)) {
      const nearbyFires = fires.filter((f) => haversineKm(eq.lat, eq.lon, f.lat, f.lon) < 300);
      if (nearbyFires.length >= 5) {
        items.push({
          id: `converge-eq-fire-${eq.id}`,
          type: 'convergence',
          priority: 0,
          text: `CONVERGENCE: M${eq.magnitude} quake + ${nearbyFires.length} fires near ${eq.place}`,
          icon: '🔺',
          lat: eq.lat,
          lon: eq.lon,
        });
      }
    }
  }

  // Sort by priority, filter expired
  const now = Date.now();
  intelItems = items.filter((item) => !item.expiry || item.expiry > now).sort((a, b) => a.priority - b.priority);

  document.dispatchEvent(new CustomEvent('dashview:intel-update', { detail: { items: intelItems } }));
}

// ── Spatial Utilities ──

interface ClusterResult {
  lat: number;
  lon: number;
  count: number;
}

function detectClusters(points: { lat: number; lon: number }[], radiusKm: number, minPoints: number): ClusterResult[] {
  // Simple grid-based clustering
  const cellSize = radiusKm / 111; // degrees (~111km per degree)
  const grid = new Map<string, { lat: number; lon: number; count: number }>();

  for (const p of points) {
    const key = `${Math.floor(p.lat / cellSize)},${Math.floor(p.lon / cellSize)}`;
    const cell = grid.get(key) || { lat: 0, lon: 0, count: 0 };
    cell.lat = (cell.lat * cell.count + p.lat) / (cell.count + 1);
    cell.lon = (cell.lon * cell.count + p.lon) / (cell.count + 1);
    cell.count++;
    grid.set(key, cell);
  }

  return Array.from(grid.values()).filter((c) => c.count >= minPoints);
}
