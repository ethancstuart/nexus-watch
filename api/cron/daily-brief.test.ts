import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildFallbackText,
  FALLBACK_CAUSE,
  type FallbackCause,
  type FallbackPath,
  formatResolvedCallLines,
  spliceLedgerLine,
  type ResolvedCallRow,
  renderDossierEmail,
  type BriefData,
} from './daily-brief.js';
import { validateBriefStructure } from '../_lib/brief-structure.js';
import { type, typeStyleAttr } from '../../src/styles/email-tokens.js';

/**
 * The one fixture that must never break: the deterministic fallback is the
 * publish gate's safe harbor, so IT must satisfy the same structural contract
 * the gate enforces on the model. A fallback that fails its own gate's spec
 * means a refused draft has nowhere safe to fall.
 */

const base: BriefData = {
  date: '2026-08-23',
  utcTime: '10:00 UTC',
  topRiskCountries: [
    {
      name: 'Sudan',
      code: 'SD',
      score: 80, // structural level (post-split)
      deviation: 9, // live signal today — what movers rank by
      prevScore: 80,
      prevDeviation: 2,
      components: { conflict: 17, disasters: 3, governance: 8, marketExposure: 4 },
    },
    {
      name: 'Yemen',
      code: 'YE',
      score: 82,
      deviation: 1,
      prevScore: 82,
      prevDeviation: 1,
      components: { conflict: 15, disasters: 2, governance: 7, marketExposure: 3 },
    },
  ] as BriefData['topRiskCountries'],
  totalCountries: 85,
  earthquakeCount: 31,
  significantQuakes: ['M5.1 off Honshu'],
  diseaseCount: 4,
  recentOutbreaks: [],
  conflictHeadlines: [],
  markets: [{ symbol: 'Crude oil ETF (USO)', price: '78.12', change: '+0.8%' }] as BriefData['markets'],
  yesterdayEqCount: 28,
  weeklyTrends: [
    {
      name: 'Sudan',
      code: 'SD',
      scores: [{ date: '2026-08-17', score: 60 }],
      currentScore: 71,
      weekAgoScore: 60,
      direction: 'rising',
    },
  ] as BriefData['weeklyTrends'],
  correlations: [],
  newsHeadlines: [{ title: 'Ceasefire talks stall in Port Sudan', source: 'Reuters' }],
  resolvedCallLines: [],
  openCallLines: [
    'Iran (IR): 62% chance of a confirmed censorship event by 2026-09-05 — +18pts vs its base rate of 44%',
  ],
};

describe('buildFallbackText — the safe harbor honours the structure contract', () => {
  it('passes the daily structure gate with full data', () => {
    const r = validateBriefStructure(buildFallbackText(base), false);
    expect(r.missing).toEqual([]);
    expect(r.extra).toEqual([]);
    expect(r.pass).toBe(true);
  });

  it('passes the gate even with empty feeds and no open calls', () => {
    const empty: BriefData = {
      ...base,
      topRiskCountries: [],
      markets: [],
      newsHeadlines: [],
      weeklyTrends: [],
      resolvedCallLines: [],
      openCallLines: [],
    };
    const text = buildFallbackText(empty);
    expect(validateBriefStructure(text, false).pass).toBe(true);
    expect(text).toContain('No open calls today.');
  });

  it("leads Today's Call with the first (most divergent) open call, verbatim", () => {
    expect(buildFallbackText(base)).toContain(base.openCallLines[0]);
  });

  it('never attributes a driver — every mover line says so explicitly', () => {
    const text = buildFallbackText(base);
    expect(text).toContain("driver not identified in today's data.");
  });
});

/**
 * THE MECHANICAL EDITION MUST STATE THE REAL CAUSE.
 *
 * For nine days in November 2026 every fallback issue told subscribers "the
 * model draft was withheld by a publish gate" while the model API was
 * answering HTTP 400 (credit too low): no draft existed, so no gate had
 * withheld anything. The sentence is true only when a gate refused a draft.
 * The cause is passed as a typed argument from each call site, never
 * recovered by parsing the aiDebug string.
 */
