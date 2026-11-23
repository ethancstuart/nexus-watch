import { describe, it, expect } from 'vitest';
import { checkComparativeClaims, comparativeClaimLabel, parseRecordMarkers } from './comparative-claims.js';

/**
 * Contexts in the format formatCensorshipLine writes. NO_MARKERS is what the
 * new code computes on the false-headline dates: no record and no rise for
 * either country (lanes2/DATA.md §1.3, lead folder).
 */
const NO_MARKERS = [
  'Russia (RU): 54,160 of 1,350,000 OONI measurements confirmed blocked (4.0%); previous window 52,000 of 1,200,000 (4.3%); highest share in the history: 4.8% (window to 2026-09-13). MARKERS: none',
  'Iran (IR): 28,000 of 114,000 OONI measurements confirmed blocked (24.6%); previous window 29,000 of 120,000 (24.2%); highest share in the history: 35.6% (window to 2026-10-11). MARKERS: none',
  'Cuba (CU): 120 of 6,000 OONI measurements confirmed blocked (2.0%); previous window 300 of 6,100 (4.9%); highest share in the history: 23.0% (window to 2026-09-25). MARKERS: none',
].join('\n');

/** 5 Oct: Iran's share and count were the highest since the floor, and up on the week; Russia's were not. */
const IRAN_RECORD = NO_MARKERS.replace(
  /^Iran \(IR\):.*$/m,
  'Iran (IR): 51,754 of 154,026 OONI measurements confirmed blocked (33.6%); previous window 46,000 of 148,900 (30.9%); highest share in the history: 33.6% (window to 2026-10-04). MARKERS: highest-share, highest-count, share-up, count-up',
);

/** 1 Nov: Iran's share at its lowest since the floor, and down on the week. */
const IRAN_LOW = NO_MARKERS.replace(
  /^Iran \(IR\):.*$/m,
  'Iran (IR): 28,000 of 114,000 OONI measurements confirmed blocked (24.6%); previous window 31,000 of 120,000 (25.8%); highest share in the history: 35.6% (window to 2026-10-11). MARKERS: lowest-share, lowest-count, share-down, count-down',
);

/** The reviewer's context (reviews2/scratch/lane-j-head/api/_lib/zz-gate-probe.test.ts), in the current format. */
const REVIEW_CTX = [
  'Iran (IR): 51,754 of 154,000 OONI measurements confirmed blocked (33.6%); previous window 47,000 of 152,000 (30.9%); highest share in the history: 33.6% (window to 2026-10-04). MARKERS: highest-share',
  'Russia (RU): 54,160 of 1,200,000 OONI measurements confirmed blocked (4.5%); previous window 53,000 of 1,190,000 (4.5%); highest share in the history: 4.8% (window to 2026-09-20). MARKERS: none',
  'Myanmar (MM): 95 of 13,500 OONI measurements confirmed blocked (0.7%); previous window 260 of 13,400 (1.9%); highest share in the history: 1.9% (window to 2026-10-12). MARKERS: none',
].join('\n');

/** The brief passes every CII country name; these are the ones the tests use. */
const MONITORED = [
  'Russia',
  'Iran',
  'Myanmar',
  'Cuba',
  'Iraq',
  'Turkmenistan',
  'Kazakhstan',
  'China',
  'Yemen',
  'Turkey',
  'Egypt',
  'India',
];

const refuses = (s: string, ctx: string) => {
  const r = checkComparativeClaims(s, ctx, MONITORED);
  return r.unsupported.length > 0 && !r.pass;
};
const passes = (s: string, ctx: string) => checkComparativeClaims(s, ctx, MONITORED).pass;

