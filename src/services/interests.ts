/**
 * Interests service — browser-facing entry point (Track F.1).
 *
 * Pure types, enums, and helpers live in `./interests-types.ts` so
 * server-side code (api/cron/daily-brief.ts, api/admin/brief/preview.ts)
 * can import the non-storage bits without pulling in the DOM-dependent
 * storage module through a transitive import chain.
 *
 * This file is the browser entry point. It re-exports everything from
 * interests-types.ts AND adds loadInterests / saveInterests /
 * markOnboarded, which use localStorage via the src/services/storage.ts
 * helper. All existing browser callers import from here without
 * changes — nothing about the public shape moved.
 */

import { get, set } from './storage.ts';
import {
  REGIONS,
  THREATS,
  SECTORS,
  DEFAULT_INTERESTS,
  type RegionId,
  type ThreatId,
  type SectorId,
  type Frequency,
  type Interests,
} from './interests-types.ts';

// Re-export everything from the pure module so existing imports of
// `from '../services/interests'` keep working without callers
// needing to know about the split.
export {
  REGIONS,
  THREATS,
  SECTORS,
  DEFAULT_INTERESTS,
  matchesInterests,
  interestedLayers,
  summarizeInterests,
  type RegionId,
  type ThreatId,
  type SectorId,
  type Frequency,
  type Interests,
} from './interests-types.ts';

const STORAGE_KEY = 'dashview:interests';

/**
 * Load the user's interests from localStorage. Returns the defaults
 * if nothing is stored or if the stored value is corrupt.
 *
 * Does NOT auto-persist the defaults — a fresh user with no stored
 * interests reads the defaults but nothing gets written. The first
 * write happens explicitly via `saveInterests()` (e.g., from the
 * onboarding flow's submit handler).
 */
export function loadInterests(): Interests {
  const stored = get<Partial<Interests> | null>(STORAGE_KEY, null);
  if (!stored || typeof stored !== 'object') return { ...DEFAULT_INTERESTS };

  // Defensive merge — keep known fields, drop anything unexpected.
  // If a user's localStorage has a stale interest ID that's no
  // longer in our enum (e.g., we removed a threat category), filter
  // it out rather than carrying forward a dangling value.
  const validRegionIds = new Set<string>(REGIONS.map((r) => r.id));
  const validThreatIds = new Set<string>(THREATS.map((t) => t.id));
  const validSectorIds = new Set<string>(SECTORS.map((s) => s.id));

  const regions = Array.isArray(stored.regions)
    ? (stored.regions.filter((r): r is RegionId => typeof r === 'string' && validRegionIds.has(r)) as RegionId[])
    : DEFAULT_INTERESTS.regions;

  const threats = Array.isArray(stored.threats)
    ? (stored.threats.filter((t): t is ThreatId => typeof t === 'string' && validThreatIds.has(t)) as ThreatId[])
    : DEFAULT_INTERESTS.threats;

  const sectors = Array.isArray(stored.sectors)
    ? (stored.sectors.filter((s): s is SectorId => typeof s === 'string' && validSectorIds.has(s)) as SectorId[])
    : DEFAULT_INTERESTS.sectors;

  const frequency: Frequency =
    stored.frequency === 'daily' || stored.frequency === 'mwf' || stored.frequency === 'weekly'
      ? stored.frequency
      : DEFAULT_INTERESTS.frequency;

  return {
    regions,
    threats,
    sectors,
    frequency,
    updatedAt: typeof stored.updatedAt === 'string' ? stored.updatedAt : DEFAULT_INTERESTS.updatedAt,
    onboarded: stored.onboarded === true,
  };
}

/**
 * Persist the user's interests to localStorage. Stamps `updatedAt`
 * automatically. Emits the standard `dashview:storage-changed`
 * event via the storage helper so any cross-device sync layer
 * listening for changes picks it up.
 */
export function saveInterests(next: Omit<Interests, 'updatedAt'>): Interests {
  const stamped: Interests = {
    ...next,
    updatedAt: new Date().toISOString(),
  };
  set(STORAGE_KEY, stamped);
  return stamped;
}

/**
 * Mark the user as onboarded without otherwise touching their
 * interests. Used by the Track F.2 onboarding flow's "skip" button
 * so returning users aren't nagged with the picker again.
 */
export function markOnboarded(): Interests {
  const current = loadInterests();
  return saveInterests({ ...current, onboarded: true });
}
