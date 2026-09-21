import type { EarthquakeFeature, FireHotspot, WeatherAlert, GdeltArticle } from '../types/index.ts';

const HISTORY_KEY = 'nw:tension-history';
const MAX_HISTORY = 168; // 7 days * 24 hours

export interface TensionState {
  global: number;
  trend: 'rising' | 'falling' | 'stable';
  components: {
    conflict: number; // 0-25
    disasters: number; // 0-25
    sentiment: number; // 0-25
    instability: number; // 0-25
  };
  history: { time: number; value: number }[];
}

let currentState: TensionState = {
  global: 0,
  trend: 'stable',
  components: { conflict: 0, disasters: 0, sentiment: 0, instability: 0 },
  history: loadHistory(),
};

// CII-derived tension floor — fetched from server to compensate for blocked client-side sources
let cachedCiiTension: { conflict: number; disasters: number; sentiment: number; instability: number } | null = null;
let ciiTensionFetched = false;

function fetchCiiTensionFloor(): void {
  if (ciiTensionFetched) return;
  ciiTensionFetched = true;
  fetch('/api/v1/cii')
    .then((r) => r.json())
    .then((data: { scores?: Array<{ score: number; components: Record<string, number> }> }) => {
      const scores = data.scores || [];
      if (scores.length === 0) return;
      // Derive tension components from aggregate CII data
      const avgConflict = scores.reduce((s, c) => s + (c.components.conflict || 0), 0) / scores.length;
      const avgDisasters = scores.reduce((s, c) => s + (c.components.disasters || 0), 0) / scores.length;
      const avgSentiment = scores.reduce((s, c) => s + (c.components.sentiment || 0), 0) / scores.length;
      const avgGov = scores.reduce((s, c) => s + (c.components.governance || 0), 0) / scores.length;
      const avgMarket = scores.reduce((s, c) => s + (c.components.marketExposure || 0), 0) / scores.length;
      const highRiskCount = scores.filter((s) => s.score >= 50).length;

      cachedCiiTension = {
        conflict: Math.min(25, Math.round(avgConflict * 1.5 + highRiskCount * 1.5)),
        disasters: Math.min(25, Math.round(avgDisasters * 2)),
        sentiment: Math.min(25, Math.round(avgSentiment * 1.5 + avgGov * 0.5)),
        instability: Math.min(25, Math.round(avgMarket * 0.8 + highRiskCount * 1)),
      };
    })
    .catch(() => {
      /* non-critical */
    });
}

// Fetch on module load
fetchCiiTensionFloor();

export function computeTensionIndex(layerData: Map<string, unknown>): TensionState {
  // ── CONFLICT component (0-25) ──
  // ACLED events + static conflict zones + CII-derived baseline
  const acled = (layerData.get('acled') as { fatalities: number }[]) || [];
  const acledScore = Math.min(15, acled.length * 0.03 + acled.reduce((sum, e) => sum + (e.fatalities || 0), 0) * 0.1);
  const conflicts = (layerData.get('conflicts') as unknown[]) || [];
  const conflictBase = Math.min(10, conflicts.length * 0.7);
  // CII-derived conflict floor: fetch from server-side scores
  // If client-side data is thin (ACLED blocked), use CII as baseline
  const ciiConflictFloor = cachedCiiTension?.conflict ?? 0;
  const conflict = Math.min(25, Math.round(Math.max(acledScore + conflictBase, ciiConflictFloor)));

  // ── DISASTERS component (0-25) ──
  const earthquakes = (layerData.get('earthquakes') as EarthquakeFeature[]) || [];
  const fires = (layerData.get('fires') as FireHotspot[]) || [];
  const gdacs = (layerData.get('gdacs') as unknown[]) || [];
  const weather = (layerData.get('weather-alerts') as WeatherAlert[]) || [];

  const eqScore = Math.min(10, earthquakes.filter((e) => e.magnitude >= 4.5).length * 2);
  const fireScore = Math.min(5, fires.length * 0.005);
  const gdacsScore = Math.min(5, (gdacs.length || 0) * 1.5);
  const wxScore = Math.min(5, weather.length * 1);
  const ciiDisasterFloor = cachedCiiTension?.disasters ?? 0;
  const disasters = Math.min(25, Math.round(Math.max(eqScore + fireScore + gdacsScore + wxScore, ciiDisasterFloor)));

  // ── SENTIMENT component (0-25) ──
  const news = (layerData.get('news') as GdeltArticle[]) || [];
  let sentimentScore = 0;
  if (news.length > 0) {
    const avgTone = news.reduce((sum, a) => sum + a.tone, 0) / news.length;
    sentimentScore = Math.min(25, Math.max(0, Math.round(-avgTone * 3)));
  }
  // If no news data (GDELT blocked), use CII-derived sentiment floor
  const sentiment = Math.max(sentimentScore, cachedCiiTension?.sentiment ?? 0);

  // ── INSTABILITY component (0-25) ──
  const cyber = (layerData.get('cyber') as unknown[]) || [];
  const gpsJamming = (layerData.get('gps-jamming') as unknown[]) || [];
  const cyberScore = Math.min(10, (cyber.length || 0) * 0.8);
  const gpsScore = Math.min(10, (gpsJamming.length || 0) * 0.9);
  const predictions = (layerData.get('predictions') as { probability: number }[]) || [];
  const predScore = predictions.length > 0 ? Math.min(5, predictions.filter((p) => p.probability < 30).length * 1) : 0;
  const ciiInstabilityFloor = cachedCiiTension?.instability ?? 0;
  const instability = Math.min(25, Math.round(Math.max(cyberScore + gpsScore + predScore, ciiInstabilityFloor)));

  const global = Math.min(100, conflict + disasters + sentiment + instability);

  // Trend calculation
  const prevValue =
    currentState.history.length > 0 ? currentState.history[currentState.history.length - 1].value : global;
  const diff = global - prevValue;
  const trend: TensionState['trend'] = diff > 2 ? 'rising' : diff < -2 ? 'falling' : 'stable';

  // Update history (hourly samples)
  const now = Date.now();
  const history = [...currentState.history];
  const lastSample = history.length > 0 ? history[history.length - 1].time : 0;
  if (now - lastSample > 3600000 || history.length === 0) {
    // Sample hourly
    history.push({ time: now, value: global });
    if (history.length > MAX_HISTORY) history.shift();
    saveHistory(history);
  }

  currentState = {
    global,
    trend,
    components: { conflict, disasters, sentiment, instability },
    history,
  };

  return currentState;
}

export function getTensionState(): TensionState {
  return currentState;
}

export function tensionColor(score: number): string {
  if (score >= 75) return '#dc2626';
  if (score >= 50) return '#f97316';
  if (score >= 25) return '#eab308';
  return '#00ff00';
}

export function tensionLabel(score: number): string {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'ELEVATED';
  if (score >= 25) return 'MODERATE';
  return 'LOW';
}

function loadHistory(): { time: number; value: number }[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (raw) return JSON.parse(raw) as { time: number; value: number }[];
  } catch {
    // ignore
  }
  return [];
}

function saveHistory(history: { time: number; value: number }[]): void {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}
