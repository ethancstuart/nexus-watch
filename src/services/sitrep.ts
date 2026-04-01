import type { EarthquakeFeature, FireHotspot, WeatherAlert, GdeltArticle } from '../types/index.ts';
import { fetchWithRetry } from '../utils/fetch.ts';

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

  // Build summary data for the API
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
    const err = (await res.json()) as { error?: string };
    throw new Error(err.error || 'Failed to generate sitrep');
  }

  return (await res.json()) as SitrepResult;
}
