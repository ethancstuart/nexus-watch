import { describe, it, expect } from 'vitest';
import { EvidenceBuilder, confidenceColor, confidenceIcon, confidenceLabel } from './confidenceScoring.ts';

describe('confidenceScoring', () => {
  describe('EvidenceBuilder', () => {
    it('produces LOW confidence for empty component', () => {
      const eb = new EvidenceBuilder();
      eb.startComponent('conflict', 20);
      eb.setScore('conflict', 0);
      const chain = eb.build('UA');
      expect(chain.components[0].confidence).toBe('low');
      // Overall stays MEDIUM until majority (3+) LOW components
      expect(chain.overallConfidence).toBe('medium');
    });

    it('produces MEDIUM for baseline-only component', () => {
      const eb = new EvidenceBuilder();
      eb.startComponent('marketExposure', 20);
      eb.markBaseline('marketExposure', 'Static baseline');
      eb.setScore('marketExposure', 15);
      const chain = eb.build('UA');
      expect(chain.components[0].confidence).toBe('medium');
      expect(chain.components[0].usesBaseline).toBe(true);
    });

    it('tracks gaps per component', () => {
      const eb = new EvidenceBuilder();
      eb.startComponent('sentiment', 15);
      eb.addGap('sentiment', 'No GDELT data');
      eb.setScore('sentiment', 0);
      const chain = eb.build('UA');
      expect(chain.components[0].gaps).toContain('No GDELT data');
      expect(chain.summaryGaps).toContain('No GDELT data');
    });

    it('counts unique sources across components', () => {
      const eb = new EvidenceBuilder();
      eb.startComponent('conflict', 20);
      eb.addSource('conflict', 'acled', 'ACLED', [{ text: 'event 1', lat: 0, lon: 0, timestamp: 0, source: 'ACLED' }]);
      eb.setScore('conflict', 10);
      eb.startComponent('disasters', 15);
      eb.addSource('disasters', 'earthquakes', 'USGS', [
        { text: 'quake 1', lat: 0, lon: 0, timestamp: 0, source: 'USGS' },
      ]);
      eb.addSource('disasters', 'fires', 'NASA FIRMS', [
        { text: 'fire 1', lat: 0, lon: 0, timestamp: 0, source: 'NASA FIRMS' },
      ]);
      eb.setScore('disasters', 5);
      const chain = eb.build('UA');
      expect(chain.totalSourceCount).toBe(3);
      expect(chain.totalDataPoints).toBe(3);
    });
  });

  describe('display helpers', () => {
    it('returns color for each confidence level', () => {
      expect(confidenceColor('high')).toBe('#22c55e');
      expect(confidenceColor('medium')).toBe('#eab308');
      expect(confidenceColor('low')).toBe('#dc2626');
    });

    it('returns icon for each confidence level', () => {
      expect(confidenceIcon('high')).toBeTruthy();
      expect(confidenceIcon('medium')).toBeTruthy();
      expect(confidenceIcon('low')).toBeTruthy();
    });

    it('returns readable label for each level', () => {
      expect(confidenceLabel('high')).toContain('HIGH');
      expect(confidenceLabel('medium')).toContain('MEDIUM');
      expect(confidenceLabel('low')).toContain('LOW');
    });
  });
});