describe('refused: the 26 published false "record" sentences (verbatim, or cut at a clause)', () => {
  const PUBLISHED: Array<[string, string]> = [
    [
      '8 Sep',
      'Iran just logged 1,283 confirmed blocking measurements in seven days — the highest week-over-week total in our data, with OONI recording blocks through 2026-09-07.',
    ],
    ['13 Sep subject', 'Russia and Iran hit record censorship in the same week'],
    [
      '13 Sep',
      '**Russia records all-time censorship peak.** OONI logged 50,768 confirmed blocks in Russia over seven days through September 12 — the highest weekly total in our archive.',
    ],
    [
      '13 Sep lede',
      'This week the board moved in ways the wires missed: Russia logged its highest-ever censorship volume in our archive, Iran held pace just behind it.',
    ],
    [
      '14 Sep',
      'This is the largest simultaneous censorship spike we have on record for both states in the same rolling window.',
    ],
    ['15 Sep', "Russia and Iran just recorded the highest censorship levels we've logged simultaneously since launch."],
    ['15 Sep subject', 'Russia and Iran log record censorship; 65 calls settle'],
    ['20 Sep heading', 'Russia and Iran sustain record censorship load**'],
    [
      '20 Sep',
      'OONI recorded 46,998 confirmed blocks in Russia and 43,310 in Iran over the past seven days — a combined 90,308 measurements, the highest seven-day total for any two-country pair in the OONI dataset we monitor.',
    ],
    [
      '23 Sep',
      "Russia and Iran both crossed 42,000 confirmed blocking measurements in the last seven days — the two highest totals we've logged in this reporting period, and they happened simultaneously.",
    ],
    [
      '6 Oct',
      'Iran and Russia both crossed 50,000 confirmed network blocks this week — the two highest censorship measurements in the OONI dataset.',
    ],
    [
      '11 Oct lede',
      "This week marked a collision of two things we don't often see at once: record-level network interference in both Russia and Iran, and the United States designating the International Criminal Court.",
    ],
    ['11 Oct heading', 'Russia and Iran hit simultaneous censorship highs**'],
    [
      '11 Oct',
      'OONI recorded 52,941 confirmed blocking measurements in Russia over the past seven days — the highest weekly total we have on record for any country.',
    ],
    ['11 Oct subject', 'Russia and Iran hold record censorship — ICC designated'],
    ['12 Oct', "Russia and Iran just logged the two highest censorship weeks we've measured."],
    [
      '12 Oct board',
      '- **Russia** 68+20 (▲+8) — OONI recorded 53,650 confirmed blocking measurements in the last 7 days, highest on record.',
    ],
    ['12 Oct', 'The blocking scale (53k measurements) is without precedent in our dataset.'],
    [
      '12 Oct',
      'The timing overlap — two authoritarian states hitting record interference in the same week — suggests coordinated preparation.',
    ],
    ['24 Oct', "Russia and Iran just hit the highest censorship levels we've recorded in a single week."],
    ['24 Oct subject', 'Russia and Iran set records, 67 forecasts settled today'],
    [
      '24 Oct crises',
      '- **Iran** → Sustained blocking at record levels, OFAC designations on four vessels 72 hours prior.',
    ],
    [
      '1 Nov',
      "Russia and Iran both hit the highest confirmed blocking volumes we've logged since launch, Turkey and India stayed elevated.",
    ],
    ['1 Nov', '**Russia logged 54,160 confirmed blocks in 7 days — the highest volume on record.**'],
    ['1 Nov subject', 'Russia and Iran log record censorship as Sudan ticks up'],
    [
      '5 Nov',
      'Russia just logged **54,468 confirmed blocking measurements in seven days** — the highest weekly censorship count in the dataset, and Iran clocked 29,050 in the same window.',
    ],
  ];
  it('there are 26', () => expect(PUBLISHED).toHaveLength(26));
  for (const [when, s] of PUBLISHED) it(`${when}: ${s.slice(0, 70)}`, () => expect(refuses(s, NO_MARKERS)).toBe(true));

  it('a true Iran marker does not rescue a sentence that also claims Russia (6 and 11 Oct)', () => {
    for (const s of [
      'Iran and Russia both crossed 50,000 confirmed blocking measurements this week — the two highest censorship measurements in the OONI dataset.',
      'Russia and Iran hold record censorship — ICC designated',
    ]) {
      const r = checkComparativeClaims(s, IRAN_RECORD, MONITORED);
      expect(r.pass).toBe(false);
      expect(r.unsupported[0].why).toContain('Russia');
    }
  });

  it('an Iran marker does not cover a non-censorship self-history claim about Iran (12 Oct plateau)', () => {
    const s =
      "Iran's live deviation has been pinned at 18 for seven consecutive days — the longest plateau we've recorded at that level.";
    expect(passes(s, IRAN_RECORD)).toBe(false);
  });

  it('a high marker never supports a low claim, and vice versa', () => {
    expect(passes("Iran's confirmed share is the lowest since 2026-09-12.", IRAN_RECORD)).toBe(false);
    expect(passes('Iran hits seven-day censorship record', IRAN_LOW)).toBe(false);
  });
});

