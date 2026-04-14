import { describe, it, expect } from 'vitest';
import { simulateScenario, matchScenarioQuery, PRESET_SCENARIOS } from './scenarioEngine.ts';

describe('scenarioEngine', () => {
  it('exposes 7 preset scenarios', () => {
    expect(PRESET_SCENARIOS.length).toBeGreaterThanOrEqual(7);
  });

  it('every preset has id, name, description', () => {
    for (const p of PRESET_SCENARIOS) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.description).toBeTruthy();
    }
  });

  it('simulates Hormuz closure with cascades', () => {
    const result = simulateScenario('hormuz-closure');
    expect(result).not.toBeNull();
    expect(result!.affectedCountries.length).toBeGreaterThan(0);
    expect(result!.affectedInfrastructure.some((i) => i.name.includes('Hormuz'))).toBe(true);
    expect(result!.cascades.length).toBeGreaterThan(0);
  });

  it('returns null for unknown preset', () => {
    const result = simulateScenario('nonexistent-scenario');
    expect(result).toBeNull();
  });

  it('matches free-text query to closest preset', () => {
    const matched = matchScenarioQuery('what if Iran closes Hormuz strait');
    expect(matched).not.toBeNull();
    expect(matched!.id).toBe('hormuz-closure');
  });

  it('returns null for unmatchable free-text query', () => {
    const matched = matchScenarioQuery('something completely unrelated xyz');
    expect(matched).toBeNull();
  });

  it('includes historical precedent for Hormuz', () => {
    const result = simulateScenario('hormuz-closure');
    expect(result!.precedents.length).toBeGreaterThan(0);
  });

  it('produces confidence assessment on every simulation', () => {
    const result = simulateScenario('taiwan-blockade');
    expect(['high', 'medium', 'low']).toContain(result!.confidence);
    expect(result!.confidenceNote).toBeTruthy();
  });
});
