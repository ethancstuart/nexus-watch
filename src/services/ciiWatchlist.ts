/**
 * CII Country Watchlist
 *
 * Simple user-saved countries for personalized dashboard, priority
 * alerts, and email digests. Distinct from the more complex existing
 * watchlist system (which tracks keywords/regions for AI alerts).
 *
 * This is specifically for "I want to follow these 5 countries."
 * localStorage-backed, emits change events, powers the /#/watchlist
 * personalized homepage.
 */

const STORAGE_KEY = 'nw:cii-watchlist:v1';

export interface CiiWatchItem {
  countryCode: string;
  addedAt: number;
  /** CII score threshold for alert notifications. */
  alertThreshold?: number;
  /** User's personal note on the country. */
  notes?: string;
}

let cache: CiiWatchItem[] | null = null;

function load(): CiiWatchItem[] {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cache = [];
      return cache;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cache = [];
      return cache;
    }
    cache = parsed.filter((x): x is CiiWatchItem => x && typeof x.countryCode === 'string');
    return cache;
  } catch {
    cache = [];
    return cache;
  }
}

function persist(): void {
  if (!cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
    document.dispatchEvent(new CustomEvent('nw:cii-watchlist-changed'));
  } catch {
    /* quota — non-fatal */
  }
}

export function getCiiWatchlist(): CiiWatchItem[] {
  return [...load()];
}

export function isCiiWatching(code: string): boolean {
  return load().some((w) => w.countryCode === code);
}

export function addCiiWatch(code: string, options?: { alertThreshold?: number; notes?: string }): void {
  const list = load();
  if (list.some((w) => w.countryCode === code)) return;
  list.push({
    countryCode: code,
    addedAt: Date.now(),
    alertThreshold: options?.alertThreshold,
    notes: options?.notes,
  });
  cache = list;
  persist();
}

export function removeCiiWatch(code: string): void {
  const list = load();
  const next = list.filter((w) => w.countryCode !== code);
  if (next.length === list.length) return;
  cache = next;
  persist();
}

export function toggleCiiWatch(code: string): boolean {
  if (isCiiWatching(code)) {
    removeCiiWatch(code);
    return false;
  }
  addCiiWatch(code);
  return true;
}

export function updateCiiWatch(code: string, updates: Partial<CiiWatchItem>): void {
  const list = load();
  const idx = list.findIndex((w) => w.countryCode === code);
  if (idx === -1) return;
  list[idx] = { ...list[idx], ...updates, countryCode: code };
  cache = list;
  persist();
}

export function clearCiiWatchlist(): void {
  cache = [];
  persist();
}
