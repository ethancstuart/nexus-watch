import { describe, it, expect } from 'vitest';
import {
  buildFallbackText,
  causeLineFor,
  renderDossierEmail,
  spliceLedgerLine,
  archivedData,
  MECHANICAL_EDITION_LINE,
  DRY_RUN_CLAUSE,
  type BriefData,
  type FallbackCause,
} from './daily-brief.js';
import {
  CORRECTIONS_LINE,
  NO_CALL_READ,
  NO_CALL_TO_EXPLAIN,
  NONE_OPEN,
  NONE_RESOLVED,
  OPEN_LIST_CAP,
  OPEN_UNREAD,
  RECORD_SECTIONS,
  RESOLVED_LIST_CAP,
  RESOLVED_UNREAD,
  UNREAD_RECORD,
  chooseExplainedCall,
  explainCall,
  resolvedLine,
  WHY_NO_BASE,
  type BriefRecord,
  type RecordCall,
} from '../_lib/brief-record.js';
import { recordCall, recordDay } from '../_lib/brief-record-fixture.js';
import { DAILY_SECTIONS, SUNDAY_SECTIONS } from '../_lib/brief-structure.js';
import { markdownToHtml } from '../_lib/markdown.js';
import { checkComparativeClaims } from '../_lib/comparative-claims.js';
import { renderBriefBody, renderInline } from '../../src/utils/briefRenderer.js';

/**
 * THE MECHANICAL EDITION IS THE RECORD (plan R1, DISCOVERY.md §5: "The daily
 * email narrows to the record: what resolved, what is open, one call explained.
 * The off-mission wire headline and the duplicated market block go.").
 *
 * Every day ships the mechanical edition while production has no model key, so
 * this is what every subscriber reads. These tests pin, on every rendering
 * (email HTML, plain text, the embeddable summary, the server-rendered brief
 * page and the SPA's renderer): the section order, the absence of every wire,
 * market and index line, the links, the rule that picks the one explained call,
 * the unread cases, escaping, and that the plain text says what the HTML says.
 * Synthetic rows only (api/_lib/brief-record-fixture.ts).
 */

const DATE = '2026-11-27';
const LEDGER =
  '14 resolved today, 6 hit · FX Brier 0.220 over 5180, -3% vs base rate · 789 open, next resolves 2026-11-28';

/** A full BriefData: every input the old edition printed is present, so its absence is a real test. */
function data(record: BriefRecord | undefined = recordDay()): BriefData {
  return {
    date: DATE,
    utcTime: '10:00 UTC',
    topRiskCountries: [
      {
        name: 'Yemen',
        code: 'YE',
        score: 82,
        deviation: 9,
        prevScore: 82,
        prevDeviation: 2,
        components: { conflict: 15, disasters: 2, governance: 7, marketExposure: 3 },
      },
    ],
    totalCountries: 86,
    earthquakeCount: 31,
    significantQuakes: ['M5.9 off Honshu'],
    diseaseCount: 2,
    recentOutbreaks: ['Marburg virus disease, QZX'],
    conflictHeadlines: ['QZXCONFLICTHEADLINE ceasefire talks'],
    markets: [
      { symbol: 'S&P 500 ETF (SPY)', price: '$601.20', change: '+0.41%', direction: 'up' },
      { symbol: 'Crude oil ETF (USO)', price: '$72.10', change: '-1.20%', direction: 'down' },
    ],
    yesterdayEqCount: 28,
    weeklyTrends: [
      {
        name: 'Yemen',
        code: 'YE',
        scores: [{ date: '2026-11-20', score: 3 }],
        currentScore: 9,
        weekAgoScore: 3,
        direction: 'rising',
      },
    ],
    correlations: ['PROXIMITY ALERT: QZX'],
    newsHeadlines: [{ title: 'QZXWIREHEADLINE How maps lay bare the bases', source: 'Bellingcat' }],
    openCallLines: ['UG (UG): 38% chance the currency depreciates ≥3% peak-vs-issue by 2026-12-05 — +13pts'],
    resolvedCallLines: ['14 calls settled today against external ground truth: 6 hit, 8 miss.'],
    openCallsRead: true,
    resolvedCallsRead: true,
    record,
  } as BriefData;
}

const edition = (record?: BriefRecord, cause: FallbackCause = 'no-draft') =>
  spliceLedgerLine(buildFallbackText(data(record), cause), LEDGER);

const render = (text: string, extra: Partial<Parameters<typeof renderDossierEmail>[0]> = {}) =>
  renderDossierEmail({
    briefText: text,
    date: DATE,
    time: '10:00 UTC',
    markets: data().markets,
    edition: 'mechanical',
    ...extra,
  });

