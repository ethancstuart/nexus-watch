import type { CountryIntelScore, EarthquakeFeature, FireHotspot, WeatherAlert, GdeltArticle } from '../types/index.ts';
import { haversineKm } from '../utils/geo.ts';

// Country metadata for scoring
const COUNTRIES: { code: string; name: string; lat: number; lon: number }[] = [
  { code: 'US', name: 'United States', lat: 39.8, lon: -98.5 },
  { code: 'RU', name: 'Russia', lat: 61.5, lon: 105.3 },
  { code: 'CN', name: 'China', lat: 35.9, lon: 104.2 },
  { code: 'UA', name: 'Ukraine', lat: 48.4, lon: 31.2 },
  { code: 'IL', name: 'Israel', lat: 31.0, lon: 34.9 },
  { code: 'IR', name: 'Iran', lat: 32.4, lon: 53.7 },
  { code: 'IN', name: 'India', lat: 20.6, lon: 78.9 },
  { code: 'GB', name: 'United Kingdom', lat: 54.0, lon: -2.0 },
  { code: 'FR', name: 'France', lat: 46.2, lon: 2.2 },
  { code: 'DE', name: 'Germany', lat: 51.2, lon: 10.4 },
  { code: 'JP', name: 'Japan', lat: 36.2, lon: 138.3 },
  { code: 'BR', name: 'Brazil', lat: -14.2, lon: -51.9 },
  { code: 'TR', name: 'Turkey', lat: 38.9, lon: 35.2 },
  { code: 'SA', name: 'Saudi Arabia', lat: 23.9, lon: 45.1 },
  { code: 'EG', name: 'Egypt', lat: 26.8, lon: 30.8 },
  { code: 'PK', name: 'Pakistan', lat: 30.4, lon: 69.3 },
  { code: 'NG', name: 'Nigeria', lat: 9.1, lon: 8.7 },
  { code: 'MX', name: 'Mexico', lat: 23.6, lon: -102.6 },
  { code: 'KR', name: 'South Korea', lat: 35.9, lon: 127.8 },
  { code: 'AU', name: 'Australia', lat: -25.3, lon: 133.8 },
  { code: 'SY', name: 'Syria', lat: 34.8, lon: 38.9 },
  { code: 'AF', name: 'Afghanistan', lat: 33.9, lon: 67.7 },
  { code: 'IQ', name: 'Iraq', lat: 33.2, lon: 43.7 },
];

// Approximate bounding radius for "near country" (km)
const COUNTRY_RADIUS_KM = 800;

let cachedScores: CountryIntelScore[] = [];
let lastComputed = 0;

export function computeCountryScores(layerData: Map<string, unknown>): CountryIntelScore[] {
  const earthquakes = (layerData.get('earthquakes') as EarthquakeFeature[]) || [];
  const fires = (layerData.get('fires') as FireHotspot[]) || [];
  const weatherAlerts = (layerData.get('weather-alerts') as WeatherAlert[]) || [];
  const news = (layerData.get('news') as GdeltArticle[]) || [];

  const scores: CountryIntelScore[] = [];

  for (const country of COUNTRIES) {
    // ── Events component (0-25): earthquake + news volume ──
    const nearbyQuakes = earthquakes.filter(
      (eq) => haversineKm(country.lat, country.lon, eq.lat, eq.lon) < COUNTRY_RADIUS_KM,
    );
    const quakeScore = Math.min(25, nearbyQuakes.length * 3 + nearbyQuakes.filter((q) => q.magnitude >= 5).length * 8);

    const countryNews = news.filter((a) => a.sourceCountry === country.code);
    const newsVolume = Math.min(10, countryNews.length * 0.5);
    const eventsScore = Math.min(25, quakeScore + newsVolume);

    // ── Disasters component (0-25): fires + weather ──
    const nearbyFires = fires.filter((f) => haversineKm(country.lat, country.lon, f.lat, f.lon) < COUNTRY_RADIUS_KM);
    const fireScore = Math.min(15, nearbyFires.length * 0.05);

    const countryWeather = weatherAlerts.filter(
      (w) => haversineKm(country.lat, country.lon, w.lat, w.lon) < COUNTRY_RADIUS_KM,
    );
    const weatherScore = countryWeather.reduce(
      (sum, w) => sum + (w.severity === 'extreme' ? 10 : w.severity === 'severe' ? 5 : 2),
      0,
    );
    const disastersScore = Math.min(25, fireScore + Math.min(15, weatherScore));

    // ── Sentiment component (0-25): news tone ──
    let sentimentScore = 0;
    if (countryNews.length >= 2) {
      const avgTone = countryNews.reduce((sum, a) => sum + a.tone, 0) / countryNews.length;
      // Negative tone increases score (tone ranges roughly -10 to +10)
      sentimentScore = Math.min(25, Math.max(0, -avgTone * 2.5));
    }

    // ── Predictions component (0-25): placeholder (no country-level prediction data yet) ──
    const predictionsScore = 0;

    const totalScore = Math.min(100, Math.round(eventsScore + disastersScore + sentimentScore + predictionsScore));

    const recentEvents: string[] = [];
    for (const eq of nearbyQuakes.slice(0, 3)) {
      recentEvents.push(`M${eq.magnitude} earthquake — ${eq.place}`);
    }
    if (nearbyFires.length > 0) {
      recentEvents.push(`${nearbyFires.length} active fire hotspots`);
    }
    for (const w of countryWeather) {
      recentEvents.push(w.description);
    }
    if (countryNews.length > 0) {
      recentEvents.push(
        `${countryNews.length} news articles (avg tone: ${(countryNews.reduce((s, a) => s + a.tone, 0) / countryNews.length).toFixed(1)})`,
      );
    }

    scores.push({
      code: country.code,
      name: country.name,
      score: totalScore,
      components: {
        events: Math.round(eventsScore),
        disasters: Math.round(disastersScore),
        sentiment: Math.round(sentimentScore),
        predictions: predictionsScore,
      },
      recentEvents: recentEvents.slice(0, 5),
      lastUpdated: Date.now(),
    });
  }

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  cachedScores = scores;
  lastComputed = Date.now();

  return scores;
}

export function getCachedScores(): CountryIntelScore[] {
  return cachedScores;
}

export function getCountryScore(code: string): CountryIntelScore | undefined {
  return cachedScores.find((s) => s.code === code);
}

export function getLastComputed(): number {
  return lastComputed;
}

export function scoreToLabel(score: number): { label: string; color: string } {
  if (score >= 75) return { label: 'CRITICAL', color: '#dc2626' };
  if (score >= 50) return { label: 'ELEVATED', color: '#f97316' };
  if (score >= 25) return { label: 'MODERATE', color: '#eab308' };
  return { label: 'STABLE', color: '#00ff00' };
}
