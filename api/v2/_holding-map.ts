/**
 * _holding-map.ts — API-side holding → country exposure map
 *
 * Vendored copy of the mapping in src/services/portfolioExposure.ts so
 * Vercel Functions (which can't reach into src/) can score portfolios
 * server-side. Keep in sync with the src/ copy when adding new symbols —
 * the intent is that this is a stable reference table, not a fork.
 *
 * Values: tuples of [ISO-2 country code, approx revenue/asset %].
 * Percentages per holding don't need to sum to 100 — unattributed weight
 * is treated as diversified / unknown geography.
 */

export const HOLDING_COUNTRY_MAP: Record<string, Array<[string, number]>> = {
  // Semiconductors
  TSMC: [
    ['TW', 85],
    ['JP', 10],
    ['US', 5],
  ],
  TSM: [
    ['TW', 85],
    ['JP', 10],
    ['US', 5],
  ],
  ASML: [
    ['NL', 60],
    ['TW', 20],
    ['KR', 10],
    ['US', 10],
  ],
  INTC: [
    ['US', 70],
    ['IL', 15],
    ['IE', 10],
    ['CN', 5],
  ],
  NVDA: [
    ['US', 65],
    ['TW', 20],
    ['CN', 10],
    ['KR', 5],
  ],
  AMD: [
    ['US', 60],
    ['TW', 25],
    ['CN', 10],
    ['SG', 5],
  ],

  // Energy
  XOM: [
    ['US', 40],
    ['SA', 10],
    ['NG', 8],
    ['BR', 7],
    ['IQ', 5],
    ['AE', 5],
    ['RU', 3],
  ],
  CVX: [
    ['US', 50],
    ['AU', 10],
    ['NG', 8],
    ['KZ', 7],
    ['SA', 5],
  ],
  BP: [
    ['GB', 30],
    ['US', 20],
    ['IQ', 10],
    ['AZ', 8],
    ['EG', 7],
    ['RU', 5],
  ],
  SHEL: [
    ['GB', 25],
    ['US', 20],
    ['NG', 10],
    ['QA', 8],
    ['AU', 7],
    ['BR', 5],
  ],

  // Defense
  LMT: [
    ['US', 80],
    ['GB', 5],
    ['SA', 5],
    ['JP', 3],
  ],
  RTX: [
    ['US', 75],
    ['GB', 8],
    ['SA', 5],
    ['JP', 4],
  ],
  BA: [
    ['US', 60],
    ['CN', 10],
    ['SA', 5],
    ['IN', 5],
    ['JP', 5],
  ],

  // Tech
  AAPL: [
    ['US', 40],
    ['CN', 30],
    ['IN', 10],
    ['TW', 10],
    ['JP', 5],
  ],
  MSFT: [
    ['US', 55],
    ['CN', 10],
    ['IN', 10],
    ['GB', 5],
    ['DE', 5],
  ],
  GOOGL: [
    ['US', 50],
    ['IN', 10],
    ['CN', 8],
    ['GB', 7],
    ['JP', 5],
  ],
  META: [
    ['US', 50],
    ['IN', 10],
    ['BR', 8],
    ['ID', 5],
    ['MX', 5],
  ],
  AMZN: [
    ['US', 55],
    ['IN', 10],
    ['DE', 8],
    ['GB', 7],
    ['JP', 5],
  ],

  // ETFs
  VWO: [
    ['CN', 35],
    ['TW', 16],
    ['IN', 15],
    ['BR', 8],
    ['SA', 5],
    ['ZA', 4],
    ['MX', 4],
  ],
  EEM: [
    ['CN', 30],
    ['TW', 16],
    ['IN', 14],
    ['KR', 12],
    ['BR', 6],
    ['SA', 4],
  ],
  EWJ: [['JP', 95]],
  EWZ: [['BR', 95]],
  EWY: [['KR', 95]],
  FXI: [['CN', 95]],
  RSX: [
    ['RU', 90],
    ['KZ', 5],
  ],
  XLE: [
    ['US', 60],
    ['SA', 10],
    ['BR', 5],
    ['NG', 5],
    ['IQ', 3],
  ],

  // Commodities
  USO: [
    ['SA', 20],
    ['RU', 15],
    ['US', 15],
    ['IQ', 10],
    ['AE', 8],
    ['NG', 7],
  ],
  GLD: [
    ['US', 30],
    ['AU', 15],
    ['ZA', 12],
    ['RU', 10],
    ['CN', 8],
  ],

  // Financials
  JPM: [
    ['US', 70],
    ['GB', 10],
    ['CN', 5],
    ['IN', 3],
  ],
  GS: [
    ['US', 65],
    ['GB', 10],
    ['CN', 8],
    ['JP', 5],
  ],
  HSBC: [
    ['GB', 30],
    ['HK', 25],
    ['CN', 15],
    ['IN', 5],
    ['MX', 5],
    ['SA', 5],
  ],
};