/** Review finding 1: 15 of these 19 passed the first version. */
describe('refused: the reviewer’s 19 unsupported paraphrases and 2 subject-only probes', () => {
  const PARAPHRASES = [
    "Russia's censorship has never been higher.",
    'Unprecedented censorship in Russia this week.',
    'Russia tops its previous censorship high.',
    'Russian censorship at an all-time high.',
    'Russia logged the most confirmed blocking measurements since August.',
    "Russia's censorship hit a new high this week.",
    "Russia's censorship share is the highest yet.",
    "Russia's censorship reached its highest level in months.",
    'Russia saw record-breaking censorship.',
    'Russia: a record 54,160 measurements confirmed blocked.',
    "Russia's censorship peaked this week.",
    'Russian censorship surpassed its previous peak.',
    'Censorship in Russia is at a 10-week high.',
    'More measurements were confirmed blocked in Russia than in any week since tracking began.',
    "Russia's censorship is the highest it has been.",
    'Russian censorship tops all prior weeks.',
    'Russia set a fresh censorship high.',
    "Myanmar's censorship share is at its lowest since September.",
    'Censorship in Myanmar fell to a record low.',
  ];
  it('there are 19', () => expect(PARAPHRASES).toHaveLength(19));
  for (const s of PARAPHRASES) it(s, () => expect(refuses(s, REVIEW_CTX)).toBe(true));
  for (const s of [
    'Russia censorship at all-time high\nOONI confirmed 54,160 of 1.2M measurements as blocked (4.5%).',
    'Russia censorship hits new high\nOONI confirmed 54,160 of 1.2M measurements as blocked (4.5%).',
  ])
    it(`subject: ${s.split('\n')[0]}`, () => expect(refuses(s, REVIEW_CTX)).toBe(true));
});

/** Review finding 4. */
describe('refused: a marker for one country or quantity never licenses another', () => {
  for (const s of [
    'Iraq hit record censorship this week, alongside Iran.',
    "Iran's neighbour Turkmenistan hit record censorship.",
    'Censorship in Kazakhstan hit a record, as Iran also did.',
  ])
    it(`other country: ${s}`, () => expect(refuses(s, REVIEW_CTX)).toBe(true));
  for (const s of [
    'Iran logged a record 51,754 measurements confirmed blocked (33.6%).',
    "Iran's confirmed count hit a record.",
    'Iran set a record for measurements confirmed blocked, 33.6% of tests.',
  ])
    it(`count claim on a share marker: ${s}`, () => expect(refuses(s, REVIEW_CTX)).toBe(true));
  it('a country no OONI line mentions is invisible without the monitored list — which the brief always passes', () => {
    const s = 'Iraq hit record censorship this week, alongside Iran.';
    expect(checkComparativeClaims(s, REVIEW_CTX).pass).toBe(true);
    expect(checkComparativeClaims(s, REVIEW_CTX, ['Iraq']).pass).toBe(false);
  });
});

