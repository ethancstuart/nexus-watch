/**
 * Platform Health — Aggregate Data Confidence Score
 *
 * Computes an overall platform confidence percentage visible in the
 * header: "DATA CONFIDENCE: 94%". Based on:
 *   - % of layers reporting live/recent freshness
 *   - % of CII components with HIGH confidence across all countries
 *   - Drops visibly when sources degrade — radical transparency
 *
 * This number IS the trust signal. It's the first thing a new user
 * sees and the reason they believe NexusWatch is different.
 */

import { getAllProvenance, computeFreshness } from './dataProvenance.ts';
import { getCachedCII } from './countryInstabilityIndex.ts';

export interface PlatformHealthState {
  /** Overall confidence percentage 0-100. */
  score: number;
  /** Label for display: EXCELLENT / GOOD / DEGRADED / IMPAIRED. */
  label: string;
  /** Color for the badge. */
  color: string;
  /** Breakdown for tooltip. */
  breakdown: {
    layersFresh: number; // count of live/recent layers
    layersTotal: number;
    highConfidenceCountries: number;
    totalCountries: number;
  };
}

export function computePlatformHealth(): PlatformHealthState {
  // Layer freshness component
  const provenance = getAllProvenance();
  let layersFresh = 0;
  let layersTotal = 0;
  for (const [, prov] of provenance) {
    layersTotal++;
    const f = computeFreshness(prov);
    if (f === 'live' || f === 'recent') layersFresh++;
  }

  // CII confidence component
  const scores = getCachedCII();
  let highConfidence = 0;
  for (const s of scores) {
    if (s.confidence === 'high') highConfidence++;
  }
  const totalCountries = scores.length;

  // Weighted composite: 60% layer freshness + 40% CII confidence
  const layerPct = layersTotal > 0 ? (layersFresh / layersTotal) * 100 : 0;
  const ciiPct = totalCountries > 0 ? (highConfidence / totalCountries) * 100 : 0;
  const score = Math.round(layerPct * 0.6 + ciiPct * 0.4);

  let label: string;
  let color: string;
  if (score >= 85) {
    label = 'EXCELLENT';
    color = '#22c55e';
  } else if (score >= 65) {
    label = 'GOOD';
    color = '#eab308';
  } else if (score >= 40) {
    label = 'DEGRADED';
    color = '#f97316';
  } else {
    label = 'IMPAIRED';
    color = '#dc2626';
  }

  return {
    score,
    label,
    color,
    breakdown: {
      layersFresh,
      layersTotal,
      highConfidenceCountries: highConfidence,
      totalCountries,
    },
  };
}
