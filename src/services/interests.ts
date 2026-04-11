/**
 * Interests service — Track F.1.
 *
 * The user's declared preferences for brief personalization. Fills a
 * gap the Apr 11 Track E.1 audit flagged as a BUG: CLAUDE.md
 * references `src/services/interests.ts` as if it exists, but it
 * didn't — any agent touching onboarding would have tripped. This
 * module is now the canonical source.
 *
 * Distinct from `src/services/watchlist.ts`:
 *   - **watchlist.ts** holds specific items the user is tracking
 *     (countries, keywords, regions like "Red Sea"). Used for
 *     real-time alert matching.
 *   - **interests.ts** holds broad preference categories
 *     (continents, threat types, sectors). Used for brief
 *     personalization — the "Your Watchlist" section in
 *     Track A.9, and the onboarding flow's interests picker in
 *     Track F.2.
 *
 * Storage key: `dashview:interests` (matches the existing
 * `dashview:*` localStorage convention). Cross-device sync happens
 * via the existing `src/services/prefs.ts` → KV pipeline once
 * Track F.2 wires the onboarding flow; until then, interests live
 * in localStorage only. Changes dispatch `dashview:storage-changed`
 * so the prefs sync layer picks them up automatically when it
 * lands.
 *
 * Design principles for F.1 (the schema, not the UI):
 *   1. Small fixed enums — not free-text — so the brief renderer
 *      can do exact-match matching against briefData topics.
 *   2. Regions = continents + optional sub-regions. The 6-continent
 *      set matches the Track E.1 coverage baseline (Africa, Asia,
 *      Europe, North America, South America, Oceania) plus two
 *      strategic sub-regions (Middle East, Caribbean) that cross
 *      continent lines in how readers actually think about them.
 *   3. Threats = coarse incident categories that align with the
 *      existing map layers — so a "conflict" interest maps cleanly
 *      to ACLED + frontlines + conflict zones layer output.
 *   4. Sectors = trader-facing verticals so the Energy / Markets
 *      sections of the brief can be filtered per-user in Track A.9.
 *
 * Nothing in this commit reads from the interests object yet — the
 * consumers (Track F.2 onboarding flow, Track A.9 Watchlist
 * section) will land later. F.1 ships the schema + getters/setters
 * + defaults so those tracks are unblocked.
 */

import { get, set } from './storage.ts';

// ---------------------------------------------------------------------------
// Enums — fixed sets the onboarding picker renders as checkboxes
// ---------------------------------------------------------------------------

/**
 * Region identifiers. The six continents from the Track E.1
 * coverage baseline, plus two strategic sub-regions that readers
 * think about as first-class buckets even though they cross
 * continent lines.
 */
export const REGIONS = [
  { id: 'africa', label: 'Africa' },
  { id: 'asia', label: 'Asia' },
  { id: 'europe', label: 'Europe' },
  { id: 'north-america', label: 'North America' },
  { id: 'south-america', label: 'South America' },
  { id: 'oceania', label: 'Oceania' },
  // Cross-continental sub-regions readers expect as first-class picks
  { id: 'middle-east', label: 'Middle East / MENA' },
  { id: 'caribbean', label: 'Caribbean' },
] as const;

export type RegionId = (typeof REGIONS)[number]['id'];

/**
 * Threat categories. Aligned with the Intel Map layer groupings in
 * CLAUDE.md so a threat interest can be translated into a map-layer
 * subset without a per-threat lookup table.
 */
export const THREATS = [
  { id: 'conflict', label: 'Conflict & Military', layers: ['acled', 'conflicts', 'frontlines', 'military'] },
  { id: 'disasters', label: 'Natural Disasters', layers: ['earthquakes', 'gdacs', 'fires', 'weather-alerts'] },
  { id: 'disease', label: 'Disease Outbreaks', layers: ['diseases'] },
  { id: 'cyber', label: 'Cyber & Internet', layers: ['cyber', 'internet-outages', 'gps-jamming'] },
  { id: 'markets', label: 'Markets & Trade', layers: ['predictions', 'sentiment'] },
  { id: 'space', label: 'Space & Satellites', layers: ['satellites', 'launches'] },
] as const;

export type ThreatId = (typeof THREATS)[number]['id'];

/**
 * Sectors = trader-facing verticals. These feed the Track A.9
 * Watchlist section — a reader who marks "energy" here will get
 * Hormuz / Bab el-Mandeb / Suez chokepoint context preferentially
 * bubbled up in their personalized Watchlist module.
 */
