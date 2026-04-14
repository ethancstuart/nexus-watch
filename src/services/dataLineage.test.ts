import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordFetch,
  recordAudit,
  getLineageByLayer,
  getAuditTrail,
  getLatestAudit,
  summarizeLineage,
} from './dataLineage.ts';

describe('dataLineage', () => {
  describe('recordFetch', () => {
    it('records a fetch and returns record with id', () => {
      const record = recordFetch({
        layerId: 'test-layer',
        source: 'Test Source',
        sourceUrl: 'https://example.com/api',
        responseStatus: 200,
        fetchStartMs: 1000,
        fetchEndMs: 1500,
        responseSizeBytes: 1024,
        recordsReturned: 10,
        recordsAccepted: 9,
      });
      expect(record.id).toBeTruthy();
      expect(record.latencyMs).toBe(500);
    });

    it('retrieves fetches by layer', () => {
      recordFetch({
        layerId: 'my-layer',
        source: 'S1',
        sourceUrl: 'https://s1/',
        responseStatus: 200,
        fetchStartMs: 1000,
        fetchEndMs: 1100,
        responseSizeBytes: 500,
        recordsReturned: 5,
        recordsAccepted: 5,
      });
      const byLayer = getLineageByLayer('my-layer');
      expect(byLayer.length).toBeGreaterThanOrEqual(1);
    });

    it('computes diff when previous and current IDs provided', () => {
      const record = recordFetch({
        layerId: 'diff-layer',
        source: 'S',
        sourceUrl: 'https://s/',
        responseStatus: 200,
        fetchStartMs: 1000,
        fetchEndMs: 1100,
        responseSizeBytes: 500,
        recordsReturned: 3,
        recordsAccepted: 3,
        previousRecordIds: ['a', 'b', 'c'],
        currentRecordIds: ['b', 'c', 'd'],
      });
      expect(record.diff).toBeDefined();
      expect(record.diff!.added).toBe(1); // d is new
      expect(record.diff!.removed).toBe(1); // a is gone
      expect(record.diff!.unchanged).toBe(2); // b, c stayed
    });

    it('captures quality filter stats', () => {
      const record = recordFetch({
        layerId: 'filter-layer',
        source: 'S',
        sourceUrl: 'https://s/',
        responseStatus: 200,
        fetchStartMs: 1000,
        fetchEndMs: 1100,
        responseSizeBytes: 500,
        recordsReturned: 10,
        recordsAccepted: 5,
        qualityFilters: [
          { rule: 'date older than 24h', rejectedCount: 3 },
          { rule: 'invalid coords', rejectedCount: 2 },
        ],
      });
      expect(record.qualityFilters.length).toBe(2);
      expect(record.qualityFilters[0].rejectedCount).toBe(3);
    });
  });

  describe('recordAudit', () => {
    beforeEach(() => {
      // Each test starts with some fetches recorded — that's fine
    });

    it('records audit entry and retrieves by country', () => {
      recordAudit({
        countryCode: 'TESTCOUNTRY',
        ruleVersion: '2.1.0',
        inputLineageIds: ['ln1', 'ln2'],
        score: 75,
        previousScore: 70,
        components: {
          conflict: 15,
          disasters: 5,
          sentiment: 10,
          infrastructure: 5,
          governance: 10,
          marketExposure: 15,
        },
        confidence: 'high',
        appliedRules: ['baseline', 'live-acled'],
        gaps: [],
      });
      const trail = getAuditTrail('TESTCOUNTRY');
      expect(trail.length).toBeGreaterThan(0);
      const latest = getLatestAudit('TESTCOUNTRY');
      expect(latest!.score).toBe(75);
    });
  });

  describe('summarizeLineage', () => {
    it('produces summary with successRate and latency', () => {
      const summary = summarizeLineage();
      expect(summary.totalFetches).toBeGreaterThanOrEqual(0);
      expect(summary.successRate).toBeGreaterThanOrEqual(0);
      expect(summary.successRate).toBeLessThanOrEqual(1);
      expect(Array.isArray(summary.layerCoverage)).toBe(true);
    });
  });
});
