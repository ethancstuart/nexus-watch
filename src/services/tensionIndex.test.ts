import { describe, it, expect, vi } from 'vitest';
import { computeTensionIndex, tensionColor, tensionLabel } from './tensionIndex.ts';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => {
    store[key] = val;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    Object.keys(store).forEach((k) => delete store[k]);
  },
});

describe('tensionIndex', () => {
  it('returns 0 with empty layer data', () => {
    const result = computeTensionIndex(new Map());
    expect(result.global).toBe(0);
    expect(result.trend).toBe('stable');
  });

  it('computes conflict component from ACLED data', () => {
    const data = new Map();
    data.set('acled', [{ fatalities: 10 }, { fatalities: 5 }, { fatalities: 20 }]);
    const result = computeTensionIndex(data);
    expect(result.components.conflict).toBeGreaterThan(0);
    expect(result.global).toBeGreaterThan(0);
  });

  it('computes disaster component from earthquake data', () => {
    const data = new Map();
    data.set('earthquakes', [
      { magnitude: 5.5, depth: 10 },
      { magnitude: 6.2, depth: 20 },
    ]);
    const result = computeTensionIndex(data);
    expect(result.components.disasters).toBeGreaterThan(0);
  });

  it('computes sentiment from GDELT tone', () => {
    const data = new Map();
    data.set('news', [{ tone: -8 }, { tone: -6 }, { tone: -7 }]);
    const result = computeTensionIndex(data);
    expect(result.components.sentiment).toBeGreaterThan(0);
  });

  it('caps global score at 100', () => {
    const data = new Map();
    data.set('acled', Array(100).fill({ fatalities: 50 }));
    data.set('earthquakes', Array(50).fill({ magnitude: 7.0 }));
    data.set('news', Array(50).fill({ tone: -10 }));
    data.set('cyber', Array(50).fill({}));
    data.set('gps-jamming', Array(50).fill({}));
    const result = computeTensionIndex(data);
    expect(result.global).toBeLessThanOrEqual(100);
  });

  it('tensionColor returns correct colors', () => {
    expect(tensionColor(80)).toBe('#dc2626');
    expect(tensionColor(55)).toBe('#f97316');
    expect(tensionColor(30)).toBe('#eab308');
    expect(tensionColor(10)).toBe('#00ff00');
  });

  it('tensionLabel returns correct labels', () => {
    expect(tensionLabel(80)).toBe('CRITICAL');
    expect(tensionLabel(55)).toBe('ELEVATED');
    expect(tensionLabel(30)).toBe('MODERATE');
    expect(tensionLabel(10)).toBe('LOW');
  });
});
