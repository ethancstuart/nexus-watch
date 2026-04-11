/**
 * Interests — pure types and helpers (Track F.1, extracted Track A.9).
 *
 * Split out of src/services/interests.ts so the email renderer in
 * api/cron/daily-brief.ts can import the enums + helpers without
 * pulling in the storage-dependent functions (which reference
 * `document` and trip the api/ tsconfig's no-DOM library set).
 *
 * This file has ZERO side-effectful imports — it's pure data and
 * pure functions. Import it from anywhere, including server-side
 * cron handlers and Vercel Node functions.
 *
 * The full src/services/interests.ts module re-exports everything
 * from here AND adds loadInterests / saveInterests / markOnboarded,
 * which depend on localStorage. Browser code should keep importing
 * from interests.ts; server code should import from interests-types.
 */

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const REGIONS = [
  { id: 'africa', label: 'Africa' },
  { id: 'asia', label: 'Asia' },
  { id: 'europe', label: 'Europe' },
  { id: 'north-america', label: 'North America' },
  { id: 'south-america', label: 'South America' },
  { id: 'oceania', label: 'Oceania' },
  { id: 'middle-east', label: 'Middle East / MENA' },
  { id: 'caribbean', label: 'Caribbean' },
] as const;

export type RegionId = (typeof REGIONS)[number]['id'];

export const THREATS = [
  { id: 'conflict', label: 'Conflict & Military', layers: ['acled', 'conflicts', 'frontlines', 'military'] },
  { id: 'disasters', label: 'Natural Disasters', layers: ['earthquakes', 'gdacs', 'fires', 'weather-alerts'] },
  { id: 'disease', label: 'Disease Outbreaks', layers: ['diseases'] },
  { id: 'cyber', label: 'Cyber & Internet', layers: ['cyber', 'internet-outages', 'gps-jamming'] },
  { id: 'markets', label: 'Markets & Trade', layers: ['predictions', 'sentiment'] },
  { id: 'space', label: 'Space & Satellites', layers: ['satellites', 'launches'] },
] as const;

export type ThreatId = (typeof THREATS)[number]['id'];

export const SECTORS = [
  { id: 'energy', label: 'Energy & Oil' },
  { id: 'shipping', label: 'Shipping & Trade Routes' },
  { id: 'defense', label: 'Defense & Aerospace' },
  { id: 'tech', label: 'Tech & Semiconductors' },
  { id: 'crypto', label: 'Crypto & Digital Assets' },
  { id: 'agriculture', label: 'Agriculture & Food Security' },
] as const;

export type SectorId = (typeof SECTORS)[number]['id'];

export type Frequency = 'daily' | 'mwf' | 'weekly';

// ---------------------------------------------------------------------------
// Persisted shape
// ---------------------------------------------------------------------------

export interface Interests {
  regions: RegionId[];
  threats: ThreatId[];
  sectors: SectorId[];
  frequency: Frequency;
  updatedAt: string;
  onboarded: boolean;
}

export const DEFAULT_INTERESTS: Interests = {
  regions: ['africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania', 'middle-east'],
  threats: ['conflict', 'disasters', 'markets'],
  sectors: [],
  frequency: 'daily',
  updatedAt: new Date(0).toISOString(),
  onboarded: false,
};

// ---------------------------------------------------------------------------
// Pure personalization helpers
// ---------------------------------------------------------------------------

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