describe('buildFallbackText — the wording names the real cause', () => {
  const FALSE_FOR_NO_DRAFT = ['withheld', 'publish gate', 'refused'];
  const INTERNALS = ['400', 'credit', 'Anthropic', 'Claude', 'HTTP', 'API key', 'aiDebug'];

  it('a refused draft says a publish gate withheld it', () => {
    const text = buildFallbackText(base, 'draft-refused');
    expect(text).toContain('the model draft was withheld by a publish gate, so today carries data without narrative.');
    expect(text).toContain('the model draft was withheld today');
    expect(text).not.toContain('no model draft was produced');
  });

  it('no draft says so, and never claims a gate withheld anything', () => {
    const text = buildFallbackText(base, 'no-draft');
    expect(text).toContain('no model draft was produced today, so today carries data without narrative.');
    expect(text).toContain('no model draft was produced today, so we give you the lead');
    for (const phrase of FALSE_FOR_NO_DRAFT) expect(text).not.toContain(phrase);
  });

  it('the no-draft wording also holds when the lead is a country, not a headline', () => {
    const text = buildFallbackText({ ...base, newsHeadlines: [] }, 'no-draft');
    expect(text).toContain('no model draft was produced today');
    for (const phrase of FALSE_FOR_NO_DRAFT) expect(text).not.toContain(phrase);
  });

  it('an unspecified cause defaults to no-draft, never to the gate wording', () => {
    expect(buildFallbackText(base)).toBe(buildFallbackText(base, 'no-draft'));
    expect(buildFallbackText(base)).not.toContain('publish gate');
  });

  it('exposes no internals to readers, whatever the cause', () => {
    for (const cause of ['draft-refused', 'no-draft'] as FallbackCause[]) {
      const text = buildFallbackText(base, cause);
      for (const word of INTERNALS) expect(text).not.toContain(word);
    }
  });

  it('both causes keep the same section spine and pass the structure gate', () => {
    for (const cause of ['draft-refused', 'no-draft'] as FallbackCause[]) {
      const r = validateBriefStructure(buildFallbackText(base, cause), false);
      expect(r.missing).toEqual([]);
      expect(r.extra).toEqual([]);
      expect(r.pass).toBe(true);
    }
  });

  it('the cause changes only the two sentences about the draft', () => {
    const a = buildFallbackText(base, 'draft-refused').split('\n');
    const b = buildFallbackText(base, 'no-draft').split('\n');
    expect(a.length).toBe(b.length);
    expect(a.filter((line, i) => line !== b[i]).length).toBe(2);
  });
});

describe('fallback call sites — every path to the fallback names its cause', () => {
  const EXPECTED: Record<FallbackPath, FallbackCause> = {
    'no-api-key': 'no-draft',
    'http-error': 'no-draft',
    exception: 'no-draft',
    'empty-response': 'no-draft',
    'grounding-refused': 'draft-refused',
    'structure-refused': 'draft-refused',
    'comparative-refused': 'draft-refused',
    'incomplete-reply': 'no-draft',
  };

  it('only the gate refusals map to the gate wording', () => {
    expect(FALLBACK_CAUSE).toEqual(EXPECTED);
  });

  /**
   * Every `buildFallbackText(` call in the handler source, with its argument
   * text read to the balanced closing paren (so an object literal or a ternary
   * argument is seen whole, not skipped), plus the source between the nearest
   * preceding `aiDebug =` and the call. Only the function's own definition is
   * excluded.
   */
  const readCallSites = () => {
    const src = readFileSync(join(process.cwd(), 'api/cron/daily-brief.ts'), 'utf8');
    const sites: { args: string; context: string }[] = [];
    for (const m of src.matchAll(/buildFallbackText\(/g)) {
      if (src.slice(Math.max(0, m.index - 16), m.index) === 'export function ') continue;
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < src.length && depth > 0; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') depth--;
      }
      const args = src.slice(m.index + m[0].length, i - 1);
      sites.push({ args, context: src.slice(src.lastIndexOf('aiDebug =', m.index), m.index) });
    }
    return sites;
  };

  // Placement: each path's call must follow the aiDebug label that path sets.
  // This reads the label string in the TEST only; the runtime never does.
  const SET_BY: Record<FallbackPath, string> = {
    'no-api-key': "aiDebug = 'no-api-key'",
    'http-error': 'aiDebug = `ai-failed:',
    exception: 'aiDebug = `ai-error:',
    'empty-response': "aiDebug = 'ai-empty-response'",
    'grounding-refused': 'aiDebug = `grounding-failed:',
    'structure-refused': 'aiDebug = `structure-failed:',
    'comparative-refused': 'aiDebug = comparativeClaimLabel(',
    'incomplete-reply': 'aiDebug = `${reply.label}:',
  };

  it('every buildFallbackText call in the handler passes exactly FALLBACK_CAUSE[<path>], once per path', () => {
    const sites = readCallSites();
    // The only accepted shape (a trailing comma, as prettier may add, is fine).
    // Anything else, including a spread, a literal cause or a ternary, fails.
    const paths = sites.map((x) => /^briefData,\s*FALLBACK_CAUSE\['([a-z-]+)'\],?$/.exec(x.args.trim())?.[1]);
    expect(paths.every((p) => p !== undefined)).toBe(true);
    expect([...paths].sort()).toEqual(Object.keys(FALLBACK_CAUSE).sort());
  });

  it('each path label sits on the branch that sets its own aiDebug label (swapped labels fail)', () => {
    for (const { args, context } of readCallSites()) {
      const path = /FALLBACK_CAUSE\['([a-z-]+)'\]/.exec(args)?.[1] as FallbackPath;
      expect(context.startsWith(SET_BY[path])).toBe(true);
    }
  });
});

