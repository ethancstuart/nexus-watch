/**
 * Mechanical gate for comparisons — does the context support "record", "new
 * high", "rose"?
 *
 * WHY THIS EXISTS. The grounding gate (grounding.ts) checks numerals and
 * nothing else, so "Russia logged 54,160 confirmed blocks — the highest volume
 * on record" passed it: the number was real, the record was not. Between
 * 13 Sep and 5 Nov 2026 the brief claimed a Russia censorship record on twelve
 * dates and was wrong on all twelve, and the subject line that started it was
 * an example in our own prompt (lanes2/DATA.md §1.3, lead folder).
 *
 * THE RULE, BY TOPIC rather than by phrase list. (The first version listed
 * record phrases; an independent review found 15 of 19 rewordings — "hit a
 * new high", "record-breaking", "a record 54,160", "peaked", "a 10-week high",
 * "the highest yet" — passing it. A list of phrasings loses to the next
 * phrasing.)
 *
 *  1. Each clause of each sentence (subject line included) is classified:
 *     - CENSORSHIP when it uses OONI vocabulary (OONI, censorship, blocking,
 *       blocked, measurements, interference), or names a country from the
 *       censorship context and talks about nothing else measurable;
 *     - OTHER when it is about something else: a price, a vote, a quake, a
 *       sanctions action, a CII deviation or component.
 *  2. In a CENSORSHIP clause, ANY comparison with the past is refused unless
 *     every monitored country the sentence names carries the computed marker
 *     (censorship-context.ts) for that direction and that quantity:
 *       - a record, superlative or "new high" against history needs
 *         highest-/lowest-share or -count;
 *       - a change against last week ("rose", "spiked", "up from", "fell")
 *         needs share-/count-up or -down.
 *     The quantity is read next to the claim: a share or a percentage means
 *     share; a total, a count or a number of measurements means count; both
 *     mean both; neither means share, because "record censorship" claims the
 *     level of censorship and the share is that level.
 *  3. In an OTHER clause only self-history is refused: a superlative or
 *     record beside "we've recorded/logged", "in our data/archive/dataset",
 *     "since launch". Attributed wire facts ("the peso hit a record low,
 *     Reuters reported"; "the largest protest since 2019") pass: they are the
 *     wire's claim, and refusing them sent whole issues to the mechanical
 *     edition (review, 20 Sep archive).
 *
 * It also refuses "N blocks": the number counts MEASUREMENTS that OONI
 * confirmed as blocked, and "51,000 blocks" reads as 51,000 blocked things.
 *
 * WHAT IT CANNOT CATCH — measured in comparative-claims.test.ts, stated here
 * so it is not trusted beyond its reach:
 *  - Span. "Highest since launch" passes on a marker computed since
 *    2026-09-12; the gate checks country, direction and quantity, not the
 *    period claimed.
 *  - Comparisons with no comparative word: "Russia's censorship is
 *    extraordinary this week", "Iran is blocking like never seen".
 *  - Claims split across sentences ("Iran's share hit 33.6%. That has not
 *    happened before.") and pronoun subjects with no country named.
 *  - A change against last week in a clause that also discusses a CII
 *    deviation or component: "rose" may be the deviation, so the trend check
 *    is skipped there (record checks still run).
 *  - Hypotheticals: a trend inside a conditional or threshold clause ("if it
 *    drops below 10,000") is not a claim and is not checked. Records inside
 *    conditionals ARE checked, and refused.
 *  - Countries absent from both the marker lines and the monitored list;
 *    invented causes, services or ISPs (the grounding gate checks numbers,
 *    not nouns); the bare word "blocks" with no number before it.
 */

export type ClaimDirection = 'high' | 'low';
export type ClaimQuantity = 'share' | 'count';
export type ClaimKind = 'record' | 'trend';

export interface UnsupportedClaim {
  /** The words that made it a comparison. */
  phrase: string;
  sentence: string;
  why: string;
}

export interface ComparativeClaimReport {
  unsupported: UnsupportedClaim[];
  /** "N blocks"-style restatements of a measurement count. */
  unitViolations: string[];
  pass: boolean;
}

