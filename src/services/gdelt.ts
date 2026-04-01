import type { GdeltArticle } from '../types/index.ts';
import { fetchWithRetry } from '../utils/fetch.ts';

export async function fetchGdeltArticles(query?: string): Promise<GdeltArticle[]> {
  const params = new URLSearchParams({
    maxrecords: '75',
    timespan: '1440',
  });
  if (query) params.set('query', query);

  const res = await fetchWithRetry(`/api/gdelt?${params}`);
  if (!res.ok) throw new Error('Failed to fetch GDELT data');

  const data = (await res.json()) as { articles: Omit<GdeltArticle, 'lat' | 'lon'>[] };

  // GDELT DOC API doesn't include lat/lon directly — we geocode by source country
  // For now, use country centroids as approximate locations
  return data.articles.map((a) => ({
    ...a,
    lat: getCountryCentroid(a.sourceCountry)[0],
    lon: getCountryCentroid(a.sourceCountry)[1],
  }));
}

// Approximate country centroids for common GDELT source countries
const COUNTRY_CENTROIDS: Record<string, [number, number]> = {
  US: [39.8, -98.5],
  GB: [54.0, -2.0],
  IN: [20.6, 78.9],
  CN: [35.9, 104.2],
  RU: [61.5, 105.3],
  FR: [46.2, 2.2],
  DE: [51.2, 10.4],
  JP: [36.2, 138.3],
  BR: [-14.2, -51.9],
  AU: [-25.3, 133.8],
  CA: [56.1, -106.3],
  MX: [23.6, -102.6],
  ZA: [-30.6, 22.9],
  NG: [9.1, 8.7],
  EG: [26.8, 30.8],
  TR: [38.9, 35.2],
  SA: [23.9, 45.1],
  IR: [32.4, 53.7],
  IL: [31.0, 34.9],
  UA: [48.4, 31.2],
  PK: [30.4, 69.3],
  KR: [35.9, 127.8],
  ID: [-0.8, 113.9],
  PH: [12.9, 121.8],
  TH: [15.9, 100.9],
  VN: [14.1, 108.3],
  PL: [51.9, 19.1],
  IT: [41.9, 12.6],
  ES: [40.5, -3.7],
  AR: [-38.4, -63.6],
  CO: [4.6, -74.3],
  KE: [-0.02, 37.9],
  ET: [9.1, 40.5],
  IQ: [33.2, 43.7],
  SY: [34.8, 38.9],
  AF: [33.9, 67.7],
  MM: [21.9, 95.9],
  SD: [12.9, 30.2],
  YE: [15.6, 48.5],
  LY: [26.3, 17.2],
  SO: [5.2, 46.2],
};

function getCountryCentroid(countryCode: string): [number, number] {
  return COUNTRY_CENTROIDS[countryCode?.toUpperCase()] || [0, 0];
}
