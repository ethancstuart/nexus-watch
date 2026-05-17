/**
 * Forecast tournament — 6 base learner models.
 *
 * Every model takes the same inputs and returns the same shape:
 *   - point: number (the model's CII forecast at horizon t)
 *   - variance: number (its uncertainty estimate; Infinity = no opinion)
 *   - hint: short label of what drove the prediction
 *
 * The ensemble in ./ensemble.ts combines them via weights loaded from
 * the forecast_weights table (refit weekly by the backtest cron).
 *
 * Design: models that depend on data not provided (ACLED, neighbors)
 * gracefully return Infinity variance so the ensemble downweights them
 * to ~0 contribution. No throws.
 *
 * 2026-05 tier-up Phase 3.
 */

export interface ForecastPoint {
  point: number;
  variance: number;
  hint: string;
}

export type ModelId = 'persistence' | 'kalman' | 'ar1' | 'holt' | 'acled_slope' | 'neighbor';

export const MODELS: ModelId[] = ['persistence', 'kalman', 'ar1', 'holt', 'acled_slope', 'neighbor'];

export interface ModelInputs {
  /** CII history, oldest first. Min 7 entries expected. */
  ciiHistory: number[];
  /** Forecast horizon in days. */
  horizon: number;
  /** Daily ACLED event counts for this country, oldest first, last 30d. Optional. */
  acledDaily?: number[];
  /** Same-region mean CII delta over last 7 days. Optional. */
  neighborDelta7?: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function variance(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}

function slope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den > 0 ? num / den : 0;
}

function clip(v: number): number {
  return Math.max(0, Math.min(100, v));
}

// ---------------------------------------------------------------------------
// 1. Persistence baseline
// ---------------------------------------------------------------------------

export function modelPersistence(inputs: ModelInputs): ForecastPoint {
  const last = inputs.ciiHistory[inputs.ciiHistory.length - 1];
  // Use historical day-to-day variance scaled by sqrt(horizon).
  const dailyDiffs = inputs.ciiHistory.slice(1).map((v, i) => v - inputs.ciiHistory[i]);
  const sigma = Math.sqrt(variance(dailyDiffs));
  return {
    point: clip(last),
    variance: sigma * sigma * inputs.horizon,
    hint: 'persistence (last observation)',
  };
}

// ---------------------------------------------------------------------------
// 2. Kalman-inspired trend + mean reversion (the original /api/v2/forecast)
// ---------------------------------------------------------------------------

export function modelKalman(inputs: ModelInputs): ForecastPoint {
  const h = inputs.ciiHistory;
  const last = h[h.length - 1];
  const m = mean(h);
  const stdDev = Math.sqrt(variance(h));
  const tail = h.slice(-14);
  const trendSlope = slope(tail);
  const dailyDiffs = h.slice(1).map((v, i) => v - h[i]);
  const changeStdDev = Math.sqrt(variance(dailyDiffs));

  const reversionRate = Math.max(0.01, Math.min(0.15, 1 / (stdDev + 1)));
  const trendProjection = last + trendSlope * inputs.horizon;
  const meanReverted = last + (m - last) * (1 - Math.exp(-reversionRate * inputs.horizon));
  const point = 0.6 * trendProjection + 0.4 * meanReverted;
  const sigma = changeStdDev * Math.sqrt(inputs.horizon);

  return { point: clip(point), variance: sigma * sigma, hint: 'trend + mean reversion (Kalman)' };
}

// ---------------------------------------------------------------------------
// 3. AR(1) — first-order autoregression
//   Y_{t+1} = phi * Y_t + (1 - phi) * mu + e
//   phi fitted by lag-1 autocorrelation; e std from residuals.
// ---------------------------------------------------------------------------

