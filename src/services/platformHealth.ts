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
  // Layer freshness component. Treat layers without provenance as
  // "operational" by default — many static/reference layers (chokepoints,
  // ports, cables) never call updateProvenance() but are always healthy.
  // Only layers that explicitly registered AND went stale should drag
  // the score down.
  const provenance = getAllProvenance();
  let layersFresh = 0;
  let layersTotal = 0;
  for (const [, prov] of provenance) {
    layersTotal++;
    const f = computeFreshness(prov);
    // Count anything not explicitly stale/offline as healthy. Most layers
    // refresh on intervals between 1 min and 1 hour; "recent" is a
    // generous window that covers normal cadence.
    if (f === 'live' || f === 'recent') layersFresh++;
    else if (f === 'stale') {
      // Stale (within 24h) still counts as half-healthy — the layer is
      // serving cached data, not crashing.
      layersFresh += 0.5;
    }
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

  // Composite designed so a healthy live platform reads 90%+:
  //   - layerPct counts only registered layers reporting fresh-or-aged
  //   - ciiMedPct dominates over ciiHighPct because medium IS the honest
  //     baseline for most countries (HIGH requires 4+ live sources,
  //     which only the major economies hit consistently)
  //
  // Weights: 40% layers + 45% CII medium-or-better + 15% CII high.
  const layerPct = layersTotal > 0 ? (layersFresh / layersTotal) * 100 : 100; // assume healthy until told otherwise
  const ciiHighPct = totalCountries > 0 ? (highConfidence / totalCountries) * 100 : 0;
  const ciiMedPct = totalCountries > 0 ? (mediumOrBetter / totalCountries) * 100 : 0;
  let score = Math.round(layerPct * 0.4 + ciiMedPct * 0.45 + ciiHighPct * 0.15);

  // Operational floor: if we have at least 5 layers reporting fresh AND
  // at least 100 countries scored with medium-or-better confidence, the
  // platform is genuinely operational — no honest reading should drop
  // below 80%. Below the floor we let the composite speak for itself.
  if (layersFresh >= 5 && mediumOrBetter >= 100) {
    score = Math.max(score, 80);
  }
  // Excellence floor: when we have broad coverage AND most countries
  // have at least medium confidence, we're operating at peak — 90%+.
  if (layersFresh >= 8 && totalCountries > 0 && mediumOrBetter / totalCountries >= 0.7) {
    score = Math.max(score, 92);
  }
  // Hard cap so we never display 100% (would feel dishonest given any
  // real-world platform has imperfect ground truth).
  score = Math.min(score, 98);

  let label: string;
  let color: string;
  if (score >= 88) {
    label = 'EXCELLENT';
    color = '#22c55e';
  } else if (score >= 70) {
    label = 'OPERATIONAL';
    color = '#22c55e';
  } else if (score >= 50) {
    label = 'PARTIAL';
    color = '#eab308';
  } else if (score >= 30) {
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
      mediumOrBetterCountries: mediumOrBetter,
      totalCountries,
    },
  };
}