describe('stop_reason — the handler reaches the model text only through readBriefReply', () => {
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const code = strip(readFileSync(join(process.cwd(), 'api/cron/daily-brief.ts'), 'utf8'));

  it('never calls extractBriefText itself, so text cannot be read past a stop_reason check', () => {
    expect(code).not.toMatch(/extractBriefText\(/);
    expect(code).toMatch(/readBriefReply\(/);
  });

  it('checks the reply after recording spend (a cut-off reply is still billed) and before any gate', () => {
    const spend = code.indexOf('recordAnthropicSpend(briefRequest');
    const read = code.indexOf('readBriefReply(');
    const grounding = code.indexOf('groundDraft(');
    const structure = code.indexOf('validateBriefStructure(briefText');
    expect(spend).toBeGreaterThan(-1);
    expect(read).toBeGreaterThan(spend);
    expect(grounding).toBeGreaterThan(read);
    expect(structure).toBeGreaterThan(read);
  });

  it('an incomplete reply is not a gate refusal: it never sets gateRefusal, and the alert says why', () => {
    const branch = /if \(!reply\.complete\) \{[\s\S]*?\n\s{10}\} else if/.exec(code)?.[0] ?? '';
    expect(branch).toContain("FALLBACK_CAUSE['incomplete-reply']");
    expect(branch).not.toContain('gateRefusal');
    expect(branch).toContain('stopNote = reply.operatorNote');
    expect(code).toMatch(/gateRefusal\s*\?[\s\S]*?:\s*\(?\s*stopNote\s*\?\?/);
  });
});

/**
 * THE EMAIL IDENTITY MUST ACTUALLY REACH THE PARSER.
 *
 * For 4.5 months every `style="..."` attribute that began with a font stack
 * was truncated at the first quote of `"Tiempos Headline"` / `"Inter"` /
 * `"JetBrains Mono"`, because the three renderers each built the attribute
 * with an UNESCAPED `style="${inline}"`. The parser saw `style="font-family:"`
 * and dropped the colour, size, weight and letter-spacing behind it. Nothing
 * failed: the HTML was still well-formed, just wearing none of the design.
 *
 * These assertions DERIVE over every attribute in a real render rather than
 * listing the ones we happen to know about, so a NEW call site that hardcodes
 * an unescaped attribute fails by default instead of passing by omission.
 */
describe('rendered brief — no style attribute is truncated by an embedded quote', () => {
  /**
   * Split a document into style attributes exactly the way an HTML parser
   * does: a double-quoted attribute value ends at the FIRST `"`. The tell for
   * a truncated attribute is therefore not that the value looks wrong — it is
   * that the character after the closing quote is not a legal attribute
   * boundary (whitespace, `/` or `>`).
   */
  function styleAttrs(html: string): { value: string; nextChar: string; truncated: boolean }[] {
    const needle = 'style="';
    const out: { value: string; nextChar: string; truncated: boolean }[] = [];
    let i = html.indexOf(needle);
    while (i !== -1) {
      const start = i + needle.length;
      const end = html.indexOf('"', start);
      if (end === -1) break;
      const nextChar = html.slice(end + 1, end + 2);
      out.push({
        value: html.slice(start, end),
        nextChar,
        truncated: !(nextChar === '' || /[\s/>]/.test(nextChar)),
      });
      i = html.indexOf(needle, end + 1);
    }
    return out;
  }

  const rendered = renderDossierEmail({
    briefText: buildFallbackText(base),
    date: base.date,
    time: base.utcTime,
    markets: base.markets,
  });

  for (const surface of ['emailHtml', 'beehiivHtml'] as const) {
    it(`${surface}: every style attribute value is free of raw double quotes`, () => {
      const attrs = styleAttrs(rendered[surface]);
      // Guard the guard: if the extractor finds nothing, it is broken, and a
      // vacuous pass would be indistinguishable from a real one.
      expect(attrs.length).toBeGreaterThan(20);

      const truncated = attrs.filter((a) => a.truncated);
      expect(truncated.map((a) => `${JSON.stringify(a.value)} → next char ${JSON.stringify(a.nextChar)}`)).toEqual([]);

      for (const a of attrs) expect(a.value).not.toContain('"');
    });
  }

  it('emailHtml: the masthead keeps its whole declaration list, not just font-family', () => {
    // The positive half. A style attribute that survives the scan above could
    // still be empty; this asserts the identity is actually present.
    const attrs = styleAttrs(rendered.emailHtml).map((a) => a.value);
    const masthead = attrs.find((v) => v.includes('Tiempos Headline') && v.includes('28px'));
    expect(masthead, 'no masthead style attribute carrying the serif stack at 28px').toBeDefined();
    expect(masthead).toContain('font-weight:700');
    expect(masthead).toContain('color:');
  });

  it('no style attribute anywhere ends mid-declaration on a dangling colon', () => {
    for (const surface of ['emailHtml', 'beehiivHtml'] as const) {
      for (const a of styleAttrs(rendered[surface])) {
        expect(a.value, `${surface} has a declaration cut off at its colon`).not.toMatch(/:\s*$/);
      }
    }
  });
});

/**
 * The other renderer (api/subscribe.ts — the
 * WELCOME email) are request handlers and cannot be rendered without a live
 * request, DB and Resend key. They are covered structurally instead: all three
 * files now build their attributes through the one shared helper, so asserting
 * the helper is correct for EVERY typography token covers them by construction.
 * A new token whose font stack contains a quote is covered automatically.
 */
describe('typeStyleAttr — the one shared helper is safe for every token', () => {
  for (const [name, token] of Object.entries(type)) {
    it(`${name} produces a well-formed, non-truncated style attribute`, () => {
      const attr = typeStyleAttr(token, { color: '#12161C' });
      expect(attr.startsWith('style="')).toBe(true);
      expect(attr.endsWith('"')).toBe(true);
      // The value is everything between the delimiters; it must contain no
      // raw quote of its own, or the attribute ends early.
      const value = attr.slice('style="'.length, -1);
      expect(value).not.toContain('"');
      // And the declaration list must have survived past the font family.
      expect(value).toContain('font-size:');
      expect(value).toContain('color:#12161C');
    });
  }
});

describe('resolution day is first-class', () => {
  /**
   * All of this exists because of 2026-09-05: 39 calls settled for the first
   * time and the brief led with an unrelated FX call, because the model's
   * context selected only status='pending' and the fallback read only
   * openCallLines. These tests pin the repaired behaviour on both paths.
   */
  const resolvedDay: BriefData = {
    ...base,
    resolvedCallLines: [
      '34 calls settled against external ground truth: 10 hit, 24 miss. 5 due calls remain pending under the coverage-grace rule (thin evidence, never scored as a miss).',
      'Kazakhstan (KZ): HIT — we said 16% (base rate 10%) for a confirmed censorship event by 2026-09-05 — OONI confirmed blocking on 2 days in the window',
    ],
  };

  it('the fallback leads with the record, then the open call', () => {
    const text = buildFallbackText(resolvedDay);
    const agg = text.indexOf('34 calls settled');
    const detail = text.indexOf('Kazakhstan (KZ): HIT');
    const open = text.indexOf(base.openCallLines[0]);
    expect(agg).toBeGreaterThan(-1);
    expect(detail).toBeGreaterThan(agg);
    expect(open).toBeGreaterThan(detail);
    // And it still satisfies the gate that would otherwise refuse it.
    expect(validateBriefStructure(text, false).pass).toBe(true);
  });

  it('with no resolutions the fallback is byte-identical to before', () => {
    expect(buildFallbackText(base)).not.toContain('settled against external ground truth');
  });
});

describe('formatResolvedCallLines', () => {
  const row = (over: Partial<ResolvedCallRow>): ResolvedCallRow => ({
    kind: 'censorship_event',
    country_code: 'KZ',
    probability: 0.16,
    base_rate: 0.1,
    status: 'hit',
    resolves_on: '2026-09-05',
    evidence_count: 2,
    ...over,
  });

  it('leads with the aggregate, orders detail by divergence', () => {
    const lines = formatResolvedCallLines(
      [
        row({ country_code: 'TR', probability: 0.84, base_rate: 0.9 }), // div .06
        row({ country_code: 'KZ', probability: 0.16, base_rate: 0.1 }), // div .06
        row({ country_code: 'UZ', probability: 0.52, base_rate: 0.7, status: 'miss', evidence_count: 0 }), // div .18 — first
      ],
      0,
      undefined,
      { total: 3, hits: 2 },
    );
    expect(lines[0]).toContain('3 calls settled');
    expect(lines[0]).toContain('2 hit, 1 miss');
    expect(lines[1]).toContain('UZ');
    expect(lines[1]).toContain('MISS');
  });

  it('the aggregate comes from totals, NEVER from the page of rows', () => {
    // rows is a divergence-ordered PAGE. A 105-resolution morning fetches 40
    // rows; publishing rows.length as the count is the by_kind page-size
    // defect (2026-08-30) reborn. Caught by the rule-2 review.
    const page = Array.from({ length: 40 }, (_, i) => row({ country_code: `C${i}`, probability: 0.5, base_rate: 0.4 }));
    const lines = formatResolvedCallLines(page, 0, undefined, { total: 105, hits: 18 });
    expect(lines[0]).toContain('105 calls settled');
    expect(lines[0]).toContain('18 hit, 87 miss');
    expect(lines.at(-1)).toContain('and 93 more'); // 105 - 12 shown
  });

  it('caps the detail list and says so', () => {
    const many = Array.from({ length: 30 }, (_, i) => row({ country_code: `C${i}`, probability: 0.5, base_rate: 0.4 }));
    const lines = formatResolvedCallLines(many, 0, undefined, { total: 30, hits: 30 });
    expect(lines.length).toBe(1 + 12 + 1);
    expect(lines.at(-1)).toContain('and 18 more');
  });

  it('an unknown kind is NEVER described as a censorship event', () => {
    // The first version's else-branch phrased any non-FX kind as "a confirmed
    // censorship event" — a false public claim for a future kind, by
    // omission. Unknown kinds get wording true of every call by construction.
    const lines = formatResolvedCallLines([row({ kind: 'sanctions_designation', country_code: 'RU' })], 0, undefined, {
      total: 1,
      hits: 1,
    });
    expect(lines[1]).not.toContain('censorship');
    expect(lines[1]).toContain('declared external source');
  });

  it('speaks when calls are due but NONE resolved — the silent-resolver case', () => {
    const lines = formatResolvedCallLines([], 5, undefined, { total: 0, hits: 0 });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('5 calls came due and none has resolved yet');
    // CHANGED WITH ARGUMENT: this used to assert 'coverage-grace' — the exact
    // wording that mis-attributed 63 FX resolver failures to a censorship
    // coverage rule in the 2026-09-06 Sunday edition. The line now states
    // only what is true of every pending row: held, never auto-missed,
    // reason on the ledger.
    expect(lines[0]).toContain('never scored as a miss by default');
    expect(lines[0]).not.toContain('coverage-grace');
  });

  it('is empty when there is genuinely nothing to say', () => {
    expect(formatResolvedCallLines([], 0, undefined, { total: 0, hits: 0 })).toEqual([]);
  });

  it('phrases FX and censorship claims differently, and only censorship hits carry evidence days', () => {
    const lines = formatResolvedCallLines(
      [
        row({ kind: 'fx_devaluation', country_code: 'SE', status: 'miss', evidence_count: null }),
        row({ country_code: 'IN', probability: 0.84, base_rate: 0.9, evidence_count: 14 }),
      ],
      0,
      undefined,
      { total: 2, hits: 1 },
    );
    const fx = lines.find((l) => l.includes('SE'))!;
    const oo = lines.find((l) => l.includes('IN'))!;
    expect(fx).toContain('currency depreciation');
    expect(fx).not.toContain('OONI');
    expect(oo).toContain('OONI confirmed blocking on 14 days');
  });
});

describe('spliceLedgerLine', () => {
  /**
   * The old splice put "> **The Ledger**" at line 0. No renderer handles ">",
   * and parseSections turns any preamble into a titleless pseudo-section — so
   * the first resolution day shipped mis-rendered on all three surfaces.
   */
  const body = "## 🎯 Today's Call\n\nA call.\n\n## 📊 Top Signal\n\nSignal.";

  it('splices INSIDE the first section, never as a preamble', () => {
    const out = spliceLedgerLine(body, '34 resolved today, 10 hit');
    expect(out.startsWith('## ')).toBe(true); // nothing before the first header
    const lines = out.split('\n');
    expect(lines[0]).toBe("## 🎯 Today's Call");
    expect(lines[2]).toBe('**The Ledger** — 34 resolved today, 10 hit');
  });

  it('emits no blockquote — the character no renderer parses', () => {
    expect(spliceLedgerLine(body, 'x')).not.toContain('\n> ');
  });

  it('still satisfies the structure gate', () => {
    const full = buildFallbackText(base);
    expect(validateBriefStructure(spliceLedgerLine(full, '1 open'), false).pass).toBe(true);
  });

  it('appends rather than losing the line when no header exists', () => {
    expect(spliceLedgerLine('plain text', 'the line')).toContain('**The Ledger** — the line');
  });
});

/**
 * THE EMAIL DECLARES ITSELF LIGHT, AND CARRIES NO DARK RULES.
 *
 * It used to declare `light dark` and ship a `prefers-color-scheme: dark` block
 * whose selectors matched five classes present on ZERO elements. A phone in
 * dark mode honoured the declaration, turned every background near-black, and
 * left all 42 text elements at their inline graphite — black on black,
 * reported by the owner 2026-09-12. Light is the identity; declaring anything
 * else is a promise the markup cannot keep.
 */
describe('rendered brief — the email is light-only and says so', () => {
  const rendered = renderDossierEmail({
    briefText: buildFallbackText(base),
    date: base.date,
    time: base.utcTime,
    markets: base.markets,
  });

  it('declares color-scheme light, and only light', () => {
    expect(rendered.emailHtml).toContain('<meta name="color-scheme" content="light">');
    expect(rendered.emailHtml).toContain('<meta name="supported-color-schemes" content="light">');
    expect(rendered.emailHtml).not.toMatch(/content="light dark"/);
  });

  it('ships no dark-mode stylesheet at all', () => {
    expect(rendered.emailHtml).not.toContain('prefers-color-scheme');
    expect(rendered.emailHtml).not.toContain('#0E1116');
  });

  it('still paints the ivory ground explicitly, so no client has to guess', () => {
    expect(rendered.emailHtml).toMatch(/<body[^>]*background:#FAF8F3/i);
  });
});
