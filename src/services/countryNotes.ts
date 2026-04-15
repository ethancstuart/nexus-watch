/**
 * Country Notes — private user annotations on countries.
 *
 * localStorage-backed (per browser). Shown on audit page and
 * watchlist cards. Emits change events.
 *
 * Future: KV sync for signed-in users, sharing by permalink.
 */

const STORAGE_KEY = 'nw:country-notes:v1';

export interface CountryNote {
  countryCode: string;
  text: string;
  updatedAt: number;
  /** Optional tags for filtering later. */
  tags?: string[];
}

let cache: Map<string, CountryNote> | null = null;

function load(): Map<string, CountryNote> {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    cache = new Map();
    if (!raw) return cache;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return cache;
    for (const n of parsed) {
      if (n && typeof n.countryCode === 'string' && typeof n.text === 'string') {
        cache.set(n.countryCode, n as CountryNote);
      }
    }
    return cache;
  } catch {
    cache = new Map();
    return cache;
  }
}

function persist(): void {
  if (!cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(cache.values())));
    document.dispatchEvent(new CustomEvent('nw:country-notes-changed'));
  } catch {
    /* quota — non-fatal */
  }
}

export function getCountryNote(code: string): CountryNote | undefined {
  return load().get(code);
}

export function setCountryNote(code: string, text: string, tags?: string[]): void {
  const map = load();
  if (!text.trim()) {
    map.delete(code);
  } else {
    map.set(code, {
      countryCode: code,
      text: text.trim(),
      updatedAt: Date.now(),
      tags,
    });
  }
  persist();
}

export function deleteCountryNote(code: string): void {
  load().delete(code);
  persist();
}

export function getAllNotes(): CountryNote[] {
  return Array.from(load().values()).sort((a, b) => b.updatedAt - a.updatedAt);
}
