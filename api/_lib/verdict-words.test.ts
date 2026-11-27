import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  frontDoorVerdict,
  figuresFromLedgerJson,
  type FxFigures,
  type VerdictFigures,
  type SkillInterval,
} from './verdict-words.js';

/**
 * THE FRONT DOOR'S VERDICT: dated, computed, and never a skill claim the data
 * does not make.
 *
 * `/` and `/ledger` open with one plain sentence about the record. Every number
 * in it is handed in by the caller, which reads it from the ledger's own
 * queries at request time; this module only words them. These tests pin:
 *  - the words, exactly, for each branch (the lead signs these off);
 *  - that every number printed comes from the figures passed in;
 *  - that "skill" is said positively ONLY when an interval excludes zero.
 *    The ledger computes no interval today, so in production that branch
 *    cannot be reached; it is tested with fixtures so it is right when one is.
 */

const MINUS = '−';

const fx = (over: Partial<FxFigures> = {}): FxFigures => ({
  skill: -0.0299,
  batches: 78,
  minBatches: 3,
  interval: null,
  ...over,
});
const figures = (over: Partial<VerdictFigures> = {}): VerdictFigures => ({
  asOn: '2026-11-27',
  scored: 5693,
  open: 980,
  fx: fx(),
  correctionsPage: true,
  ...over,
});
const text = (f: VerdictFigures) => {
  const v = frontDoorVerdict(f);
  if (!v) throw new Error('no verdict');
  return v.text;
};

const CORRECTIONS =
  'Corrections to our daily brief’s censorship reporting are published on our corrections page; corrected ' +
  'forecast outcomes appear on their call pages.';

describe('the words, branch by branch', () => {
  it('the lead’s example: counts, then currencies, then the corrections link', () => {
    const v = frontDoorVerdict(figures());
    expect(v?.text).toBe(
      `As of 27 Nov 2026: 5,693 forecasts scored, 980 open. Currency forecasts score ${MINUS}3% against their base ` +
        `rate: no detectable skill. ${CORRECTIONS}`,
    );
    expect(v?.dateline).toBe('As of 27 Nov 2026:');
    expect(v?.corrections).toEqual({
      before: 'Corrections to our daily brief’s censorship reporting are published on ',
      link: 'our corrections page',
      after: '; corrected forecast outcomes appear on their call pages.',
      href: '/corrections',
    });
    // The pieces put back together are the whole text: no surface can render
    // a different sentence from the one tested here.
    expect(`${v?.dateline} ${v?.body} ${v?.corrections?.before}${v?.corrections?.link}${v?.corrections?.after}`).toBe(
      v?.text,
    );
  });

  it('a skill that rounds to zero prints 0%, unsigned', () => {
    expect(text(figures({ fx: fx({ skill: -0.004 }) }))).toContain(
      'Currency forecasts score 0% against their base rate: no detectable skill.',
    );
  });

  it('a positive estimate with no interval is never called skill', () => {
    expect(text(figures({ fx: fx({ skill: 0.021 }) }))).toContain(
      'Currency forecasts score +2% against their base rate. We compute no interval for that figure yet, so we ' +
        'claim no skill from it.',
    );
  });

  it('withheld below the batch threshold says so, with the threshold from the figures', () => {
    expect(text(figures({ fx: fx({ skill: null, batches: 2, minBatches: 3 }) }))).toContain(
      'Currency forecasts have no skill figure yet: it is withheld until they have resolved in 3 separate batches.',
    );
    expect(text(figures({ fx: fx({ skill: null, batches: 4, minBatches: 5 }) }))).toContain(
      'resolved in 5 separate batches.',
    );
  });

  it('withheld for any other reason says only that there is no figure', () => {
    for (const f of [fx({ skill: null, batches: 9 }), fx({ skill: null, minBatches: null })]) {
      expect(text(figures({ fx: f }))).toContain('Currency forecasts carry no published skill figure.');
    }
  });

  it('no currency sentence when there are no scored currency forecasts', () => {
    expect(text(figures({ fx: null }))).toBe(`As of 27 Nov 2026: 5,693 forecasts scored, 980 open. ${CORRECTIONS}`);
  });

  it('no corrections sentence, and no link, when there is no corrections page', () => {
    const v = frontDoorVerdict(figures({ correctionsPage: false }));
    expect(v?.corrections).toBeNull();
    expect(v?.text).not.toMatch(/orrection/);
  });

  it('one forecast is singular', () => {
    expect(text(figures({ scored: 1, open: 0 }))).toContain('As of 27 Nov 2026: 1 forecast scored, 0 open.');
  });

  it('an interval that includes zero is printed, in plain words', () => {
    expect(text(figures({ fx: fx({ skill: -0.031, interval: { lo: -0.072, hi: 0.04, level: 0.95 } }) }))).toContain(
      `Currency forecasts score ${MINUS}3% against their base rate (95% interval ${MINUS}7.2% to +4.0%, which ` +
        'includes zero): no detectable skill.',
    );
  });

  it('an interval wholly above zero is the one place "skill" is said positively', () => {
    expect(text(figures({ fx: fx({ skill: 0.05, interval: { lo: 0.021, hi: 0.08, level: 0.95 } }) }))).toContain(
      'Currency forecasts score +5% against their base rate (95% interval +2.1% to +8.0%, which excludes zero): ' +
        'detectable skill.',
    );
  });

  it('an interval wholly below zero says worse, not skill', () => {
    expect(text(figures({ fx: fx({ skill: -0.08, interval: { lo: -0.12, hi: -0.041, level: 0.95 } }) }))).toContain(
      `Currency forecasts score ${MINUS}8% against their base rate (95% interval ${MINUS}12.0% to ${MINUS}4.1%, ` +
        'which excludes zero): worse than their base rate.',
    );
  });
});