/**
 * Written by the lane before the second tuning pass. The rewrite's first run
 * missed 8 of these 25; the classes behind those misses were generalised and
 * all 25 are now refused.
 */
describe('refused: 25 more unsupported comparisons (the writer’s own)', () => {
  const MINE = [
    "Russia's blocking reached a new peak.",
    'Russian censorship is at levels never seen before.',
    "Myanmar's confirmed share climbed to 0.7%.",
    'Censorship in Russia surged this week.',
    'Russia doubled its confirmed blocking measurements.',
    'OONI measurements confirmed blocked in Russia rose again.',
    "Russia's blocking is the most intense it has been.",
    "Russia's censorship outpaced every prior week.",
    'Russia: the biggest week of blocking since records began.',
    'Russian interference was heavier than at any point this autumn.',
    'Russia set a new censorship benchmark.',
    "Russia's confirmed blocking is up sharply.",
    'Blocking in Myanmar spiked.',
    "Russia's censorship climbed to a fresh high.",
    'Russia logged its busiest censorship week yet.',
    "Russia's censorship intensified.",
    'Russia blocked more sites than ever.',
    "Censorship in Russia hasn't been this high since tracking began.",
    "Russia's blocking volume is at a multi-month high.",
    'Russian censorship hit its highest level of the year.',
    "Russia's OONI count jumped 4% week on week.",
    "Russia's censorship share edged up.",
    "Myanmar's blocking eased.",
    'Russia: censorship at record pace.',
    "Russia's censorship is worse than last week.",
  ];
  it('there are 25', () => expect(MINE).toHaveLength(25));
  for (const s of MINE) it(s, () => expect(refuses(s, REVIEW_CTX)).toBe(true));
});

/**
 * Held out: written after the second tuning pass and run once before any
 * change. That run missed 4 of 15 ("not seen since", "never blocked this
 * much", "outdid every previous week", "up 12%") and refused 0 of 10 true
 * sentences. Those four classes were then fixed, so this block now proves
 * only that they stay fixed; the honest estimate is the first run's.
 */
describe('held-out set', () => {
  const CTX = [
    REVIEW_CTX.split('\n')[0].replace('MARKERS: highest-share', 'MARKERS: highest-share, share-up, count-up'),
    REVIEW_CTX.split('\n')[1],
    'Turkey (TR): 3,978 of 60,000 OONI measurements confirmed blocked (6.6%); previous window 2,217 of 58,000 (3.8%); history too short to compare. MARKERS: share-up, count-up',
  ].join('\n');
  for (const s of [
    'Russia is blocking at a pace not seen since the summer.',
    "Russia's internet controls are the tightest they've been.",
    "Russian blocking soared past last week's level.",
    'For Russia, this is a high-water mark for blocking.',
    'Russia has never blocked this much.',
    "Russia's blocking keeps climbing.",
    'Turkey hit its highest censorship share since we began tracking it.',
    'Iran saw its biggest weekly drop in blocking.',
    'Censorship in Egypt rose sharply this week.',
    'Russia outdid every previous week for confirmed blocks.',
    'Russia, Iran and Turkey all logged rising censorship.',
    'Blocking in Russia is up 12% on the week.',
    "Iran's blocked count is the highest it has ever been.",
    "Russia's censorship share has grown for three straight weeks.",
    'A record share of Russian tests came back blocked.',
  ])
    it(`refuses: ${s}`, () => expect(refuses(s, CTX)).toBe(true));
  for (const s of [
    "Iran's confirmed share rose to 33.6% from 30.9% the week before.",
    'Turkey: 6.6% of OONI measurements confirmed blocked, up from 3.8%.',
    'Russia has the largest count of confirmed-blocked measurements on the board today.',
    'OONI confirmed 54,160 of 1,200,000 measurements in Russia as blocked (4.5%), the same share as the previous window.',
    "Iran's share is the highest 7-day share since 2026-09-12.",
    "What would change our mind: Iran's confirmed share falling below 25% by 2026-11-21.",
    "Russia's live deviation jumped 6 points today on no visible driver.",
    'The rial fell to a record low against the dollar, Reuters reported.',
    'Egypt held its largest protest since 2019, the BBC reported.',
    "Russia's ruble is at its weakest since March.",
  ])
    it(`passes: ${s}`, () => expect(passes(s, CTX)).toBe(true));
});

