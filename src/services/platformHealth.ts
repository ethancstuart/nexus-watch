/**
 * Platform Data Confidence — aggregate health signal in the header HUD.
 *
 * 2026-05-02 W5 rebalance:
 *   - Was: 60% layer-freshness + 40% CII high-confidence-only
 *     → produced a punitive 60% reading even when most data was healthy.
 *   - Now: 50% layer-freshness + 30% CII high + 20% CII medium-or-better.
 *     The third term lets the score reflect that *most* countries have
 *     *some* signal — closer to truth.
 *   - Thresholds widened: ≥75 EXCELLENT, ≥55 OPERATIONAL, ≥35 PARTIAL,
 *     <35 IMPAIRED. "OPERATIONAL" replaces "GOOD" — it's the honest
 *     descriptor for a live, multi-source platform.
 *   - Renamed to "Data Confidence" everywhere (was "Data Quality") to
 *     match the existing CII confidence vocabulary.
 *
 * This number IS the trust signal. It's the first thing a new user sees
 * and the reason they believe NexusWatch is different.
 */

import { getAllProvenance, computeFreshness } from './dataProvenance.ts';
import { getCachedCII } from './countryInstabilityIndex.ts';

export interface PlatformHealthState {
  /** Overall confidence percentage 0-100. */
  score: number;
  /** Label for display: EXCELLENT / OPERATIONAL / PARTIAL / IMPAIRED. */
  label: string;
  /** Color for the badge. */
  color: string;
  /** Breakdown for tooltip. */
  breakdown: {
    layersFresh: number; // count of live/recent layers
    layersTotal: number;
    highConfidenceCountries: number;
    mediumOrBetterCountries: number;
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

  // CII confidence components — high vs medium-or-better.
  const scores = getCachedCII();
  let highConfidence = 0;
  let mediumOrBetter = 0;
  for (const s of scores) {
    if (s.confidence === 'high') {
      highConfidence++;
      mediumOrBetter++;
    } else if (s.confidence === 'medium') {
      mediumOrBetter++;
    }
  }
  const totalCountries = scores.length;

  // Rebalanced composite: 50/30/20.
  const layerPct = layersTotal > 0 ? (layersFresh / layersTotal) * 100 : 0;
  const ciiHighPct = totalCountries > 0 ? (highConfidence / totalCountries) * 100 : 0;
  const ciiMedPct = totalCountries > 0 ? (mediumOrBetter / totalCountries) * 100 : 0;
  const score = Math.round(layerPct * 0.5 + ciiHighPct * 0.3 + ciiMedPct * 0.2);

  let label: string;
  let color: string;
  if (score >= 75) {
    label = 'EXCELLENT';
    color = '#22c55e';
  } else if (score >= 55) {
    label = 'OPERATIONAL';
    color = '#eab308';
  } else if (score >= 35) {
    label = 'PARTIAL';
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
      mediumOrBetterCountries: mediumOrBetter,
      totalCountries,
    },
  };
}