export function modelAr1(inputs: ModelInputs): ForecastPoint {
  const h = inputs.ciiHistory;
  if (h.length < 3) return modelPersistence(inputs);
  const m = mean(h);
  const cent = h.map((v) => v - m);
  let num = 0;
  let den = 0;
  for (let i = 1; i < cent.length; i++) {
    num += cent[i] * cent[i - 1];
    den += cent[i - 1] * cent[i - 1];
  }
  const phi = den > 0 ? Math.max(-0.99, Math.min(0.99, num / den)) : 0;
  // Project h steps ahead
  let y = h[h.length - 1] - m;
  for (let i = 0; i < inputs.horizon; i++) y = phi * y;
  const point = clip(m + y);
  // Residual variance from fitted model
  const residuals: number[] = [];
  for (let i = 1; i < cent.length; i++) residuals.push(cent[i] - phi * cent[i - 1]);
  const sigmaE2 = variance(residuals);
  // Variance of h-step AR(1) forecast: sigmaE2 * (1 - phi^(2h)) / (1 - phi^2)
  const denom = 1 - phi * phi;
  const hStep = sigmaE2 * (denom > 1e-8 ? (1 - Math.pow(phi, 2 * inputs.horizon)) / denom : inputs.horizon);

  return { point, variance: hStep, hint: `AR(1) phi=${phi.toFixed(2)}` };
}

// ---------------------------------------------------------------------------
// 4. Holt linear exponential smoothing (no seasonality)
//   Level + trend, projected h steps.
// ---------------------------------------------------------------------------

export function modelHolt(inputs: ModelInputs): ForecastPoint {
  const h = inputs.ciiHistory;
  if (h.length < 3) return modelPersistence(inputs);
  const alpha = 0.4;
  const beta = 0.15;
  let level = h[0];
  let trend = h[1] - h[0];
  const residuals: number[] = [];
  for (let i = 1; i < h.length; i++) {
    const newLevel = alpha * h[i] + (1 - alpha) * (level + trend);
    const newTrend = beta * (newLevel - level) + (1 - beta) * trend;
    residuals.push(h[i] - (level + trend));
    level = newLevel;
    trend = newTrend;
  }
  const point = clip(level + trend * inputs.horizon);
  const sigma2 = variance(residuals) * inputs.horizon;
  return { point, variance: sigma2, hint: `Holt α=${alpha} β=${beta}` };
}

// ---------------------------------------------------------------------------
// 5. ACLED event-rate slope — bumps base Kalman if event rate is climbing.
// ---------------------------------------------------------------------------

export function modelAcledSlope(inputs: ModelInputs): ForecastPoint {
  const base = modelKalman(inputs);
  if (!inputs.acledDaily || inputs.acledDaily.length < 7) {
    return { point: base.point, variance: Number.POSITIVE_INFINITY, hint: 'acled_slope: insufficient data' };
  }
  const eventSlope = slope(inputs.acledDaily.slice(-14));
  // Each +1 event/day slope adds ~0.5 CII per week of horizon.
  const bump = eventSlope * (inputs.horizon / 7) * 0.5;
  const point = clip(base.point + bump);
  return { point, variance: base.variance * 1.2, hint: `ACLED slope ${eventSlope.toFixed(2)} events/day` };
}

// ---------------------------------------------------------------------------
// 6. Regional neighbor contagion — pulls forecast toward neighbor delta.
// ---------------------------------------------------------------------------

export function modelNeighbor(inputs: ModelInputs): ForecastPoint {
  const base = modelKalman(inputs);
  if (inputs.neighborDelta7 == null || !Number.isFinite(inputs.neighborDelta7)) {
    return { point: base.point, variance: Number.POSITIVE_INFINITY, hint: 'neighbor: no regional data' };
  }
  // Apply 30% of regional delta scaled to horizon
  const bump = inputs.neighborDelta7 * (inputs.horizon / 7) * 0.3;
  return {
    point: clip(base.point + bump),
    variance: base.variance * 1.5,
    hint: `neighbor Δ7 = ${inputs.neighborDelta7.toFixed(2)}`,
  };
}

// ---------------------------------------------------------------------------
// Public registry
// ---------------------------------------------------------------------------

export const MODEL_FNS: Record<ModelId, (i: ModelInputs) => ForecastPoint> = {
  persistence: modelPersistence,
  kalman: modelKalman,
  ar1: modelAr1,
  holt: modelHolt,
  acled_slope: modelAcledSlope,
  neighbor: modelNeighbor,
};