describe('passes: true comparisons when the marker is there', () => {
  it('5 Oct body', () => {
    const s =
      "Iran logged 51,754 confirmed blocking measurements in the last seven days — the highest weekly total we've recorded from OONI since launch.";
    expect(passes(s, IRAN_RECORD)).toBe(true);
    expect(passes(s, NO_MARKERS)).toBe(false);
  });
  it('5 Oct subject', () => {
    const s = '65 forecasts settled today — Iran hits seven-day censorship record';
    expect(passes(s, IRAN_RECORD)).toBe(true);
    expect(passes(s, NO_MARKERS)).toBe(false);
  });
  it('the honest share sentence from DATA.md §1.5 (5 Oct)', () => {
    const s =
      'In the 7 days to 4 Oct, 33.6% of OONI measurements in Iran were confirmed blocked, up from 30.9% the week before and the highest share since 2026-09-12.';
    expect(passes(s, IRAN_RECORD)).toBe(true);
    expect(passes(s, NO_MARKERS)).toBe(false);
  });
  it('a true low (1 Nov shape)', () => {
    const s = "Iran's confirmed-blocked share fell to 24.6% of OONI measurements, its lowest since 2026-09-12.";
    expect(passes(s, IRAN_LOW)).toBe(true);
    expect(passes(s, NO_MARKERS)).toBe(false);
  });
  it('review finding 5: the prompt’s own phrasing, with no censorship word in the sentence', () => {
    expect(passes("Iran's confirmed share, 33.6%, is the highest 7-day share since 2026-09-12.", REVIEW_CTX)).toBe(
      true,
    );
  });
});

/** Review finding 3: attributed wire facts and other domains are not refused. */
describe('passes: ordinary sentences, wire records, cross-country rankings, CII moves', () => {
  for (const s of [
    'Our record this week: 3 hits and 1 miss.',
    'The record shows we were wrong on Thailand at 52%.',
    'On the record, the ministry denied any blocking order.',
    'For the record, no call resolved today.',
    'Our track record on FX calls is no better than chance.',
    'We keep a record of every call on the ledger.',
    'The week on the record.',
    'OONI recorded 2,136 confirmed blocking measurements in Russia in the 7 days to 2026-10-04.',
    'Nothing in OONI, the sanctions feed, or the seismic record explains it today.',
    'Yemen is the highest-scored country on the board today.',
    "Iran's live deviation is the second-highest globally after Yemen.",
    "Iran's censorship trajectory climbed from +15 to a +23 peak over seven days.",
    "Russia logged 52,331 confirmed blocking measurements in the last seven days — the highest absolute count in the OONI feed and 1.6x Iran's.",
    'Russia and Iran are running the two highest sustained censorship operations we track.',
    'The biggest single-day move globally was Cuba, up 12.',
    'Our record this week: 3 of 4 calls hit.',
    "The record shows Iran's share at 33.6%.",
    'For the record, OONI confirmed 51,754 of 154,000 measurements as blocked.',
    'We have recorded 12 calls on the ledger this month.',
    'Russia blocks Telegram, the wire reports.',
    'Sanctions designations were the most in a month.',
    "Argentina's peso hit a record low against the dollar, Reuters reported.",
    'Turnout hit record levels in the Georgian election, the BBC reported.',
    'The largest protest since 2019 filled Tbilisi, per the BBC.',
    'Oil prices reached their highest since March.',
    'Record numbers fled Sudan last month, the UN said.',
    'The heaviest rainfall on record hit Pakistan.',
    // From the archive: false refusals the first rewrite made.
    '- Why Taiwan dropped 7 points, or why Saudi Arabia fell 6 — both moves lack attribution.',
    "- We are NOT explaining Kenya's -4 drop — no driver identified in today's data.",
    'The blocking persisted across the entire week with no single-day spike, suggesting infrastructural enforcement.',
    "These aren't gradual escalations; these are infrastructure-scale blocking campaigns.",
    "Russia's volume is four times higher than any other country this week except Iran.",
    'The next highest is India at 3,547.',
    'The most informative: India — we said 17% (base rate 26%) for rupee depreciation by today, and it held.',
    'The nearest critical infrastructure is energy transmission lines feeding eastern China.',
    "Russia logged 53,291 confirmed blocking measurements in the last seven days — nearly double Iran's 29,797.",
    'OONI recorded 52,487 confirmed blocking measurements in Iran over the past seven days, both peaking on October 3.',
    'What would change our mind: a drop in OONI measurements for Russia below 30,000 by 2026-11-20.',
    'Iran has fallen from 18.8 to 15 over 7 days.',
  ])
    it(s.slice(0, 80), () => expect(checkComparativeClaims(s, NO_MARKERS, MONITORED).unsupported).toEqual([]));
});

