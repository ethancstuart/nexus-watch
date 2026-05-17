/**
 * Forecast ensemble — weighted combination of base learners.
 *
 * Weights are loaded from the forecast_weights table (one row per horizon,
 * keyed by ModelId). Updated weekly by api/cron/forecast-backtest.ts after
 * scoring residuals on 30-day-old forecasts. Default weights live here
 * for the cold start (no history yet).
 *
 * Combination math:
 *   - Convert variance → precision = 1/var (Inf → 0 = no opinion)
 *   - Multiply each model's precision by its trained weight
 *   - Weighted mean by precision*weight
 *   - Variance = 1 / sum(precision*weight) (Cramér–Rao floor)
 *   - Then expand to credible intervals via Normal quantiles
 *
 * 2026-05 tier-up Phase 3.
 */

import { MODEL_FNS, MODELS, type ModelId, type ModelInputs, type ForecastPoint } from './models.js';

export interface EnsembleOutput {
  /** Per-model point/variance (so the UI can show the disagreement). */
  perModel: Array<{ model: ModelId; point: number; variance: number; weight: number; hint: string }>;
  /** Combined point + variance + credible intervals. */
  ensemble: {
    point: number;
    variance: number;
    p10: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
  };
}

export const DEFAULT_WEIGHTS: Record<ModelId, number> = {
  persistence: 0.05,
  kalman: 0.35,
  ar1: 0.25,
  holt: 0.2,
  acled_slope: 0.1,
  neighbor: 0.05,
};

export function combine(
  inputs: ModelInputs,
  weights: Partial<Record<ModelId, number>> = DEFAULT_WEIGHTS,
): EnsembleOutput {
  const perModel = MODELS.map((id) => {
    const r: ForecastPoint = MODEL_FNS[id](inputs);
    return {
      model: id,
      point: r.point,
      variance: r.variance,
      weight: weights[id] ?? DEFAULT_WEIGHTS[id],
      hint: r.hint,
    };
  });

  // Effective weight = w * precision (0 for Inf variance)
  let wSum = 0;
  let wMean = 0;
  for (const m of perModel) {
    const prec = Number.isFinite(m.variance) && m.variance > 0 ? 1 / m.variance : m.variance === 0 ? 1e6 : 0;
    const w = m.weight * prec;
    wSum += w;
    wMean += w * m.point;
  }
  const point = wSum > 0 ? wMean / wSum : (perModel.find((m) => Number.isFinite(m.variance))?.point ?? 50);
  const ensembleVariance = wSum > 0 ? 1 / wSum : 100;

  const sigma = Math.sqrt(ensembleVariance);
  const clip = (v: number): number => Math.max(0, Math.min(100, v));
  return {
    perModel,
    ensemble: {
      point: round(point),
      variance: round(ensembleVariance),
      p10: round(clip(point - 1.28 * sigma)),
      p25: round(clip(point - 0.67 * sigma)),
      p50: round(clip(point)),
      p75: round(clip(point + 0.67 * sigma)),
      p90: round(clip(point + 1.28 * sigma)),
    },
  };
}

function round(v: number): number {
  return Math.round(v * 100) / 100;
}

/**
 * Probability that a normal(mean, std) variable exceeds threshold.
 * Used for threshold-crossing probabilities (e.g. P(CII > 80)).
 */
export function probAbove(mean: number, variance: number, threshold: number): number {
  const std = Math.sqrt(Math.max(variance, 1e-9));
  const z = (threshold - mean) / std;
  // Abramowitz & Stegun 26.2.17 approximation
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804014327;
  const p =
    d *
    Math.exp((-z * z) / 2) *
    (t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429)))));
  return z >= 0 ? round(p) : round(1 - p);
}
