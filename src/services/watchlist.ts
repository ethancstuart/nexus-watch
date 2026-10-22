import type { EarthquakeFeature, GdeltArticle } from '../types/index.ts';

const STORAGE_KEY = 'nw:watchlist';

export interface WatchItem {
  id: string;
  type: 'country' | 'keyword' | 'region';
  value: string;
  label: string;
}

export interface WatchMatch {
  watchItemId: string;
  watchLabel: string;
  source: string;
  text: string;
  lat: number;
  lon: number;
  timestamp: number;
}

let items: WatchItem[] = [];
let matches: WatchMatch[] = [];

export function loadWatchlist(): WatchItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) items = JSON.parse(raw) as WatchItem[];
  } catch {
    items = [];
  }
  if (items.length === 0) {
    // Default watchlist
    items = [
      { id: 'w-taiwan', type: 'region', value: 'taiwan', label: 'Taiwan Strait' },
      { id: 'w-ukraine', type: 'country', value: 'UA', label: 'Ukraine' },
      { id: 'w-redsea', type: 'keyword', value: 'red sea', label: 'Red Sea' },
      { id: 'w-iran', type: 'country', value: 'IR', label: 'Iran' },
      { id: 'w-china', type: 'country', value: 'CN', label: 'China' },
    ];
    saveWatchlist();
  }
  return items;
}

export function getWatchlist(): WatchItem[] {
  return items;
}

export function getWatchMatches(): WatchMatch[] {
  return matches;
}

export function addWatchItem(item: WatchItem): void {
  items.push(item);
  saveWatchlist();
}

export function removeWatchItem(id: string): void {
  items = items.filter((i) => i.id !== id);
  saveWatchlist();
}

function saveWatchlist(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export function scanForMatches(layerData: Map<string, unknown>): WatchMatch[] {
  const newMatches: WatchMatch[] = [];
  const now = Date.now();

  for (const item of items) {
    const searchValue = item.value.toLowerCase();

    // Scan earthquakes
    const quakes = (layerData.get('earthquakes') as EarthquakeFeature[]) || [];
    for (const eq of quakes) {
      if (eq.place.toLowerCase().includes(searchValue) || matchesCountry(eq, item)) {
        newMatches.push({
          watchItemId: item.id,
          watchLabel: item.label,
          source: 'Earthquake',
          text: `M${eq.magnitude} — ${eq.place}`,
          lat: eq.lat,
          lon: eq.lon,
          timestamp: eq.time,
        });
      }
    }

    // Scan ACLED
    const acled =
      (layerData.get('acled') as {
        country: string;
        actor1: string;
        notes: string;
        lat: number;
        lon: number;
        date: string;
        fatalities: number;
      }[]) || [];
    for (const ev of acled) {
      if (
        ev.country.toLowerCase().includes(searchValue) ||
        ev.actor1.toLowerCase().includes(searchValue) ||
        (ev.notes && ev.notes.toLowerCase().includes(searchValue))
      ) {
        newMatches.push({
          watchItemId: item.id,
          watchLabel: item.label,
          source: 'Conflict',
          text: `${ev.actor1} — ${ev.country}${ev.fatalities > 0 ? ` (${ev.fatalities} killed)` : ''}`,
          lat: ev.lat,
          lon: ev.lon,
          timestamp: new Date(ev.date).getTime(),
        });
      }
    }

    // Scan GDELT news
    const news = (layerData.get('news') as GdeltArticle[]) || [];
    for (const article of news) {
      if (article.title.toLowerCase().includes(searchValue) || article.sourceCountry.toLowerCase() === searchValue) {
        newMatches.push({
          watchItemId: item.id,
          watchLabel: item.label,
          source: 'News',
          text: article.title,
          lat: article.lat,
          lon: article.lon,
          timestamp: now,
        });
      }
    }
  }

  // Dedupe by text (keep first occurrence)
  const seen = new Set<string>();
  matches = newMatches.filter((m) => {
    const key = `${m.watchItemId}-${m.text.slice(0, 50)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by timestamp descending, limit
  matches.sort((a, b) => b.timestamp - a.timestamp);
  matches = matches.slice(0, 50);

  return matches;
}

function matchesCountry(eq: EarthquakeFeature, item: WatchItem): boolean {
  if (item.type !== 'country') return false;
  // Rough country matching by checking if the earthquake place mentions the country
  const countryNames: Record<string, string[]> = {
    UA: ['ukraine'],
    RU: ['russia'],
    CN: ['china'],
    IR: ['iran'],
    IL: ['israel'],
    TW: ['taiwan'],
    KR: ['korea'],
    JP: ['japan'],
  };
  const names = countryNames[item.value.toUpperCase()] || [item.value.toLowerCase()];
  return names.some((n) => eq.place.toLowerCase().includes(n));
}