/**
 * The reading the prompt asks for: a count that rose on volume, a share that
 * did not set a record. It needs no marker beyond what it states. Re-check
 * finding B: the first of these was refused because "count" and "share" in
 * one clause demanded both markers for "rose".
 */
describe('passes: honest volume readings and non-records', () => {
  // Russia carries count-up only: its count rose, its share did not.
  const RU_COUNT_UP = REVIEW_CTX.replace(/^(Russia \(RU\):.*)MARKERS: none$/m, '$1MARKERS: count-up');
  for (const s of [
    "Russia's count of measurements confirmed blocked rose to 56,160 while its share held at 4.5%: more testing, not more censorship.",
    "Russia's confirmed count went up but its share stayed flat at 4.5%, which points to more testing rather than more blocking.",
    "Russia's share of 4.5% is not a record; the highest in the history is 4.8%.",
    'The higher count in Russia reflects test volume: the confirmed share was unchanged at 4.5%.',
    "Russia's share did not set a record this week, and the rise in its count is explained by more tests.",
    "Myanmar's share, at 0.7%, is well below its highest of 1.9%.",
    // A percentage right after a count's change word is the size of the change.
    "Russia's confirmed count rose 6% although its share did not move from 4.5%.",
  ])
    it(s.slice(0, 80), () => expect(passes(s, RU_COUNT_UP)).toBe(true));

  it('…but the same shape with the share as the riser is still refused', () => {
    expect(passes("Russia's count held at 54,160 while its share rose to 4.8%.", RU_COUNT_UP)).toBe(false);
  });

  // Re-check at 65ea2f8: "than", "from", "against" before a superlative were
  // exempted as reference points, so these record claims passed. Only
  // below-markers (below, under, beneath, short of, off, down from) exempt.
  for (const s of [
    "Russia's censorship is higher than its highest week on record.",
    "Russia's censorship share is now higher than its previous highest.",
    'Russian blocking is more intense than at its highest point in our data.',
    "Russia's censorship share is greater than its highest level since September.",
  ])
    it(`refused, comparative above a superlative: ${s}`, () => expect(passes(s, RU_COUNT_UP)).toBe(false));
});

/** Re-check finding A: an attributed economic record about a country with an OONI line. */
describe('passes: attributed records about economic quantities', () => {
  for (const s of [
    "Russia's central bank raised its key rate to a record 21%, Bloomberg reported.",
    "Iran's inflation hit its highest since 2019, the central bank said.",
    "Russia's budget deficit is the widest since 2020, the finance ministry said.",
  ])
    it(s, () => expect(passes(s, REVIEW_CTX)).toBe(true));
});

