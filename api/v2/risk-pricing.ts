import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { MARKET_RISK } from '../_lib/cii-baselines.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

/**
 * Real-Time Risk Pricing — CII to Dollar Impact.
 *
 * Translates geopolitical risk into dollar-denominated portfolio impact.
 * "Your $500K portfolio has $23K in geopolitical VaR. A Taiwan blockade
 * would create $47K in additional drawdown exposure."
 *
 * Uses historical CII-return correlations (beta coefficients) to compute
 * per-holding, per-country geopolitical Value at Risk (VaR).
 *
 * POST /api/v2/risk-pricing
 * Body: { holdings: [{ticker, weight}], portfolio_value: 500000 }
 */

const CORS_ORIGIN = 'https://nexuswatch.dev';

// Ticker → country exposure mapping (simplified; expand over time)
const TICKER_COUNTRY_MAP: Record<string, Array<{ country: string; exposure: number }>> = {
  AAPL: [
    { country: 'US', exposure: 0.45 },
    { country: 'CN', exposure: 0.25 },
    { country: 'TW', exposure: 0.2 },
    { country: 'IN', exposure: 0.1 },
  ],
  MSFT: [
    { country: 'US', exposure: 0.65 },
    { country: 'CN', exposure: 0.1 },
    { country: 'IN', exposure: 0.1 },
  ],
  GOOGL: [
    { country: 'US', exposure: 0.6 },
    { country: 'GB', exposure: 0.1 },
    { country: 'IN', exposure: 0.1 },
  ],
  AMZN: [
    { country: 'US', exposure: 0.55 },
    { country: 'CN', exposure: 0.15 },
    { country: 'DE', exposure: 0.1 },
    { country: 'IN', exposure: 0.1 },
  ],
  TSLA: [
    { country: 'US', exposure: 0.4 },
    { country: 'CN', exposure: 0.35 },
    { country: 'DE', exposure: 0.15 },
  ],
  TSM: [
    { country: 'TW', exposure: 0.8 },
    { country: 'US', exposure: 0.1 },
    { country: 'JP', exposure: 0.1 },
  ],
  BABA: [
    { country: 'CN', exposure: 0.85 },
    { country: 'US', exposure: 0.1 },
  ],
  XOM: [
    { country: 'US', exposure: 0.3 },
    { country: 'SA', exposure: 0.15 },
    { country: 'IQ', exposure: 0.1 },
    { country: 'NG', exposure: 0.1 },
  ],
  SPY: [
    { country: 'US', exposure: 0.85 },
    { country: 'CN', exposure: 0.05 },
  ],
  EWJ: [{ country: 'JP', exposure: 0.95 }],
  FXI: [{ country: 'CN', exposure: 0.95 }],
  EWZ: [{ country: 'BR', exposure: 0.95 }],
  INDA: [{ country: 'IN', exposure: 0.95 }],
  EWW: [{ country: 'MX', exposure: 0.95 }],
  GLD: [{ country: 'US', exposure: 0.3 }], // Gold is a hedge, lower geo exposure
  VWO: [
    { country: 'CN', exposure: 0.3 },
    { country: 'TW', exposure: 0.15 },
    { country: 'IN', exposure: 0.15 },
    { country: 'BR', exposure: 0.1 },
    { country: 'SA', exposure: 0.1 },
  ],
};

// CII-return beta: estimated portfolio drawdown per 10-point CII increase
// Based on historical correlations (simplified model)
const CII_BETA: Record<string, number> = {
  // High beta — direct market impact from instability
  TW: 0.035, // 3.5% drawdown per 10-point CII increase (semiconductor dependency)
  SA: 0.025, // 2.5% (oil price impact)
  RU: 0.03, // 3.0% (sanctions cascade)
  CN: 0.02, // 2.0% (trade war / Taiwan risk)
  IR: 0.02, // 2.0% (oil + regional)
  // Medium beta
  US: 0.005, // 0.5% (domestic instability has lower market beta)
  JP: 0.01, // 1.0%
  DE: 0.008, // 0.8%
  GB: 0.007,
  FR: 0.007,
  IN: 0.012,
  BR: 0.015,
  MX: 0.012,
  NG: 0.018,
  TR: 0.015,
  EG: 0.015,
  // Low beta (diversified economies)
  AU: 0.005,
  CA: 0.005,
  KR: 0.01,
};