export interface ApiHolding {
  symbol: string;
  /** Portfolio weight 0-100. */
  weight: number;
}

export interface ApiCountryExposure {
  country_code: string;
  exposure_pct: number;
  cii_score: number | null;
  confidence: string | null;
  weighted_risk: number | null;
  contributing_holdings: string[];
}

export interface ApiPortfolioReport {
  overall_risk: number;
  risk_label: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  coverage_pct: number;
  exposures: ApiCountryExposure[];
  elevated_countries: ApiCountryExposure[];
  elevated_exposure_pct: number;
  unmapped_symbols: string[];
}

export function riskLabel(score: number): ApiPortfolioReport['risk_label'] {
  if (score >= 75) return 'CRITICAL';
  if (score >= 55) return 'HIGH';
  if (score >= 35) return 'ELEVATED';
  if (score >= 15) return 'MODERATE';
  return 'LOW';
}

/**
 * Pure compute over already-loaded CII scores. Caller is expected to
 * query cii_daily_snapshots and pass the resulting map in.
 */
export function computeApiExposure(
  holdings: ApiHolding[],
  ciiByCountry: Map<string, { score: number; confidence: string }>,
): ApiPortfolioReport {
  const totalWeight = holdings.reduce((s, h) => s + Math.max(0, h.weight), 0) || 100;
  const byCountry = new Map<string, { exposure: number; holdings: Set<string> }>();
  const unmapped: string[] = [];

  for (const h of holdings) {
    const symbol = h.symbol.toUpperCase();
    const mapping = HOLDING_COUNTRY_MAP[symbol];
    if (!mapping) {
      unmapped.push(h.symbol);
      continue;
    }
    const normalizedWeight = (h.weight / totalWeight) * 100;
    for (const [code, pct] of mapping) {
      const exposurePts = (pct / 100) * normalizedWeight;
      const entry = byCountry.get(code) ?? { exposure: 0, holdings: new Set<string>() };
      entry.exposure += exposurePts;
      entry.holdings.add(h.symbol);
      byCountry.set(code, entry);
    }
  }

  const exposures: ApiCountryExposure[] = [];
  let riskNumer = 0;
  let riskDenom = 0;
  let elevatedExposurePct = 0;
  for (const [code, { exposure, holdings: syms }] of byCountry) {
    const cii = ciiByCountry.get(code) ?? null;
    const weightedRisk = cii ? exposure * (cii.score / 100) : null;
    if (cii) {
      riskNumer += exposure * cii.score;
      riskDenom += exposure;
      if (cii.score >= 60) elevatedExposurePct += exposure;
    }
    exposures.push({
      country_code: code,
      exposure_pct: Math.round(exposure * 100) / 100,
      cii_score: cii?.score ?? null,
      confidence: cii?.confidence ?? null,
      weighted_risk: weightedRisk === null ? null : Math.round(weightedRisk * 100) / 100,
      contributing_holdings: [...syms].sort(),
    });
  }
  exposures.sort((a, b) => b.exposure_pct - a.exposure_pct);

  const coveragePct = exposures.reduce((s, e) => s + e.exposure_pct, 0);
  const overallRisk = riskDenom > 0 ? Math.round(riskNumer / riskDenom) : 0;
  const elevatedCountries = exposures.filter((e) => (e.cii_score ?? 0) >= 60);

  return {
    overall_risk: overallRisk,
    risk_label: riskLabel(overallRisk),
    coverage_pct: Math.round(coveragePct * 100) / 100,
    exposures,
    elevated_countries: elevatedCountries,
    elevated_exposure_pct: Math.round(elevatedExposurePct * 100) / 100,
    unmapped_symbols: unmapped,
  };
}
