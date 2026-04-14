import { describe, it, expect } from 'vitest';
import { parseClaims, renderClaimsHtml, overallConfidence } from './claimConfidence.ts';

describe('claimConfidence', () => {
  describe('parseClaims', () => {
    it('parses sentences with confidence tags', () => {
      const text = 'Sudan CII is 87 [H]. Conflict events increased 23% [H]. Famine reports remain uncertain [L].';
      const claims = parseClaims(text);
      expect(claims.length).toBe(3);
      expect(claims[0].confidence).toBe('high');
      expect(claims[2].confidence).toBe('low');
    });

    it('strips tags from display text', () => {
      const claims = parseClaims('This is a fact [H].');
      expect(claims[0].sentence).toBe('This is a fact.');
    });

    it('handles [A] assessments as low confidence', () => {
      const claims = parseClaims('The pattern resembles the 2023 collapse [A].');
      expect(claims[0].confidence).toBe('low');
    });

    it('defaults to medium for untagged sentences', () => {
      const claims = parseClaims('Untagged sentence.');
      expect(claims[0].confidence).toBe('medium');
    });

    it('handles empty input', () => {
      expect(parseClaims('')).toEqual([]);
    });
  });

  describe('overallConfidence', () => {
    it('returns medium for empty', () => {
      expect(overallConfidence([])).toBe('medium');
    });

    it('returns high when majority high', () => {
      const claims = [
        { sentence: 'a', confidence: 'high' as const, sourceIds: [] },
        { sentence: 'b', confidence: 'high' as const, sourceIds: [] },
        { sentence: 'c', confidence: 'medium' as const, sourceIds: [] },
      ];
      expect(overallConfidence(claims)).toBe('high');
    });

    it('returns low when majority low', () => {
      const claims = [
        { sentence: 'a', confidence: 'low' as const, sourceIds: [] },
        { sentence: 'b', confidence: 'low' as const, sourceIds: [] },
        { sentence: 'c', confidence: 'medium' as const, sourceIds: [] },
      ];
      expect(overallConfidence(claims)).toBe('low');
    });
  });

  describe('renderClaimsHtml', () => {
    it('renders with inline badges', () => {
      const claims = [{ sentence: 'Hello', confidence: 'high' as const, sourceIds: [] }];
      const html = renderClaimsHtml(claims);
      expect(html).toContain('nw-claim-high');
      expect(html).toContain('Hello');
      expect(html).toContain('>H<');
    });

    it('escapes HTML in sentences', () => {
      const claims = [{ sentence: '<script>alert("x")</script>', confidence: 'low' as const, sourceIds: [] }];
      const html = renderClaimsHtml(claims);
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });
  });
});
