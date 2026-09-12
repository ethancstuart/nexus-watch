import { describe, it, expect } from 'vitest';
import { DATA_SOURCES, pickSource, type LayerConfig } from './data-sources';

const single: LayerConfig = {
  id: 'only',
  primary: {
    name: 'the-one',
    probeUrl: 'https://example.test/only',
    probeTimeoutMs: 1000,
    freshnessWindowSeconds: 3600,
  },
  fallbacks: [],
};

const withFallbacks: LayerConfig = {
  id: 'many',
  primary: { name: 'p', probeUrl: 'https://example.test/p', probeTimeoutMs: 1000, freshnessWindowSeconds: 3600 },
  fallbacks: [
    { name: 'f1', probeUrl: 'https://example.test/f1', probeTimeoutMs: 1000, freshnessWindowSeconds: 3600 },
    { name: 'f2', probeUrl: 'https://example.test/f2', probeTimeoutMs: 1000, freshnessWindowSeconds: 3600 },
  ],
};

/**
 * A BREAKER THAT IS NEVER PROBED CAN NEVER CLOSE. pickSource used to return
 * null for an open circuit with no fallbacks, the cron then "recorded the
 * outage without probing", and consecutive_failures climbed forever: UCDP
 * reached 150 on 2026-09-12 while its upstream answered 200, red on the
 * public status page for a probe that was never sent.
 */
describe('pickSource — an open circuit with nothing to fall back to keeps probing its only source', () => {
  it('returns the primary while closed or half-open', () => {
    expect(pickSource(single, 'closed', 0)?.name).toBe('the-one');
    expect(pickSource(single, 'half_open', 0)?.name).toBe('the-one');
    expect(pickSource(withFallbacks, 'closed', 7)?.name).toBe('p');
  });

  it('cycles fallbacks every five failures while open, when there are any', () => {
    expect(pickSource(withFallbacks, 'open', 5)?.name).toBe('f1');
    expect(pickSource(withFallbacks, 'open', 10)?.name).toBe('f2');
    expect(pickSource(withFallbacks, 'open', 15)?.name).toBe('f1');
  });

  it('never returns null for a single-source layer — the case that stranded UCDP', () => {
    expect(pickSource(single, 'open', 5)?.name).toBe('the-one');
    expect(pickSource(single, 'open', 150)?.name).toBe('the-one');
  });

  it('every layer in the live catalogue can be probed in every breaker state', () => {
    // Derived from the catalogue, so a new single-source layer is covered the
    // day it is added rather than when someone remembers this file.
    for (const layer of DATA_SOURCES) {
      for (const state of ['closed', 'half_open', 'open'] as const) {
        expect(pickSource(layer, state, 150), `${layer.id} in state ${state}`).not.toBeNull();
      }
    }
  });
});
