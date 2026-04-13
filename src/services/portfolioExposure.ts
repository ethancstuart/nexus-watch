/**
 * Portfolio Geopolitical Exposure Engine
 *
 * Maps financial holdings to geopolitical risk. "Your portfolio has
 * 23% exposure to countries with CII > 60."
 *
 * This is the Pro tier ($99/mo) feature that makes hedge fund PMs pay
 * without blinking. Input: portfolio holdings. Output: risk heatmap
 * on the globe, scenario impact estimates, CII-weighted exposure.
 *
 * Holdings → Country Exposure → CII Score → Weighted Risk
 */

import { getCachedCII } from './countryInstabilityIndex.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PortfolioHolding {
  /** Ticker or identifier (e.g., "TSMC", "XOM", "VWO"). */
  symbol: string;
  /** Allocation weight 0-100 (percentage of portfolio). */
  weight: number;
}

export interface CountryExposure {
  countryCode: string;
  countryName: string;
  /** Portfolio weight exposed to this country (0-100). */
  exposurePct: number;
  /** CII score from the instability index. */
  ciiScore: number;
  /** CII-weighted risk: exposurePct × (ciiScore / 100). */
  weightedRisk: number;
  /** Contributing holdings. */
  holdings: string[];
  /** Confidence level from CII evidence chain. */
  ciiConfidence: string;
}

export interface PortfolioRiskReport {
  /** Total portfolio geopolitical risk score (0-100). */
  overallRisk: number;
  /** Risk category. */
  riskLabel: 'LOW' | 'MODERATE' | 'ELEVATED' | 'HIGH' | 'CRITICAL';
  /** Color for display. */
  riskColor: string;
  /** Per-country exposure breakdown. */
  exposures: CountryExposure[];
  /** Top risk concentrations. */
  topRisks: string[];
  /** Countries with CII > 60 that the portfolio is exposed to. */
  elevatedCountries: CountryExposure[];
  /** Total exposure to countries with CII > 60. */
  elevatedExposurePct: number;
}

// ---------------------------------------------------------------------------
// Holding → Country mapping
// ---------------------------------------------------------------------------

/**
 * Maps common holdings to their country exposure.
 * Each entry: [countryCode, exposurePct relative to holding].
 * A holding can have exposure to multiple countries.
 *
 * This is a starter set — production would use a financial data API
 * (Bloomberg, Refinitiv) for real-time revenue geographic breakdowns.
 */
const HOLDING_COUNTRY_MAP: Record<string, Array<[string, number]>> = {
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
  SSNLF: [
    ['KR', 80],
    ['VN', 10],
    ['US', 5],
    ['IN', 5],
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
  TTE: [
    ['FR', 25],
    ['NG', 10],
    ['QA', 8],
    ['AU', 7],
    ['BR', 5],
    ['US', 5],
  ],

  // Defense
  LMT: [
    ['US', 80],
    ['GB', 5],
    ['SA', 5],
    ['JP', 3],
    ['AU', 2],
  ],
  RTX: [
    ['US', 75],
    ['GB', 8],
    ['SA', 5],
    ['JP', 4],
    ['DE', 3],
  ],
  NOC: [
    ['US', 85],
    ['GB', 5],
    ['AU', 3],
    ['JP', 2],
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
  GDX: [
    ['CA', 25],
    ['AU', 20],
    ['ZA', 15],
    ['US', 10],
    ['BR', 8],
    ['RU', 5],
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
  UNG: [
    ['US', 40],
    ['RU', 15],
    ['QA', 10],
    ['AU', 8],
    ['NG', 5],
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

// ---------------------------------------------------------------------------
// Computation
// ---------------------------------------------------------------------------

/**
 * Compute portfolio geopolitical exposure from holdings.
 */
export function computePortfolioExposure(holdings: PortfolioHolding[]): PortfolioRiskReport {
  const ciiScores = getCachedCII();
  const ciiMap = new Map(ciiScores.map((s) => [s.countryCode, s]));

  // Aggregate country exposure across all holdings
  const countryExposures = new Map<string, { pct: number; holdings: string[] }>();

  for (const holding of holdings) {
    const mapping = HOLDING_COUNTRY_MAP[holding.symbol.toUpperCase()];
    if (!mapping) continue;

    for (const [code, holdingPct] of mapping) {
      // holdingPct is the % of the holding exposed to this country
      // holding.weight is the % of the portfolio in this holding
      // Effective exposure = holding.weight × holdingPct / 100
      const effectivePct = (holding.weight * holdingPct) / 100;
      const existing = countryExposures.get(code) || { pct: 0, holdings: [] };
      existing.pct += effectivePct;
      if (!existing.holdings.includes(holding.symbol)) {
        existing.holdings.push(holding.symbol);
      }
      countryExposures.set(code, existing);
    }
  }

  // Build exposure list with CII data
  const exposures: CountryExposure[] = [];
  for (const [code, { pct, holdings: holdingSymbols }] of countryExposures) {
    const cii = ciiMap.get(code);
    exposures.push({
      countryCode: code,
      countryName: cii?.countryName ?? code,
      exposurePct: Math.round(pct * 10) / 10,
      ciiScore: cii?.score ?? 0,
      weightedRisk: Math.round(pct * ((cii?.score ?? 0) / 100) * 10) / 10,
      holdings: holdingSymbols,
      ciiConfidence: cii?.confidence ?? 'low',
    });
  }

  // Sort by weighted risk descending
  exposures.sort((a, b) => b.weightedRisk - a.weightedRisk);

  // Calculate elevated exposure
  const elevatedCountries = exposures.filter((e) => e.ciiScore >= 60);
  const elevatedExposurePct = Math.round(elevatedCountries.reduce((sum, e) => sum + e.exposurePct, 0) * 10) / 10;

  // Overall risk score: weighted average of CII scores by exposure
  const totalExposure = exposures.reduce((sum, e) => sum + e.exposurePct, 0);
  const overallRisk =
    totalExposure > 0
      ? Math.round(exposures.reduce((sum, e) => sum + e.exposurePct * e.ciiScore, 0) / totalExposure)
      : 0;

  // Top risks
  const topRisks: string[] = [];
  if (elevatedExposurePct > 20)
    topRisks.push(`${elevatedExposurePct}% of portfolio exposed to countries with CII > 60`);
  for (const e of exposures.slice(0, 3)) {
    if (e.ciiScore >= 50) topRisks.push(`${e.countryName}: ${e.exposurePct}% exposure, CII ${e.ciiScore}`);
  }

  let riskLabel: PortfolioRiskReport['riskLabel'];
  let riskColor: string;
  if (overallRisk >= 60) {
    riskLabel = 'CRITICAL';
    riskColor = '#dc2626';
  } else if (overallRisk >= 45) {
    riskLabel = 'HIGH';
    riskColor = '#f97316';
  } else if (overallRisk >= 30) {
    riskLabel = 'ELEVATED';
    riskColor = '#eab308';
  } else if (overallRisk >= 15) {
    riskLabel = 'MODERATE';
    riskColor = '#6366f1';
  } else {
    riskLabel = 'LOW';
    riskColor = '#22c55e';
  }

  return {
    overallRisk,
    riskLabel,
    riskColor,
    exposures,
    topRisks,
    elevatedCountries,
    elevatedExposurePct,
  };
}

/**
 * Get the list of supported holding symbols for the exposure engine.
 */
export function getSupportedHoldings(): string[] {
  return Object.keys(HOLDING_COUNTRY_MAP).sort();
}