/**
 * "skill" in a positive sense: whatever is left of the text once every
 * negative or neutral phrase this module may use is removed. Written out here,
 * not imported, so a change to the module's words cannot quietly widen it.
 */
const NEGATIVE_SKILL_PHRASES = [
  'no detectable skill',
  'so we claim no skill from it',
  'have no skill figure yet',
  'carry no published skill figure',
];
function saysSkillPositively(t: string): boolean {
  let rest = t;
  for (const p of NEGATIVE_SKILL_PHRASES) rest = rest.split(p).join('');
  return /skill/i.test(rest);
}

/** A small deterministic generator, so the sweep is the same on every run. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('"skill" is said positively only when an interval excludes zero', () => {
  const rand = lcg(20261127);
  const intervals: Array<SkillInterval | null | undefined> = [];
  for (let i = 0; i < 400; i++) {
    const a = (rand() - 0.5) * 0.4;
    const b = (rand() - 0.5) * 0.4;
    intervals.push(
      i % 7 === 0 ? null : i % 11 === 0 ? undefined : { lo: Math.min(a, b), hi: Math.max(a, b), level: 0.95 },
    );
  }

  it('over a sweep of skills and intervals, in both directions', () => {
    const rand2 = lcg(7);
    let positives = 0;
    let others = 0;
    for (const interval of intervals) {
      const skill = interval ? (interval.lo + interval.hi) / 2 : (rand2() - 0.5) * 0.4;
      const t = text(figures({ fx: fx({ skill, interval }) }));
      const excludesZeroAbove = !!interval && interval.lo > 0;
      expect(saysSkillPositively(t), t).toBe(excludesZeroAbove);
      if (excludesZeroAbove) positives++;
      else others++;
    }
    // Both branches were actually exercised.
    expect(positives).toBeGreaterThan(20);
    expect(others).toBeGreaterThan(20);
  });

  it('a positive point estimate is not skill without an interval, however large', () => {
    for (const skill of [0.001, 0.02, 0.15, 0.6]) {
      expect(saysSkillPositively(text(figures({ fx: fx({ skill, interval: null }) })))).toBe(false);
    }
  });

  it('an interval that touches zero does not exclude it', () => {
    const t = text(figures({ fx: fx({ skill: 0.03, interval: { lo: 0, hi: 0.06, level: 0.95 } }) }));
    expect(saysSkillPositively(t)).toBe(false);
    expect(t).toContain('which includes zero): no detectable skill.');
  });

  it('a malformed interval is ignored, never read as evidence of skill', () => {
    const bad: unknown[] = [
      { lo: 0.05, hi: 0.01, level: 0.95 }, // reversed
      { lo: 0.02, hi: 0.08, level: 0.95, extra: 1 } as unknown, // fine shape, but the estimate is outside it
      { lo: Number.NaN, hi: 0.08, level: 0.95 },
      { lo: 0.02, hi: Number.POSITIVE_INFINITY, level: 0.95 },
      { lo: 0.02, hi: 0.08, level: 1.5 },
      { lo: '0.02', hi: '0.08', level: 0.95 },
    ];
    for (const interval of bad) {
      const t = text(figures({ fx: fx({ skill: 0.15, interval: interval as SkillInterval }) }));
      expect(saysSkillPositively(t), JSON.stringify(interval)).toBe(false);
      expect(t).toContain('We compute no interval for that figure yet, so we claim no skill from it.');
    }
  });

  it('a withheld skill never becomes a claim, whatever interval comes with it', () => {
    const t = text(figures({ fx: fx({ skill: null, interval: { lo: 0.02, hi: 0.08, level: 0.95 } }) }));
    expect(saysSkillPositively(t)).toBe(false);
  });
});

describe('every number printed comes from the figures passed in', () => {
  /** The strings a figure may legitimately print as. */
  function allowed(f: VerdictFigures): Set<string> {
    const [y, m, d] = f.asOn.split('-').map(Number);
    const out = new Set<string>([String(d), String(y), String(m)]);
    const group = (n: number) => n.toLocaleString('en-US');
    out.add(group(f.scored));
    out.add(group(f.open));
    if (f.fx) {
      if (f.fx.skill !== null) out.add(String(Math.abs(Math.round(f.fx.skill * 100))));
      if (f.fx.minBatches !== null) out.add(String(f.fx.minBatches));
      const i = f.fx.interval;
      if (i) {
        out.add(String(Math.round(i.level * 100)));
        out.add(Math.abs(i.lo * 100).toFixed(1));
        out.add(Math.abs(i.hi * 100).toFixed(1));
      }
    }
    return out;
  }

  it('over a sweep of books, no digit appears that the figures did not supply', () => {
    const rand = lcg(42);
    for (let i = 0; i < 300; i++) {
      const day = 1 + Math.floor(rand() * 28);
      const month = 1 + Math.floor(rand() * 12);
      const asOn = `${2026 + Math.floor(rand() * 3)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const lo = (rand() - 0.5) * 0.3;
      const f = figures({
        asOn,
        scored: Math.floor(rand() * 2_000_000),
        open: Math.floor(rand() * 50_000),
        fx:
          i % 5 === 0
            ? null
            : fx({
                skill: i % 4 === 0 ? null : (rand() - 0.5) * 0.4,
                batches: Math.floor(rand() * 9),
                minBatches: 2 + Math.floor(rand() * 6),
                interval: i % 3 === 0 ? { lo, hi: lo + rand() * 0.2, level: 0.9 } : null,
              }),
      });
      if (f.fx?.interval && f.fx.skill !== null) {
        f.fx.skill = (f.fx.interval.lo + f.fx.interval.hi) / 2;
      }
      const t = text(f);
      const ok = allowed(f);
      for (const n of t.match(/\d[\d,.]*\d|\d/g) ?? []) expect(ok.has(n), `${n} in: ${t}`).toBe(true);
    }
  });

  it('two different books print two different verdicts, each with its own numbers', () => {
    const a = text(figures({ asOn: '2026-11-22', scored: 5429, open: 919, fx: fx({ skill: -0.0299 }) }));
    const b = text(figures({ asOn: '2026-12-03', scored: 6210, open: 1004, fx: fx({ skill: -0.012 }) }));
    expect(a).toContain('As of 22 Nov 2026: 5,429 forecasts scored, 919 open.');
    expect(a).toContain(`score ${MINUS}3% against`);
    expect(b).toContain('As of 3 Dec 2026: 6,210 forecasts scored, 1,004 open.');
    expect(b).toContain(`score ${MINUS}1% against`);
  });

  it('the module itself carries no figure: its only numeric literals are 0, 1 and 100', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'verdict-words.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      // The one regex literal: thousands grouping.
      .replace(/\/\\B\(\?=\(\\d\{3\}\)\+\(\?!\\d\)\)\/g/g, '');
    const literals = [...src.matchAll(/(?<![\w$.])\d+(?:\.\d+)?(?![\w$])/g)].map((m) => m[0]);
    expect(new Set(literals)).toEqual(new Set(['0', '1', '100']));
  });
});

describe('refuses figures it cannot stand behind', () => {
  it('a date that is not a real calendar date gives no verdict', () => {
    for (const asOn of ['2026-02-30', '<b>27 Nov</b>', '', '2026-11-27T00:00:00Z']) {
      expect(frontDoorVerdict(figures({ asOn }))).toBeNull();
    }
  });

  it('a count that is not a whole, non-negative number gives no verdict', () => {
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '980' as unknown as number]) {
      expect(frontDoorVerdict(figures({ open: bad }))).toBeNull();
      expect(frontDoorVerdict(figures({ scored: bad }))).toBeNull();
    }
  });

  it('a skill that is not a finite number is read as withheld, never printed', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, '-0.03' as unknown as number]) {
      const t = text(figures({ fx: fx({ skill: bad }) }));
      expect(t).not.toMatch(/Currency forecasts score/);
      expect(t).not.toMatch(/%.*against/);
      expect(t).toContain('Currency forecasts carry no published skill figure.');
    }
  });
});

describe('figuresFromLedgerJson: the landing reads the ledger’s JSON, defensively', () => {
  const json = {
    generated_at: '2026-11-27T09:14:00.000Z',
    counts: { open: 980, resolved: 5693 },
    min_batches_for_skill: 3,
    by_kind: {
      fx_devaluation: { resolved: 5400, skill_vs_base_rate: -0.031, batches: 80 },
      censorship_event: { resolved: 263, skill_vs_base_rate: -0.02, batches: 6 },
    },
  };

  it('takes the date, the counts and the currency figures from the response', () => {
    expect(figuresFromLedgerJson(json, true)).toEqual({
      asOn: '2026-11-27',
      scored: 5693,
      open: 980,
      fx: { skill: -0.031, batches: 80, minBatches: 3, interval: null },
      correctionsPage: true,
    });
  });

  it('no currency figures when the response has no scored currency forecasts', () => {
    const none = { ...json, by_kind: { fx_devaluation: { resolved: 0, skill_vs_base_rate: null, batches: 0 } } };
    expect(figuresFromLedgerJson(none, true)?.fx).toBeNull();
    expect(figuresFromLedgerJson({ ...json, by_kind: {} }, true)?.fx).toBeNull();
  });

  it('a withheld skill arrives as null and stays null', () => {
    const withheld = {
      ...json,
      by_kind: { fx_devaluation: { resolved: 40, skill_vs_base_rate: null, batches: 1 } },
    };
    expect(figuresFromLedgerJson(withheld, true)?.fx).toEqual({
      skill: null,
      batches: 1,
      minBatches: 3,
      interval: null,
    });
  });

  it('nothing at all from a response it cannot read', () => {
    for (const bad of [
      null,
      undefined,
      'x',
      {},
      { ...json, generated_at: 42 },
      { ...json, counts: { open: '980', resolved: 5693 } },
      { ...json, counts: null },
    ]) {
      expect(figuresFromLedgerJson(bad, true)).toBeNull();
    }
  });

  it('a response that says nothing of the batch threshold cannot word "withheld until"', () => {
    const { min_batches_for_skill: _m, ...rest } = json;
    expect(figuresFromLedgerJson(rest, true)?.fx?.minBatches).toBeNull();
  });
});