/**
 * What it cannot catch — asserted, so a change in the gate's reach shows up
 * here and the file header stays honest.
 */
describe('known limits', () => {
  const RU_SHARE_RECORD = REVIEW_CTX.replace(/^(Russia \(RU\):.*)MARKERS: none$/m, '$1MARKERS: highest-share');
  for (const [s, ctx] of [
    ["Russia's censorship is extraordinary this week.", REVIEW_CTX], // no comparative word
    ["Iran's share hit 33.6%. That has not happened before.", REVIEW_CTX], // split across sentences, no country in the second
    ["Russia's deviation and its blocking both climbed this week.", REVIEW_CTX], // a change beside a CII deviation is not checked
    ['Watch whether the India censorship spike is federal or state-level.', REVIEW_CTX], // presupposed change inside a conditional
    ['Russia has the highest share since launch.', RU_SHARE_RECORD], // span: a marker computed since 2026-09-12
  ] as const)
    it(`passes, and should not: ${s}`, () => expect(checkComparativeClaims(s, ctx, MONITORED).unsupported).toEqual([]));
  it('refused, and should not be: a true trend sentence that names no country', () => {
    expect(
      passes("OONI's 48,102 measurements over seven days is sustained tightening, not a transient block.", REVIEW_CTX),
    ).toBe(false);
  });
});

describe('the unit: measurements, never "blocks"', () => {
  for (const s of [
    'OONI logged 50,768 confirmed blocks in Russia over seven days.',
    'Iran censorship at 51,000 blocks, 67 FX calls settled today',
    'Russia and Iran together logged over 90,000 confirmed network blocks in seven days.',
    '**What would change our mind:** OONI recording a sustained drop below 500 blocks/week in Iran.',
    "Russia's 1,912 blocks are structural at this point.",
    'Uganda hit 37%, Russia logs 54,000 blocks in one week',
    'The blocking scale (53k blocks) held all week.',
  ])
    it(`refuses: ${s.slice(0, 70)}`, () => {
      const r = checkComparativeClaims(s, NO_MARKERS);
      expect(r.unitViolations.length).toBeGreaterThan(0);
      expect(r.pass).toBe(false);
    });
  for (const s of [
    'The embassy sits three city blocks from the square.',
    'The protest was 2 blocks away from parliament.',
    'Russia blocks Telegram again, per the regulator.',
    'OONI recorded 53,650 confirmed blocking measurements in Russia.',
  ])
    it(`passes: ${s}`, () => expect(checkComparativeClaims(s, NO_MARKERS).unitViolations).toEqual([]));
});

describe('comparativeClaimLabel and parseRecordMarkers', () => {
  it('names the offending phrases for aiDebug', () => {
    const r = checkComparativeClaims(
      'Russia and Iran hit record censorship in the same week\nOONI logged 50,768 confirmed blocks in Russia.',
      NO_MARKERS,
    );
    const label = comparativeClaimLabel(r);
    expect(label).toMatch(/^comparative-claim-failed: /);
    expect(label).toContain('"record" (Russia lacks highest-share; Iran lacks highest-share)');
    expect(label).toContain('unit=["50,768 confirmed blocks"]');
  });

  it('reads only the computed marker lines', () => {
    const m = parseRecordMarkers(IRAN_RECORD);
    expect([...m.keys()]).toEqual(['RU', 'IR', 'CU']);
    expect(m.get('IR')?.markers).toEqual(new Set(['highest-share', 'highest-count', 'share-up', 'count-up']));
    expect(m.get('RU')?.markers.size).toBe(0);
  });

  it('a draft with no comparative claim passes on an empty context', () => {
    expect(checkComparativeClaims('A quiet day. Nothing moved.', '').pass).toBe(true);
  });
});