export const SECTORS = [
  { id: 'energy', label: 'Energy & Oil' },
  { id: 'shipping', label: 'Shipping & Trade Routes' },
  { id: 'defense', label: 'Defense & Aerospace' },
  { id: 'tech', label: 'Tech & Semiconductors' },
  { id: 'crypto', label: 'Crypto & Digital Assets' },
  { id: 'agriculture', label: 'Agriculture & Food Security' },
] as const;

export type SectorId = (typeof SECTORS)[number]['id'];

/**
 * Brief frequency the user wants. Mon/Wed/Fri is the free tier
 * cadence; daily is Analyst+.
 */
export type Frequency = 'daily' | 'mwf' | 'weekly';

// ---------------------------------------------------------------------------
// Persisted shape
// ---------------------------------------------------------------------------

export interface Interests {
  regions: RegionId[];
  threats: ThreatId[];
  sectors: SectorId[];
  frequency: Frequency;
  /** ISO timestamp when the user last updated their interests. */
  updatedAt: string;
  /**
   * Flag — whether the user has completed the onboarding interests
   * picker. `false` until Track F.2 wires it. Used by the brief
   * renderer to decide between a personalized Watchlist section and
   * a generic "Set up your interests" CTA.
   */
  onboarded: boolean;
}

const STORAGE_KEY = 'dashview:interests';

/**
 * Default interests for users who haven't onboarded yet. Chosen to
 * cast a wide-but-not-noisy net: all six continents, the three most
 * common threat categories, no sectors (sectors are opt-in), daily
 * frequency. `onboarded: false` so the brief renderer can distinguish
 * "user deliberately picked these" from "we assumed."
 */
export const DEFAULT_INTERESTS: Interests = {
  regions: ['africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania', 'middle-east'],
  threats: ['conflict', 'disasters', 'markets'],
  sectors: [],
  frequency: 'daily',
  updatedAt: new Date(0).toISOString(),
  onboarded: false,
};

// ---------------------------------------------------------------------------
// Read / write
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Personalization helpers — used by Track A.9 Watchlist rendering
// ---------------------------------------------------------------------------

/**
 * Given a set of interests and a CII/brief country object, decide
 * whether this country should show up in the user's personalized
 * Watchlist section. The matching is intentionally loose: if ANY
 * of the country's associated regions or top components match the
 * user's picks, it surfaces.
 *
 * Returns an object with `match: boolean` and, when match is true,
 * an array of the reasons it matched so the renderer can show a
 * short "why you're seeing this" tag.
 */
export function matchesInterests(
  country: { code?: string; name?: string; regionIds?: RegionId[]; topThreat?: ThreatId },
  interests: Interests,
): { match: boolean; reasons: string[] } {
  const reasons: string[] = [];

  if (country.regionIds) {
    for (const r of country.regionIds) {
      if (interests.regions.includes(r)) {
        const label = REGIONS.find((x) => x.id === r)?.label ?? r;
        reasons.push(label);
      }
    }
  }

  if (country.topThreat && interests.threats.includes(country.topThreat)) {
    const label = THREATS.find((t) => t.id === country.topThreat)?.label ?? country.topThreat;
    reasons.push(label);
  }

  return { match: reasons.length > 0, reasons };
}

/**
 * Returns the set of map layer IDs the user has implicitly opted
 * into via their threat interests. Useful for personalizing the
 * brief's data context or filtering alerts — a user who only cares
 * about cyber doesn't need earthquake alerts in their inbox.
 */
export function interestedLayers(interests: Interests): string[] {
  const layerSet = new Set<string>();
  for (const threatId of interests.threats) {
    const threat = THREATS.find((t) => t.id === threatId);
    if (threat) {
      for (const layer of threat.layers) layerSet.add(layer);
    }
  }
  return Array.from(layerSet);
}

/**
 * Human-readable summary of the user's current interests. Shown in
 * the account settings screen (Track F.3) and in the footer of the
 * personalized Watchlist section ("Based on your interest in
 * Middle East, Conflict, Energy").
 */
export function summarizeInterests(interests: Interests): string {
  const parts: string[] = [];
  if (interests.regions.length > 0) {
    const regionLabels = interests.regions.map((r) => REGIONS.find((x) => x.id === r)?.label ?? r).join(', ');
    parts.push(regionLabels);
  }
  if (interests.threats.length > 0) {
    const threatLabels = interests.threats.map((t) => THREATS.find((x) => x.id === t)?.label ?? t).join(', ');
    parts.push(threatLabels);
  }
  if (interests.sectors.length > 0) {
    const sectorLabels = interests.sectors.map((s) => SECTORS.find((x) => x.id === s)?.label ?? s).join(', ');
    parts.push(sectorLabels);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No interests set';
}
