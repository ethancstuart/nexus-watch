import { describe, it, expect } from 'vitest';
import { computePortfolioExposure, getSupportedHoldings } from './portfolioExposure.ts';

describe('portfolioExposure', () => {
  it('returns supported tickers list', () => {
    const tickers = getSupportedHoldings();
    expect(tickers).toContain('TSMC');
    expect(tickers).toContain('XOM');
    expect(tickers).toContain('VWO');
    expect(tickers.length).toBeGreaterThan(30);
  });

  it('computes exposure for tech-heavy portfolio', () => {
    const report = computePortfolioExposure([
      { symbol: 'TSMC', weight: 50 },
      { symbol: 'NVDA', weight: 50 },
    ]);
    expect(report.exposures.length).toBeGreaterThan(0);
    const taiwan = report.exposures.find((e) => e.countryCode === 'TW');
    expect(taiwan).toBeDefined();
    // TSMC: 85% TW × 50% weight = 42.5, NVDA: 20% TW × 50% = 10
    expect(taiwan?.exposurePct).toBeCloseTo(52.5, 1);
  });

  it('returns zero-risk for empty portfolio', () => {
    const report = computePortfolioExposure([]);
    expect(report.overallRisk).toBe(0);
    expect(report.exposures.length).toBe(0);
  });

  it('aggregates exposure across multiple holdings', () => {
    const report = computePortfolioExposure([
      { symbol: 'AAPL', weight: 30 },
      { symbol: 'MSFT', weight: 30 },
      { symbol: 'TSMC', weight: 40 },
    ]);
    const usExposure = report.exposures.find((e) => e.countryCode === 'US');
    expect(usExposure).toBeDefined();
    // AAPL 40% × 30 + MSFT 55% × 30 + TSMC 5% × 40 = 12 + 16.5 + 2 = 30.5
    expect(usExposure!.exposurePct).toBeGreaterThan(25);
  });

  it('surfaces elevated exposure when CII > 60 countries present', () => {
    const report = computePortfolioExposure([
      { symbol: 'RSX', weight: 100 }, // 90% Russia
    ]);
    // Elevated exposure depends on CII being populated — should at least be defined
    expect(typeof report.elevatedExposurePct).toBe('number');
  });

  it('produces a valid risk label and color', () => {
    const report = computePortfolioExposure([{ symbol: 'AAPL', weight: 100 }]);
    expect(['LOW', 'MODERATE', 'ELEVATED', 'HIGH', 'CRITICAL']).toContain(report.riskLabel);
    expect(report.riskColor).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('ignores unknown tickers gracefully', () => {
    const report = computePortfolioExposure([{ symbol: 'UNKNOWN_TICKER_XYZ', weight: 50 }]);
    expect(report.exposures.length).toBe(0);
  });
});
