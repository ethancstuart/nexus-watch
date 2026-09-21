import type { EarthquakeFeature, FireHotspot, WeatherAlert, GdeltArticle } from '../types/index.ts';

const SAMPLE_SITREP = `SITUATION REPORT — SAMPLE (AI not configured)

Global tension remains elevated across multiple theaters. The Eastern European theater continues to see sustained combat operations along the Ukraine-Russia contact line, with ACLED data recording significant casualty concentrations in Donetsk and Zaporizhzhia oblasts. Naval activity in the Red Sea persists as Houthi forces maintain anti-shipping operations through the Bab el-Mandeb strait, forcing continued rerouting via the Cape of Good Hope.

In the Indo-Pacific, routine PLA naval exercises in the South China Sea coincide with increased US carrier group presence in the Western Pacific. GPS jamming activity remains elevated across the Eastern Mediterranean and Baltic regions. GDELT sentiment analysis shows negative news tone trending across conflict-adjacent regions.

RISK ASSESSMENT: Global tension index holding at MODERATE-ELEVATED. Primary escalation vectors remain the Ukraine theater, Red Sea maritime corridor, and Taiwan Strait. No immediate indicators of new conflict initiation detected.

[This is a sample report. Configure ANTHROPIC_API_KEY for AI-generated sitreps from live data.]`;
import { fetchWithRetry } from '../utils/fetch.ts';
import { getWatchlist, getWatchMatches } from './watchlist.ts';
import { getTensionState } from './tensionIndex.ts';

export interface SitrepResult {
  sitrep: string;
  region: string;
  generatedAt: string;
}

export async function generateSitrep(region: string, layerData: Map<string, unknown>): Promise<SitrepResult> {
  const earthquakes = (layerData.get('earthquakes') as EarthquakeFeature[]) || [];
  const fires = (layerData.get('fires') as FireHotspot[]) || [];
  const news = (layerData.get('news') as GdeltArticle[]) || [];
  const weather = (layerData.get('weather-alerts') as WeatherAlert[]) || [];

  const fireRegions = new Set<string>();
  for (const f of fires.slice(0, 100)) {
    fireRegions.add(`${f.lat.toFixed(0)}°${f.lat >= 0 ? 'N' : 'S'}, ${f.lon.toFixed(0)}°${f.lon >= 0 ? 'E' : 'W'}`);
  }

  const body = {
    region,
    data: {
      earthquakes: earthquakes.slice(0, 10).map((e) => ({
        magnitude: e.magnitude,
        place: e.place,
        time: e.time,
      })),
      fires: {
        count: fires.length,
        regions: Array.from(fireRegions).slice(0, 5),
      },
      news: news.slice(0, 8).map((n) => ({
        title: n.title,
        source: n.source,
        tone: n.tone,
      })),
      weather: weather.map((w) => ({
        city: w.city,
        description: w.description,
      })),
    },
  };

  const res = await fetchWithRetry('/api/sitrep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    // Fallback: return sample sitrep when AI is not configured
    return {
      sitrep: SAMPLE_SITREP,
      region,
      generatedAt: new Date().toISOString(),
    };
  }

  return (await res.json()) as SitrepResult;
}

export async function generatePersonalBrief(layerData: Map<string, unknown>): Promise<SitrepResult> {
  const watchlist = getWatchlist();
  const matches = getWatchMatches();
  const tension = getTensionState();

  const earthquakes = (layerData.get('earthquakes') as EarthquakeFeature[]) || [];
  const news = (layerData.get('news') as GdeltArticle[]) || [];

  // Build personalized context
  const watchContext = watchlist.map((w) => w.label).join(', ');
  const matchSummary = matches
    .slice(0, 15)
    .map((m) => `[${m.watchLabel}] ${m.source}: ${m.text}`)
    .join('\n');

  const body = {
    region: 'Personal Brief',
    data: {
      earthquakes: earthquakes.slice(0, 5).map((e) => ({
        magnitude: e.magnitude,
        place: e.place,
        time: e.time,
      })),
      news: news.slice(0, 5).map((n) => ({
        title: n.title,
        source: n.source,
        tone: n.tone,
      })),
      // Personal intelligence context
      personalContext: {
        tensionIndex: tension.global,
        tensionTrend: tension.trend,
        watchlistTopics: watchContext,
        watchlistMatches: matchSummary,
      },
    },
  };

  const res = await fetchWithRetry('/api/sitrep', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return {
      sitrep: SAMPLE_SITREP,
      region: 'Personal Brief',
      generatedAt: new Date().toISOString(),
    };
  }

  return (await res.json()) as SitrepResult;
}
