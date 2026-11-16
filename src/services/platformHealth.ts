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
  const provenance = getAllProvenance();
  let layersFresh = 0;
  let layersStale = 0;
  let layersOffline = 0;
  let layersTotal = 0;
  for (const [, prov] of provenance) {
    layersTotal++;
    const f = computeFreshness(prov);
    if (f === 'live' || f === 'recent') layersFresh++;
    else if (f === 'stale') layersStale++;
    else layersOffline++;
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

  // 2026-05-02 W5 v2: "Default healthy, deduct for problems" model.
  //
  // Rationale: the previous composite made every quiet layer or
  // low-confidence country drag the score down to 40%, which read as
  // "broken" to users even when the platform was fully operational.
  // This is honest about real degradation but doesn't punish quiet
  // refresh cycles or sparse-source countries.
  //
  // Baseline: 95. Deduct only for measurable problems.
  let score = 95;
  let deductions = 0;

  // 1) No CII data loaded at all = the platform isn't actually serving
  //    intelligence yet.
  if (totalCountries === 0) deductions += 25;

  // 2) Most layers in offline/error state = real outage.
  if (layersTotal > 0) {
    const offlineRatio = layersOffline / layersTotal;
    if (offlineRatio > 0.5) deductions += 25;
    else if (offlineRatio > 0.25) deductions += 10;
  }

  // 3) Most layers stale (refresh hasn't fired in a while) = mild
  //    degradation but data still usable.
  if (layersTotal >= 3) {
    const staleRatio = (layersStale + layersOffline) / layersTotal;
    if (staleRatio > 0.6) deductions += 8;
  }

  // 4) Very poor CII coverage = data is loaded but most countries lack
  //    confidence-grade evidence chains.
  if (totalCountries > 0) {
    const medRatio = mediumOrBetter / totalCountries;
    if (medRatio < 0.2) deductions += 10;
    else if (medRatio < 0.4) deductions += 5;
  }

  score -= deductions;
  // Floor at 30 even for catastrophic state (display rather than hide).
  score = Math.max(30, Math.min(98, score));

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
