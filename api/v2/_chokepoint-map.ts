/**
 * _chokepoint-map.ts — country → chokepoint dependency mapping
 *
 * Maps each country to the maritime chokepoints its trade depends on,
 * with weight = fraction of that country's seaborne commerce routed
 * through the chokepoint. Numbers are approximate (EIA + Lloyd's data);
 * used for directional exposure signals, not precise attribution.
 *
 * Consumed by api/v2/exposure.ts to add chokepoint fragility to
 * portfolio exposure reports.
 */

export interface ChokepointDef {
  id: string;
  name: string;
  lat: number;
  lon: number;
  /** Current status rating. Mirrors the chokepoint-threat layer. */
  baseline_status: 'open' | 'restricted' | 'closed';
}

export const CHOKEPOINTS: Record<string, ChokepointDef> = {
  hormuz: { id: 'hormuz', name: 'Strait of Hormuz', lat: 26.56, lon: 56.25, baseline_status: 'open' },
  malacca: { id: 'malacca', name: 'Strait of Malacca', lat: 2.9, lon: 101.3, baseline_status: 'open' },
  suez: { id: 'suez', name: 'Suez Canal', lat: 30.58, lon: 32.27, baseline_status: 'open' },
  'bab-el-mandeb': {
    id: 'bab-el-mandeb',
    name: 'Bab el-Mandeb',
    lat: 12.58,
    lon: 43.33,
    baseline_status: 'restricted',
  },
  panama: { id: 'panama', name: 'Panama Canal', lat: 9.08, lon: -79.68, baseline_status: 'open' },
  taiwan: { id: 'taiwan', name: 'Taiwan Strait', lat: 24.5, lon: 119.5, baseline_status: 'open' },
  bosporus: { id: 'bosporus', name: 'Bosporus Strait', lat: 41.12, lon: 29.06, baseline_status: 'open' },
};

/**
 * Country → [chokepoint id, weight] mapping.
 * Weights sum to <= 1.0; residual is "other" (continental, intra-regional).
 */
export const COUNTRY_CHOKEPOINT: Record<string, Array<[string, number]>> = {
  // Oil-importing Asia — Hormuz + Malacca dominant
  JP: [
    ['hormuz', 0.5],
    ['malacca', 0.3],
    ['taiwan', 0.1],
  ],
  KR: [
    ['hormuz', 0.5],
    ['malacca', 0.3],
    ['taiwan', 0.1],
  ],
  CN: [
    ['malacca', 0.4],
    ['hormuz', 0.25],
    ['taiwan', 0.15],
  ],
  IN: [
    ['hormuz', 0.55],
    ['malacca', 0.2],
    ['suez', 0.1],
  ],

  // Europe — Suez + Bosporus + Hormuz
  DE: [
    ['suez', 0.35],
    ['hormuz', 0.15],
    ['bab-el-mandeb', 0.15],
  ],
  FR: [
    ['suez', 0.3],
    ['hormuz', 0.15],
    ['bosporus', 0.1],
  ],
  GB: [
    ['suez', 0.25],
    ['hormuz', 0.1],
    ['panama', 0.05],
  ],
  IT: [
    ['suez', 0.35],
    ['bosporus', 0.12],
    ['hormuz', 0.1],
  ],
  ES: [
    ['suez', 0.3],
    ['hormuz', 0.1],
    ['panama', 0.1],
  ],
  NL: [
    ['suez', 0.3],
    ['panama', 0.08],
    ['hormuz', 0.1],
  ],

  // Americas
  US: [
    ['panama', 0.2],
    ['hormuz', 0.08],
    ['malacca', 0.05],
  ],
  BR: [
    ['panama', 0.1],
    ['suez', 0.08],
  ],

  // Gulf producers — exporter-side exposure (Hormuz dominant)
  SA: [['hormuz', 0.85]],
  AE: [['hormuz', 0.9]],
  QA: [['hormuz', 0.95]],
  KW: [['hormuz', 0.95]],
  IQ: [['hormuz', 0.7]],
  IR: [['hormuz', 0.85]],

  // Producers routing through other chokepoints
  RU: [
    ['bosporus', 0.2],
    ['suez', 0.1],
  ],
  EG: [['suez', 0.6]],
  TR: [['bosporus', 0.4]],
  YE: [['bab-el-mandeb', 0.8]],

  // Asia-Pacific producers
  AU: [
    ['malacca', 0.25],
    ['panama', 0.1],
  ],
  ID: [['malacca', 0.4]],
  MY: [['malacca', 0.6]],
  SG: [['malacca', 0.9]],
  TW: [
    ['taiwan', 0.6],
    ['malacca', 0.15],
  ],
};

export interface ChokepointExposureEntry {
  chokepoint_id: string;
  chokepoint_name: string;
  exposure_pct: number; // portfolio share routed through this chokepoint
  status: 'open' | 'restricted' | 'closed';
  contributing_countries: Array<{ code: string; exposure_pct: number; weight: number }>;
}

/**
 * Given a list of country-level exposures, compute chokepoint-level
 * portfolio exposure. exposures[i].exposure_pct is the portfolio's share
 * attributable to country[i]; this function multiplies through the
 * COUNTRY_CHOKEPOINT weights to get chokepoint-level shares.
 */
export function computeChokepointExposure(
  countryExposures: Array<{ country_code: string; exposure_pct: number }>,
  statusOverrides?: Record<string, 'open' | 'restricted' | 'closed'>,
): ChokepointExposureEntry[] {
  const byChoke = new Map<
    string,
    { exposure: number; contributors: Map<string, { exposure: number; weight: number }> }
  >();
  for (const e of countryExposures) {
    const routes = COUNTRY_CHOKEPOINT[e.country_code];
    if (!routes) continue;
    for (const [chokeId, weight] of routes) {
      const entry = byChoke.get(chokeId) ?? { exposure: 0, contributors: new Map() };
      const pct = e.exposure_pct * weight;
      entry.exposure += pct;
      entry.contributors.set(e.country_code, { exposure: pct, weight });
      byChoke.set(chokeId, entry);
    }
  }
  const out: ChokepointExposureEntry[] = [];
  for (const [id, { exposure, contributors }] of byChoke) {
    const def = CHOKEPOINTS[id];
    if (!def) continue;
    out.push({
      chokepoint_id: id,
      chokepoint_name: def.name,
      exposure_pct: Math.round(exposure * 100) / 100,
      status: statusOverrides?.[id] ?? def.baseline_status,
      contributing_countries: [...contributors.entries()]
        .map(([code, v]) => ({
          code,
          exposure_pct: Math.round(v.exposure * 100) / 100,
          weight: v.weight,
        }))
        .sort((a, b) => b.exposure_pct - a.exposure_pct),
    });
  }
  return out.sort((a, b) => b.exposure_pct - a.exposure_pct);
}