/** Country code → display name and the markers its context line carries. */
export function parseRecordMarkers(context: string): Map<string, { name: string; markers: Set<string> }> {
  const out = new Map<string, { name: string; markers: Set<string> }>();
  const re = /^(.+?) \(([A-Z]{2})\): .*\bMARKERS: ([a-z, -]+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(context)) !== null) {
    const markers = m[3].trim() === 'none' ? [] : m[3].split(',').map((s) => s.trim());
    out.set(m[2], { name: m[1], markers: new Set(markers) });
  }
  return out;
}

// --- Topic -----------------------------------------------------------------

/** OONI vocabulary. "censorship" alone is CII-speak beside "component". */
const OONI_WORDS =
  /\b(?:OONI|measurements?|confirmed[-\s](?:block\w*|share)|block(?:s|ed|ing)|interference|probes?|web\s+tests?|of\s+(?:\w+\s+){0,2}tests)\b/i;
const CENSORSHIP_WORD = /\bcensor\w*/i;
/** CII talk: the deviation, a component, the score, the movers arrows, a signed live deviation. */
const CII_WORDS =
  /\b(?:deviation|component|CII|score|structural\w*|composite|trajectory|decay\w*|de-escalation)\b|(?<!percentage\s)\bpoints?\b|[▲▼↑↓→]|(?:^|[\s(])[+−-]\d/i;
/** Measurable things that are not censorship. */
const OTHER_WORDS =
  /\b(?:peso|rial|rouble|ruble|lira|yuan|currenc\w*|dollar|FX|exchange\s+rate|oil|gas|crude|prices?|ETF|stocks?|bonds?|yields?|markets?|turnout|elections?|votes?|voters|protests?|protesters|demonstrat\w*|rain\w*|floods?|quakes?|earthquakes?|magnitude|seismic|refugees|fled|displace\w*|inflation|GDP|sanction\w*|designat\w*|OFAC|SDN|delist\w*|assets?|casualt\w*|killed|deaths?|troops|strikes?|missiles?|attacks?|outbreaks?|cases|calls?|forecasts?|Brier|ledger|rupee|won|real|baht|depreciat\w*|appreciat\w*|base\s+rate|we\s+said|settled?|resolved?|hits?\s+and\s+miss\w*|central\s+banks?|(?:interest|policy|key|benchmark|lending|refinancing|mortgage)\s+rates?|deficits?|surplus\w*|budgets?|debt|exports?|imports?|tariffs?|unemployment|jobless\w*|wages?|reserves|output|production|growth|bankrupt\w*|ministry|treasury)\b/i;
/** Sanctions "blocked property" is not OONI blocking. */
const SANCTIONS_BLOCKING = /\b(?:OFAC|sanction\w*|SDN|assets?|property)\b/i;

// --- Claims ----------------------------------------------------------------

/** Negation in the words just before a claim ("no single-day spike", "aren't gradual escalations"). */
const NEGATED = /(?:\b(?:no|not|without|nor|never|any|absent|lack\s+of|rather\s+than)|n't)\s+(?:[\w-]+\s+){0,3}$/i;
/** A list governed by an earlier negation: "no headline, sanctions event, or censorship surge". */
const NEGATED_LIST = /\b(?:no|nor|without|not)\b(?!\s+doubt)[^.;:]{0,80}$/i;
const CONDITIONAL = /\b(?:if|would|could|should|unless|whether|watch\w*|threshold)\b|\bwhat\s+would\s+change\b/i;

const LOW_WORDS =
  /\b(?:lowest|fewest|smallest|least|minimum|bottom|lows?|fewer|less|lower|smaller)\b|\bnever\s+(?:been\s+)?(?:lower|fewer|less)\b|\bthis\s+low\b/i;

/** A superlative is historical unless it is plainly a ranking across countries today. */
/**
 * Any superlative: "-est" words (busiest, harshest, tightest) and "most",
 * less a stoplist of "-est" words that are not superlatives.
 */
const MAGNITUDE_SUPERLATIVE =
  /\b(?:highest|lowest|largest|biggest|heaviest|greatest|strongest|longest|fewest|smallest|least|worst|maximum|minimum)\b|\b(?:the|its|their)\s+most\b(?=\s+(?:[\w-]+\s+){0,2}?(?:intense|severe|restrictive|aggressive|extensive|widespread|confirmed|blocked|blocking|censor\w*|measurements|blocks|tests|interference|heavily))|\bmost[-\s]ever\b/i;
const SUPERLATIVE =
  /\b(?!\w*west\b)(?!(?:budapest|bucharest|everest|conquest|inquest|tempest|priest|latest|interest|protest|contest|request|arrest|forest|honest|modest|earnest|suggest|digest|manifest|harvest|invest|test|rest|west|best|nest|guest|quest|chest|crest|unrest|behest|attest|detest|infest|divest|ingest|congest|molest|pest|vest|zest|jest|lest)\b)\w{2,}est\b|\b(?:worst|least|maximum|minimum)\b|\b(?:the|its|their)\s+most\b|\bmost[-\s]ever\b/i;
const CROSS_SECTIONAL =
  /\b(?:globally|worldwide|in\s+the\s+world|of\s+any\s+(?:other\s+)?(?:country|platform|state)|than\s+any\s+other|among|on\s+(?:the|our)\s+board|of\s+all\s+(?:\d+\s+)?(?:countries|states)|in\s+(?:the|our|today's)\s+(?:[\w-]+\s+)?(?:feed|context|list|section)|on\s+the\s+list|we\s+(?:can\s+)?(?:track|monitor|measure|see)|today|next|second|third|fourth|outside\s+[A-Z]\w+|after\s+[A-Z]\w+|alongside\s+[A-Z]\w+|except\s+[A-Z]\w+)\b/;
const TEMPORAL =
  /\b(?:since|ever|yet|so\s+far|to\s+date|before|previous|prior|past|history|historic\w*|archive|dataset|on\s+record|all[-\s]time|launch|in\s+(?:weeks|months|years|a\s+decade)|this\s+(?:year|month|period)|reporting\s+period|in\s+a\s+single\s+week|(?:it|they|we)(?:'ve|\s+have|\s+has)\s+(?:ever\s+)?been|we(?:'ve|\s+have)\b|in\s+(?:our|the)\s+data)\b|\b(?:[2-9]|\d{2,})[-\s](?:week|month|year)\b/i;
const POSSESSIVE_SUPERLATIVE = /\b(?:its|their|his|her)\s+(?:[\w-]+\s+)?(?:\w{2,}est|most)\b/i;

/** Self-history: the only comparison an OTHER clause may not make. */
const SELF_HISTORY =
  /\bwe(?:'ve|\s+have)?\s+(?:ever\s+)?(?:recorded|logged|measured|seen|tracked|observed)\b|\bin\s+(?:our|the)\s+(?:\w+\s+){0,2}(?:archive|dataset|data|records|history)\b|\bon\s+our\s+record\b|\bsince\s+(?:our\s+)?launch\b|\bsince\s+(?:we|tracking|records)\s+(?:began|started)\b/i;

/** Record-type phrases, independent of superlatives. */
const RECORD_PATTERNS: RegExp[] = [
  // "record" as a claim; benign senses are filtered in recordWordIsClaim.
  /\brecord(?:[-\s]breaking|[-\s]setting)?\b/gi,
  /\b(?:set|sets|setting|hit|hits|broke|break|breaks|breaking|new|smash\w*|shatter\w*|beat\w*)\s+(?:\w+\s+)?records\b/gi,
  /\ball[-\s]time\b/gi,
  /\bunprecedented\b|\b(?:without|no|beyond)\s+precedent\b/gi,
  /\bnever\s+(?:been\s+)?(?:higher|lower|more|fewer|this\s+(?:high|low))\b/gi,
  /\bnever\s+(?:\w+\s+){0,3}?(?:before|seen|recorded|logged|measured)\b/gi,
  /\bnever\s+(?:\w+\s+){0,3}?(?:this|so)\s+(?:much|many|high|low|heavily|widely|hard)\b/gi,
  /\bnot\s+(?:been\s+)?seen\s+(?:since|before|in)\b/gi,
  // A high, low or peak as a NOUN: "a new high", "a 10-week high", "its previous peak".
  /\b(?:new|fresh|previous|prior|old|earlier|recent|a|an|its|their|\d+[-\s](?:day|week|month|year)|multi[-\s](?:day|week|month|year)|several[-\s](?:week|month))\s+(?:\w+[-\s]){0,2}?(?:highs?|lows?|peaks?|max(?:imum)?|bottom|benchmark|milestone|high[-\s]water[-\s]mark)(?=\s*(?:$|[.,;:!?)\]—–]|\s+(?:this|last|of|for|in|since|on|at|and|as|after|before|yet|ever|so)\b))/gi,
  // "peaked", "a new peak" — but not "both peaking on October 3", a day inside the window.
  /\bpeak(?:s|ed|ing)?\b(?!\s+(?:on\s+)?(?:\d|January|February|March|April|May|June|July|August|September|October|November|December|Mon|Tue|Wed|Thu|Fri|Sat|Sun|mid-week|midweek))/gi,
  /\b(?:censorship|blocking|interference)\s+(?:highs|lows)\b/gi,
  /\b(?:tops?|topped|topping|surpass\w*|exceed\w*|beat(?:s|en)?|eclips\w*|outstrip\w*|outpac\w*|outd(?:id|o\w*)|bested|dwarf\w*|overt[ao]k\w*)\b[^.;]{0,40}?\b(?:all|any|every|previous|prior|earlier|past|its|their)\b(?!\s+(?:other|(?:[\w-]+\s+)?(?:country|countries|state|states)\b))/gi,
  /\b(?:more|fewer|less|worse|better|\w{3,}er)\b[^.;]{0,80}?\bthan\s+(?:at\s+|in\s+)?(?:any|ever|before|all)\b(?!\s+(?:other|(?:[\w-]+\s+)?(?:country|countries|state|states)\b))/gi,
  /\bfirst\s+time\b[^.;]{0,40}?\b(?:since|ever)\b/gi,
];

const TREND_UP =
  /\b(?:rose|rise[sn]?|rising|increas\w*|jump(?:ed|s|ing)?|climb(?:ed|s|ing)?|surg(?:e|es|ed|ing)|spik(?:e|es|ed|ing)|soar\w*|doubl\w*|tripl\w*|uptick\w*|upswing\w*|upturn\w*|grew|grow(?:s|ing|n)?|intensif\w*|tighten\w*|accelerat\w*|swell\w*|ramp(?:ed|s|ing)?\s+up)\b|\bup\s+(?:from|by|\d+|sharply|again|steeply)\b|\b(?:edg|tick|inch|creep|crept|nudg|mov)\w*\s+(?:up|higher)\b|\b(?:more|worse|higher|greater|larger|heavier|bigger)\b[^.;]{0,60}?\bthan\s+(?:last\s+week|the\s+(?:previous|prior|week|7\s+days)\b|a\s+week\s+(?:ago|earlier)|the\s+week\s+before)/gi;
const TREND_DOWN =
  /\b(?:fell|fall(?:s|ing|en)?|drop(?:ped|s|ping)?|declin\w*|decreas\w*|eas(?:ed|es|ing)|plung\w*|plummet\w*|slid(?:e|es|ing)?|slump\w*|halv\w*|dipp(?:ed|ing)|dips?|downtick\w*|downturn\w*|reced\w*|cool(?:ed|ing)|shr[iu]nk\w*)\b|\bdown\s+(?:from|by|\d+|sharply|again)\b|\b(?:edg|tick|inch|creep|crept|nudg|mov)\w*\s+(?:down|lower)\b|\b(?:fewer|lower|smaller|less|lighter|better)\b[^.;]{0,60}?\bthan\s+(?:last\s+week|the\s+(?:previous|prior|week|7\s+days)\b|a\s+week\s+(?:ago|earlier)|the\s+week\s+before)/gi;

interface Claim {
  kind: ClaimKind;
  direction: ClaimDirection;
  phrase: string;
  index: number;
}

/** The benign senses of "record": our record, the record shows, on the record, track record. */
function recordWordIsClaim(clause: string, index: number, phrase: string): boolean {
  if (!/^record\b/i.test(phrase)) return true;
  if (/[-\s](?:breaking|setting)$/i.test(phrase)) return true;
  const before = clause.slice(Math.max(0, index - 30), index);
  const after = clause.slice(index + phrase.length, index + phrase.length + 30);
  const claimNoun =
    /^[-\s]+(?:highs?|lows?|levels?|censorship|interference|blocking|weeks?|weekly|totals?|volumes?|counts?|shares?|loads?|peaks?|numbers?|\d)/i;
  if (claimNoun.test(after)) return true;
  if (
    /\b(?:set|sets|setting|hit|hits|hitting|broke|break|breaks|breaking|beat\w*|equal\w*|match\w*|tie[sd]?|smash\w*|shatter\w*|near|at)\s+(?:a\s+|the\s+|new\s+|its\s+|their\s+)?(?:[\w-]+\s+)?$/i.test(
      before,
    )
  )
    return true;
  if (/^\s+(?:of|shows?|showed|straight|book)\b/i.test(after)) return false;
  // "the measurement record", "the seismic record": the record as evidence.
  if (/\bthe\s+(?:[\w-]+\s+)?$/i.test(before)) return false;
  if (/\bon\s+$/i.test(before)) return false; // "on record": the superlative beside it is the claim
  if (
    /\b(?:our|track|the|for\s+the|off\s+the|public|published|seismic|ledger's|criminal|voting|their|his|her|its|a\s+matter\s+of)\s+$/i.test(
      before,
    )
  )
    return false;
  // What remains — "record censorship", "censorship record", "set a record",
  // "hit a record" — is a claim.
  return true;
}

/**
 * The comparisons in one clause. `lead` is the sentence before the clause, so
 * a negation that governs a list ("no headline, sanctions event, or
 * censorship surge") reaches the clause that holds the claim.
 */
function findClaims(clause: string, lead: string): Claim[] {
  const claims: Claim[] = [];
  const negatedAt = (index: number) => {
    const before = clause.slice(0, index);
    return NEGATED.test(before.slice(-40)) || NEGATED_LIST.test(`${lead} ${before}`);
  };
  const add = (kind: ClaimKind, re: RegExp, dirFrom: (p: string) => ClaimDirection) => {
    for (const m of clause.matchAll(re)) {
      const index = m.index ?? 0;
      if (negatedAt(index)) continue;
      if (kind === 'record' && !recordWordIsClaim(clause, index, m[0])) continue;
      // "double Iran's", "triple Russia's population": a comparison between
      // countries today, not a change over time.
      if (kind === 'trend' && /^(?:doubl|tripl)/i.test(m[0])) {
        const next = clause.slice(index + m[0].length, index + m[0].length + 40);
        if (/[A-Z][\w-]+(?:'s|’s)|\bthat\s+of\b|\bpopulation\b/.test(next)) continue;
      }
      claims.push({ kind, direction: dirFrom(m[0]), phrase: m[0], index });
    }
  };
  const recordDir = (p: string): ClaimDirection => (LOW_WORDS.test(p) ? 'low' : 'high');
  for (const re of RECORD_PATTERNS) add('record', re, recordDir);
  // "record low", "record-low": the direction is the word after "record".
  for (const c of claims) {
    if (/^record$/i.test(c.phrase) && /^[-\s]+lows?\b/i.test(clause.slice(c.index + c.phrase.length)))
      c.direction = 'low';
  }
  // A magnitude superlative (highest, largest, most) is historical unless it
  // is plainly a ranking across countries; any other "-est" word (busiest,
  // tightest — or nearest) only when the clause also points at the past.
  const temporal = TEMPORAL.test(clause) || POSSESSIVE_SUPERLATIVE.test(clause);
  const mag = MAGNITUDE_SUPERLATIVE.exec(clause);
  const sup = mag ?? SUPERLATIVE.exec(clause);
  // "well below its highest of 1.9%", "down from its peak": the superlative is
  // the reference point, and the claim is that today is NOT there. Only
  // below-markers: "higher than its highest", "greater than its highest level"
  // claim the opposite, and an independent re-check caught the first version
  // exempting them.
  const reference = (index: number) =>
    /\b(?:below|under|beneath|short\s+of|off|down\s+from)\s+(?:[\w-]+\s+){0,2}$/i.test(
      clause.slice(Math.max(0, index - 40), index),
    );
  if (sup && !negatedAt(sup.index) && !reference(sup.index)) {
    const historical = temporal || (mag !== null && !CROSS_SECTIONAL.test(clause));
    if (historical) claims.push({ kind: 'record', direction: recordDir(sup[0]), phrase: sup[0], index: sup.index });
  }
  // "hasn't been this high since…": a level compared with history.
  const level = /\b(?:this|so|as)\s+(high|low|heavy|intense|severe|widespread|many|much|few)\b/i.exec(clause);
  if (level && TEMPORAL.test(clause)) {
    claims.push({
      kind: 'record',
      direction: /low|few/i.test(level[1]) ? 'low' : 'high',
      phrase: level[0],
      index: level.index,
    });
  }
  add('trend', TREND_UP, () => 'high');
  add('trend', TREND_DOWN, () => 'low');
  return claims;
}

// --- Quantity --------------------------------------------------------------

const SHARE_CUE = /\bshare\b|%|\bpercent\w*|\bproportion\b|\bof\s+(?:\w+\s+){0,2}tests\b|\brate\b/i;
const COUNT_CUE =
  /\b(?:totals?|counts?|volumes?|numbers?|tally)\b|\d[\d,.]*\s*[kKmM]?\+?\s+(?:[\w-]+\s+){0,3}(?:measurements|blocks|tests)\b|\b(?:the|its|their)\s+most\b|\bmost[-\s]ever\b|^\s*(?:more|fewer)\b/i;

/** "measurements" is a count unless it is the denominator of a share ("33.6% of OONI measurements"). */
function bareMeasurements(text: string): boolean {
  for (const m of text.matchAll(/\bmeasurements\b/gi)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 24), m.index);
    if (!/\bof\s+(?:[\w-]+\s+){0,2}$/i.test(before)) return true;
  }
  return false;
}

/**
 * Where a contrast splits one clause into two statements: "the count rose …
 * while its share held". A change word belongs to the quantity on its own
 * side, so the honest volume reading — the prompt's own advice — is not
 * charged with a share claim it does not make.
 */
const CONTRAST =
  /\s+(?:while|whereas|but|although|though|yet)\s+|:\s+|\s+and\s+(?=(?:its|their|the)\s+(?:share|count|total)\b)/gi;

function segmentAround(clause: string, index: number): { text: string; offset: number } {
  let start = 0;
  let end = clause.length;
  for (const m of clause.matchAll(CONTRAST)) {
    const at = m.index ?? 0;
    if (at + m[0].length <= index) start = at + m[0].length;
    else if (at >= index) {
      end = at;
      break;
    }
  }
  return { text: clause.slice(start, end), offset: start };
}

const CHANGE_PERCENT =
  /\b(?:rose|rises|risen|rising|fell|falls|fallen|falling|jump(?:ed|s)?|climb(?:ed|s)?|grew|gain(?:ed|s)?|increas(?:ed|es)|decreas(?:ed|es)|declin(?:ed|es)|dropp?(?:ed|s)?|up|down)\s+(?:by\s+)?(?:about\s+|nearly\s+|some\s+)?\d+(?:\.\d+)?\s*%/gi;

function quantities(clause: string, c: Claim): ClaimQuantity[] {
  // Both sides of the claim, within its own side of any contrast, so
  // "Russia's OONI share jumped and its count too" needs both markers and a
  // share marker never carries a count claim beside it.
  const seg = segmentAround(clause, c.index);
  // "the count rose 6%": where the segment names a count, a percentage right
  // after the change word is the size of the change, not a share.
  const segCount = COUNT_CUE.test(seg.text) || bareMeasurements(seg.text);
  const read = (text: string): ClaimQuantity[] => {
    const q: ClaimQuantity[] = [];
    if (SHARE_CUE.test(segCount ? text.replace(CHANGE_PERCENT, ' ') : text)) q.push('share');
    if (COUNT_CUE.test(text) || bareMeasurements(text)) q.push('count');
    return q;
  };
  const at = c.index - seg.offset;
  const q = new Set([
    ...read(seg.text.slice(at, at + c.phrase.length + 45)),
    ...read(seg.text.slice(Math.max(0, at - 40), at)),
  ]);
  return q.size > 0 ? [...q] : ['share'];
}

// --- Countries ---------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** "Russia", "Russia's", "Russian", "Iranian", "Iraqi" — not "Nigeria" for "Niger". */
function names(text: string, country: string): boolean {
  return new RegExp(`\\b${escapeRe(country)}(?:'s|’s|n|ns|ian|ians|i|is)?\\b`).test(text);
}

// --- Gate ------------------------------------------------------------------

function sentences(text: string): string[] {
  return text
    .replace(/\*\*/g, '')
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z"“(\-–—•])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Clauses: at dashes, semicolons and commas. A subject line joins two stories
 * with a comma ("Russia and Iran set records, 67 forecasts settled today"),
 * and each half has its own topic.
 */
function clauses(sentence: string): string[] {
  const parts = sentence
    .split(/\s+[—–→]\s+|;\s+|\s+--\s+|,\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // A fragment of one or two words is a list item ("Russia, Iran and China
  // hit record censorship"): it belongs to the clause that follows.
  const out: string[] = [];
  let carry = '';
  for (const p of parts) {
    if (p.split(/\s+/).length <= 2) {
      carry = carry ? `${carry}, ${p}` : p;
      continue;
    }
    out.push(carry ? `${carry}, ${p}` : p);
    carry = '';
  }
  if (carry) out.push(carry);
  return out;
}

/** "51,000 blocks", "53k confirmed network blocks", "500 blocks/week". */
const UNIT_PATTERNS: RegExp[] = [
  /\b\d[\d,]*(?:\.\d+)?\s*[kK]?\+?\s+(?:(?:confirmed|network|OONI|OONI-confirmed|weekly|daily|censorship|blocking|internet|web|total|new)\s+){0,3}blocks\b(?!\s+(?:from|away|north|south|east|west)\b)/g,
  /\bblocks?\s*(?:\/|\s+per\s+|\s+a\s+)\s*(?:week|day|wk|hour)\b/gi,
];

const isOoniClause = (t: string) =>
  (OONI_WORDS.test(t) && !(SANCTIONS_BLOCKING.test(t) && !/\b(?:OONI|censor\w*|interference)\b/i.test(t))) ||
  (CENSORSHIP_WORD.test(t) && !CII_WORDS.test(t));

/**
 * @param monitoredCountries every country the brief scores (CII names), so a
 *   record claimed for a country with no OONI line ("Iraq hit record
 *   censorship, alongside Iran") is refused instead of being invisible.
 */
export function checkComparativeClaims(
  draft: string,
  context: string,
  monitoredCountries: readonly string[] = [],
): ComparativeClaimReport {
  const markers = parseRecordMarkers(context);
  const markerByName = new Map([...markers.values()].map((v) => [v.name, v.markers]));
  const known = [...new Set([...markerByName.keys(), ...monitoredCountries])];
  const unsupported: UnsupportedClaim[] = [];
  const unitViolations: string[] = [];

  for (const s of sentences(draft)) {
    for (const re of UNIT_PATTERNS) {
      for (const m of s.matchAll(re)) unitViolations.push(m[0]);
    }
    const sentenceCountries = known.filter((n) => names(s, n));
    const sentenceTopic = { ooni: isOoniClause(s), cii: CII_WORDS.test(s), other: OTHER_WORDS.test(s) };

    const conditional = CONDITIONAL.test(s);
    let lead = '';
    // The topic a clause with no topic words of its own inherits: the last
    // clause that had one ("OONI logged only 6 measurements, down from prior
    // weeks"), else the sentence.
    let inherited = sentenceTopic;

    for (const clause of clauses(s)) {
      const claims = findClaims(clause, lead);
      lead = `${lead} ${clause}`;
      const ownTopic = { ooni: isOoniClause(clause), cii: CII_WORDS.test(clause), other: OTHER_WORDS.test(clause) };
      const previousTopic = inherited;
      if (ownTopic.ooni || ownTopic.cii || ownTopic.other) inherited = ownTopic;
      if (claims.length === 0) continue;

      const own = known.filter((n) => names(clause, n));
      const clauseTopic = { ooni: isOoniClause(clause), cii: CII_WORDS.test(clause), other: OTHER_WORDS.test(clause) };
      const hasOwnTopic = clauseTopic.ooni || clauseTopic.cii || clauseTopic.other;
      // A clause with no topic words that names a country from the
      // censorship context ("Russia and Iran set records") is about
      // censorship; one that names none ("— the longest plateau we've
      // recorded") inherits.
      const ownCensored = own.some((n) => markerByName.has(n));
      // byName: censorship only because a censored country is named. Records
      // are checked there; changes ("Cuba, up 12") are not, because a bare
      // country with a move is a CII move far more often than an OONI one —
      // unless the clause names the OONI quantity ("its share rose").
      const namesQuantity = /\b(?:share|count)\b/i.test(clause);
      const byName = !hasOwnTopic && ownCensored && !namesQuantity;
      const topic = hasOwnTopic ? clauseTopic : byName ? { ooni: true, cii: false, other: false } : previousTopic;
      const cii = topic.cii;
      const namesCensoredCountry = (own.length > 0 ? own : sentenceCountries).some((n) => markerByName.has(n));
      const censorship = topic.ooni || (!topic.cii && !topic.other && namesCensoredCountry);

      if (!censorship) {
        const c = claims.find((x) => x.kind === 'record');
        if (c && SELF_HISTORY.test(clause)) {
          unsupported.push({ phrase: c.phrase, sentence: s, why: 'self-history claim outside the censorship section' });
        }
        continue;
      }

      const missing = new Set<string>();
      let firstPhrase = '';
      for (const c of claims) {
        // "rose" beside a CII deviation may be the deviation; a threshold,
        // "if" or "watch for" sentence states no change. Records are checked
        // regardless.
        if (
          c.kind === 'trend' &&
          (cii || conditional || byName || (!topic.ooni && namesCensoredCountry && !namesQuantity))
        )
          continue;
        // The claim's subject: the countries named before it in the clause
        // ("Iraq hit record censorship, alongside Iran" is about Iraq), else
        // after it, else anywhere in the sentence.
        const before = own.filter((n) => names(clause.slice(0, c.index), n));
        const countries = before.length > 0 ? before : own.length > 0 ? own : sentenceCountries;
        if (countries.length === 0) {
          missing.add('names no country');
          firstPhrase ||= c.phrase;
          continue;
        }
        // "doubled" and "tripled" claim a size of change, not just a direction.
        const multiple = /^doubl/i.test(c.phrase) ? 'count-doubled' : /^tripl/i.test(c.phrase) ? 'count-tripled' : null;
        for (const q of multiple ? (['count'] as ClaimQuantity[]) : quantities(clause, c)) {
          const need =
            multiple ??
            (c.kind === 'record'
              ? `${c.direction === 'high' ? 'highest' : 'lowest'}-${q}`
              : `${q}-${c.direction === 'high' ? 'up' : 'down'}`);
          for (const n of countries) {
            if (!markerByName.get(n)?.has(need)) {
              missing.add(`${n} lacks ${need}`);
              firstPhrase ||= c.phrase;
            }
          }
        }
      }
      if (missing.size > 0) unsupported.push({ phrase: firstPhrase, sentence: s, why: [...missing].join('; ') });
    }
  }

  return { unsupported, unitViolations, pass: unsupported.length === 0 && unitViolations.length === 0 };
}

/** The aiDebug label: the offending phrases, short enough for the log. */
export function comparativeClaimLabel(r: ComparativeClaimReport): string {
  const claims = r.unsupported
    .slice(0, 6)
    .map((u) => `"${u.phrase}" (${u.why})`)
    .join('; ');
  const unit = r.unitViolations.slice(0, 4).map((u) => `"${u}"`);
  return `comparative-claim-failed: claims=[${claims}] unit=[${unit.join(', ')}]`;
}
