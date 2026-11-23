import { describe, it, expect } from 'vitest';
import { getBriefSystemPrompt, buildFallbackText, type BriefData } from './daily-brief.js';
import { checkComparativeClaims } from '../_lib/comparative-claims.js';
import { DAILY_SECTIONS, SUNDAY_SECTIONS } from '../_lib/brief-structure.js';

// 2026-11-14 is a Saturday (daily variant); 2026-11-15 a Sunday (Week in Review).
const VARIANTS: Array<[string, Date]> = [
  ['daily', new Date('2026-11-14T10:00:00Z')],
  ['sunday', new Date('2026-11-15T10:00:00Z')],
];

describe('brief prompt — censorship wording (lanes2/DATA.md Part 1)', () => {
  for (const [variant, when] of VARIANTS) {
    const prompt = getBriefSystemPrompt(when);

    it(`${variant}: no example subject seeds a "record censorship" claim`, () => {
      // Used verbatim as the 13 Sep and 16 Sep subjects; false both times.
      expect(prompt).not.toContain('hit record censorship');
      expect(prompt).not.toMatch(/^Good:.*\brecord\b/im);
    });

    it(`${variant}: says what the number is and forbids "blocks"`, () => {
      expect(prompt).toContain('CENSORSHIP NUMBERS ARE MEASUREMENTS');
      expect(prompt).toMatch(/never "N blocks"/);
    });

    it(`${variant}: comparisons only where the context marks one`, () => {
      expect(prompt).toContain('COMPARISONS ONLY WHERE MARKED');
      for (const m of ['highest-share', 'share-up', 'count-down']) expect(prompt).toContain(m);
    });

    it(`${variant}: no example restates a measurement count as "blocks"`, () => {
      expect(prompt).not.toMatch(/\d[\d,]*\s+confirmed blocks\b/);
    });

    it(`${variant}: the attribution example models no count, least of all the defective 2,136`, () => {
      // 2,136 was Russia's faulty one-hour figure (the real 6-day count was
      // 47,533). An instruction should not model a wrong count, so the example
      // carries the placeholder N.
      expect(/names its source inline: "([^"]+)"/.exec(prompt)?.[1].replace(/\s+/g, ' ')).toBe(
        'OONI confirmed N test measurements in Russia as blocked this week',
      );
      expect(prompt).not.toContain('2,136');
    });

    it(`${variant}: does not tell the model censorship predicts anything`, () => {
      // The audit (lanes2/HEADLINE-AUDIT.md) names the first as a cause of
      // "censorship precedes crackdowns" in the briefs; the second was the
      // model example of an assessment, echoed as "pre-positioning".
      expect(prompt).not.toMatch(/leading\s+indicators?/i);
      expect(prompt).not.toMatch(/days ahead of any\s+wire report/);
      expect(prompt).not.toMatch(/pre-emptive\s+posture/);
      expect(prompt).toMatch(/Never present censorship as\s+a predictor/);
    });
  }
});

describe('the comparative-claim gate does not refuse our own fixed text', () => {
  it('section headers pass', () => {
    expect(checkComparativeClaims([...DAILY_SECTIONS, ...SUNDAY_SECTIONS].join('\n'), '').pass).toBe(true);
  });

  it('the mechanical edition makes no record claim and no "blocks" restatement', () => {
    const data = {
      date: '2026-11-14',
      utcTime: '10:00 UTC',
      topRiskCountries: [
        {
          name: 'Iran',
          code: 'IR',
          score: 85,
          deviation: 12,
          prevScore: 85,
          prevDeviation: 4,
          components: { conflict: 10, disasters: 0, governance: 9, marketExposure: 5, infrastructure: 12 },
        },
      ],
      totalCountries: 85,
      earthquakeCount: 31,
      significantQuakes: [],
      diseaseCount: 0,
      recentOutbreaks: [],
      conflictHeadlines: [],
      markets: [],
      yesterdayEqCount: null,
      weeklyTrends: [],
      correlations: [],
      newsHeadlines: [],
      resolvedCallLines: [
        '65 calls settled against external ground truth: 27 hit, 38 miss.',
        'Iran (IR): HIT — we said 84% (base rate 80%) for a confirmed censorship event by 2026-11-13 — OONI confirmed blocking on 7 days in the window',
      ],
      openCallLines: [
        'Iran (IR): 62% chance of a confirmed censorship event by 2026-11-28 — +18pts vs its base rate of 44%',
      ],
    } as unknown as BriefData;
    const r = checkComparativeClaims(buildFallbackText(data), '');
    expect(r.unsupported).toEqual([]);
    expect(r.unitViolations).toEqual([]);
  });
});

describe('the prompt’s own example phrasing passes the gate (review finding 5)', () => {
  const ctx = [
    'Iran (IR): 1,611 of 9,800 OONI measurements confirmed blocked (16.4%); previous window 350 of 9,700 (3.6%); highest share in the history: 16.4% (window to 2026-11-13). MARKERS: highest-share, highest-count, share-up, count-up, count-doubled, count-tripled',
    'Russia (RU): 2,136 of 48,000 OONI measurements confirmed blocked (4.5%); previous window 2,100 of 47,500 (4.4%); highest share in the history: 4.8% (window to 2026-09-20). MARKERS: none',
  ].join('\n');
  const prompt = getBriefSystemPrompt(new Date('2026-11-14T10:00:00Z'));
  const quoted = (re: RegExp) => {
    const m = re.exec(prompt);
    expect(m).not.toBeNull();
    return (m as RegExpExecArray)[1].replace(/\s+/g, ' ');
  };
  it('the Movers example', () => {
    const s = quoted(/Correct, with evidence:\s+(.+)/);
    expect(checkComparativeClaims(s, ctx, ['Iran', 'Russia']).pass).toBe(true);
  });
  it('the attribution example', () => {
    const s = quoted(/inline: "([^"]+)"/);
    expect(checkComparativeClaims(s, ctx, ['Iran', 'Russia']).pass).toBe(true);
  });
  it('the assessment example', () => {
    const s = `Russia: ${quoted(/is observed\. "([^"]+)" is assessed/)}`;
    expect(checkComparativeClaims(s, ctx, ['Iran', 'Russia']).pass).toBe(true);
  });
  it('the span example, applied to a country that carries the marker', () => {
    const s = `Iran's share is ${quoted(/span the section header gives\s+\("([^"]+)"\)/)}.`;
    expect(checkComparativeClaims(s, ctx, ['Iran', 'Russia']).pass).toBe(true);
  });
});