/** Visible text of an HTML fragment: tags dropped, the entities these renderers emit decoded. */
function visible(html: string): string {
  return html
    .replace(/<\/?(?:a|strong|em)\b[^>]*>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Every rendering of one edition, by name. */
function renderings(text: string): Record<string, string> {
  const out = render(text);
  return {
    markdown: text,
    'email HTML': out.emailHtml,
    'embeddable summary': out.beehiivHtml,
    'plain text': out.plainText,
    'brief page (server)': markdownToHtml(text),
    'brief page (SPA)': renderBriefBody(text, { dateForImage: DATE, links: true }),
  };
}

const day = recordDay();
/** The rule's own order, worked independently: exact thousandths, then the lower id. */
const thousandthsGap = (c: RecordCall) =>
  Math.abs(Math.round(c.probability * 1000) - Math.round((c.base_rate ?? c.probability) * 1000));
const shownResolved = [...(day.resolved as Extract<BriefRecord['resolved'], { read: true }>).calls]
  .sort((a, b) => thousandthsGap(b) - thousandthsGap(a) || a.id - b.id)
  .slice(0, RESOLVED_LIST_CAP);
const nextOpen = (day.open as Extract<BriefRecord['open'], { read: true }>).next;

// ---------------------------------------------------------------------------

describe('section order', () => {
  const text = edition();

  it('the edition is exactly the four record sections, in order, and nothing of the old spine', () => {
    const headers = [...text.matchAll(/^## .+$/gm)].map((m) => m[0]);
    expect(headers).toEqual([...RECORD_SECTIONS]);
    for (const h of [...DAILY_SECTIONS, ...SUNDAY_SECTIONS]) expect(text).not.toContain(h);
  });

  it('nothing precedes the first section, and the Ledger line opens it', () => {
    const lines = text.split('\n');
    expect(lines[0]).toBe(RECORD_SECTIONS[0]);
    expect(lines[1]).toBe('');
    expect(lines[2]).toBe(`**The Ledger** — ${LEDGER}`);
  });

  /** The six parts, in the order the plan gives them. Each marker is unique to its part. */
  const parts = [
    'The Ledger',
    '14 calls settled today against external ground truth: 6 hit, 8 miss.',
    '789 calls are open.',
    'Why this call:',
    'Corrections to earlier editions of this brief',
    'This is the mechanical edition: no model draft was produced today, so today carries data without narrative.',
  ];

  for (const [name, out] of Object.entries(renderings(text))) {
    it(`${name}: Ledger line, what resolved, what is open, one call explained, corrections, cause`, () => {
      const body = name === 'plain text' || name === 'markdown' ? out : visible(out);
      const at = parts.map((p) => body.indexOf(p));
      for (const [i, a] of at.entries()) expect(a, parts[i]).toBeGreaterThan(-1);
      expect([...at].sort((x, y) => x - y)).toEqual(at);
    });
  }

  it('the email names the mechanical edition in its masthead, before the first section', () => {
    const { emailHtml } = render(text);
    expect(emailHtml.indexOf(MECHANICAL_EDITION_LINE)).toBeGreaterThan(-1);
    expect(emailHtml.indexOf(MECHANICAL_EDITION_LINE)).toBeLessThan(emailHtml.indexOf('What resolved today'));
  });
});

describe('no wire, market or index content remains', () => {
  // Every one of these was printed by the edition before R1, or by its renderer.
  const FORBIDDEN = [
    'QZXWIREHEADLINE',
    'Bellingcat',
    'as the wire carried it',
    'QZXCONFLICTHEADLINE',
    'conflict headline feed',
    'Top Signal',
    'The Board',
    'Long Fuse',
    'Movers',
    'Crises',
    'Market Pulse',
    'Markets',
    'Market data unavailable',
    'S&P 500 ETF',
    'SPY',
    '$601.20',
    '+0.41%',
    'Crude oil',
    'Yemen',
    'CII',
    'driver not identified',
    'What would change our mind',
    'peak-vs-issue',
    'Watchlist',
    'WATCHLIST',
    'Map of the Day',
  ];

  for (const cause of ['no-draft', 'draft-refused', 'dry-run'] as FallbackCause[]) {
    for (const [name, out] of Object.entries(renderings(edition(recordDay(), cause)))) {
      it(`${cause} / ${name}`, () => {
        for (const word of FORBIDDEN) expect(out, word).not.toContain(word);
      });
    }
  }

  it('even with a reader’s interests, no watchlist module is appended to a mechanical email', () => {
    const personal = {
      interests: { regions: ['middle-east'], threats: ['conflict'] } as never,
      watchlistCountries: [
        { code: 'YE', name: 'Yemen', score: 82, regionIds: ['middle-east' as const], topThreat: 'conflict' as const },
      ],
    };
    // Guard: the same reader on a model day does get the module, so its absence below is real.
    expect(render(edition(), { ...personal, edition: 'model' }).emailHtml).toContain('YOUR WATCHLIST');
    const out = render(edition(), personal);
    expect(out.emailHtml).not.toContain('Yemen');
    expect(out.emailHtml).not.toContain('YOUR WATCHLIST');
  });

  it('the archived JSON of a mechanical day carries the record and none of the inputs it no longer prints', () => {
    const archived = archivedData(data(), true);
    expect(Object.keys(archived)).toEqual(['date', 'utcTime', 'record']);
    const json = JSON.stringify(archived);
    for (const word of ['QZXWIREHEADLINE', 'Bellingcat', 'S&P 500', 'Yemen', 'peak-vs-issue']) {
      expect(json).not.toContain(word);
    }
  });

  it('a model day archives exactly what it did before: every input, and no record', () => {
    const d = data();
    const archived = archivedData(d, false) as Record<string, unknown>;
    const before = { ...d } as Record<string, unknown>;
    delete before.record;
    expect(archived).toEqual(before);
    expect(Object.keys(archived)).toEqual(Object.keys(before));
    expect(archived).not.toHaveProperty('record');
  });
});

describe('links', () => {
  const text = edition();
  const out = render(text);

  it('each resolved call shown is one line linked to its own call page', () => {
    for (const c of shownResolved) {
      const line = text
        .split('\n')
        .find((l) => l.startsWith(`- ${c.name} (${c.country_code}): `) && l.includes(`#${c.id}`));
      expect(line, `call ${c.id}`).toBeDefined();
      expect(line).toContain(`[Call #${c.id}](https://nexuswatch.dev/call/${c.id})`);
      expect(out.emailHtml).toContain(`<a href="https://nexuswatch.dev/call/${c.id}"`);
    }
    // Capped, then the rest counted and pointed at the ledger.
    expect(text.split('\n').filter((l) => l.startsWith('- ') && l.includes(' — we said '))).toHaveLength(
      RESOLVED_LIST_CAP,
    );
    expect(text).toContain(
      `…and ${14 - RESOLVED_LIST_CAP} more. [The ledger](https://nexuswatch.dev/ledger) lists the latest resolutions.`,
    );
  });

  it('each of the next open calls is linked, and the ledger after them', () => {
    expect(text).toContain('Next to resolve:');
    for (const c of nextOpen) {
      expect(text).toContain(`[Call #${c.id}](https://nexuswatch.dev/call/${c.id})`);
      expect(out.emailHtml).toContain(`<a href="https://nexuswatch.dev/call/${c.id}"`);
    }
    expect(text.split('\n').filter((l) => l.startsWith('- ') && l.includes(': we say '))).toHaveLength(OPEN_LIST_CAP);
    expect(text).toContain('More open calls are on [the ledger](https://nexuswatch.dev/ledger).');
  });

  it('the explained call links its own page', () => {
    const pick = chooseExplainedCall(day).call!;
    expect(text).toContain(`[Read call #${pick.id}](https://nexuswatch.dev/call/${pick.id})`);
  });

  it('the corrections line links /corrections, and appears only while that page is published', () => {
    expect(CORRECTIONS_LINE).toBe(
      'Corrections to earlier editions of this brief are listed on [the corrections page](https://nexuswatch.dev/corrections).',
    );
    expect(text).toContain(CORRECTIONS_LINE);
    expect(out.emailHtml).toContain('<a href="https://nexuswatch.dev/corrections"');
    // /corrections answers 404 until an approved note exists: no dead link then.
    const unpublished = edition({ ...recordDay(), correctionsPage: false });
    expect(unpublished).not.toContain('corrections');
  });

  it('every link in the edition goes to a page on nexuswatch.dev, and every one renders', () => {
    for (const html of [
      out.beehiivHtml,
      markdownToHtml(text),
      renderBriefBody(text, { dateForImage: DATE, links: true }),
    ]) {
      const hrefs = [...html.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThanOrEqual(RESOLVED_LIST_CAP + OPEN_LIST_CAP + 3);
      for (const h of hrefs) expect(h).toMatch(/^https:\/\/nexuswatch\.dev\//);
      // No Markdown link syntax is left over as text.
      expect(visible(html)).not.toMatch(/\]\(https?:/);
    }
  });

  it('a link to any other host is never rendered as one, in the email or the SPA (review finding 4)', () => {
    const foreign =
      '[x](https://evil.example/a) [y](https://nexuswatch.dev.evil.example/b) [z](http://nexuswatch.dev/c)';
    const out = renderDossierEmail({
      briefText: `## 🏁 What resolved today\n\n${foreign}`,
      date: '2026-11-27',
      time: '10:00 UTC',
      markets: [],
      edition: 'mechanical',
    });
    for (const html of [out.emailHtml, out.beehiivHtml, renderInline(foreign, true)]) {
      expect(html).not.toContain('href="https://evil.example');
      expect(html).not.toContain('href="https://nexuswatch.dev.evil');
      expect(html).not.toContain('href="http://');
    }
    // And our own site still is, so the check above is not vacuous.
    expect(renderInline('[ok](https://nexuswatch.dev/ledger)', true)).toBe(
      '<a href="https://nexuswatch.dev/ledger">ok</a>',
    );
  });

  it('plain text gives each link as "label (address)"', () => {
    const c = shownResolved[0];
    expect(out.plainText).toContain(`Call #${c.id} (https://nexuswatch.dev/call/${c.id})`);
    expect(out.plainText).toContain('the corrections page (https://nexuswatch.dev/corrections)');
    expect(out.plainText).not.toContain('](');
    expect(out.plainText).not.toContain('[Call');
  });

  it('a model edition renders exactly as before: an own-site link a model wrote is not turned into one', () => {
    const modelText = "## 🎯 Today's Call\n\nSee [call 1](https://nexuswatch.dev/call/1).\n";
    for (const e of ['model', undefined] as const) {
      const m = renderDossierEmail({ briefText: modelText, date: DATE, time: '10:00 UTC', markets: [], edition: e });
      expect(m.emailHtml).not.toContain('<a href="https://nexuswatch.dev/call/1"');
      expect(m.emailHtml).toContain('[call 1](https://nexuswatch.dev/call/1)');
      expect(m.plainText).toContain('[call 1](https://nexuswatch.dev/call/1)');
    }
    expect(renderBriefBody(modelText, { dateForImage: DATE })).toContain('[call 1](https://nexuswatch.dev/call/1)');
  });
});

describe('the one-call rule is deterministic', () => {
  const read = (calls: RecordCall[], total = calls.length): BriefRecord['resolved'] => ({
    read: true,
    total,
    hits: calls.filter((c) => c.status === 'hit').length,
    corrections: [],
    calls,
  });
  const openBook = (next: RecordCall[], total = 789): BriefRecord['open'] => ({ read: true, total, held: 0, next });

  it('picks the resolution furthest from its base rate, whatever order the rows arrive in', () => {
    const calls = [
      recordCall({ id: 3, probability: 0.3, base_rate: 0.25 }),
      recordCall({ id: 2, probability: 0.16, base_rate: 0.1 }),
      recordCall({ id: 1, probability: 0.84, base_rate: 0.9 }),
      recordCall({ id: 4, probability: 0.52, base_rate: 0.7 }), // gap .18: the pick
    ];
    for (let k = 0; k < calls.length; k++) {
      const rotated = [...calls.slice(k), ...calls.slice(0, k)];
      const e = chooseExplainedCall({ resolved: read(rotated), open: openBook([]), correctionsPage: true });
      expect(e.why).toBe('resolved');
      expect(e.call?.id).toBe(4);
    }
    expect(
      chooseExplainedCall({ resolved: read([...calls].reverse()), open: openBook([]), correctionsPage: true }).call?.id,
    ).toBe(4);
  });

  it('a decimal tie goes to the lower id, though floating point would split it (review finding 5)', () => {
    // 0.300 − 0.100 and 0.500 − 0.300 are both 0.2; in floating point the first is smaller.
    expect(0.3 - 0.1).toBeLessThan(0.5 - 0.3);
    const calls = [
      recordCall({ id: 2, probability: 0.5, base_rate: 0.3 }),
      recordCall({ id: 1, probability: 0.3, base_rate: 0.1 }),
    ];
    for (const order of [calls, [...calls].reverse()]) {
      expect(chooseExplainedCall({ resolved: read(order), open: openBook([]), correctionsPage: true }).call?.id).toBe(
        1,
      );
      const text = edition({ resolved: read(order), open: openBook([]), correctionsPage: true });
      expect(text.indexOf('[Call #1]')).toBeLessThan(text.indexOf('[Call #2]'));
    }
  });

  it('a call with no stored base rate ranks after every call that has one (finding 6)', () => {
    const calls = [
      recordCall({ id: 1, probability: 0.9, base_rate: null }),
      recordCall({ id: 2, probability: 0.26, base_rate: 0.25 }),
    ];
    expect(chooseExplainedCall({ resolved: read(calls), open: openBook([]), correctionsPage: true }).call?.id).toBe(2);
    const next = [
      recordCall({ id: 5, status: 'pending', resolves_on: '2026-11-28', base_rate: null }),
      recordCall({ id: 6, status: 'pending', resolves_on: '2026-11-28', probability: 0.25, base_rate: 0.25 }),
    ];
    expect(chooseExplainedCall({ resolved: read([]), open: openBook(next), correctionsPage: true }).call?.id).toBe(6);
  });

  it('a tie goes to the lower call id', () => {
    const calls = [recordCall({ id: 9, probability: 0.31 }), recordCall({ id: 7, probability: 0.31 })];
    for (const order of [calls, [...calls].reverse()]) {
      expect(chooseExplainedCall({ resolved: read(order), open: openBook([]), correctionsPage: true }).call?.id).toBe(
        7,
      );
    }
  });

  it('no resolutions: the next open call to resolve (earliest date, then furthest from base, then lower id)', () => {
    const next = [
      recordCall({ id: 12, status: 'pending', resolves_on: '2026-11-29', probability: 0.4 }),
      recordCall({ id: 11, status: 'pending', resolves_on: '2026-11-28', probability: 0.3 }),
      recordCall({ id: 10, status: 'pending', resolves_on: '2026-11-28', probability: 0.3 }),
      recordCall({ id: 13, status: 'pending', resolves_on: '2026-11-28', probability: 0.26 }),
    ];
    for (const order of [next, [...next].reverse()]) {
      const e = chooseExplainedCall({ resolved: read([]), open: openBook(order), correctionsPage: true });
      expect(e).toMatchObject({ why: 'next-none-resolved', call: { id: 10 } });
    }
    const text = edition({ resolved: read([]), open: openBook(next), correctionsPage: true });
    expect(text).toContain(NONE_RESOLVED);
    expect(text).toContain('Why this call: no call resolved today.');
    expect(text).toContain('The status: open. It resolves on 2026-11-28, and is not scored until then.');
    expect(text).toContain('What we say: 30%.');
  });

  it('resolutions unread: the same pick from the open book, saying the resolutions could not be read', () => {
    const next = [recordCall({ id: 21, status: 'pending', resolves_on: '2026-11-28' })];
    const resolved = { read: false } as const;
    const e = chooseExplainedCall({ resolved, open: openBook(next), correctionsPage: true });
    expect(e).toMatchObject({ why: 'next-resolved-unread', call: { id: 21 } });
    const text = edition({ resolved, open: openBook(next), correctionsPage: true });
    expect(text).toContain("Why this call: today's resolutions could not be read.");
    expect(text).not.toContain('no call resolved today');
    // A pending call is open in every path: never an outcome (review finding 3).
    expect(text).toContain('The status: open. It resolves on 2026-11-28, and is not scored until then.');
    expect(text).toContain('What we say: ');
    expect(text).not.toContain('The outcome:');
  });

  it('resolutions counted but not listed (a count above 0, an empty page): it says they could not be listed', () => {
    const next = [recordCall({ id: 21, status: 'pending', resolves_on: '2026-11-28' })];
    const r = { resolved: read([], 66), open: openBook(next), correctionsPage: true };
    expect(chooseExplainedCall(r)).toMatchObject({ why: 'next-resolved-unlisted', call: { id: 21 } });
    const text = edition(r);
    expect(text).toContain('66 calls settled today against external ground truth');
    expect(text).toContain("Why this call: today's resolutions could not be listed.");
    expect(text).not.toContain('could not be read');
    expect(text).not.toContain('The outcome:');
  });

  it('a pending call never prints an outcome, whatever path chose it (review finding 3)', () => {
    const pending = recordCall({ id: 31, status: 'pending', resolves_on: '2026-11-28' });
    for (const why of ['resolved', 'next-none-resolved', 'next-resolved-unread', 'next-resolved-unlisted'] as const) {
      const text = explainCall({ call: pending, why }).join('\n');
      expect(text, why).toContain('The status: open. It resolves on 2026-11-28, and is not scored until then.');
      expect(text, why).toContain('What we say: 37%.');
      expect(text, why).not.toMatch(/The outcome:|\bMISS\b|\bHIT\b/);
    }
  });

  it('no resolutions and no open calls: none, and it says so', () => {
    const r = { resolved: read([]), open: openBook([], 0), correctionsPage: true };
    expect(chooseExplainedCall(r)).toEqual({ call: null, why: 'none' });
    const text = edition(r);
    expect(text).toContain(NO_CALL_TO_EXPLAIN);
    expect(text).toContain(NONE_RESOLVED);
    expect(text).toContain(NONE_OPEN);
  });

  it('every open call held past its date and none resolved: none (no call is due after today)', () => {
    const r = {
      resolved: read([]),
      open: { read: true as const, total: 16, held: 16, next: [] },
      correctionsPage: true,
    };
    expect(chooseExplainedCall(r).why).toBe('none');
    const text = edition(r);
    expect(text).toContain(
      '16 calls are open. 16 due calls remain unresolved — held, never scored as a miss by default.',
    );
    expect(text).not.toContain(NONE_OPEN);
    expect(text).toContain('[The ledger](https://nexuswatch.dev/ledger) lists open calls.');
  });

  it('nothing to pick and a read failed: it never says there is nothing', () => {
    for (const r of [
      UNREAD_RECORD,
      { resolved: read([]), open: { read: false as const }, correctionsPage: true },
      { resolved: { read: false as const }, open: openBook([], 0), correctionsPage: true },
    ]) {
      expect(chooseExplainedCall(r)).toEqual({ call: null, why: 'unread' });
      const text = edition(r);
      expect(text).toContain(NO_CALL_READ);
      expect(text).not.toContain(NO_CALL_TO_EXPLAIN);
    }
    expect(chooseExplainedCall(undefined)).toEqual({ call: null, why: 'unread' });
  });

  it('the explanation is the call’s own fields: claim, threshold, probability, base rate, outcome', () => {
    const c = recordCall({
      id: 6049,
      country_code: 'AZ',
      name: 'Azerbaijan',
      probability: 0.31,
      base_rate: 0.25,
      claim: 'AZN depreciates 0.42% or more against USD at any point within 14 days, from 1.70000.',
      threshold_pct: 0.415,
      status: 'hit',
      made_on: '2026-11-13',
    });
    const text = edition({ resolved: read([c]), open: openBook([]), correctionsPage: true });
    const section = text.slice(text.indexOf(RECORD_SECTIONS[2]), text.indexOf(RECORD_SECTIONS[3]));
    expect(section).toContain('**Azerbaijan (AZ), call #6049.**');
    expect(section).toContain(
      'The claim, frozen when the call was made on 2026-11-13: “AZN depreciates 0.42% or more against USD at any point within 14 days, from 1.70000.”',
    );
    expect(section).toContain(
      'The threshold: a depreciation of 0.415% or more against USD within the window. What we said: 31%. ' +
        'How often it happens anyway, its base rate at issue: 25%. We sat 6 points above it.',
    );
    expect(section).toContain('The outcome: HIT. Its declared source recorded what the claim names inside the window.');
  });

  it('a miss, a call below its base rate, one at it, one with none, and a corrected verdict', () => {
    const one = (over: Partial<RecordCall>) => {
      const text = edition({ resolved: read([recordCall(over)]), open: openBook([]), correctionsPage: true });
      return text.slice(text.indexOf(RECORD_SECTIONS[2]), text.indexOf(RECORD_SECTIONS[3]));
    };
    // A MISS rests on the declared source's record, never on the world (review finding 2).
    const miss = one({ status: 'miss' });
    expect(miss).toContain(
      'The outcome: MISS. Its declared source did not record what the claim names inside the window.',
    );
    expect(miss).not.toMatch(/did not happen|happened/);
    expect(one({ probability: 0.2, base_rate: 0.26 })).toContain('We sat 6 points below it.');
    // "Matched" only for an exact match; a gap that rounds away is "less than a point" (finding 8).
    expect(one({ probability: 0.25, base_rate: 0.25 })).toContain('What we said matched the base rate.');
    expect(one({ probability: 0.254, base_rate: 0.246 })).toContain('We sat less than a point above it.');
    expect(one({ probability: 0.246, base_rate: 0.254 })).toContain('We sat less than a point below it.');
    expect(one({ probability: 0.254, base_rate: 0.246 })).not.toContain('matched');
    expect(one({ probability: 0.26, base_rate: 0.25 })).toContain('We sat 1 point above it.');
    // No base rate: the reason does not claim a distance from one (finding 6).
    const noBase = one({ base_rate: null });
    expect(noBase).toContain('No base rate is stored for this call.');
    expect(noBase).toContain(WHY_NO_BASE);
    expect(noBase).not.toContain('differed most from its base rate');
    const corrected = one({ kind: 'censorship_event', status: 'miss', corrected_status: 'hit', threshold: 1 });
    expect(corrected).toContain('The outcome: MISS as published, the evidence records as HIT.');
    expect(corrected).not.toContain('declared source');
    expect(corrected).toContain('The threshold: at least 1 qualifying event inside the window.');
    // A correction to a status that is not scored is still stated (finding 9).
    for (const to of ['unresolvable', 'void']) {
      const text = one({ status: 'miss', corrected_status: to });
      expect(text).toContain(`The outcome: MISS as published; a correction records it as ${to.toUpperCase()}.`);
      expect(text).not.toContain('declared source');
      expect(
        edition({
          resolved: read([recordCall({ status: 'miss', corrected_status: to })]),
          open: openBook([]),
          correctionsPage: true,
        }),
      ).toContain(`MISS as published; a correction records it as ${to.toUpperCase()} — we said`);
    }
    // A correction that agrees with the published verdict is not one.
    expect(one({ status: 'miss', corrected_status: 'miss' })).toContain(
      'The outcome: MISS. Its declared source did not record',
    );
  });

  it('a corrected verdict among today’s resolutions is stated beside the published counts', () => {
    const c = recordCall({ kind: 'censorship_event', status: 'miss', corrected_status: 'hit' });
    const text = edition({
      resolved: {
        read: true,
        total: 1,
        hits: 0,
        corrections: [{ status: 'miss', corrected_status: 'hit' }],
        calls: [c],
      },
      open: openBook([]),
      correctionsPage: true,
    });
    expect(text).toContain(
      '1 call settled today against external ground truth: 0 hit, 1 miss. The counts are as published; ' +
        '1 call published MISS that the evidence records as HIT.',
    );
    expect(text).toContain('MISS as published, the evidence records as HIT — we said 37%');
  });
});

describe('a read that failed is never printed as an empty one', () => {
  const states: Array<[string, BriefRecord['resolved']]> = [
    ['resolved unread', { read: false }],
    ['none resolved', { read: true, total: 0, hits: 0, corrections: [], calls: [] }],
    ['some resolved', recordDay().resolved],
  ];
  const opens: Array<[string, BriefRecord['open']]> = [
    ['open unread', { read: false }],
    ['none open', { read: true, total: 0, held: 0, next: [] }],
    ['some open', recordDay().open],
  ];

  for (const [rName, resolved] of states) {
    for (const [oName, open] of opens) {
      it(`${rName}, ${oName}`, () => {
        const text = edition({ resolved, open, correctionsPage: true });
        const html = render(text).emailHtml;
        for (const out of [text, html, render(text).plainText]) {
          // "No open calls today." only from a successful read that found none.
          expect(out.includes(NONE_OPEN)).toBe(open.read && open.total === 0);
          expect(out.includes(OPEN_UNREAD)).toBe(!open.read);
          expect(out.includes(NONE_RESOLVED)).toBe(resolved.read && resolved.total === 0);
          expect(out.includes(RESOLVED_UNREAD)).toBe(!resolved.read);
        }
      });
    }
  }

  it('an edition built with no record at all (nothing read) says so in both sections', () => {
    for (const text of [buildFallbackText({ ...data(), record: undefined })]) {
      expect(text).toContain(OPEN_UNREAD);
      expect(text).toContain(RESOLVED_UNREAD);
      expect(text).not.toContain(NONE_OPEN);
      expect(text).not.toContain(NONE_RESOLVED);
      expect(text).toContain(NO_CALL_READ);
    }
  });

  it('the prompt-side flags do not decide the edition: only the record’s own reads do', () => {
    // openCallsRead true with an unread record: the edition still says unread.
    const text = buildFallbackText({ ...data(UNREAD_RECORD), openCallsRead: true, resolvedCallsRead: true });
    expect(text).toContain(OPEN_UNREAD);
    expect(text).not.toContain(NONE_OPEN);
  });
});

describe('escaping holds', () => {
  const hostile = recordCall({
    id: 66_666,
    name: '<img src=x onerror=alert(1)> **Bold** [x](https://nexuswatch.dev/evil)',
    country_code: 'Q"<',
    claim: 'Line one\n\n## Injected section\n<script>alert(1)</script> *em* `code` [link](https://example.test/)',
    status: 'hit',
  });
  const record: BriefRecord = {
    resolved: { read: true, total: 1, hits: 1, corrections: [], calls: [hostile] },
    open: { read: true, total: 1, held: 0, next: [{ ...hostile, status: 'pending', resolves_on: '2026-11-28' }] },
    correctionsPage: true,
  };
  const text = edition(record);

  it('stored text adds no structure: no section, emphasis, code or link of its own', () => {
    expect([...text.matchAll(/^## .+$/gm)].map((m) => m[0])).toEqual([...RECORD_SECTIONS]);
    expect(text).not.toMatch(/^## Injected/m);
    expect(text).not.toContain('**Bold**');
    expect(text).not.toContain('`code`');
    expect(text).not.toContain('[x](https://nexuswatch.dev/evil)');
    expect(text).not.toContain('[link](https://example.test/)');
  });

  for (const [name, out] of Object.entries(renderings(text))) {
    if (name === 'markdown' || name === 'plain text') continue;
    it(`${name}: no tag or attribute from stored text, and only our own links`, () => {
      expect(out).not.toContain('<script');
      expect(out).not.toContain('<img');
      expect(out).not.toContain('onerror=alert(1)>');
      expect(out).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(out).toContain('&lt;script&gt;');
      expect(out).not.toContain('nexuswatch.dev/evil"');
      expect(out).not.toContain('href="https://example.test');
      // The edition's own links: everything before the email chrome's call to action and footer.
      const content = out.split('<a href="https://nexuswatch.dev/#/ledger"')[0];
      const hrefs = [...content.matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);
      expect(hrefs.length).toBeGreaterThan(0);
      for (const h of hrefs) expect(h).toMatch(/^https:\/\/nexuswatch\.dev\/(call\/\d+|ledger|corrections)$/);
      expect((out.match(/<h2/g) ?? []).length).toBe(RECORD_SECTIONS.length);
    });
  }

  it('plain text carries the stored words as text, on one line, under no header of their own', () => {
    const { plainText } = render(text);
    expect(plainText).toContain('<script>alert(1)</script>');
    expect(plainText.split('\n').some((l) => l.startsWith('## Injected'))).toBe(false);
  });
});

describe('the plain-text email says what the HTML email says', () => {
  /** The edition's lines as plain text writes them, as a reader of the HTML sees them. */
  function contentLines(plainText: string): string[] {
    const start = plainText.indexOf(RECORD_SECTIONS[0]);
    const end = plainText.indexOf('\n──────────', start);
    return plainText
      .slice(start, end)
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map(
        (l) =>
          l
            .replace(/^## \S+ /, '') // the section header, without its emoji
            .replace(/^- /, '') // a list item
            .replace(/ \(https:\/\/nexuswatch\.dev\/[^)]*\)/g, ''), // a link's address
      );
  }

  for (const [name, record] of [
    ['a resolution day', recordDay()],
    ['nothing read', UNREAD_RECORD],
    ['none resolved', { ...recordDay(), resolved: { read: true, total: 0, hits: 0, corrections: [], calls: [] } }],
  ] as Array<[string, BriefRecord]>) {
    it(`${name}: every line of the plain text appears in the HTML, in the same order, and nothing else does`, () => {
      const text = edition(record);
      const out = render(text);
      const lines = contentLines(out.plainText);
      expect(lines.length).toBeGreaterThan(8);
      const html = visible(out.beehiivHtml);
      let from = 0;
      for (const line of lines) {
        const at = html.indexOf(line, from);
        expect(at, line).toBeGreaterThanOrEqual(from);
        from = at + line.length;
      }
      // And the HTML holds no sentence the plain text lacks: same words, once each,
      // apart from the edition line, the kickers (each header again, in capitals) and the CTA.
      const htmlWords = html
        .replace(MECHANICAL_EDITION_LINE, '')
        .replace(/Open the ledger →|Read the Brief Archive →/g, '')
        .replace(/[\u{1F300}-\u{1FAFF}]/gu, '');
      let rest = htmlWords;
      for (const h of RECORD_SECTIONS) rest = rest.replace(h.replace(/^## \S+ /, '').toUpperCase(), '');
      for (const line of lines) rest = rest.replace(line, '');
      expect(rest.replace(/[\s▸]+/g, '')).toBe('');
      // The same links, in the same order.
      const hrefs = [...out.beehiivHtml.matchAll(/<a href="(https:\/\/nexuswatch\.dev\/[^"]*)"/g)]
        .map((m) => m[1])
        .filter((h) => !h.includes('#/'));
      const addresses = [...out.plainText.matchAll(/ \((https:\/\/nexuswatch\.dev\/[^)]*)\)/g)].map((m) => m[1]);
      expect(addresses).toEqual(hrefs);
    });
  }
});

describe('the cause line: the existing honest sentence, its truth conditions unchanged', () => {
  const FALSE_FOR_NO_DRAFT = ['withheld', 'publish gate', 'refused'];
  const INTERNALS = ['400', 'credit', 'Anthropic', 'Claude', 'HTTP', 'API key', 'aiDebug'];

  it('says exactly what it said before, for each cause', () => {
    expect(causeLineFor('draft-refused')).toBe(
      'This is the mechanical edition: the model draft was withheld by a publish gate, so today carries data without narrative.',
    );
    expect(causeLineFor('no-draft')).toBe(
      'This is the mechanical edition: no model draft was produced today, so today carries data without narrative.',
    );
    expect(causeLineFor('dry-run')).toBe(
      `This is the mechanical edition: ${DRY_RUN_CLAUSE}, so today carries data without narrative.`,
    );
  });

  it('closes the edition, and is the only line the cause changes', () => {
    const base = buildFallbackText(data(), 'no-draft').split('\n');
    for (const cause of ['draft-refused', 'dry-run'] as FallbackCause[]) {
      const other = buildFallbackText(data(), cause).split('\n');
      expect(other.length).toBe(base.length);
      const diff = other.filter((l, i) => l !== base[i]);
      expect(diff).toEqual([causeLineFor(cause)]);
      expect(other.filter(Boolean).at(-1)).toBe(causeLineFor(cause));
    }
  });

  it('no draft never claims a gate withheld one; no cause exposes internals; unspecified means no draft', () => {
    const noDraft = buildFallbackText(data(), 'no-draft');
    for (const p of FALSE_FOR_NO_DRAFT) expect(noDraft).not.toContain(p);
    for (const cause of ['draft-refused', 'no-draft', 'dry-run'] as FallbackCause[]) {
      for (const w of INTERNALS) expect(buildFallbackText(data(), cause)).not.toContain(w);
    }
    expect(buildFallbackText(data())).toBe(noDraft);
  });
});

describe('the gate the model must pass, the edition passes too', () => {
  it('no comparison, record or superlative the context does not support', () => {
    const one = (over: Partial<RecordCall>): BriefRecord => ({
      resolved: { read: true, total: 1, hits: 0, corrections: [], calls: [recordCall(over)] },
      open: { read: true, total: 0, held: 0, next: [] },
      correctionsPage: true,
    });
    const pending = recordCall({ status: 'pending', resolves_on: '2026-11-28' });
    for (const record of [
      recordDay(),
      UNREAD_RECORD,
      one({ probability: 0.254, base_rate: 0.246 }),
      one({ base_rate: null }),
      one({ status: 'hit' }),
      one({ status: 'miss', corrected_status: 'unresolvable' }),
      {
        resolved: { read: true as const, total: 9, hits: 1, corrections: [], calls: [] },
        open: { read: true as const, total: 1, held: 0, next: [pending] },
        correctionsPage: true,
      },
    ]) {
      const r = checkComparativeClaims(edition(record), '');
      expect(r.unsupported).toEqual([]);
      expect(r.unitViolations).toEqual([]);
    }
  });
});

describe('country names: never a code twice', () => {
  const one = (over: Partial<RecordCall>) =>
    edition({
      resolved: { read: true, total: 1, hits: 0, corrections: [], calls: [recordCall(over)] },
      open: { read: true, total: 1, held: 0, next: [recordCall({ ...over, id: 90_900, status: 'pending' })] },
      correctionsPage: true,
    });

  it('a named country reads "Name (CC)"', () => {
    const text = one({ country_code: 'SE', name: 'Sweden' });
    expect(text).toContain('- Sweden (SE): MISS — we said');
    expect(text).toContain('- Sweden (SE): we say');
    expect(text).toContain('**Sweden (SE), call #90001.**');
  });

  it('no name, or a "name" that is only the code: the code alone, once', () => {
    for (const name of [null, '', 'SE', '  ']) {
      const text = one({ country_code: 'SE', name });
      expect(text).toContain('- SE: MISS — we said');
      expect(text).toContain('- SE: we say');
      expect(text).toContain('**SE, call #90001.**');
      expect(text).not.toContain('SE (SE)');
    }
  });
});

describe('only a scored call is ever HIT or MISS (review finding 3, the second guard)', () => {
  it('a pending or unscored status prints as itself in a list line, never as MISS', () => {
    expect(resolvedLine(recordCall({ status: 'pending' }))).toMatch(/^Uganda \(UG\): PENDING — we said/);
    expect(resolvedLine(recordCall({ status: 'void' }))).toMatch(/^Uganda \(UG\): VOID — we said/);
    for (const status of ['pending', 'void', 'unresolvable']) {
      expect(resolvedLine(recordCall({ status }))).not.toMatch(/\bMISS\b|\bHIT\b/);
    }
  });

  it('an unscored status chosen as resolved states itself and claims nothing about a source', () => {
    const text = explainCall({ call: recordCall({ status: 'unresolvable' }), why: 'resolved' }).join('\n');
    expect(text).toContain('The outcome: UNRESOLVABLE.');
    expect(text).not.toMatch(/\bMISS\b|\bHIT\b|declared source/);
  });
});

describe('a day that scored nothing says exactly that (review finding 12)', () => {
  it('"No call was scored today.", never "No calls resolved today."', () => {
    expect(NONE_RESOLVED).toBe('No call was scored today.');
    const text = edition({ ...recordDay(), resolved: { read: true, total: 0, hits: 0, corrections: [], calls: [] } });
    expect(text).toContain('No call was scored today.');
    expect(text).not.toContain('No calls resolved today.');
  });
});