interface Holding {
  ticker: string;
  weight: number; // 0-100 or 0-1
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const { holdings, portfolio_value } = req.body as { holdings?: Holding[]; portfolio_value?: number };
  if (!holdings || !Array.isArray(holdings) || holdings.length === 0) {
    return res.status(400).json({ error: 'holdings array required' });
  }
  const portfolioValue = portfolio_value || 100000;

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  try {
    // Get latest CII scores for all countries
    const ciiScores = await sql`
      SELECT DISTINCT ON (country_code) country_code, score
      FROM country_cii_history
      ORDER BY country_code, timestamp DESC
    `;
    const ciiMap = new Map(ciiScores.map((r) => [String(r.country_code), Number(r.score)]));

    // Normalize weights
    const totalWeight = holdings.reduce((s, h) => s + h.weight, 0);
    const normalizedHoldings = holdings.map((h) => ({
      ...h,
      weight: totalWeight > 1 ? h.weight / totalWeight : h.weight,
    }));

    // Compute per-holding risk
    const holdingRisks = normalizedHoldings.map((h) => {
      const countries = TICKER_COUNTRY_MAP[h.ticker.toUpperCase()] || [{ country: 'US', exposure: 1.0 }];
      const holdingValue = portfolioValue * h.weight;

      let geoVaR = 0;
      const countryBreakdown: Array<{ country: string; cii: number; exposure: number; varContribution: number }> = [];

      for (const { country, exposure } of countries) {
        const cii = ciiMap.get(country) || (MARKET_RISK[country] ? MARKET_RISK[country] * 5 : 25);
        const beta = CII_BETA[country] || 0.01;
        // VaR contribution = holding_value × country_exposure × CII_score/100 × beta
        const varContrib = holdingValue * exposure * (cii / 100) * beta;
        geoVaR += varContrib;

        countryBreakdown.push({
          country,
          cii: Math.round(cii),
          exposure: Math.round(exposure * 100),
          varContribution: Math.round(varContrib),
        });
      }

      return {
        ticker: h.ticker.toUpperCase(),
        weight: Math.round(h.weight * 100),
        holdingValue: Math.round(holdingValue),
        geoVaR: Math.round(geoVaR),
        countryBreakdown,
      };
    });

    const totalGeoVaR = holdingRisks.reduce((s, h) => s + h.geoVaR, 0);
    const varPct = (totalGeoVaR / portfolioValue) * 100;

    // Scenario stress tests using CII deltas from preset scenarios
    const scenarioStresses: Array<{ name: string; countryCiiDeltas: Record<string, number> }> = [
      { name: 'Taiwan Strait Blockade', countryCiiDeltas: { TW: 15, JP: 8, KR: 8, CN: 8, US: 3 } },
      { name: 'Hormuz Closure', countryCiiDeltas: { IR: 5, SA: 5, JP: 8, KR: 8, IN: 8, DE: 5 } },
      { name: 'Russia-NATO Escalation', countryCiiDeltas: { RU: 6, PL: 6, DE: 6, FR: 6, GB: 6, UA: 2 } },
      { name: 'OPEC+ Collapse', countryCiiDeltas: { SA: 10, RU: 10, NG: 6, VE: 6, IQ: 6 } },
    ];

    const stressResults = scenarioStresses.map((scenario) => {
      let additionalVaR = 0;
      for (const holding of normalizedHoldings) {
        const countries = TICKER_COUNTRY_MAP[holding.ticker.toUpperCase()] || [];
        const holdingValue = portfolioValue * holding.weight;
        for (const { country, exposure } of countries) {
          const ciiDelta = scenario.countryCiiDeltas[country] || 0;
          if (ciiDelta > 0) {
            const beta = CII_BETA[country] || 0.01;
            additionalVaR += holdingValue * exposure * (ciiDelta / 100) * beta;
          }
        }
      }
      return {
        scenario: scenario.name,
        additionalVaR: Math.round(additionalVaR),
        additionalVaRPct: Math.round((additionalVaR / portfolioValue) * 10000) / 100,
      };
    });

    return res.json({
      success: true,
      portfolio: {
        value: portfolioValue,
        holdingCount: holdings.length,
      },
      geopoliticalRisk: {
        totalGeoVaR: Math.round(totalGeoVaR),
        geoVaRPercent: Math.round(varPct * 100) / 100,
        riskLevel: varPct > 5 ? 'HIGH' : varPct > 2 ? 'ELEVATED' : varPct > 1 ? 'MODERATE' : 'LOW',
      },
      holdings: holdingRisks,
      scenarioStressTests: stressResults,
      methodology:
        'CII-return beta model. VaR = sum(holding_value × country_exposure × CII/100 × beta). Betas estimated from historical CII-return correlations.',
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[risk-pricing] Error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Risk pricing computation failed' });
  }
}
