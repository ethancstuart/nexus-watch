/**
 * Tests for src/services/interests.ts — Track F.1.
 *
 * Covers the defensive load/save pipeline, the enum-drop behavior
 * for stale localStorage values, and the personalization helpers
 * that downstream tracks (A.9 Watchlist, F.2 onboarding) will
 * depend on.
 *
 * These tests pin the public API so Track F.2 and A.9 can be
 * written against a stable contract — the test names are the
 * specification.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Node 25+ built-in localStorage is non-functional without
// --localstorage-file. Stub it with a Map-based fake, matching the
// pattern in src/services/storage.test.ts. The stub must be
// installed BEFORE importing anything that reads localStorage at
// module scope — interests.ts doesn't do that, but the storage
// helper it imports does, so we stub first just to be safe.
const store = new Map<string, string>();
const fakeLocalStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, String(value)),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
  get length() {
    return store.size;
  },
  key: (i: number) => [...store.keys()][i] ?? null,
};
vi.stubGlobal('localStorage', fakeLocalStorage);

import {
  loadInterests,
  saveInterests,
  markOnboarded,
  matchesInterests,
  interestedLayers,
  summarizeInterests,
  DEFAULT_INTERESTS,
  REGIONS,
  THREATS,
  SECTORS,
  type Interests,
} from './interests.ts';

const STORAGE_KEY = 'dashview:interests';

function resetStorage() {
  store.clear();
}

describe('interests — load / save defensive parsing', () => {
  beforeEach(resetStorage);

  it('returns defaults when nothing is stored', () => {
    const loaded = loadInterests();
    expect(loaded.regions).toEqual(DEFAULT_INTERESTS.regions);
    expect(loaded.threats).toEqual(DEFAULT_INTERESTS.threats);
    expect(loaded.sectors).toEqual(DEFAULT_INTERESTS.sectors);
    expect(loaded.frequency).toBe(DEFAULT_INTERESTS.frequency);
    expect(loaded.onboarded).toBe(false);
  });

  it('does NOT auto-persist the defaults on a fresh read', () => {
    loadInterests();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('round-trips a full save → load cycle', () => {
    saveInterests({
      regions: ['asia', 'middle-east'],
      threats: ['conflict', 'cyber'],
      sectors: ['energy'],
      frequency: 'daily',
      onboarded: true,
    });
    const loaded = loadInterests();
    expect(loaded.regions).toEqual(['asia', 'middle-east']);
    expect(loaded.threats).toEqual(['conflict', 'cyber']);
    expect(loaded.sectors).toEqual(['energy']);
    expect(loaded.frequency).toBe('daily');
    expect(loaded.onboarded).toBe(true);
    expect(loaded.updatedAt).not.toBe(DEFAULT_INTERESTS.updatedAt);
  });

  it('drops unknown region IDs that were stored before the enum changed', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        regions: ['asia', 'atlantis', 'europe'],
        threats: ['conflict'],
        sectors: [],
        frequency: 'daily',
        onboarded: true,
      }),
    );
    const loaded = loadInterests();
    expect(loaded.regions).toEqual(['asia', 'europe']);
  });

  it('drops unknown threat and sector IDs defensively', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        regions: ['asia'],
        threats: ['conflict', 'telepathy'],
        sectors: ['energy', 'time-travel'],
        frequency: 'daily',
      }),
    );
    const loaded = loadInterests();
    expect(loaded.threats).toEqual(['conflict']);
    expect(loaded.sectors).toEqual(['energy']);
  });

  it('rejects an invalid frequency value and falls back to the default', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        regions: ['asia'],
        threats: [],
        sectors: [],
        frequency: 'hourly',
      }),
    );
    const loaded = loadInterests();
    expect(loaded.frequency).toBe(DEFAULT_INTERESTS.frequency);
  });

  it('returns the defaults when the stored JSON is corrupt', () => {
    localStorage.setItem(STORAGE_KEY, '{ not json');
    const loaded = loadInterests();
    expect(loaded.regions).toEqual(DEFAULT_INTERESTS.regions);
    expect(loaded.threats).toEqual(DEFAULT_INTERESTS.threats);
  });

  it('treats onboarded as false unless explicitly true', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        regions: ['asia'],
        threats: [],
        sectors: [],
        frequency: 'daily',
        onboarded: 'yes',
      }),
    );
    expect(loadInterests().onboarded).toBe(false);
  });
});

describe('interests — markOnboarded', () => {
  beforeEach(resetStorage);

  it('flips onboarded to true without touching other fields', () => {
    saveInterests({
      regions: ['middle-east'],
      threats: ['conflict'],
      sectors: ['energy'],
      frequency: 'daily',
      onboarded: false,
    });
    const after = markOnboarded();
    expect(after.onboarded).toBe(true);
    expect(after.regions).toEqual(['middle-east']);
    expect(after.threats).toEqual(['conflict']);
    expect(after.sectors).toEqual(['energy']);
  });
});

describe('interests — matchesInterests', () => {
  const interests: Interests = {
    regions: ['middle-east', 'asia'],
    threats: ['conflict'],
    sectors: [],
    frequency: 'daily',
    updatedAt: new Date().toISOString(),
    onboarded: true,
  };

  it('matches when a country region overlaps user interests', () => {
    const result = matchesInterests({ code: 'IR', name: 'Iran', regionIds: ['middle-east'] }, interests);
    expect(result.match).toBe(true);
    expect(result.reasons).toContain('Middle East / MENA');
  });

  it('matches when a country threat overlaps user interests', () => {
    const result = matchesInterests({ code: 'UA', name: 'Ukraine', topThreat: 'conflict' }, interests);
    expect(result.match).toBe(true);
    expect(result.reasons).toContain('Conflict & Military');
  });

  it('returns match=false when nothing overlaps', () => {
    const result = matchesInterests({ code: 'BR', name: 'Brazil', regionIds: ['south-america'] }, interests);
    expect(result.match).toBe(false);
    expect(result.reasons).toEqual([]);
  });

  it('deduplicates reasons when region and threat both match', () => {
    const result = matchesInterests(
      { code: 'IR', name: 'Iran', regionIds: ['middle-east'], topThreat: 'conflict' },
      interests,
    );
    expect(result.match).toBe(true);
    // Region match + threat match = 2 distinct reasons
    expect(result.reasons.length).toBe(2);
  });
});

describe('interests — interestedLayers', () => {
  it('expands threat IDs to the underlying map layer set', () => {
    const interests: Interests = {
      ...DEFAULT_INTERESTS,
      threats: ['conflict', 'cyber'],
    };
    const layers = interestedLayers(interests);
    // Conflict layers
    expect(layers).toContain('acled');
    expect(layers).toContain('frontlines');
    // Cyber layers
    expect(layers).toContain('cyber');
    expect(layers).toContain('internet-outages');
    // No disease layers since we didn't pick it
    expect(layers).not.toContain('diseases');
  });

  it('returns an empty array when no threats are selected', () => {
    const interests: Interests = {
      ...DEFAULT_INTERESTS,
      threats: [],
    };
    expect(interestedLayers(interests)).toEqual([]);
  });

  it('deduplicates layers when two threats share an underlying layer', () => {
    // (If no threats share layers in the current enum, this test
    // is a trip-wire for the future.)
    const interests: Interests = {
      ...DEFAULT_INTERESTS,
      threats: THREATS.map((t) => t.id),
    };
    const layers = interestedLayers(interests);
    const unique = new Set(layers);
    expect(layers.length).toBe(unique.size);
  });
});

describe('interests — summarizeInterests', () => {
  it('joins region, threat, and sector labels with the dot separator', () => {
    const interests: Interests = {
      regions: ['middle-east'],
      threats: ['conflict'],
      sectors: ['energy'],
      frequency: 'daily',
      updatedAt: new Date().toISOString(),
      onboarded: true,
    };
    const summary = summarizeInterests(interests);
    expect(summary).toContain('Middle East / MENA');
    expect(summary).toContain('Conflict & Military');
    expect(summary).toContain('Energy & Oil');
    expect(summary.split(' · ').length).toBe(3);
  });

  it('returns "No interests set" when everything is empty', () => {
    const interests: Interests = {
      regions: [],
      threats: [],
      sectors: [],
      frequency: 'daily',
      updatedAt: new Date().toISOString(),
      onboarded: false,
    };
    expect(summarizeInterests(interests)).toBe('No interests set');
  });

  it('omits empty categories from the summary string', () => {
    const interests: Interests = {
      regions: ['asia'],
      threats: [],
      sectors: ['shipping'],
      frequency: 'daily',
      updatedAt: new Date().toISOString(),
      onboarded: true,
    };
    const summary = summarizeInterests(interests);
    expect(summary.split(' · ').length).toBe(2);
    expect(summary).toContain('Asia');
    expect(summary).toContain('Shipping & Trade Routes');
  });
});

describe('interests — enum integrity', () => {
  it('all REGIONS have non-empty id and label', () => {
    for (const r of REGIONS) {
      expect(r.id).toBeTruthy();
      expect(r.label).toBeTruthy();
    }
  });

  it('all THREATS map to at least one layer', () => {
    for (const t of THREATS) {
      expect(t.layers.length).toBeGreaterThan(0);
    }
  });

  it('all SECTORS have non-empty id and label', () => {
    for (const s of SECTORS) {
      expect(s.id).toBeTruthy();
      expect(s.label).toBeTruthy();
    }
  });
});
