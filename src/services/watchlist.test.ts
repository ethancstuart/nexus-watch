import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadWatchlist, getWatchlist, addWatchItem, removeWatchItem, scanForMatches } from './watchlist.ts';

// Mock localStorage for test environment
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => {
    store[key] = val;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k]);
  },
});

describe('watchlist', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('loads default watchlist items', () => {
    const items = loadWatchlist();
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((i) => i.label === 'Taiwan Strait')).toBe(true);
    expect(items.some((i) => i.label === 'Ukraine')).toBe(true);
  });

  it('adds and removes watchlist items', () => {
    loadWatchlist();
    const initialCount = getWatchlist().length;

    addWatchItem({ id: 'test-1', type: 'keyword', value: 'test', label: 'Test Item' });
    expect(getWatchlist().length).toBe(initialCount + 1);

    removeWatchItem('test-1');
    expect(getWatchlist().length).toBe(initialCount);
  });

  it('scans earthquake data for matches', () => {
    loadWatchlist();
    const data = new Map();
    data.set('earthquakes', [
      { id: '1', place: '10km NE of Kyiv, Ukraine', magnitude: 4.0, lat: 50.5, lon: 30.5, time: Date.now() },
    ]);

    const matches = scanForMatches(data);
    expect(matches.some((m) => m.watchLabel === 'Ukraine')).toBe(true);
  });

  it('scans news data for matches', () => {
    loadWatchlist();
    const data = new Map();
    data.set('news', [{ title: 'Taiwan Strait tensions rise', sourceCountry: 'TW', lat: 25, lon: 121, tone: -5 }]);

    const matches = scanForMatches(data);
    expect(matches.some((m) => m.watchLabel === 'Taiwan Strait')).toBe(true);
  });

  it('returns empty matches for unrelated data', () => {
    loadWatchlist();
    const data = new Map();
    data.set('earthquakes', [
      { id: '1', place: 'Central Alaska', magnitude: 3.0, lat: 63, lon: -150, time: Date.now() },
    ]);

    const matches = scanForMatches(data);
    // Alaska doesn't match any default watchlist items
    expect(matches.filter((m) => m.source === 'Earthquake').length).toBe(0);
  });
});
