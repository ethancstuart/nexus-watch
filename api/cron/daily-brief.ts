import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { channelsToAlert, formatAlertBody } from '../_lib/delivery-health.js';
import { raiseAlert, clearAlert } from '../_lib/alert.js';
import { archiveContent, editionFor, MECHANICAL_EDITION_LINE, type BriefEdition } from '../_lib/brief-edition.js';
import { groundDraft, type GroundingReport } from '../_lib/grounding.js';
import { checkComparativeClaims, comparativeClaimLabel } from '../_lib/comparative-claims.js';
import {
  summariseCensorship,
  formatCensorshipLine,
  censorshipWindowLabel,
  OONI_DAY_GRAIN_SINCE,
  type OoniDayRow,
} from '../_lib/censorship-context.js';
import {
  DAILY_SECTIONS,
  SUNDAY_SECTIONS,
  validateBriefStructure,
  parseDeclaredSubject,
  chooseSubject,
  fallbackSubject,
} from '../_lib/brief-structure.js';
import {
  formatLedgerSummary,
  toLedgerSummaryRow,
  correctedOutcomeOf,
  describeCorrections,
  CALIBRATION_KINDS,
  SCORED_STATUSES,
  type Call,
  type LedgerSummaryRow,
} from '../_lib/calls.js';
import { UNSUB_PLACEHOLDER } from '../_lib/unsubscribe-token.js';
import {
  buildRecordEdition,
  OPEN_LIST_CAP,
  RESOLVED_LIST_CAP,
  type BriefRecord,
  type OpenRead,
  type RecordCall,
  type ResolvedRead,
} from '../_lib/brief-record.js';
import { correctionsNewestFirst } from '../_lib/corrections.js';
import { checkBudget, recordAnthropicSpend } from '../_lib/llm-budget.js';
import { buildBriefRequest, readBriefReply, BRIEF_TIMEOUT_MS } from '../_lib/brief-model.js';
import {
  buildDryRunRecord,
  dryRunAlert,
  getBriefModelMode,
  newDryRunAttempt,
  recordDryRun,
  summariseGates,
  type SqlTag,
} from '../_lib/brief-dry-run.js';

export const config = { runtime: 'nodejs', maxDuration: 300 };

interface CIIEntry {
  code: string;
  name: string;
  /** Structural level (0-100) — changes only when baselines are reviewed. */
  score: number;
  /** Today's live deviation in points; the number that actually moves. */
  deviation: number;
  prevScore: number | null;
  prevDeviation: number | null;
  components: Record<string, number>;
}

interface MarketQuote {
  symbol: string;
  price: string;
  change: string;
  direction: 'up' | 'down' | 'flat';
}

export interface BriefData {
  date: string;
  utcTime: string;
  topRiskCountries: CIIEntry[];
  totalCountries: number;
  earthquakeCount: number;
  significantQuakes: string[];
  diseaseCount: number;
  recentOutbreaks: string[];
  conflictHeadlines: string[];
  markets: MarketQuote[];
  yesterdayEqCount: number | null;
  weeklyTrends: WeeklyTrend[];
  correlations: string[];
  newsHeadlines: NewsItem[];
  /** Pre-formatted open-call lines (divergence-ordered), for Today's Call. */
  openCallLines: string[];
  /**
   * Pre-formatted lines for calls RESOLVED in the current window (today, or
   * the last 7 days on Sundays). First line is always the aggregate.
   *
   * This field exists because of 2026-09-05: on the first resolution day in
   * the product's history, the model led with an unrelated FX call. It had no
   * way to do otherwise — the only calls query feeding the prompt selected
   * `status = 'pending'`, so the one thing the register exists to produce was
   * invisible to the writer the moment it existed.
   */
  resolvedCallLines: string[];
  /**
   * True only when the open-call query ran and succeeded on this run. Absent
   * or false means the book was not read, and the mechanical edition must not
   * call it empty. On 2026-11-23, the first day with no model key, the query
   * never ran and the edition printed "No open calls today." under a Ledger
   * line counting hundreds of open calls.
   */
  openCallsRead?: boolean;
  /**
   * True only when every resolved-call read ran and succeeded on this run.
   * Absent or false means the window was not read (a resolved-call query
   * failed, or the open-call read before them did), and the prompt must not
   * call it empty.
   */
  resolvedCallsRead?: boolean;
  /**
   * The record the mechanical edition is built from (api/_lib/brief-record.ts):
   * today's resolutions and the open book, each with its own read flag. Read on
   * every run by gatherRecord. Never part of the model's prompt, and never
   * archived on a model day. Absent means nothing was read, and the edition
   * says so rather than calling anything empty.
   */
  record?: BriefRecord;
}

/**
 * The prompt's OUR OPEN CALLS section when the open-call read failed. It used
 * to say "No open calls.", the words of a book read and found empty, and the
 * system prompt tells the model to write "No open calls today." when the
 * context lists none: a failed read could put that false sentence in a
 * model-written edition. This names the failure and forbids both sentences the
 * system prompt would otherwise reach for. A read that succeeds, with calls or
 * with none, gets the prompt it always had.
 */
const OPEN_CALLS_UNREAD_PROMPT =
  'Open calls could not be read today. Make no statement about open calls: do not say there are none, do not ' +
  'describe any, and do not write "No open calls today." or "No calls on the book this week."';

/**
 * The prompt's RESOLVED CALLS section when the resolved-call reads failed, or
 * never ran because the open-call read before them failed. It used to say "No
 * calls resolved today." ("this week" on Sunday), the words of a window read
 * and found empty, which is false on a resolution day. A read that succeeds,
 * with resolutions or with none, gets the prompt it always had.
 */
const RESOLVED_CALLS_UNREAD_PROMPT =
  'Resolved calls could not be read today. Make no statement about resolved calls: do not say none resolved, ' +
  'do not describe any, and do not write "No calls resolved today." or "No calls on the book this week."';

interface WeeklyTrend {
  name: string;
  code: string;
  scores: { date: string; score: number }[];
  currentScore: number;
  weekAgoScore: number | null;
  direction: 'rising' | 'falling' | 'stable' | 'volatile';
}

interface NewsItem {
  title: string;
  source: string;
}

// Critical infrastructure for proximity correlation detection
const CRITICAL_INFRA: { name: string; type: string; lat: number; lon: number }[] = [
  { name: 'Zaporizhzhia NPP', type: 'nuclear', lat: 47.51, lon: 34.58 },
  { name: 'Bushehr NPP', type: 'nuclear', lat: 28.83, lon: 50.89 },
  { name: 'Fukushima Daiichi', type: 'nuclear', lat: 37.42, lon: 141.03 },
  { name: 'Strait of Hormuz', type: 'chokepoint', lat: 26.56, lon: 56.25 },
  { name: 'Bab el-Mandeb', type: 'chokepoint', lat: 12.58, lon: 43.33 },
  { name: 'Suez Canal', type: 'chokepoint', lat: 30.46, lon: 32.34 },
  { name: 'Malacca Strait', type: 'chokepoint', lat: 2.5, lon: 101.8 },
  { name: 'Taiwan Strait', type: 'chokepoint', lat: 24.0, lon: 119.0 },
  { name: 'Panama Canal', type: 'chokepoint', lat: 9.08, lon: -79.68 },
  { name: 'Port of Shanghai', type: 'port', lat: 31.35, lon: 121.6 },
  { name: 'Port of Rotterdam', type: 'port', lat: 51.95, lon: 4.13 },
  { name: 'Port of Singapore', type: 'port', lat: 1.26, lon: 103.84 },
  { name: 'Ras Tanura Terminal', type: 'energy', lat: 26.64, lon: 50.15 },
  { name: 'Druzhba Pipeline Hub', type: 'energy', lat: 52.1, lon: 23.7 },
  { name: 'Kharg Island Terminal', type: 'energy', lat: 29.23, lon: 50.31 },
];

// OSINT + world news RSS feeds for headline context
/**
 * The brief's news roster.
 *
 * This was five English-language feeds — Bellingcat, Crisis Group, BBC World,
 * Al Jazeera, DW — for a product that claims a global view. 109 of the first
 * 133 briefs mentioned Bellingcat and one recent edition drew 5 of 5 "top
 * stories" from it, including a football-betting piece. Bellingcat is an
 * investigations shop on a multi-week cadence: excellent, and the wrong tempo
 * to drive a daily. Measured coverage across 120 briefs: Iran 120, Mexico 5,
 * Nigeria 8, DR Congo 7.
 *
 * EVERY FEED BELOW WAS FETCHED AND CONFIRMED TO RETURN ITEMS before being
 * added. Candidates that failed are recorded in the gap note rather than
 * added hopefully — an empty source is how V-Dem ended up cited on the landing
 * page for four months while its table held zero rows.
 *
 * STATE MEDIA IS INCLUDED AND TAGGED. It is never a fact source. What a state
 * outlet chooses to emphasise is evidence of that state's posture, which is
 * a different and genuinely useful observable — but it may only ever be cited
 * as "TASS is framing X as Y", never as "X happened". The tag is what makes
 * that rule enforceable in the prompt.
 *
 * KNOWN GAP, stated rather than papered over: there is no wire service here.
 * AP, Reuters, ISW, the Kyiv Independent and Times of Israel were all tested
 * and all failed (connection failure, 403, or 404). A daily brief without a
 * wire is a real weakness and it should be closed with a paid or authenticated
 * feed rather than by pretending.
 */
type BriefFeed = { url: string; source: string; region: string; stateMedia?: true };

const BRIEF_RSS_FEEDS: BriefFeed[] = [
  // Investigative and analytic
  { url: 'https://www.bellingcat.com/feed/', source: 'Bellingcat', region: 'global' },
  { url: 'https://www.crisisgroup.org/rss.xml', source: 'Crisis Group', region: 'global' },
  // Anglophone internationals
  { url: 'https://feeds.bbci.co.uk/news/world/rss.xml', source: 'BBC World', region: 'global' },
  { url: 'https://www.aljazeera.com/xml/rss/all.xml', source: 'Al Jazeera', region: 'mena' },
  { url: 'https://rss.dw.com/xml/rss-en-all', source: 'DW', region: 'europe' },
  // Regional origin — the actual gap
  { url: 'https://www.thehindu.com/news/international/feeder/default.rss', source: 'The Hindu', region: 'south-asia' },
  { url: 'https://asia.nikkei.com/rss/feed/nar', source: 'Nikkei Asia', region: 'east-asia' },
  { url: 'https://www.scmp.com/rss/91/feed', source: 'SCMP', region: 'east-asia' },
  { url: 'https://www.premiumtimesng.com/feed', source: 'Premium Times', region: 'west-africa' },
  { url: 'https://www.dailymaverick.co.za/dmrss/', source: 'Daily Maverick', region: 'southern-africa' },
  { url: 'https://www.batimes.com.ar/feed', source: 'Buenos Aires Herald', region: 'latam' },
  { url: 'https://en.mercopress.com/rss/', source: 'MercoPress', region: 'latam' },
  { url: 'https://meduza.io/rss/en/all', source: 'Meduza', region: 'russia' },
  // State media — posture, never fact
  { url: 'https://tass.com/rss/v2.xml', source: 'TASS', region: 'russia', stateMedia: true },
  { url: 'https://www.globaltimes.cn/rss/outbrain.xml', source: 'Global Times', region: 'china', stateMedia: true },
  { url: 'https://en.irna.ir/rss', source: 'IRNA', region: 'iran', stateMedia: true },
];

/** Source names that may only be cited as evidence of state framing. */
const STATE_MEDIA_SOURCES = new Set(BRIEF_RSS_FEEDS.filter((f) => f.stateMedia).map((f) => f.source));

// === The NexusWatch Brief — AI Prompt ===
export function getBriefSystemPrompt(now: Date): string {
  // UTC day index. 0=Sun, 1=Mon ... 5=Fri, 6=Sat. The cron runs at 10:00 UTC
  // (5:00 AM ET) so UTC day and US-East day match for the whole publication.
  const dayOfWeek = now.getUTCDay();
  const isSunday = dayOfWeek === 0;
  // Friday tool-of-the-week is gone with One More Thing (structure swap
  // 2026-08-23); neither the prompt nor the fallback varies by weekday now.

  // ---------------------------------------------------------------------------
  // Base voice — the 40/60 analyst/smart-friend rubric locked 2026-04-11.
  // Source of truth: docs/voice/nexuswatch-voice.md (Track C.0 Voice Model).
  // Changes here must stay in sync with the voice spec or the drafting engine
  // (Track C) and the newsletter will drift apart.
  // ---------------------------------------------------------------------------
  const baseVoice = `You are the editorial voice of The NexusWatch Brief, a daily geopolitical intelligence newsletter read by traders, analysts, founders, and curious professionals over morning coffee.

VOICE — 40% analyst / 60% smart friend. Get this right:
- You are a smart, well-connected friend who happens to run a global intelligence platform.
- Use "we" as the brand pronoun. "We're watching Iran closely" / "We flagged this yesterday." Never "I", never reference a specific founder or author.
- Conversational but credible — like a Bloomberg reporter at a dinner party, not a cable news anchor.
- Show personality on big days: "Okay, this one's worth your attention" / "This caught our eye" / "Big day."
- Every sentence must pass the "would I actually say this to a smart friend?" test.
- Brevity is respect. Every sentence earns its place. Target ~800-1000 words total.

FORBIDDEN PHRASES (auto-reject and rewrite if any appear):
- "geopolitical landscape"
- "in the realm of"
- "it remains to be seen"
- "remains a concern"
- "amid growing tensions"
- "tensions are rising"
- "experts say" / "analysts say" / "sources say"
- "a major development"
- "unprecedented"
- Any sentence that sounds like a government report, a college essay, or a LinkedIn post.

AUDIENCE: Global professionals — traders, analysts, founders, policy people, OSINT enthusiasts, journalists, corporate risk managers, defense-industry watchers. Frame events for a sophisticated, internationally-minded audience.

EDITORIAL STANCE — procedure, not position (owner ruling 2026-08-22):
We do not have a side. We have resolution criteria. Neutrality is enforced by
these mechanisms, every one of which a reader can check:
- THE ACTOR-SWAP TEST. Before writing any sentence about a state's behaviour,
  confirm you would publish the identical sentence with the actor names
  exchanged. If you would not, rewrite it. Apply this to every conflict
  sentence without exception.
- SYMMETRIC SOURCING. On any state-versus-state item, draw on at least one
  source from each side's information environment plus one third party, and
  name them in the text.
- NAME THE GAPS. Where the data is thin, say so and say where. "We have no
  reliable displacement data past March — treat this as low confidence" builds
  more trust than hedged prose.
- FACTS OF LAW AND OF THE RECORD ARE FACTS, NOT POSITIONS. An invasion is an
  invasion; a designation is a designation; a court ruling is a court ruling.
  Report the noun. Do not supply the adjective.
- Do NOT editorialize on which side is justified. Present what happened, cite
  the source, explain why it matters.
- Energy analysis covers global supply-chain dynamics, not any nation's interests.
- Epistemic humility IS the brand. When confidence is low, say so.

ATTRIBUTION: You are NexusWatch — the platform IS the source. Don't attribute to "reports say" or "according to sources." When referencing a specific investigation or report (Bellingcat, Crisis Group, ISW), name it. Otherwise, state facts with authority.

CRITICAL RULES:
- NEVER fabricate events, names, or claims not in the data. If the data doesn't support it, don't write it.
- NO SELF-HISTORY. Never write "the biggest move we've logged this year", "the
  last time we saw this", or compare to any past NexusWatch observation. This
  archive begins 2026-04-08 and holds no such history, so every one of those
  sentences has been invented — including a "2018 Sulawesi moved the CII
  equivalent by 28 points" that predates the product by eight years. A brief
  whose entire claim is a published record cannot invent its own record.
  The one exception is the censorship comparison the context computes for you
  (previous 7 days, highest share, MARKERS); see below.
- NO RETROSPECTIVE CLAIMS AT ALL unless the item is in today's context. No past
  price moves, no historical analogies, no "in 2019...". You cannot check them
  and neither can the reader.
- ATTRIBUTE IN THE SENTENCE, not in a footnote. Any non-trivial factual claim
  names its source inline: "OONI confirmed N test measurements in Russia
  as blocked this week", not "Russia is tightening controls". Never name a
  source that is not in the context — published briefs have carried "ACLED
  reports 400+ civilian casualties" when ACLED has never been contacted by this
  system.
- SEPARATE OBSERVED FROM ASSESSED. "OONI recorded X" is observed. "We read the
  higher count as more testing, since the share did not move" is assessed, and
  assessment carries a confidence word and a reason: "moderate confidence —
  single source, no corroboration yet."
- DO synthesize and connect dots — this is analysis, not aggregation.
- LEAD WITH STATE BEHAVIOUR. The Top Signal covers something a government,
  bloc or armed actor DID or DECIDED — a designation, a vote, a deployment, a
  blocking order, a negotiation, a court ruling. A natural event leads only when
  it has crossed a consequence threshold: major damage, population displacement,
  or disruption to energy, nuclear, port or cable infrastructure. "An earthquake
  occurred 180km from a facility" is a distance calculation, not news.
- The POLITICAL SIGNAL section is the highest-value input in the data context.
  Use it for what it measures: how often OONI's volunteer tests found sites
  blocked, and how that compares with the previous week. It does not say why,
  who ordered it, which services, or what follows. Never present censorship as
  a predictor of a crackdown, protest or arrest; nothing in the context
  supports that.
- CENSORSHIP NUMBERS ARE MEASUREMENTS. Each OONI figure counts test
  measurements (one volunteer probe testing one site once) that OONI confirmed
  as blocked. It goes up when volunteers run more tests, with no change in
  censorship. Write "N measurements confirmed blocked", never "N blocks",
  "network blocks", or a number of sites, services or events. Give the share
  (confirmed of total), which is the comparable figure, beside the count. Name
  no service, ISP or category the context does not list.
- COMPARISONS ONLY WHERE MARKED. About censorship, write a record or a high
  ("record", "highest", "new high", "peak", "all-time", "since launch") only
  when that country's context line carries highest-share or highest-count
  (lowest-… for a low), and then state the span the section header gives
  ("the highest 7-day share since 2026-09-12"). Write a change against last
  week ("rose", "fell", "spiked", "up from") only when the line carries
  share-up, share-down, count-up or count-down ("doubled" needs count-doubled,
  "tripled" count-tripled). A share claim needs a share
  marker and a count claim a count marker. A higher count with a flat share is
  more testing, not more censorship. A draft that makes an unmarked
  comparison, or calls measurements "blocks", is refused before it reaches a
  reader.
- Be specific: numbers, country names, magnitudes, percentages.
- If data is thin on a topic, say less, not vaguer things.
- "Your Watchlist" is NOT generated by you. Ignore any user-specific content in your output — the template layer appends a per-user Watchlist section after your output.`;

  // ---------------------------------------------------------------------------
  // Sunday variant — Week in Review. Reflective, trajectory-focused.
  // ---------------------------------------------------------------------------
  if (isSunday) {
    return `${baseVoice}

OUTPUT FORMAT: Clean markdown. Use ## for section headers with emoji prefixes. **bold** for emphasis. Numbered lists for stories. Bullet points for outlook.

THIS IS THE SUNDAY WEEK IN REVIEW EDITION. Different structure from daily briefs — reflective, trajectory-focused.

FIRST LINE OF YOUR OUTPUT — before any section header — must be exactly one line
in this form:

SUBJECT: <the email subject line for today's issue>

Rules for it: 40-65 characters. It names the specific thing that happened today,
in plain words a busy professional would understand at a glance in an inbox. No
markdown, no date, no publication name, no section label, no colon-prefixed
category. It is a headline, not a topic.
Good:  We are calling Thailand at 52% against a 70% base rate
Bad:   Why it matters          (a transition phrase, not a story)
Bad:   Thailand                (a label, not a headline)
Bad:   NexusWatch Brief for Friday   (says nothing)

STRUCTURE (follow exactly — six sections, do NOT add, drop or reorder; the
template inserts the mechanical Ledger line above your output):

${SUNDAY_SECTIONS[0]}
2-3 sentences. Warm, reflective. "Happy Sunday. Here's what mattered this week — and what we're watching heading into Monday."

${SUNDAY_SECTIONS[1]}
The week on the record. From the RESOLVED CALLS section of the context: the aggregate line verbatim (settled, hits, misses, grace-held), then the two or three most informative resolutions with our stated probability and base rate beside each outcome — where we were right cheaply, where we were wrong confidently. Then from OUR OPEN CALLS: the single most divergent open call restated in one sentence with its probability, base rate and resolution date. Every number verbatim from the context. If both sections are empty, write exactly: "No calls on the book this week." Never invent a call.

${SUNDAY_SECTIONS[2]}
5-7 of the biggest stories from the past 7 days. Each story gets:
- A **bold headline**
- 2-3 sentences: what happened, how it developed over the week, where it stands now
- Focus on TRENDS and TRAJECTORIES, not isolated events

${SUNDAY_SECTIONS[3]}
The week's state of the board, three parts in one section:
- **Movers** — the 5-6 countries that moved most over 7 days. Format: **Country** CII_SCORE (▲+N or ▼-N) — driver. THE DRIVER MUST COME FROM THE CONTEXT OR NOT BE GIVEN: if nothing in the context explains a move, write exactly "driver not identified in this week's data." and stop.
- **Markets** — weekly moves connected to geopolitical developments. THE MARKET LINES ARE ETF SHARE PRICES, NOT THE UNDERLYING — quote the instrument as named, never restate as the underlying's level, and percentage moves are PERCENT, never "basis points".
- End the section with one line: **What would change our mind:** the single concrete, checkable observation that would most revise our current top read. It must name a source that appears in the context (OONI, an FX rate, a headline). Falsifiable, dated where possible, never a vibe.

${SUNDAY_SECTIONS[4]}
2-4 bullets of disciplined silence — the section where restraint is the content:
- Moves we are NOT explaining because no driver is identified.
- Narratives circulating this week that the data cannot support — cite the item ("[TASS · STATE MEDIA] is framing X as Y; nothing in OONI or the wires corroborates it").
- Data gaps: feeds down, stale, or missing, named plainly.
Never speculate under the guise of restraint. If there is nothing to withhold, say "Nothing withheld this week — the data covered what moved."

${SUNDAY_SECTIONS[5]}
5-6 things to watch Monday through Friday. Specific events, thresholds, and dates. This section should feel like a Monday morning prep sheet.
Never frame a censorship watch item as a record in waiting ("would be the longest", "would mark a new high"): give the threshold and the date, not a superlative.`;
  }

  // ---------------------------------------------------------------------------
  // Daily variant (Mon-Sat) — the locked 7-section structure from Apr 10
  // Decision 5, plus the Friday-only "Tool of the Week" eighth section from
  // the same decision. "Your Watchlist" is template-level (Track A.9), not
  // part of the Sonnet output. Space & Tech is deliberately omitted — it
  // wasn't in the Apr 10 Decision 5 locked structure.
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Daily variant (Mon-Sat) — the accountability loop (owner decision
  // 2026-08-23): Ledger (mechanical) → Today's Call → Top Signal → The Board
  // (with the mandatory "what would change our mind" clause) → What We're Not
  // Saying → The Long Fuse. Scenario Spotlight and One More Thing are killed —
  // an unfalsifiable hypothetical undermines a graded product, and a section
  // that advertises the product isn't a section. Headers come from
  // brief-structure.ts, the same constants the publish gate validates against.
  // ---------------------------------------------------------------------------
  return `${baseVoice}

OUTPUT FORMAT: Clean markdown. Use ## for section headers with emoji prefixes. **bold** for emphasis. Numbered lists for stories. Bullet points for outlook. NO HTML.

FIRST LINE OF YOUR OUTPUT — before any section header — must be exactly one line
in this form:

SUBJECT: <the email subject line for today's issue>

Rules for it: 40-65 characters. It names the specific thing that happened today,
in plain words a busy professional would understand at a glance in an inbox. No
markdown, no date, no publication name, no section label, no colon-prefixed
category. It is a headline, not a topic.
Good:  We are calling Thailand at 52% against a 70% base rate
Bad:   Why it matters          (a transition phrase, not a story)
Bad:   Thailand                (a label, not a headline)
Bad:   NexusWatch Brief for Friday   (says nothing)

STRUCTURE (follow exactly — five sections, do NOT add, drop or reorder; the
template inserts the mechanical Ledger line above your output):

${DAILY_SECTIONS[0]}

FIRST check the RESOLVED CALLS section of the context. If it lists anything,
LEAD WITH THE RECORD: state the aggregate line verbatim (how many settled,
hits, misses, and any still pending under the grace rule), then the single
most informative resolution — the one listed first — with our stated
probability and its base rate beside the outcome. A model that publishes
dated, falsifiable calls and then buries the day they settle is doing public
relations, not forecasting; the settled record ALWAYS outranks a new call.
Then, IF the OUR OPEN CALLS section lists anything, one further sentence
with the top open call; if it lists nothing, end the section after the
record — never invent an open call to fill the slot.

If RESOLVED CALLS is empty: the one call we are making today, from the OUR
OPEN CALLS section of the context — pick the call listed FIRST (they arrive
ordered by divergence from the base rate; the first is where we are saying
the most). Restate it in 1-2 sentences: the country, the claim, our
probability, the base rate beside it, and the resolution date.

Every number verbatim from the context. If the context lists no calls at
all, write exactly: "No open calls today." Never invent a call, never adjust
a probability, never editorialise the criterion.

${DAILY_SECTIONS[1]}

Lead with the single most important story of the day. This is the hero.
- 1 sentence hook that makes the reader stop scrolling (the "hey, you seeing this?" moment)
- 2-3 sentences on what happened (specific: names, numbers, places, sources)
- 2-3 sentences on why it matters (the "so what" for the reader's world — portfolio, policy, safety)
- Cite the source when referencing investigations (Bellingcat, Crisis Group, ISW, etc.)

If it's a quiet day, lead with the most interesting pattern or trend from the CII data, NOT a recap of yesterday's news.

${DAILY_SECTIONS[2]}

The day's state of the board — three parts inside one section, then the clause:

**Movers** — the countries that moved most in 24h. Data, not narrative.
Format each as: **Country** CII_SCORE (▲+N or ▼-N) — driver. Show 4-6, sorted by absolute change.

THE DRIVER MUST COME FROM THE CONTEXT OR NOT BE GIVEN. This is the strictest
rule in the brief and it overrides every stylistic instruction above.
- A driver is permitted ONLY when a named, dated item in the data context
  supports it — a headline, a censorship measurement, a sanctions event, a
  quake. Name that source in the line.
- If nothing in the context explains the move, write exactly:
  "driver not identified in today's data." Then stop. Do not speculate, do not
  offer alternatives, do not write "likely", "possible", "or", or "awaiting
  confirmation". An unexplained move is a true and publishable thing to report.
- Most CII moves have no external driver. Several components are static
  baselines and the disasters component decays as a rolling 24-hour feed ages
  out, so a fall is usually decay rather than de-escalation. Never narrate
  decay as an event.

Correct, with evidence:  **Iran** 61 (▲+4) — OONI confirmed 1,611 of 9,800 measurements as blocked (16.4%) in the last 7 days, up from 3.6% the 7 days before.
Correct, without:        **South Korea** 13 (▲+8) — driver not identified in today's data.

**Crises** — active crises and escalation risks, 2-4 bullets max, each: **bold
label** → 1-2 sentences on status and what to watch. Only genuine crises: a
live deviation ≥ 8, or a structurally severe country (level ≥ 80) with any
live deviation today. A high structural level ALONE is not a crisis — it is a
standing fact. If none qualify, write "No active crisis triggers today."

**Markets** — 2-4 sentences. THE MARKET LINES ARE ETF SHARE PRICES, NOT THE
UNDERLYING. They are labelled as such in the context — "Crude oil ETF (USO)",
"Dollar index ETF (UUP)". Never restate one as the underlying's level: USO's
share price is not the price of a barrel and UUP's is not the dollar index.
Quote the instrument as named, or describe the direction and size of the move
without asserting a level. Percentage moves in a share price are PERCENT,
never "basis points" — basis points measure yield, and using them for an
equity price move is both wrong and the fastest way to lose a reader who
trades. Reference chokepoints (Hormuz, Bab el-Mandeb, Suez, Malacca) when
relevant. What's priced in vs. what's a surprise?

End the section with one line: **What would change our mind:** the single
concrete, checkable observation that would most revise today's top read. It
must name a source that appears in the context (OONI, an FX rate, a headline,
a CII component). Falsifiable, dated where possible, never a vibe.

${DAILY_SECTIONS[3]}

2-4 bullets of disciplined silence — the section where restraint is the content:
- Moves we are NOT explaining, because no driver is identified in the data.
- Narratives circulating today that the data cannot support — cite the item
  ("[TASS · STATE MEDIA] is framing X as Y; nothing in OONI or the wires
  corroborates it"). State framing is quotable AS framing here, never as fact.
- Data gaps, named plainly: a feed down, a series stale, a country unscored.
Never speculate under the guise of restraint — "we can't yet confirm the coup"
implies a coup. If there is nothing to withhold, write "Nothing withheld today
— the data covered what moved."

${DAILY_SECTIONS[4]}

One slow-building development, 2-3 sentences — something visible in the 7-day
trajectories, the censorship series, or repeated headlines, that is weeks from
mattering rather than hours. Forward-looking and conditional ("if X continues
through month-end, Y"). Y is something the data will show (a call resolving, a
threshold crossed), never a crackdown, protest, arrest or attack that the
censorship figures are said to foretell: they do not foretell anything.
Never frame the censorship series as a record in waiting: no "would be the
longest", "would mark the highest", "record" or "new high" in a forecast.
Give the threshold and the date instead.
NO HISTORICAL PRECEDENTS. Do not cite past events, past price moves, or past
NexusWatch observations here or anywhere else in the brief, beyond the
censorship comparison the context computes. A precedent
recalled from memory is unverifiable, and the attribution rules forbid hedging
it, so the two instructions together would manufacture confident false
statements. Nothing retrospective.`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireCron(req, res)) return;
  const dbUrl = process.env.DATABASE_URL;
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  try {
    const sql = neon(dbUrl);
    const now = new Date();
    // Sunday drives both the prompt variant (weekly recap) and the resolved-
    // calls window (7 days, so "the week on the record" is answerable).
    const isSunday = now.getUTCDay() === 0;
    const today = now.toISOString().split('T')[0];
    const utcTime = `${now.getUTCHours().toString().padStart(2, '0')}:${now.getUTCMinutes().toString().padStart(2, '0')} UTC`;

    // Opaque but sortable run identifier shared by every channel's delivery-log
    // row for this cron invocation. See docs/migrations/2026-04-11-brief-delivery-log.sql
    // and Track A.4 in NEXUSWATCH-COMPLETION-PLAN.md.
    const runId = `${today}-${Date.now()}`;

    /**
     * Write one row to brief_delivery_log. Fire-and-forget from the caller's
     * perspective — logDelivery swallows its own errors so a logging failure
     * never breaks the cron. Keep `error` strings short; truncate to 500 chars
     * to avoid storing multi-KB API response bodies in Postgres.
     */
    async function logDelivery(params: {
      channel: 'archive' | 'resend' | 'notion';
      status: 'success' | 'failed' | 'partial';
      recipientCount?: number;
      failedCount?: number;
      error?: string;
      latencyMs: number;
      metadata?: Record<string, unknown>;
    }): Promise<void> {
      try {
        const errTruncated = params.error ? params.error.slice(0, 500) : null;
        const metaJson = params.metadata ? JSON.stringify(params.metadata) : null;
        await sql`
          INSERT INTO brief_delivery_log
            (run_id, brief_date, channel, status, recipient_count, failed_count, error, latency_ms, metadata)
          VALUES
            (${runId}, ${today}, ${params.channel}, ${params.status},
             ${params.recipientCount ?? null}, ${params.failedCount ?? null},
             ${errTruncated}, ${params.latencyMs}, ${metaJson})
        `;
      } catch (logErr) {
        console.error(
          '[daily-brief] logDelivery insert failed (non-fatal):',
          logErr instanceof Error ? logErr.message : logErr,
        );
      }
    }

    // === Atomic idempotency guard (P0 dedup fix, 2026-04-18) ===
    // Uses INSERT ON CONFLICT to atomically claim today's brief slot.
    // If another invocation already inserted a row for today, the INSERT
    // returns 0 rows and we skip. No race window.
    const claimed = await sql`
      INSERT INTO daily_briefs (brief_date, content, summary)
      VALUES (${today}, '{"pending":true}', 'generating...')
      ON CONFLICT (brief_date) DO NOTHING
      RETURNING brief_date
    `;
    if (claimed.length === 0) {
      console.log(`[daily-brief] Brief for ${today} already claimed — skipping (atomic dedup).`);
      return res.status(200).json({
        success: true,
        skipped: true,
        reason: `Brief for ${today} already generated or in progress.`,
        runId,
      });
    }

    // === Parallel data fetch ===
    const [
      ciiResult,
      prevCiiResult,
      earthquakeResult,
      diseaseResult,
      conflictResult,
      marketResult,
      yesterdaySnapResult,
      weeklyHistoryResult,
      newsResult,
    ] = await Promise.allSettled([
      // 1. Current CII scores
      sql`
        SELECT DISTINCT ON (country_code) country_code, country_name, score, components,
               COALESCE((components->>'deviation')::float, 0) AS deviation
        FROM country_cii_history ORDER BY country_code, timestamp DESC
      `,
      // 2. Yesterday's CII for trend arrows (deviation is what moves post-split)
      sql`
        SELECT DISTINCT ON (country_code) country_code, score,
               COALESCE((components->>'deviation')::float, 0) AS deviation
        FROM country_cii_history
        WHERE timestamp < NOW() - INTERVAL '20 hours'
        ORDER BY country_code, timestamp DESC
      `,
      // 3. Earthquakes
      fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson', {
        signal: AbortSignal.timeout(10000),
      }).then((r) => (r.ok ? r.json() : null)),
      // 4. Disease outbreaks
      fetch('https://www.who.int/api/news/diseaseoutbreaknews?$top=10&$orderby=PublicationDate%20desc', {
        signal: AbortSignal.timeout(10000),
      }).then((r) => (r.ok ? r.json() : null)),
      // 5. Conflict headlines (GDELT — may be blocked)
      fetch(
        'https://api.gdeltproject.org/api/v2/doc/doc?query=attack%20OR%20airstrike%20OR%20ceasefire%20OR%20war%20OR%20sanctions&mode=artlist&maxrecords=15&timespan=1440min&format=json&sort=DateDesc',
        { signal: AbortSignal.timeout(10000) },
      ).then(async (r) => {
        if (!r.ok) return null;
        const text = await r.text();
        if (text.startsWith('Please limit')) return null;
        return JSON.parse(text);
      }),
      // 6. Markets
      (async () => {
        const apiKey = process.env.TWELVEDATA_API_KEY;
        if (!apiKey) return null;
        const r = await fetch(`https://api.twelvedata.com/quote?symbol=SPY,GLD,USO,UNG,XLE,UUP,TLT&apikey=${apiKey}`, {
          signal: AbortSignal.timeout(8000),
        });
        return r.ok ? r.json() : null;
      })(),
      // 7. Yesterday's earthquake snapshot for comparison
      sql`
        SELECT feature_count FROM event_snapshots
        WHERE layer_id = 'earthquakes' AND timestamp > NOW() - INTERVAL '36 hours'
        ORDER BY timestamp ASC LIMIT 1
      `,
      // 8. 7-day CII history for trend analysis
      sql`
        SELECT country_code, country_name,
               COALESCE((components->>'deviation')::float, 0) AS deviation,
               timestamp::date as day
        FROM country_cii_history
        WHERE timestamp > NOW() - INTERVAL '7 days'
        ORDER BY country_code, timestamp DESC
      `,
      // 9. OSINT + world news headlines
      fetchNewsHeadlines(),
    ]);

    // === Process results ===
    const ciiRows = ciiResult.status === 'fulfilled' ? (ciiResult.value as Record<string, unknown>[]) : [];
    const prevCiiRows = prevCiiResult.status === 'fulfilled' ? (prevCiiResult.value as Record<string, unknown>[]) : [];
    const prevScoreMap = new Map(prevCiiRows.map((r) => [r.country_code as string, r.score as number]));
    const prevDevMap = new Map(prevCiiRows.map((r) => [r.country_code as string, Number(r.deviation ?? 0)]));

    const allCII: CIIEntry[] = ciiRows
      .map((r) => ({
        code: r.country_code as string,
        name: r.country_name as string,
        score: r.score as number,
        deviation: Number(r.deviation ?? 0),
        prevScore: prevScoreMap.get(r.country_code as string) ?? null,
        prevDeviation: prevDevMap.get(r.country_code as string) ?? null,
        components: r.components as Record<string, number>,
      }))
      // Ranked by structural level, deviation as tiebreak — the "top risk"
      // list is about the level; the movers list below is about the day.
      .sort((a, b) => b.score - a.score || b.deviation - a.deviation);
    const topCII = allCII.slice(0, 10);

    // Biggest movers — by DEVIATION change. Post-split the structural score
    // is deliberately static, so a score delta would always be zero; what
    // moves day to day is the live deviation.
    const movers = allCII
      .filter((c) => c.prevDeviation !== null)
      .map((c) => ({ ...c, delta: c.deviation - (c.prevDeviation ?? 0) }))
      .filter((c) => Math.abs(c.delta) >= 3)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 5);

    // Earthquakes
    let earthquakeCount = 0;
    let significantQuakes: string[] = [];
    if (earthquakeResult.status === 'fulfilled' && earthquakeResult.value) {
      const qData = earthquakeResult.value as { features: Array<{ properties: { mag: number; place: string } }> };
      earthquakeCount = qData.features?.length || 0;
      significantQuakes = (qData.features || [])
        .filter((f) => f.properties.mag >= 4.5)
        .sort((a, b) => b.properties.mag - a.properties.mag)
        .slice(0, 5)
        .map((f) => `M${f.properties.mag.toFixed(1)} — ${f.properties.place}`);
    }

    const yesterdayEqCount =
      yesterdaySnapResult.status === 'fulfilled' && (yesterdaySnapResult.value as Record<string, unknown>[]).length > 0
        ? ((yesterdaySnapResult.value as Record<string, unknown>[])[0].feature_count as number)
        : null;

    // Disease
    let diseaseCount = 0;
    let recentOutbreaks: string[] = [];
    if (diseaseResult.status === 'fulfilled' && diseaseResult.value) {
      const dData = diseaseResult.value as { value: Array<{ Title: string }> };
      diseaseCount = dData.value?.length || 0;
      recentOutbreaks = (dData.value || []).slice(0, 5).map((o) => o.Title);
    }

    // Conflict
    let conflictHeadlines: string[] = [];
    if (conflictResult.status === 'fulfilled' && conflictResult.value) {
      const cData = conflictResult.value as { articles?: Array<{ title: string; url: string }> };
      conflictHeadlines = (cData.articles || []).slice(0, 10).map((a) => a.title);
    }

    // Markets
    const markets: MarketQuote[] = [];
    if (marketResult.status === 'fulfilled' && marketResult.value) {
      const mData = marketResult.value as Record<string, { close?: string; percent_change?: string }>;
      // Honest instrument names. These are ETF SHARE PRICES, and the prompt's
      // market rules assume the context says so — until 2026-08-23 this map
      // said "Crude Oil" and "USD Index", handing the model the exact
      // misstatement the rules forbid.
      const labels: Record<string, string> = {
        SPY: 'S&P 500 ETF (SPY)',
        GLD: 'Gold ETF (GLD)',
        USO: 'Crude oil ETF (USO)',
        UNG: 'Nat gas ETF (UNG)',
        XLE: 'Energy sector ETF (XLE)',
        UUP: 'Dollar index ETF (UUP)',
        TLT: 'Treasury bond ETF (TLT)',
      };
      for (const [sym, q] of Object.entries(mData)) {
        if (q?.close) {
          const pct = parseFloat(q.percent_change || '0');
          markets.push({
            symbol: labels[sym] || sym,
            price: `$${parseFloat(q.close).toFixed(2)}`,
            change: `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`,
            direction: pct > 0.1 ? 'up' : pct < -0.1 ? 'down' : 'flat',
          });
        }
      }
    }

    // 7-day CII trends
    const weeklyTrends: WeeklyTrend[] = [];
    if (weeklyHistoryResult.status === 'fulfilled') {
      const histRows = weeklyHistoryResult.value as Record<string, unknown>[];
      // Trajectories track the DEVIATION (post-split) — a 7-day structural
      // trajectory is flat by construction and would say nothing.
      const byCountry = new Map<string, { name: string; entries: { date: string; score: number }[] }>();
      for (const r of histRows) {
        const code = r.country_code as string;
        const entry = byCountry.get(code) || { name: r.country_name as string, entries: [] };
        entry.entries.push({ date: String(r.day), score: Number(r.deviation ?? 0) });
        byCountry.set(code, entry);
      }
      // Build trends for top-risk countries
      for (const c of topCII) {
        const history = byCountry.get(c.code);
        if (!history || history.entries.length < 2) continue;
        // Deduplicate by date — keep FIRST entry per date (most recent, since query is DESC)
        const byDate = new Map<string, number>();
        for (const e of history.entries) {
          if (!byDate.has(e.date)) byDate.set(e.date, e.score);
        }
        const scores = Array.from(byDate.entries())
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, score]) => ({ date, score }));
        const weekAgo = scores.length >= 2 ? scores[0].score : null;
        // Use authoritative current deviation from allCII, not history query
        const current = c.deviation;
        // Detect volatility: if score swings >5 points in both directions
        let maxUp = 0,
          maxDown = 0;
        for (let i = 1; i < scores.length; i++) {
          const d = scores[i].score - scores[i - 1].score;
          if (d > maxUp) maxUp = d;
          if (d < maxDown) maxDown = d;
        }
        const direction: WeeklyTrend['direction'] =
          maxUp > 5 && Math.abs(maxDown) > 5
            ? 'volatile'
            : weekAgo !== null && current - weekAgo >= 3
              ? 'rising'
              : weekAgo !== null && current - weekAgo <= -3
                ? 'falling'
                : 'stable';
        weeklyTrends.push({
          name: c.name,
          code: c.code,
          scores,
          currentScore: current,
          weekAgoScore: weekAgo,
          direction,
        });
      }
    }

    // Server-side correlation detection (earthquakes near critical infrastructure)
    const correlations: string[] = [];
    if (earthquakeResult.status === 'fulfilled' && earthquakeResult.value) {
      const qData = earthquakeResult.value as {
        features: Array<{
          properties: { mag: number; place: string };
          geometry: { coordinates: [number, number, number] };
        }>;
      };
      for (const f of qData.features || []) {
        // Was 4.5, which fires most days somewhere on earth and is why this
        // section — which the prompt used to be told to lead with — read as a
        // seismic bulletin. Measured across the last 21 briefs the mix was
        // 18.5% seismic against 3.1% politics. A quake earns the lead by
        // consequence, not by occurring.
        if (f.properties.mag < 5.5) continue;
        const [lon, lat] = f.geometry.coordinates;
        for (const infra of CRITICAL_INFRA) {
          const dist = haversineKm(lat, lon, infra.lat, infra.lon);
          if (dist < 200) {
            correlations.push(
              `PROXIMITY ALERT: M${f.properties.mag.toFixed(1)} earthquake ${Math.round(dist)}km from ${infra.name} (${infra.type}). ${f.properties.place}.`,
            );
          }
        }
      }
      // Seismic cluster detection
      const sigQuakes = (qData.features || []).filter((f) => f.properties.mag >= 4.0);
      const clusters = new Map<string, number>();
      for (const q of sigQuakes) {
        const key = `${Math.round(q.geometry.coordinates[1] / 3) * 3},${Math.round(q.geometry.coordinates[0] / 3) * 3}`;
        clusters.set(key, (clusters.get(key) || 0) + 1);
      }
      for (const [key, count] of clusters) {
        if (count >= 3) {
          const [lat, lon] = key.split(',').map(Number);
          const nearby = sigQuakes.find(
            (q) => Math.abs(q.geometry.coordinates[1] - lat) < 3 && Math.abs(q.geometry.coordinates[0] - lon) < 3,
          );
          correlations.push(
            `SEISMIC CLUSTER: ${count} M4.0+ earthquakes concentrated near ${nearby?.properties.place || `${lat}°N ${lon}°E`}. Elevated aftershock/escalation risk.`,
          );
        }
      }
    }
    // CII convergence: multiple high-CII countries in same region
    const highCII = allCII.filter((c) => c.score >= 50);
    if (highCII.length >= 5) {
      correlations.push(
        `MULTI-REGION INSTABILITY: ${highCII.length} countries above CII 50 threshold — elevated global risk posture. Top: ${highCII
          .slice(0, 3)
          .map((c) => `${c.name} (${c.score})`)
          .join(', ')}.`,
      );
    }

    // News headlines
    const newsHeadlines: NewsItem[] = newsResult.status === 'fulfilled' ? (newsResult.value as NewsItem[]) : [];

    // Database reads that need no model key, so they run on every run: the
    // mechanical edition prints them too (gatherCallLines).
    const callLines = await gatherCallLines(sql, new Map(allCII.map((c) => [c.code, c.name])), isSunday);
    // The mechanical edition's own reads (gatherRecord). Separate queries, so
    // nothing the prompt is handed changes; their result reaches only
    // buildFallbackText and, on a mechanical day, the archive.
    const record = await gatherRecord(sql, new Map(allCII.map((c) => [c.code, c.name])));

    const briefData: BriefData = {
      date: today,
      utcTime,
      topRiskCountries: topCII,
      totalCountries: ciiRows.length,
      earthquakeCount,
      significantQuakes,
      diseaseCount,
      recentOutbreaks,
      conflictHeadlines,
      markets,
      yesterdayEqCount,
      weeklyTrends,
      correlations,
      newsHeadlines,
      openCallLines: callLines.openCallLines,
      resolvedCallLines: callLines.resolvedCallLines,
      openCallsRead: callLines.openCallsRead,
      resolvedCallsRead: callLines.resolvedCallsRead,
      record,
    };

    // === Generate AI brief (outputs markdown text) ===
    let briefText: string;
    let aiDebug: string | null = null;
    // Set BY THE GATE that refused, at the branch that refused — never
    // recovered afterwards from the label string. The fallback alarm reads
    // this to tell "the gates did their job" from "the machinery failed".
    let gateRefusal = false;
    // Set when the model's reply never became a draft (cut off, refused, or an
    // unexpected stop_reason). Not a gate refusal and not a credit failure, so
    // the alarm says what actually happened instead of "check credit".
    let stopNote: string | null = null;
    let grounding: GroundingReport | null = null;
    // The model's declared subject. Cleared if a gate refuses the draft — a
    // subject describing a refused issue must never ship with the fallback.
    let declaredSubject: string | null = null;
    // What a dry run records (api/_lib/brief-dry-run.ts), filled in as the
    // call proceeds. Read only when BRIEF_MODEL_MODE is not `live`, and never
    // by anything that reaches a reader.
    const attempt = newDryRunAttempt();

    if (anthropicKey) {
      try {
        const trendArrow = (c: CIIEntry) => {
          if (c.prevDeviation === null) return '';
          const d = c.deviation - c.prevDeviation;
          if (d >= 3) return ` ↑${d.toFixed(0)}`;
          if (d <= -3) return ` ↓${Math.abs(d).toFixed(0)}`;
          return ' →';
        };

        // === POLITICAL SIGNAL ===
        // The brief has never seen any of this. Measured across the last 21
        // briefs the topic mix was markets 49.7%, seismic 18.5%, conflict
        // 18.1%, politics 3.1% — the thing the product is named for came last
        // but one. Censorship deltas and the open call book are both political,
        // both dated, and both already in the database.
        //
        // Non-fatal: a query failure costs a section, never the brief.
        // Replaced on a successful query. Until then the model is told the
        // data is missing, never that nothing was blocked.
        let censorshipLines: string[] = [
          'OONI data unavailable today: the query failed. Make no censorship statement.',
        ];
        // Last complete UTC day; today's row is still filling. History starts
        // at the day-grain fix and reaches back at most 180 days.
        const censorshipEndDate = new Date(now.getTime() - 86_400_000).toISOString().slice(0, 10);
        const censorshipHistorySince = [
          OONI_DAY_GRAIN_SINCE,
          new Date(now.getTime() - 180 * 86_400_000).toISOString().slice(0, 10),
        ].sort()[1];
        let sanctionsLines: string[] = [];
        try {
          // Totals, shares, the previous week and the stored history — not one
          // 7-day sum. A sum alone could carry no honest comparison, and the
          // model wrote "record" on it anyway (censorship-context.ts).
          const nameOf = new Map(allCII.map((c) => [c.code, c.name]));
          const ooniRows = (await sql`
            SELECT country_code, measurement_date::text AS measurement_date,
                   confirmed_blocked::int AS confirmed_blocked, total_measurements::int AS total_measurements
            FROM ooni_measurements
            WHERE test_name = 'web_connectivity'
              AND measurement_date >= ${censorshipHistorySince}::date AND measurement_date <= ${censorshipEndDate}::date
          `) as unknown as OoniDayRow[];
          censorshipLines = summariseCensorship(ooniRows, {
            endDate: censorshipEndDate,
            historySince: censorshipHistorySince,
          })
            .slice(0, 12)
            .map((c) => formatCensorshipLine(c, nameOf.get(c.code) ?? c.code));

          // Designation deltas — real adds/removes/updates from the rebuilt
          // sanctions collector (a diff against the stored snapshot, not a
          // re-insert of the whole list). Sparse by nature: ~5 designation
          // days a year, which is exactly why it is brief signal and not a
          // call domain.
          const sanctions = (await sql`
            SELECT source, change_type, entity_name, country_codes, programs, source_date::text AS source_date
            FROM sanctions_events
            WHERE observed_at > NOW() - INTERVAL '7 days'
            ORDER BY observed_at DESC LIMIT 12
          `) as unknown as Array<{
            source: string;
            change_type: string;
            entity_name: string;
            country_codes: string[];
            programs: string[];
            source_date: string | null;
          }>;
          sanctionsLines = sanctions.map((ev) => {
            const src = ev.source === 'ofac' ? 'OFAC' : 'UN';
            const verb = ev.change_type === 'add' ? 'designated' : ev.change_type === 'remove' ? 'delisted' : 'amended';
            const cc = ev.country_codes?.length ? ` [${ev.country_codes.join(', ')}]` : '';
            const pg = ev.programs?.length ? ` under ${ev.programs.slice(0, 2).join(', ')}` : '';
            return `${src} ${verb}: ${ev.entity_name}${pg}${cc}${ev.source_date ? ` (${ev.source_date})` : ''}`;
          });
        } catch (polErr) {
          console.error(
            '[daily-brief] political signal unavailable (non-fatal):',
            polErr instanceof Error ? polErr.message : polErr,
          );
        }

        const dataContext = `DATE: ${today} ${utcTime}
COUNTRIES MONITORED: ${ciiRows.length}

=== TOP RISK COUNTRIES (structural level 0-100 · live deviation today) ===
The LEVEL changes only when baselines are reviewed; the DEVIATION is today's
live signal on top of it (0 = quiet). They are two numbers, never one sum.
${topCII.map((c) => `${c.name}: level ${c.score}/100 · today +${c.deviation}${trendArrow(c)} [conflict=${c.components.conflict}, governance=${c.components.governance}, market=${c.components.marketExposure} | live: disasters=${c.components.disasters}, censorship=${c.components.infrastructure}]`).join('\n')}

=== BIGGEST DEVIATION MOVES (24h) ===
${movers.length > 0 ? movers.map((m) => `${m.name}: deviation ${m.delta > 0 ? '+' : ''}${m.delta.toFixed(0)} (${m.prevDeviation?.toFixed(0)} → ${m.deviation}) on structural level ${m.score}`).join('\n') : 'No significant deviation moves (±3 threshold)'}

=== POLITICAL SIGNAL — NETWORK INTERFERENCE (OONI web_connectivity; ${censorshipWindowLabel(censorshipEndDate, censorshipHistorySince)}) ===
Each figure counts OONI test MEASUREMENTS that OONI confirmed as blocked. It rises when volunteers run more tests; the share is the comparable figure. MARKERS are computed from the stored history and the previous window; a comparison not marked here is not supported.
${censorshipLines.length > 0 ? censorshipLines.join('\n') : `No OONI measurements confirmed as blocked in the 7 complete days to ${censorshipEndDate}.`}

=== RESOLVED CALLS (settled against external ground truth — ${isSunday ? 'the last 7 days' : 'today'}) ===
${briefData.resolvedCallLines.length > 0 ? briefData.resolvedCallLines.join('\n') : briefData.resolvedCallsRead !== true ? RESOLVED_CALLS_UNREAD_PROMPT : isSunday ? 'No calls resolved this week.' : 'No calls resolved today.'}

=== OUR OPEN CALLS (dated, falsifiable, resolved against OONI and FX reference rates) ===
${briefData.openCallLines.length > 0 ? briefData.openCallLines.join('\n') : briefData.openCallsRead === true ? 'No open calls.' : OPEN_CALLS_UNREAD_PROMPT}

=== SANCTIONS DESIGNATION CHANGES (OFAC SDN + UN consolidated, last 7 days) ===
${sanctionsLines.length > 0 ? sanctionsLines.join('\n') : 'No designation changes observed in the last 7 days.'}

=== 7-DAY CII TRAJECTORIES ===
${weeklyTrends.length > 0 ? weeklyTrends.map((t) => `${t.name} [${t.direction.toUpperCase()}]: ${t.weekAgoScore ?? '?'} → ${t.currentScore} over 7d | Daily: ${t.scores.map((s) => s.score).join(' → ')}`).join('\n') : 'Insufficient history for weekly trends'}

=== CROSS-DOMAIN CORRELATIONS (auto-detected) ===
${correlations.length > 0 ? correlations.join('\n') : 'No significant cross-domain correlations detected'}

=== SEISMIC ACTIVITY ===
${earthquakeCount} earthquakes in last 24h${yesterdayEqCount !== null ? ` (yesterday: ${yesterdayEqCount}, ${earthquakeCount > yesterdayEqCount ? 'INCREASING' : earthquakeCount < yesterdayEqCount ? 'decreasing' : 'stable'})` : ''}
Significant (M4.5+): ${significantQuakes.length > 0 ? significantQuakes.join('; ') : 'None'}

=== HEALTH SECURITY ===
${diseaseCount} active WHO outbreak notices
${recentOutbreaks.length > 0 ? recentOutbreaks.join('\n') : 'No recent outbreak reports'}

=== CONFLICT & SECURITY HEADLINES ===
${conflictHeadlines.length > 0 ? conflictHeadlines.map((h) => `- ${h}`).join('\n') : '(GDELT feed unavailable from this origin)'}

=== OSINT & WORLD NEWS (last 24h) ===
Items marked [STATE MEDIA] are evidence of that government's framing, NOT of
what happened. Cite them only as "TASS is presenting X as Y". Never as a fact.
${
  newsHeadlines.length > 0
    ? newsHeadlines
        .map((n) => `- [${n.source}${STATE_MEDIA_SOURCES.has(n.source) ? ' · STATE MEDIA' : ''}] ${n.title}`)
        .join('\n')
    : 'No headlines available'
}

=== MARKET INDICATORS ===
${markets.length > 0 ? markets.map((m) => `${m.symbol}: ${m.price} (${m.change})`).join(' | ') : 'Market data unavailable'}

=== ENERGY CHOKEPOINT RISK CONTEXT ===
Strait of Hormuz: ~20% of global oil transits. Adjacent to Iran (CII: ${allCII.find((c) => c.code === 'IR')?.score ?? '?'}), Yemen (CII: ${allCII.find((c) => c.code === 'YE')?.score ?? '?'})
Bab el-Mandeb: Red Sea gateway. Adjacent to Yemen, Somalia (CII: ${allCII.find((c) => c.code === 'SO')?.score ?? '?'})
Suez Canal: ~12% of global trade. Adjacent to instability in Sudan (CII: ${allCII.find((c) => c.code === 'SD')?.score ?? '?'}), Libya (CII: ${allCII.find((c) => c.code === 'LY')?.score ?? '?'})
${(() => {
  const oilQuote = markets.find((m) => m.symbol.includes('USO'));
  const gasQuote = markets.find((m) => m.symbol.includes('UNG'));
  const energyQuote = markets.find((m) => m.symbol.includes('XLE'));
  return `Oil: ${oilQuote ? `${oilQuote.price} (${oilQuote.change})` : 'N/A'} | Nat Gas: ${gasQuote ? `${gasQuote.price} (${gasQuote.change})` : 'N/A'} | Energy Sector (XLE): ${energyQuote ? `${energyQuote.price} (${energyQuote.change})` : 'N/A'}`;
})()}

=== SPACE & TECHNOLOGY ===
NexusWatch tracks satellites, launches, GPS jamming zones, and internet outages globally.
${(() => {
  const parts: string[] = [];
  // Internet outages affect cyber/tech posture
  const highCIICountries = allCII.filter((c) => c.score >= 40);
  const infraRisk = highCIICountries.filter((c) => c.components.infrastructure > 5);
  if (infraRisk.length > 0) {
    parts.push(
      `Infrastructure disruption risk elevated in: ${infraRisk.map((c) => `${c.name} (infra: ${c.components.infrastructure})`).join(', ')}`,
    );
  }
  parts.push(`GPS jamming zones, satellite orbits, and launch schedules are tracked on the live platform.`);
  return parts.join('\n');
})()}`;

        // Cron path: bypassCap — the daily brief is mission-critical and must
        // ship even at the cap — but the check still runs so the soft-warn
        // telemetry fires as spend approaches the limit.
        await checkBudget({ endpoint: 'daily-brief', bypassCap: true });
        // One request object feeds both the call and the spend record below,
        // so the two can never name different models.
        const briefRequest = buildBriefRequest({
          apiKey: anthropicKey,
          system: getBriefSystemPrompt(now),
          dataContext,
        });
        attempt.model = briefRequest.body.model;
        // The host stays a literal HERE, not in brief-model.ts: scripts/check-llm-spend.ts
        // scopes billed call sites by that literal and then requires a gate and a
        // spend record of this file.
        const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: briefRequest.headers,
          body: JSON.stringify(briefRequest.body),
          signal: AbortSignal.timeout(BRIEF_TIMEOUT_MS),
        });

        if (aiRes.ok) {
          const aiData = (await aiRes.json()) as {
            content?: Array<{ type?: string; text?: string }>;
            stop_reason?: string | null;
            usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number };
          };
          // The single largest, most reliable Anthropic spend in the system —
          // a full Sonnet brief, every day at 10:00 UTC — and until now it
          // recorded nothing, leaving the $9/day kill-switch blind to it.
          await recordAnthropicSpend(briefRequest.body.model, aiData.usage, 'daily-brief');
          attempt.usage = aiData.usage ?? null;
          // Text blocks, not content[0] (a response may open with a thinking
          // block), and only if stop_reason is a normal end of turn: a reply
          // cut off at max_tokens inside the last section still passes the
          // structure gate, and a refusal is a 200.
          const reply = readBriefReply(aiData);
          attempt.stopReason = reply.complete ? 'end_turn' : reply.stopReason;
          const rawDraft = reply.complete ? reply.text : '';
          // Strip the declared SUBJECT line before anything else reads the
          // draft: the gates must score the body, and the line must never
          // reach a reader.
          const parsedSubject = parseDeclaredSubject(rawDraft);
          declaredSubject = parsedSubject.subject;
          briefText = rawDraft ? parsedSubject.body : '';
          // Kept for a dry run: the reply as the model wrote it, SUBJECT line
          // included, and the subject as it would have shipped.
          attempt.draftSubject = declaredSubject;
          attempt.draftText = rawDraft;
          if (!reply.complete) {
            aiDebug = `${reply.label}:${reply.stopReason}`;
            console.error('[daily-brief] NO COMPLETE DRAFT:', aiDebug);
            stopNote = reply.operatorNote;
            declaredSubject = null;
            briefText = buildFallbackText(briefData, FALLBACK_CAUSE['incomplete-reply']);
          } else if (!briefText) {
            aiDebug = 'ai-empty-response';
            declaredSubject = null;
            briefText = buildFallbackText(briefData, FALLBACK_CAUSE['empty-response']);
          } else {
            // === Mechanical grounding gate (Phase 2) ===
            // Every numeral in the draft must be present in, or derivable
            // from, the context it was generated from. Published briefs have
            // carried invented casualty figures attributed to ACLED, an
            // invented WHO statement, and a false precedent reproduced from
            // the prompt itself. An instruction not to fabricate is not a
            // gate; this is the gate, and it fails LOUDLY to the
            // deterministic builder — which is grounded by construction —
            // rather than silently shipping invention.
            grounding = groundDraft(briefText, dataContext);
            const structure = validateBriefStructure(briefText, isSunday);
            // Record claims are checked on the subject too: the false
            // "record censorship" headlines were subject lines.
            const comparative = checkComparativeClaims(
              `${declaredSubject ?? ''}\n${briefText}`,
              dataContext,
              allCII.map((c) => c.name),
            );
            attempt.gates = summariseGates(grounding, structure, comparative);
            if (!grounding.pass) {
              aiDebug = `grounding-failed: ${grounding.unsupported.length}/${grounding.draftNumerals.length} unsupported numerals [${grounding.unsupported.slice(0, 8).join(', ')}]`;
              console.error('[daily-brief] GROUNDING GATE REFUSED THE DRAFT:', aiDebug);
              gateRefusal = true;
              declaredSubject = null;
              briefText = buildFallbackText(briefData, FALLBACK_CAUSE['grounding-refused']);
            } else if (!structure.pass) {
              // The section spine is a contract with the reader (and with the
              // renderer). A draft that resurrects Scenario Spotlight, drops
              // What We're Not Saying, or forgets the change-our-mind clause
              // is refused the same way an ungrounded one is.
              aiDebug = `structure-failed: missing=[${structure.missing.join('; ')}] extra=[${structure.extra.join('; ')}]${structure.misordered ? ' misordered' : ''}${structure.missingChangeOurMind ? ' no-change-our-mind-clause' : ''}`;
              console.error('[daily-brief] STRUCTURE GATE REFUSED THE DRAFT:', aiDebug);
              gateRefusal = true;
              declaredSubject = null;
              briefText = buildFallbackText(briefData, FALLBACK_CAUSE['structure-refused']);
            } else if (!comparative.pass) {
              // A "record" the computed markers do not carry, or a measurement
              // count restated as "blocks" — refused like an invented number.
              aiDebug = comparativeClaimLabel(comparative);
              console.error('[daily-brief] COMPARATIVE-CLAIM GATE REFUSED THE DRAFT:', aiDebug);
              gateRefusal = true;
              declaredSubject = null;
              briefText = buildFallbackText(briefData, FALLBACK_CAUSE['comparative-refused']);
            } else {
              aiDebug = `ai-success (grounding ${grounding.unsupported.length}/${grounding.draftNumerals.length} unsupported)`;
            }
          }
        } else {
          const errBody = await aiRes.text().catch(() => 'unknown');
          aiDebug = `ai-failed:${aiRes.status}:${errBody.slice(0, 300)}`;
          console.error(`AI brief failed: ${aiRes.status} — ${errBody.slice(0, 200)}`);
          briefText = buildFallbackText(briefData, FALLBACK_CAUSE['http-error']);
        }
      } catch (aiErr) {
        aiDebug = `ai-error:${aiErr instanceof Error ? aiErr.message : String(aiErr)}`;
        console.error('AI brief error:', aiErr instanceof Error ? aiErr.message : aiErr);
        briefText = buildFallbackText(briefData, FALLBACK_CAUSE['exception']);
      }
    } else {
      aiDebug = 'no-api-key';
      briefText = buildFallbackText(briefData, FALLBACK_CAUSE['no-api-key']);
    }

    // === Dry run: BRIEF_MODEL_MODE (api/_lib/brief-dry-run.ts) ===
    // Unless the setting is exactly `live`, a draft that cleared every gate
    // does not ship. The day is handled exactly as a gate refusal is: a
    // non-success label, no declared subject, and the mechanical text with its
    // own true cause line. The edition, the subject, the archive row and the
    // email below are all built from those three, so all of them are the
    // mechanical edition. Done here, after the gates and before the edition is
    // decided, and before anything is written or sent. The draft survives only
    // in `attempt`, for the private table and the operator's email.
    // A gate refusal and a failed model call are left exactly as they were.
    const briefMode = getBriefModelMode();
    const wouldHaveShipped = (aiDebug ?? '').startsWith('ai-success');
    const attemptOutcome = aiDebug ?? 'unknown';
    // The draft reached a verdict: it cleared every gate, or a gate refused it.
    const draftJudged = wouldHaveShipped || gateRefusal;
    if (briefMode !== 'live' && wouldHaveShipped) {
      aiDebug = 'dry-run';
      declaredSubject = null;
      briefText = buildFallbackText(briefData, FALLBACK_CAUSE['dry-run']);
    }

    // === The Ledger line (Phase 2) ===
    // Goes at the very top of the brief, above everything the model wrote.
    // This is the habit mechanic: a reader who saw a call made has a stake in
    // it resolving, and the resolution lands on a schedule they do not
    // control. It also drags the differentiator out of a page nobody visits
    // and into the one surface with demonstrated daily engagement.
    //
    // Non-fatal by construction — a brief must still go out if the ledger
    // query fails, and it must never claim a record it does not have.
    //
    // Today's record, kept outside the try so the mechanical edition's subject
    // can be built from it: on a day the model did not write, the ledger is the
    // only number the subject may carry.
    let ledgerRecord: { resolved: number; hits: number } | null = null;
    try {
      // Same derivation as the prompt queries above: the exclusion reads from
      // CALIBRATION_KINDS, never a literal — round three of the rule-2 review
      // caught these three queries still naming seismicity_window while the
      // commit message claimed the class was fixed.
      const calKinds = [...CALIBRATION_KINDS];
      const resolvedToday = (await sql`
        SELECT country_code, status, probability::float AS probability
        FROM calls
        WHERE resolved_at::date = CURRENT_DATE AND status = ANY(${[...SCORED_STATUSES]})
          AND NOT (kind = ANY(${calKinds}))
      `) as unknown as Array<{ country_code: string; status: string; probability: number }>;
      ledgerRecord = {
        resolved: resolvedToday.length,
        hits: resolvedToday.filter((r) => r.status === 'hit').length,
      };

      // kind and resolved_at are REQUIRED, not decorative: the summary scores
      // per kind and gates on the number of distinct resolution batches. The
      // previous query selected neither, which is why the brief could only
      // produce one pooled, ungated number.
      //
      // Corrections ride along, as they do on /ledger and /api/calls/ledger:
      // 54 of the censorship verdicts are recorded as wrong (call_corrections)
      // and the line must carry the corrected reading beside the published
      // one. DISTINCT ON keeps a call that ever acquired a second cause from
      // appearing twice and moving a published number.
      const allScoredRows = (await sql`
        SELECT c.kind, c.probability::float AS probability, c.base_rate::float AS base_rate,
               c.status, c.resolved_at::text AS resolved_at, cc.corrected_status
        FROM calls c
        LEFT JOIN (
          SELECT DISTINCT ON (call_id) call_id, corrected_status
          FROM call_corrections ORDER BY call_id, issued_on DESC
        ) cc ON cc.call_id = c.id
        WHERE c.status = ANY(${[...SCORED_STATUSES]}) AND NOT (c.kind = ANY(${calKinds}))
      `) as unknown as Array<{
        kind: string;
        probability: number;
        base_rate: number | null;
        status: string;
        resolved_at: string | null;
        corrected_status: string | null;
      }>;

      // "next resolves" must be a FUTURE date. A bare MIN(resolves_on) over
      // pending rows picks up grace-held calls whose resolves_on has already
      // passed (due but unresolvable, held under UNRESOLVABLE_GRACE_DAYS), so
      // the published line read "next resolves 2026-09-05" two days after
      // 09-05. Held rows still count as open; they just aren't "next" — the
      // next resolution EVENT is the next scheduled resolves_on. The brief
      // runs after the resolver, so anything due today has been attempted.
      const openRows = (await sql`
        SELECT COUNT(*)::int AS n,
               (MIN(resolves_on) FILTER (WHERE resolves_on > CURRENT_DATE))::text AS next_resolves
        FROM calls WHERE status = 'pending' AND NOT (kind = ANY(${calKinds}))
      `) as unknown as Array<{ n: number; next_resolves: string | null }>;

      const scoredRows: LedgerSummaryRow[] = allScoredRows.map(toLedgerSummaryRow);

      const ledger = formatLedgerSummary({
        resolvedToday: resolvedToday as unknown as Call[],
        scored: scoredRows,
        openCount: openRows[0]?.n ?? 0,
        nextResolvesOn: openRows[0]?.next_resolves ?? null,
      });

      briefText = spliceLedgerLine(briefText, ledger);
    } catch (ledgerErr) {
      console.error(
        '[daily-brief] ledger line skipped (non-fatal):',
        ledgerErr instanceof Error ? ledgerErr.message : ledgerErr,
      );
    }

    // === Render Light Intel Dossier (Track B.3) ===
    // Single rendering pass produces all outputs: email shell for Resend,
    // plain-text multipart fallback, and the inner-modules HTML stored as the
    // DB archive summary. All paths (AI success, AI failure, no key) go
    // through the same dossier pipeline so the archive and the email are
    // visually identical.
    // Decided here, before the render: the renderer is told the edition, and
    // the archive row records it so a delivery-time re-render can be told too.
    const onFallback = !(aiDebug ?? '').startsWith('ai-success');
    const edition = editionFor(onFallback);
    const dossier = renderDossierEmail({
      briefText,
      date: today,
      time: utcTime,
      markets,
      edition,
    });
    const briefHtml = dossier.beehiivHtml;

    // Store both markdown and HTML versions. Instrumented as the 'archive'
    // channel — this row failing means the entire run is broken, so the outer
    // try/catch converts it to a 500. The logDelivery call below only fires
    // on success.
    // Update the placeholder row inserted by the atomic dedup guard above.
    //
    // THE SUBJECT DEPENDS ON WHICH EDITION SHIPPED. On a model day it is the
    // declared line, or one scraped from Top Signal. On a mechanical day
    // scraping is forbidden: the first bold phrase in the fallback's Top Signal
    // is the lead news headline verbatim, and for three mornings in September
    // 2026 that was a Chinatown murder story sent to every subscriber as the
    // subject of this register. See fallbackSubject.
    const subject = onFallback ? fallbackSubject(today, ledgerRecord) : chooseSubject(declaredSubject, briefText);
    const archiveT0 = Date.now();
    // The edition travels with the stored content (from the same flag, not the
    // text) so /api/status can report it without parsing anything.
    await sql`
      UPDATE daily_briefs
      SET content = ${JSON.stringify(archiveContent(archivedData(briefData, onFallback), briefText, subject, onFallback))},
          summary = ${briefHtml}
      WHERE brief_date = ${today}
    `;
    // The FULL email document, stored beside the embeddable summary. A
    // separate non-fatal statement: the archive write above failing means the
    // run is broken and must 500; this one failing (migration not applied
    // yet) must not — deliver-briefs probes and falls back to the fragment,
    // which is exactly the previous behaviour.
    try {
      await sql`
        UPDATE daily_briefs
        SET email_html = ${dossier.emailHtml}, plain_text = ${dossier.plainText}
        WHERE brief_date = ${today}
      `;
    } catch (emailColErr) {
      console.error(
        '[daily-brief] email_html/plain_text not stored (non-fatal — send falls back to summary; is 2026-09-05-brief-email-html.sql applied?):',
        emailColErr instanceof Error ? emailColErr.message : emailColErr,
      );
    }

    await logDelivery({
      channel: 'archive',
      status: 'success',
      latencyMs: Date.now() - archiveT0,
      metadata: {
        brief_html_length: briefHtml.length,
        ai: aiDebug,
        // Watched, not hoped about: the unsupported-claim rate per issue.
        grounding_unsupported: grounding?.unsupported.length ?? null,
        grounding_total_numerals: grounding?.draftNumerals.length ?? null,
        grounding_rate: grounding ? Math.round(grounding.unsupportedRate * 1000) / 1000 : null,
      },
    });

    // === The dry run's private record and the operator's email ===
    // Only on a dry-run day, and only after the reader's edition is archived.
    // Every attempt is recorded, a failed model call included; the email goes
    // only when there is a draft to read, and only to ADMIN_EMAILS. Nothing
    // here touches daily_briefs or can undo the swap above. recordDryRun never
    // throws; the catch is for anything around it that might.
    if (briefMode !== 'live') {
      try {
        await recordDryRun(
          sql,
          buildDryRunRecord({ briefDate: today, runId, outcome: attemptOutcome, wouldHaveShipped, attempt }),
        );
      } catch (dryRunErr) {
        console.error(
          '[daily-brief] dry-run record failed (non-fatal, readers unaffected):',
          dryRunErr instanceof Error ? dryRunErr.message : dryRunErr,
        );
      }
    }

    // === Say so when the model did not write today ===
    // The archive row above records "success" whether the model wrote the
    // issue or the mechanical edition went out instead, and nothing else
    // watched the difference: from 2026-09-10 the Anthropic account was out of
    // credit and the fallback shipped for three days before anyone looked.
    // Keyed, so a run of fallback days is one alarm with reminders, and the
    // first model day after it sends the all-clear. An API or credit failure
    // is an operator problem and pages CRITICAL; a gate refusing the draft is
    // the gates working, and is a WARNING worth knowing about.
    try {
      if (briefMode !== 'live' && draftJudged) {
        // A dry-run day on which the draft reached the gates. The mechanical
        // edition was the plan, not a failure, so this replaces the alarm
        // below. It goes by the general path, which may be Discord, so it
        // carries the date, each gate's verdict and DRY RUN, never the draft:
        // dryRunAlert is not given the draft.
        await raiseAlert(dryRunAlert(today, attempt.gates, wouldHaveShipped));
        // The draft cleared every gate, so the machinery is working: stand down
        // an earlier "shipped as the mechanical edition" alarm (a credit outage,
        // say) exactly as a live model day does. Without this, a failure weeks
        // later would report the old outage as still ongoing. A refused draft
        // clears nothing, as on a live day. The note carries no draft text.
        if (wouldHaveShipped) {
          await clearAlert(
            'brief:fallback',
            `${today}: dry run. The model wrote a draft and it cleared every gate; readers received the mechanical edition by design.`,
          );
        }
      } else if (onFallback) {
        const cause = aiDebug ?? 'unknown';
        // gateRefusal was set by the gate that refused, so a refusal is a
        // WARNING (the gates working) and anything else that is not success is
        // the machinery failing — credit, key, transport, an empty response —
        // and pages CRITICAL by default: a new failure label fails closed. The
        // first draft enumerated failure prefixes and missed `ai-empty-response`;
        // the second enumerated gate prefixes; both read a string where a flag
        // belonged. Two independent reviews, one each.
        await raiseAlert({
          key: 'brief:fallback',
          severity: gateRefusal ? 'warning' : 'critical',
          title: `The brief shipped as the mechanical edition (${cause.split(':')[0]})`,
          body:
            `${today}: the model's draft did not ship and subscribers received the deterministic edition.\n\n` +
            `Cause: ${cause.slice(0, 400)}\n\n` +
            (gateRefusal
              ? 'A gate refused the draft. Read the archived brief and the grounding/structure report in brief_delivery_log.'
              : (stopNote ??
                'This is the machinery failing, not a gate refusal — check Anthropic credit and the key before the next 10:00 UTC run.')),
        });
      } else {
        await clearAlert('brief:fallback', `${today}: the model wrote today's issue and it cleared every gate.`);
      }
    } catch (fallbackAlertErr) {
      console.error(
        '[daily-brief] fallback alert failed (non-fatal):',
        fallbackAlertErr instanceof Error ? fallbackAlertErr.message : fallbackAlertErr,
      );
    }

    // === Record CII snapshots for prediction ledger (Phase 3) ===
    // Every daily brief records the CII scores at publication time.
    // Used by the accuracy dashboard to track prediction accuracy.
    try {
      let snapshotCount = 0;
      for (const country of allCII) {
        const components = country.components || {};
        await sql`
          INSERT INTO cii_daily_snapshots (date, country_code, cii_score, confidence,
            component_conflict, component_disasters, component_sentiment,
            component_infrastructure, component_governance, component_market_exposure,
            source_count, data_point_count)
          VALUES (${today}, ${country.code}, ${country.score}, ${'medium'},
            ${components.conflict ?? null}, ${components.disasters ?? null}, ${components.sentiment ?? null},
            ${components.infrastructure ?? null}, ${components.governance ?? null}, ${components.marketExposure ?? null},
            ${0}, ${0})
          ON CONFLICT (date, country_code) DO NOTHING
        `;
        snapshotCount++;
      }
      console.log(`[daily-brief] Recorded ${snapshotCount} CII snapshots for ${today}`);
    } catch (snapshotErr) {
      // Non-fatal — the brief still sends even if snapshots fail
      console.error('CII snapshot recording failed:', snapshotErr instanceof Error ? snapshotErr.message : snapshotErr);
    }

    // The beehiiv mirror was RETIRED. It had failed on every run since
    // 2026-07-09 because its publication id setting was malformed. No request
    // goes to beehiiv from any path, whatever BEEHIIV_* variables are set.

    // The Buffer/X channel was DELETED with the marketing subsystem
    // (2026-09-05, plan witty-finding-crystal PR-3). It was building its post
    // from two regexes that matched section names which no longer exist —
    // '## ☕ Good Morning' on weekdays and '## 📍 Today's Top Stories' ever —
    // so six days a week it shipped a post assembled from two empty matches.
    // The social_queue dual-write went with it.

    // === Email delivery delegated to deliver-briefs.ts (D-2, 2026-04-18) ===
    // Resend batch sending removed. The deliver-briefs hourly cron sends each
    // subscriber this brief at their 07:00 local, or at the first run after
    // it is archived if their 07:00 came earlier (api/_lib/brief-window.ts).
    // This cron only generates content + archives to daily_briefs table.
    await logDelivery({
      channel: 'resend',
      status: 'success',
      recipientCount: 0,
      latencyMs: 0,
      metadata: { note: 'delivery delegated to deliver-briefs.ts cron' },
    });

    // === Push to Notion (Substack-ready) ===
    const notionKey = process.env.NOTION_API_KEY;
    const notionBriefsPage = '33e45c2d-baf4-8104-b0e9-f6794c462363';
    if (notionKey) {
      const notionT0 = Date.now();
      try {
        // Use the markdown text directly — already clean and copy-paste ready
        const plainBrief = briefText;

        // Create a subpage for today's brief
        const pageRes = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${notionKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': '2022-06-28',
          },
          body: JSON.stringify({
            parent: { page_id: notionBriefsPage },
            icon: { type: 'emoji', emoji: '📋' },
            properties: {
              title: [{ type: 'text', text: { content: `Intelligence Brief — ${today}` } }],
            },
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (!pageRes.ok) {
          const body = await pageRes.text().catch(() => '');
          throw new Error(`notion page create ${pageRes.status}: ${body.slice(0, 200)}`);
        }

        const page = (await pageRes.json()) as { id: string };

        // Split into chunks of ~2000 chars (Notion block limit)
        const chunks = splitTextToChunks(plainBrief, 1900);
        const blocks = chunks.map((chunk) => ({
          object: 'block' as const,
          type: 'paragraph' as const,
          paragraph: {
            rich_text: [{ type: 'text' as const, text: { content: chunk } }],
          },
        }));

        // Notion API accepts max 100 blocks per request
        let blocksWritten = 0;
        for (let i = 0; i < blocks.length; i += 100) {
          const batch = blocks.slice(i, i + 100);
          const blockRes = await fetch(`https://api.notion.com/v1/blocks/${page.id}/children`, {
            method: 'PATCH',
            headers: {
              Authorization: `Bearer ${notionKey}`,
              'Content-Type': 'application/json',
              'Notion-Version': '2022-06-28',
            },
            body: JSON.stringify({ children: batch }),
            signal: AbortSignal.timeout(10000),
          });
          if (!blockRes.ok) {
            const body = await blockRes.text().catch(() => '');
            throw new Error(`notion block patch ${blockRes.status} (batch ${i}): ${body.slice(0, 200)}`);
          }
          blocksWritten += batch.length;
        }

        await logDelivery({
          channel: 'notion',
          status: 'success',
          latencyMs: Date.now() - notionT0,
          metadata: { page_id: page.id, blocks: blocksWritten },
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[daily-brief] Notion push failed:', msg);
        await logDelivery({
          channel: 'notion',
          status: 'failed',
          error: msg,
          latencyMs: Date.now() - notionT0,
        });
      }
    }

    // === Delivery-channel health check ===
    // Runs last, once every channel above has recorded its outcome. Recording
    // a failure is not the same as reporting one: beehiiv 400'd on every run
    // for 34 consecutive days (since 2026-07-09) and the only witness was a
    // Postgres row nobody read.
    //
    // NOTE the ::text cast. `brief_date` is a TEXT column, not a date — the
    // obvious `brief_date > CURRENT_DATE - INTERVAL '45 days'` raises
    // "operator does not exist: text > timestamp", and the catch below would
    // have swallowed it. A silent failure inside the thing built to stop
    // silent failures. Caught by running this query against production.
    //
    // Swallows its own errors — a broken alert must never break a brief.
    //
    // NO WINDOW. The streak must be the TRUE streak or the cadence breaks: a
    // 45-day window clamped beehiiv's streak at exactly 45 — a repeat boundary
    // (threshold 3, then every 7) — so shouldAlert said yes every single day
    // and "every seven failures" became "every morning" from 2026-09-10. Any
    // window reintroduces the same defect at its own edge: clamp on a boundary
    // and it pages daily, clamp off one and it never pages again. The table
    // grows about five rows a day, so reading all of it is cheap for years.
    try {
      const recent = (await sql`
        SELECT channel, brief_date::text AS brief_date, status, error
        FROM brief_delivery_log
      `) as Array<{ channel: string; brief_date: string; status: string; error: string | null }>;

      const broken = channelsToAlert(recent);
      if (broken.length > 0) {
        const admins = (process.env.ADMIN_EMAILS || '')
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean);
        const alertKey = process.env.RESEND_API_KEY;
        const body = formatAlertBody(broken);
        console.error('[daily-brief] delivery channel alert:\n' + body);

        if (alertKey && admins.length > 0) {
          const subject =
            broken.length === 1
              ? `NexusWatch: ${broken[0].channel} delivery has failed ${broken[0].streak} days running`
              : `NexusWatch: ${broken.length} delivery channels are failing`;
          const alertRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${alertKey}` },
            body: JSON.stringify({
              from: 'NexusWatch Alerts <alerts@nexuswatch.dev>',
              to: admins,
              subject,
              text: body,
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (!alertRes.ok) {
            console.error('[daily-brief] delivery alert email failed:', alertRes.status);
          }
        } else {
          console.error(
            '[daily-brief] delivery alert NOT emailed: ' +
              (admins.length === 0 ? 'ADMIN_EMAILS is empty' : 'RESEND_API_KEY is unset'),
          );
        }
      }
    } catch (healthErr) {
      console.error(
        '[daily-brief] delivery health check failed (non-fatal):',
        healthErr instanceof Error ? healthErr.message : healthErr,
      );
    }

    return res.json({ success: true, date: today, briefLength: briefHtml.length, ai: aiDebug });
  } catch (err) {
    console.error('Daily brief cron error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Brief generation failed' });
  }
}

// ============================================================================
// Email rendering — Light Intel Dossier (Track A.6)
// ============================================================================
//
// Replaces the pre-2026-04-11 `wrapEmailTemplate` which produced a dark
// terminal-themed HTML wrapper around a Sonnet-generated body. The new
// renderer owns both the shell AND the section-level rendering, following
// the Apr 11 CEO lock "we own the HTML" (Decision 5).
//
// Design tokens live in src/styles/email-tokens.ts — the canonical source
// of truth for the Light Intel Dossier palette, typography, and spacing.
// All inline styles in this module flow from those tokens via `style()`
// and `typeStyle()` helpers. Do not introduce hardcoded hex colors or
// font stacks below — use the tokens, or add new ones there first.
//
// Three outputs per render:
//   1. emailHtml  — full standalone HTML for Resend transactional send
//                   (masthead + modules + CTA + footer + unsubscribe)
//   2. beehiivHtml — inner modules only, no shell chrome, since beehiiv
//                    adds its own masthead/footer when sending
//   3. plainText  — text/plain multipart fallback (15% of intel readers
//                   are on text-only clients + higher deliverability)
// ============================================================================

import {
  colors,
  fonts,
  type,
  space,
  layout,
  style,
  typeStyle,
  escapeHtml,
  styleAttr,
} from '../../src/styles/email-tokens.js';
import {
  REGIONS,
  THREATS,
  matchesInterests,
  type Interests,
  type RegionId,
} from '../../src/services/interests-types.js';
import { requireCron } from '../_cron-utils.js';

export interface RenderedBrief {
  emailHtml: string;
  beehiivHtml: string;
  plainText: string;
}

/**
 * Country shape used by the Watchlist personalization layer. Intentionally
 * narrower than CIIEntry so callers that don't have the full component
 * breakdown can still feed the renderer — only name/code/score are required.
 *
 * `regionIds` lets the caller pre-tag a country with the regions it belongs
 * to so matchesInterests() can fire on region matches. Track A.9.1 ships
 * this as an optional passthrough; Track A.9.2 will generate the mapping
 * server-side during brief generation so the per-user render doesn't need
 * to reconstruct country → region membership.
 */
export interface WatchlistCountry {
  code?: string;
  name: string;
  score: number;
  regionIds?: RegionId[];
  topThreat?: 'conflict' | 'disasters' | 'disease' | 'cyber' | 'markets' | 'space';
}

/**
 * The edition is told to the renderer by its caller, never sniffed from the
 * text (the BriefEdition type and editionFor live in _lib/brief-edition.ts).
 * The mechanical edition's own prose can change, and a renderer that searched
 * for it would silently stop marking the edition the day the wording moved.
 *
 * The edition recorded in the archive row's `content`, for any path that
 * re-renders from the archive (deliver-briefs). Only an exact 'mechanical' is
 * read as mechanical. Rows archived before this field existed carry none: the
 * edition of those is UNKNOWN from stored data, and they render as they always
 * did, as the model edition.
 */
export function editionFromStoredContent(content: unknown): BriefEdition {
  const edition = (content as { edition?: unknown } | null)?.edition;
  return edition === 'mechanical' ? 'mechanical' : 'model';
}

/** The line that names the mechanical edition (api/_lib/brief-edition.ts, so an edge function can read it too). */
export { MECHANICAL_EDITION_LINE };

export interface RenderBriefOptions {
  briefText: string; // Markdown body (Sonnet output or buildFallbackText)
  /** Defaults to the model edition so every existing caller is unchanged. */
  edition?: BriefEdition;
  date: string; // YYYY-MM-DD
  time: string; // "10:00 UTC"
  markets: MarketQuote[];
  /** URL of the corresponding /brief/:date permalink, for forward-to-colleague. */
  archiveUrl?: string;
  /**
   * Per-recipient interests. When present, renderDossierEmail emits a
   * "Your Watchlist" module at the end of the inner content showing the
   * top-risk countries that match the user's interest regions/threats.
   * When absent, no Watchlist module is rendered — appropriate for the
   * shared beehiiv post body or for anonymous preview requests. See
   * Track A.9 in NEXUSWATCH-COMPLETION-PLAN.md.
   */
  interests?: Interests;
  /**
   * The country-level risk data the Watchlist filter runs against. Pulled
   * from briefData.topRiskCountries at send time and forwarded through
   * renderDossierEmail. Accepts the narrow WatchlistCountry shape above
   * so callers can project from whatever their own structure looks like.
   */
  watchlistCountries?: WatchlistCountry[];
}

/**
 * Parse Sonnet's markdown output into addressable sections. Each section
 * begins with `## <emoji> <title>` and runs until the next `##`.
 */
interface BriefSection {
  emoji: string;
  title: string;
  body: string;
}
function parseSections(markdown: string): BriefSection[] {
  const sections: BriefSection[] = [];
  // Split on '## ' at line starts, drop the leading empty fragment.
  const fragments = markdown.split(/\n?^## /m).filter(Boolean);
  for (const frag of fragments) {
    const firstNewline = frag.indexOf('\n');
    const headerLine = firstNewline === -1 ? frag : frag.slice(0, firstNewline);
    const body = firstNewline === -1 ? '' : frag.slice(firstNewline + 1).trim();

    // The header line is something like "☕ Good Morning" — split off the emoji.
    // Emojis can be 1-2 code points; we accept anything up to the first space.
    const firstSpace = headerLine.indexOf(' ');
    if (firstSpace === -1) {
      sections.push({ emoji: '', title: headerLine.trim(), body });
    } else {
      sections.push({
        emoji: headerLine.slice(0, firstSpace).trim(),
        title: headerLine.slice(firstSpace + 1).trim(),
        body,
      });
    }
  }
  return sections;
}

/**
 * Render a section body from Sonnet markdown into dossier-styled HTML.
 * Handles the subset of markdown the prompt actually emits:
 *   - **bold** → <strong>
 *   - numbered lists (`1. `) → numbered story cards
 *   - bullet lists (`- `) → bullet paragraphs
 *   - paragraphs separated by blank lines
 *   - inline "**Why it matters**" runs → oxblood callout blocks
 */
function renderSectionBody(body: string, links = false): string {
  if (!body.trim()) return '';
  const renderInline = (text: string) => renderInlineText(text, links);
  const paragraphBase = typeStyle(type.body, { color: colors.textPrimary, margin: `0 0 ${space.md} 0` });
  const bulletBase = typeStyle(type.body, {
    color: colors.textPrimary,
    margin: `0 0 ${space.sm} 0`,
    paddingLeft: space.lg,
  });
  const whyItMattersLabel = typeStyle(type.sectionLabel, {
    color: colors.accent,
    textTransform: 'uppercase',
    margin: `0 0 ${space.xs} 0`,
    display: 'block',
  });
  const whyItMattersBody = typeStyle(type.body, { color: colors.textPrimary, margin: 0 });
  const calloutBlock = style({
    margin: `${space.md} 0 ${space.lg} 0`,
    padding: `${space.md} ${space.lg}`,
    background: colors.accentBgSoft,
    borderLeft: `3px solid ${colors.accent}`,
    borderRadius: layout.radiusCallout,
  });

  // Split body into blocks separated by blank lines, then render each block
  // as a paragraph, numbered story, or bullet list based on its leading token.
  const blocks = body.split(/\n\s*\n/);
  const rendered: string[] = [];

  for (const raw of blocks) {
    const block = raw.trim();
    if (!block) continue;

    // Numbered story (`1. **Headline**\n   Body text...`).
    const numberedMatch = block.match(/^(\d+)\.\s+(.*)$/s);
    if (numberedMatch) {
      const num = numberedMatch[1];
      const rest = numberedMatch[2];
      rendered.push(
        `<div ${styleAttr(
          style({
            margin: `0 0 ${space.xl} 0`,
            paddingBottom: space.lg,
            borderBottom: `1px solid ${colors.border}`,
          }),
        )}>` +
          `<div ${styleAttr(
            typeStyle(type.kicker, {
              color: colors.textTertiary,
              margin: `0 0 ${space.xs} 0`,
            }),
          )}>STORY ${num}</div>` +
          `<div ${styleAttr(paragraphBase)}>${renderInline(rest)}</div>` +
          `</div>`,
      );
      continue;
    }

    // Bullet list (lines starting with `- ` or `* `).
    if (/^[-*]\s/.test(block)) {
      const items = block
        .split(/\n/)
        .filter((l) => /^[-*]\s/.test(l.trim()))
        .map((l) => l.trim().replace(/^[-*]\s+/, ''));
      rendered.push(
        items
          .map(
            (item) =>
              `<div ${styleAttr(bulletBase)}>` +
              `<span ${styleAttr(style({ color: colors.accent, marginRight: space.sm }))}>▸</span>` +
              renderInline(item) +
              `</div>`,
          )
          .join(''),
      );
      continue;
    }

    // "Why it matters" callout — detect when the block leads with the phrase.
    const whyMatch = block.match(/^\*\*Why it matters[:\s*]+\*\*\s*(.*)$/is);
    if (whyMatch) {
      rendered.push(
        `<div ${styleAttr(calloutBlock)}>` +
          `<span ${styleAttr(whyItMattersLabel)}>Why it matters</span>` +
          `<p ${styleAttr(whyItMattersBody)}>${renderInline(whyMatch[1])}</p>` +
          `</div>`,
      );
      continue;
    }

    // Plain paragraph.
    rendered.push(`<p ${styleAttr(paragraphBase)}>${renderInline(block)}</p>`);
  }

  return rendered.join('\n');
}

/**
 * A Markdown link to one of our own pages, as the record-only edition writes
 * them (api/_lib/brief-record.ts), matched AFTER the text is HTML-escaped. Only
 * https://nexuswatch.dev/ URLs, and only characters no escaping produces, so an
 * href can carry nothing but a path on our own site. Exported for the tests.
 */
export const OWN_LINK = /\[([^\]\n]+)\]\((https:\/\/nexuswatch\.dev\/[A-Za-z0-9/_.#?=%-]*)\)/g;

/** The plain-text form of an own-site link: the label, then the address. */
export function plainLinks(text: string): string {
  return text.replace(OWN_LINK, '$1 ($2)');
}

/**
 * Render inline markdown — **bold**, *italic*, and standalone "Why it matters"
 * phrases that appear mid-paragraph. Keeps the output safe by escaping raw
 * text first and then reintroducing the markup.
 *
 * `links` is set only for the mechanical edition, whose own-site links it
 * renders. A model edition renders exactly as it always has: a model that
 * wrote a link would get its brackets printed, as before.
 */
function renderInlineText(text: string, links = false): string {
  let out = escapeHtml(text);
  if (links) {
    out = out.replace(
      OWN_LINK,
      (_m, label: string, href: string) =>
        `<a href="${href}" ${styleAttr(style({ color: colors.accent, textDecoration: 'underline' }))}>${label}</a>`,
    );
  }
  // **bold**
  out = out.replace(/\*\*([^*]+)\*\*/g, `<strong ${styleAttr(style({ color: colors.textPrimary }))}>$1</strong>`);
  // *italic*
  out = out.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  return out;
}

/**
 * Render the Market Pulse module — mono ticker strip with semantic
 * up/down/flat coloring. Emitted as its own dossier block so the parent
 * template can place it independently of the Sonnet "Market Signal"
 * narrative section.
 */
function renderMarketPulse(markets: MarketQuote[]): string {
  if (markets.length === 0) return '';
  const strip = markets
    .map((m) => {
      const color = m.direction === 'up' ? colors.up : m.direction === 'down' ? colors.down : colors.flat;
      const symbolStyle = styleAttr(typeStyle(type.data, { color: colors.textTertiary, marginRight: space.xs }));
      const changeStyle = styleAttr(typeStyle(type.dataStrong, { color }));
      return `<span ${styleAttr(style({ display: 'inline-block', marginRight: space.lg, marginBottom: space.xs }))}>
        <span ${symbolStyle}>${escapeHtml(m.symbol)}</span> <span ${changeStyle}>${escapeHtml(m.change)}</span>
      </span>`;
    })
    .join('');

  return (
    `<div ${styleAttr(
      style({
        margin: `0 0 ${space.xl} 0`,
        padding: `${space.md} ${space.lg}`,
        background: colors.bgMuted,
        borderTop: `2px solid ${colors.divider}`,
        borderBottom: `2px solid ${colors.divider}`,
      }),
    )}>` +
    `<div ${styleAttr(
      typeStyle(type.sectionLabel, {
        color: colors.textTertiary,
        marginBottom: space.sm,
        textTransform: 'uppercase',
      }),
    )}>Market Pulse</div>` +
    strip +
    `</div>`
  );
}

/**
 * Render the "Your Watchlist" personalized module (Track A.9).
 *
 * Takes a recipient's declared interests + the brief's top-risk
 * countries, filters the countries down to the ones matching the
 * recipient's regions or top threat category, and emits a dossier
 * module with the top 3 matches. Each match gets a score badge and
 * a short "why this matters to you" tag built from the intersection
 * reasons.
 *
 * Returns an empty string if:
 *   - interests is undefined (anonymous preview / shared beehiiv path)
 *   - countries list is empty
 *   - no country matches the user's interests (we'd rather show
 *     nothing than a misleading empty card; the brief's main body
 *     still covers the global situation)
 *
 * This is the "hybrid personalization" from Apr 10 Decision 9: the
 * shared brief body is the same for every reader; the Watchlist
 * module is the one slice that varies per recipient.
 */
function renderYourWatchlist(interests: Interests | undefined, countries: WatchlistCountry[] | undefined): string {
  if (!interests || !countries || countries.length === 0) return '';

  // Score each country against the user's interests and keep the
  // matches. matchesInterests returns {match, reasons} — we sort by
  // CII score within the matched set so the most urgent items lead.
  const matched = countries
    .map((country) => {
      const result = matchesInterests(country, interests);
      return result.match ? { country, reasons: result.reasons } : null;
    })
    .filter((m): m is { country: WatchlistCountry; reasons: string[] } => m !== null)
    .sort((a, b) => b.country.score - a.country.score)
    .slice(0, 3);

  if (matched.length === 0) return '';

  const rows = matched
    .map(({ country, reasons }) => {
      const scoreColor =
        country.score >= 70
          ? colors.down
          : country.score >= 50
            ? colors.accent
            : country.score >= 30
              ? colors.divider
              : colors.up;

      return (
        `<div ${styleAttr(
          style({
            display: 'block',
            margin: `0 0 ${space.md} 0`,
            padding: `${space.md} ${space.lg}`,
            background: colors.bgCard,
            border: `1px solid ${colors.border}`,
            borderLeft: `3px solid ${scoreColor}`,
            borderRadius: layout.radiusCallout,
          }),
        )}>` +
        // Row: country name on the left, score chip on the right.
        `<div ${styleAttr(
          style({
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: space.xs,
          }),
        )}>` +
        `<span ${styleAttr(
          typeStyle(type.storyHeadline, {
            color: colors.textPrimary,
            fontSize: '18px',
            margin: 0,
          }),
        )}>${escapeHtml(country.name)}</span>` +
        `<span ${styleAttr(
          typeStyle(type.dataStrong, {
            color: scoreColor,
            fontSize: '14px',
          }),
        )}>CII ${country.score}</span>` +
        `</div>` +
        // Reasons tag — why this country is in THIS user's Watchlist.
        `<div ${styleAttr(
          typeStyle(type.caption, {
            color: colors.textTertiary,
            marginTop: space.xs,
          }),
        )}>` +
        `<span ${styleAttr(
          style({
            fontFamily: fonts.mono,
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: colors.accent,
            marginRight: space.sm,
          }),
        )}>Matches</span>` +
        `${reasons.map((r) => escapeHtml(r)).join(' · ')}` +
        `</div>` +
        `</div>`
      );
    })
    .join('');

  // Summary strip at the top of the section so the reader sees which
  // of their interests the match was against. Built from the
  // intersection of the interests enums so we don't leak the raw
  // region/threat IDs into the email.
  const regionLabels = interests.regions.map((r) => REGIONS.find((x) => x.id === r)?.label ?? r).join(' · ');
  const threatLabels = interests.threats.map((t) => THREATS.find((x) => x.id === t)?.label ?? t).join(' · ');

  return (
    `<div ${styleAttr(
      style({
        margin: `${space.xxl} 0 ${space.xxl} 0`,
        paddingTop: space.xl,
        borderTop: `2px solid ${colors.divider}`,
      }),
    )}>` +
    // Kicker label + serif headline
    `<div ${styleAttr(
      typeStyle(type.kicker, {
        color: colors.accent,
        margin: `0 0 ${space.xs} 0`,
      }),
    )}>YOUR WATCHLIST</div>` +
    `<h2 ${styleAttr(
      typeStyle(type.storyHeadline, {
        color: colors.textPrimary,
        margin: `0 0 ${space.sm} 0`,
      }),
    )}>Based on your interests</h2>` +
    // Interest summary strip
    `<div ${styleAttr(
      typeStyle(type.caption, {
        color: colors.textTertiary,
        margin: `0 0 ${space.lg} 0`,
      }),
    )}>${[regionLabels, threatLabels].filter(Boolean).join(' · ')}</div>` +
    // Matched country rows
    rows +
    `</div>`
  );
}

/**
 * Render the Map of the Day static image block. Embeds an <img> pointing
 * at /api/brief/screenshot?date=X&size=email — the endpoint returns
 * either a Mapbox Static Images redirect (when MAPBOX_TOKEN is set) or
 * a branded SVG fallback (when it isn't). Either way the layout holds.
 *
 * The 600px content width means we render the image at the same width
 * the dossier card expects — the screenshot endpoint generates at
 * 1200x630 so retina displays look crisp when scaled down.
 */
function renderMapOfTheDayImage(date: string): string {
  const imgUrl = `https://nexuswatch.dev/api/brief/screenshot?date=${encodeURIComponent(date)}&size=email`;
  return (
    `<div ${styleAttr(style({ margin: `${space.md} 0 ${space.lg} 0` }))}>` +
    `<img src="${imgUrl}" alt="Map of the Day — ${escapeHtml(date)}" width="${parseInt(layout.contentWidth, 10) - 64}" ${styleAttr(
      style({
        display: 'block',
        width: '100%',
        maxWidth: '100%',
        height: 'auto',
        borderRadius: layout.radiusCallout,
        border: `1px solid ${colors.border}`,
      }),
    )} />` +
    `</div>`
  );
}

/**
 * Render a Sonnet-written section into a Light Intel Dossier module. Every
 * section gets the same shell: kicker + serif headline + body. The body
 * renderer handles per-paragraph, per-bullet, per-story-card treatments
 * inside the shell.
 *
 * The "Map of the Day" section gets special treatment: an <img> of the
 * auto-generated screenshot is prepended to the body text so readers get
 * the visual anchor before the caption.
 */
function renderSection(section: BriefSection, dateForImage?: string, links = false): string {
  const kickerStyle = styleAttr(
    typeStyle(type.kicker, {
      color: colors.accent,
      margin: `0 0 ${space.xs} 0`,
    }),
  );
  const headlineStyle = styleAttr(
    typeStyle(type.storyHeadline, {
      color: colors.textPrimary,
      margin: `0 0 ${space.md} 0`,
    }),
  );
  const emojiInline = section.emoji
    ? `<span ${styleAttr(style({ marginRight: space.sm }))}>${section.emoji}</span>`
    : '';

  // Special case: Map of the Day gets the screenshot image embedded before
  // the Sonnet-generated caption.
  const isMapOfTheDay = /map of the day/i.test(section.title);
  const imageBlock = isMapOfTheDay && dateForImage ? renderMapOfTheDayImage(dateForImage) : '';

  return (
    `<div ${styleAttr(style({ margin: `0 0 ${space.xxl} 0` }))}>` +
    `<div ${kickerStyle}>${emojiInline}${escapeHtml(section.title.toUpperCase())}</div>` +
    `<h2 ${headlineStyle}>${escapeHtml(section.title)}</h2>` +
    imageBlock +
    renderSectionBody(section.body, links) +
    `</div>`
  );
}

/**
 * Masthead block. Rendered at the top of the email-only shell (not in
 * beehiivHtml — beehiiv writes its own). Shows the wordmark, date, and a
 * parchment-gold rule that anchors the dossier aesthetic.
 */
function renderEditionLine(): string {
  return `<div ${styleAttr(
    typeStyle(type.kicker, {
      color: colors.accent,
      margin: `${space.md} 0 0 0`,
    }),
  )}>${escapeHtml(MECHANICAL_EDITION_LINE)}</div>`;
}

function renderMasthead(date: string, time: string, edition: BriefEdition = 'model'): string {
  return (
    `<div ${styleAttr(style({ margin: `0 0 ${space.xl} 0`, textAlign: 'center' }))}>` +
    `<div ${styleAttr(
      typeStyle(type.masthead, {
        color: colors.textPrimary,
        margin: `0 0 ${space.xs} 0`,
        letterSpacing: '-0.01em',
      }),
    )}>NexusWatch</div>` +
    `<div ${styleAttr(
      typeStyle(type.kicker, {
        color: colors.accent,
        margin: `0 0 ${space.md} 0`,
      }),
    )}>SITUATION BRIEF</div>` +
    `<div ${styleAttr(
      style({
        height: '2px',
        background: `linear-gradient(to right, transparent, ${colors.divider}, transparent)`,
        margin: `0 0 ${space.md} 0`,
      }),
    )}></div>` +
    `<div ${styleAttr(
      typeStyle(type.issueMeta, {
        color: colors.textTertiary,
      }),
    )}>${escapeHtml(date)} · ${escapeHtml(time)}</div>` +
    (edition === 'mechanical' ? renderEditionLine() : '') +
    `</div>`
  );
}

/**
 * CTA block — "Open Live Map" + "Read the Brief Archive" pairing. Rendered
 * in the email shell only.
 */
function renderCTA(): string {
  const ctaButton = style({
    display: 'inline-block',
    padding: `${space.md} ${space.xl}`,
    background: colors.accent,
    color: colors.textInverse,
    textDecoration: 'none',
    borderRadius: layout.radiusCallout,
    fontFamily: fonts.mono,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  });
  const ctaSecondary = style({
    display: 'inline-block',
    padding: `${space.md} ${space.xl}`,
    background: 'transparent',
    color: colors.textPrimary,
    textDecoration: 'none',
    border: `1px solid ${colors.borderStrong}`,
    borderRadius: layout.radiusCallout,
    fontFamily: fonts.mono,
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    marginRight: space.md,
  });

  return (
    `<div ${styleAttr(style({ margin: `${space.xl} 0`, textAlign: 'center' }))}>` +
    `<a href="https://nexuswatch.dev/#/ledger" ${styleAttr(ctaSecondary)}>Open the ledger →</a>` +
    `<a href="https://nexuswatch.dev/#/briefs" ${styleAttr(ctaButton)}>Read the Brief Archive →</a>` +
    `</div>`
  );
}

/**
 * Footer — unsubscribe, preferences, forward-to-colleague permalink, and
 * the brand signature. Forward-to-colleague is the growth loop: a clickable
 * permalink to the /brief/:date archive page, which subscribers can share
 * directly without exposing their email address.
 */
function renderFooter(date: string, archiveUrl: string): string {
  const footerText = typeStyle(type.caption, {
    color: colors.textTertiary,
    margin: `0 0 ${space.sm} 0`,
  });
  const footerLink = style({
    color: colors.accent,
    textDecoration: 'none',
  });
  return (
    `<div ${styleAttr(
      style({
        marginTop: space.xxl,
        paddingTop: space.xl,
        borderTop: `1px solid ${colors.border}`,
        textAlign: 'center',
      }),
    )}>` +
    `<p ${styleAttr(footerText)}>` +
    `Know someone who should read this? ` +
    `<a href="${escapeHtml(archiveUrl)}" ${styleAttr(footerLink)}>Forward today's brief →</a>` +
    `</p>` +
    `<p ${styleAttr(footerText)}>` +
    // Preferences points at /settings — a route that EXISTS. Both this and
    // the unsubscribe link used to point at routes that were never in the
    // router: every footer link a subscriber could act on was a 404.
    `<a href="https://nexuswatch.dev/settings" ${styleAttr(footerLink)}>Preferences</a>` +
    ` · ` +
    // Per-recipient: one body is rendered for all recipients, so the signed
    // link is substituted at send time (deliver-briefs), never baked here.
    `<a href="${UNSUB_PLACEHOLDER}" ${styleAttr(footerLink)}>Unsubscribe</a>` +
    ` · ` +
    `<a href="mailto:hello@nexuswatch.dev" ${styleAttr(footerLink)}>hello@nexuswatch.dev</a>` +
    `</p>` +
    `<p ${styleAttr(
      typeStyle(type.caption, {
        color: colors.textTertiary,
        margin: `${space.md} 0 0 0`,
      }),
    )}>NexusWatch Intelligence · Issue ${escapeHtml(date)}</p>` +
    `</div>`
  );
}

/**
 * Render a text/plain multipart fallback from the markdown body. ~15% of
 * intel readers use text-only mail clients, and Resend + beehiiv both
 * treat a plain-text alternative as a deliverability signal. Preserves
 * section structure and reading order without trying to ASCII-art it.
 */
function renderPlainText(
  briefText: string,
  date: string,
  time: string,
  archiveUrl: string,
  edition: BriefEdition = 'model',
): string {
  // Strip bold/italic markers but keep the plain text. Section headers
  // already use `## ` and read fine as-is in a mono client.
  // A mechanical edition's own-site links read as "label (address)". A model
  // edition is untouched, as in the HTML.
  const stripped = (edition === 'mechanical' ? plainLinks(briefText) : briefText)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .trim();

  return [
    `NEXUSWATCH SITUATION BRIEF`,
    `${date} · ${time}`,
    ...(edition === 'mechanical' ? [MECHANICAL_EDITION_LINE] : []),
    `──────────────────────────────────────────`,
    '',
    stripped,
    '',
    `──────────────────────────────────────────`,
    ``,
    `Read the ledger: https://nexuswatch.dev/#/ledger`,
    `Read the Brief Archive: https://nexuswatch.dev/#/briefs`,
    `Forward today's brief: ${archiveUrl}`,
    ``,
    `Preferences: https://nexuswatch.dev/settings`,
    `Unsubscribe: ${UNSUB_PLACEHOLDER}`,
    `Contact: hello@nexuswatch.dev`,
    ``,
    `NexusWatch Intelligence`,
  ].join('\n');
}

/**
 * Compose the inner dossier content block (used by both the full email and
 * the beehiiv post body). Structure: Market Pulse → all Sonnet sections in
 * order → optional Your Watchlist module (per-recipient). The Sonnet output
 * controls the narrative sections; this function just styles them and
 * inserts the Market Pulse module after Good Morning and the Watchlist
 * module at the end.
 *
 * Passes `date` down to renderSection so the Map of the Day module can
 * embed the correct screenshot URL. When `interests` + `watchlistCountries`
 * are provided, appends the personalized Watchlist at the end via
 * renderYourWatchlist (Track A.9). When absent, no Watchlist is rendered —
 * appropriate for the shared beehiiv post body.
 */
function renderDossierInner(
  briefText: string,
  markets: MarketQuote[],
  date: string,
  interests?: Interests,
  watchlistCountries?: WatchlistCountry[],
  edition: BriefEdition = 'model',
): string {
  // The mechanical edition is the record (buildFallbackText, plan R1): it
  // carries no market block of its own, and Market Pulse is not part of it.
  // Its own-site links (call pages, /ledger, /corrections) render as links.
  const mechanical = edition === 'mechanical';
  if (mechanical) markets = [];
  const sections = parseSections(briefText);
  if (sections.length === 0) {
    // Fallback: wrap the whole body as a single paragraph block.
    return `<div ${styleAttr(typeStyle(type.body, { color: colors.textPrimary }))}>${renderInlineText(briefText, mechanical)}</div>`;
  }

  const pieces: string[] = [];
  let marketPulseInserted = false;

  for (const section of sections) {
    pieces.push(renderSection(section, date, mechanical));
    // Insert the Market Pulse module right after Top Signal, so the
    // reader gets price context before diving into the movers.
    if (!marketPulseInserted && /top signal|good morning/i.test(section.title)) {
      pieces.push(renderMarketPulse(markets));
      marketPulseInserted = true;
    }
  }

  // If there's no Good Morning section (shouldn't happen with Sonnet output,
  // but defensive against the fallback builder), prepend Market Pulse.
  if (!marketPulseInserted) {
    pieces.unshift(renderMarketPulse(markets));
  }

  // Per-recipient Watchlist module — empty string when interests is
  // undefined or no countries match, so the beehiiv shared post body
  // gets no Watchlist section automatically.
  // Not on a mechanical day: the watchlist is index rows, not the record.
  const watchlistHtml = mechanical ? '' : renderYourWatchlist(interests, watchlistCountries);
  if (watchlistHtml) pieces.push(watchlistHtml);

  return pieces.join('\n');
}

/**
 * THE EMAIL IS LIGHT-ONLY, AND SAYS SO. It used to declare
 * `color-scheme: light dark` and ship a dark stylesheet — which targeted five
 * `.dossier-text-*` classes that appear on ZERO elements. The only class in
 * the whole document is on the outer card. So a phone client that honoured
 * the declaration (iOS Mail, Apple Mail, Outlook iOS) turned every background
 * near-black via `body, table, td { !important }` while all 42 text elements
 * kept their inline graphite text colour — black on black, reported by the
 * owner on 2026-09-12 as "the email is also black and you can't read
 * anything".
 *
 * The identity is the LIGHT Intel Dossier — ivory page, graphite ink — so the
 * honest declaration is `light`. Apple Mail then leaves the email alone in
 * dark mode. Gmail applies its own inversion regardless of any declaration
 * and that is outside a sender's control; a full inversion keeps contrast, so
 * it stays readable. What must never happen again is the client darkening the
 * ground while we keep the ink dark.
 *
 * If dark mode is ever wanted for real, the fix is to make the dark rules
 * match the elements they mean to restyle (every inline `color:` needs a
 * counterpart), verified by looking at a phone — not by adding the block back.
 */
const EMAIL_COLOR_SCHEME = 'light';

/**
 * Main export — render a brief into all three delivery formats.
 *
 * This is the only function the rest of the handler (and the preview
 * endpoint in api/admin/brief/preview.ts) should call. It guarantees the
 * three outputs stay synchronized: same content, three different
 * renderings (email shell, beehiiv content, plain-text).
 */
export function renderDossierEmail(opts: RenderBriefOptions): RenderedBrief {
  const { briefText, date, time, markets, interests, watchlistCountries } = opts;
  const edition: BriefEdition = opts.edition ?? 'model';
  const archiveUrl = opts.archiveUrl ?? `https://nexuswatch.dev/#/brief/${date}`;
  const inner = renderDossierInner(briefText, markets, date, interests, watchlistCountries, edition);

  // Full standalone email shell for Resend transactional path.
  const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="${EMAIL_COLOR_SCHEME}">
  <meta name="supported-color-schemes" content="${EMAIL_COLOR_SCHEME}">
  <title>NexusWatch Situation Brief · ${escapeHtml(date)}</title>
</head>
<body ${styleAttr(
    style({
      margin: 0,
      padding: 0,
      background: colors.bgPage,
      fontFamily: fonts.sans,
      color: colors.textPrimary,
      WebkitTextSizeAdjust: '100%',
      msTextSizeAdjust: '100%',
    }),
  )}>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ${styleAttr(
    style({ background: colors.bgPage, padding: `${space.xl} ${space.md}` }),
  )}>
    <tr><td align="center">
      <table role="presentation" width="${layout.contentWidth}" cellpadding="0" cellspacing="0" border="0" class="dossier-card" ${styleAttr(
        style({
          maxWidth: layout.contentWidth,
          background: colors.bgCard,
          borderRadius: layout.radiusCard,
          border: `1px solid ${colors.border}`,
          padding: layout.gutter,
        }),
      )}>
        <tr><td>
          ${renderMasthead(date, time, edition)}
          ${inner}
          ${renderCTA()}
          ${renderFooter(date, archiveUrl)}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // Inner modules only for the beehiiv post body. beehiiv adds its own
  // masthead, footer, and unsubscribe footer, so we ship just the content.
  const beehiivHtml = `<div ${styleAttr(
    style({
      fontFamily: fonts.sans,
      color: colors.textPrimary,
      background: colors.bgCard,
      padding: space.md,
      maxWidth: layout.contentWidth,
    }),
  )}>${edition === 'mechanical' ? renderEditionLine() : ''}${inner}${renderCTA()}</div>`;

  const plainText = renderPlainText(briefText, date, time, archiveUrl, edition);

  return { emailHtml, beehiivHtml, plainText };
}

// === RSS fetcher for news headlines ===
async function fetchNewsHeadlines(): Promise<NewsItem[]> {
  const headlines: NewsItem[] = [];
  const results = await Promise.allSettled(
    BRIEF_RSS_FEEDS.map(async (feed) => {
      const r = await fetch(feed.url, {
        signal: AbortSignal.timeout(6000),
        headers: { 'User-Agent': 'NexusWatch/1.0 Intelligence Brief' },
      });
      if (!r.ok) return [];
      const xml = await r.text();
      return parseRssItems(xml, feed.source);
    }),
  );
  for (const r of results) {
    if (r.status === 'fulfilled') headlines.push(...r.value);
  }
  // Sort by recency heuristic (position in feed) and deduplicate
  const seen = new Set<string>();
  return headlines
    .filter((h) => {
      const key = h.title.toLowerCase().slice(0, 50);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 20);
}

function parseRssItems(xml: string, source: string): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
    const item = match[1];
    const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/.exec(item);
    const title = titleMatch ? titleMatch[1].replace(/<!\[CDATA\[|\]\]>/g, '').trim() : '';
    if (title && title.length > 10) {
      items.push({ title, source });
    }
  }
  return items;
}

// === Haversine distance for correlation detection ===
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// === Fallback brief in markdown (when AI fails) ===
// Matches the A.5 locked structure (Apr 10 Decision 5): 7 weekday sections
// + optional Friday Tool of the Week. No Space & Tech (deliberately dropped
// during A.5 — wasn't in the locked structure). Sunday falls back to the
/**
 * Format resolved calls for the prompt context and the fallback.
 *
 * The first line is ALWAYS the aggregate; detail lines follow, ordered by
 * divergence from the stored base rate (most informative first — a hit at 16%
 * against a 10% base says more than the seventh hit at 84%). Capped so a
 * 105-resolution morning cannot flood the prompt; the cap is stated in the
 * output so the model knows the list is bounded rather than complete.
 *
 * Every numeral here lands in dataContext, which is what makes it QUOTABLE:
 * the grounding gate (groundDraft) verifies the draft's numerals against the
 * context, so a resolution the model mentions must appear here first or the
 * whole draft is refused in favour of the fallback.
 */
export interface ResolvedCallRow {
  kind: string;
  country_code: string;
  probability: number;
  base_rate: number | null;
  status: string;
  resolves_on: string;
  evidence_count: number | null;
  /** From call_corrections, when the call has one. Never replaces `status`. */
  corrected_status?: string | null;
}

/**
 * Splice the standing ledger line into a brief body.
 *
 * INSIDE the first section, as a bold paragraph — never as a preamble and
 * never as a blockquote. Both halves of that were learned on 2026-09-05, the
 * first resolution day: the old splice put `> **The Ledger** ...` at line 0,
 * and (a) no renderer in the product handles `>`, so the literal character
 * shipped to every subscriber, while (b) parseSections splits on `^## `, so
 * everything before the first header became a TITLELESS pseudo-section with
 * an empty kicker and empty h2 above it. The single most important line the
 * product had ever published went out mis-rendered on all three surfaces.
 *
 * A bold paragraph under the first `## ` header renders correctly in the
 * email renderer, the SPA mirror, and the archive today, with zero renderer
 * changes. The dedicated masthead treatment belongs to the redesign.
 */
export function spliceLedgerLine(briefText: string, ledger: string): string {
  const lines = briefText.split('\n');
  const firstHeader = lines.findIndex((l) => l.startsWith('## '));
  const block = ['', `**The Ledger** — ${ledger}`];
  if (firstHeader >= 0) lines.splice(firstHeader + 1, 0, ...block);
  else lines.push(...block);
  return lines.join('\n');
}

/**
 * The claim wording, BY KIND, with no default that lies. An independent
 * review caught the first version's `fx ? … : censorship` else-branch: a new
 * call kind would have been described to the public as "a confirmed
 * censorship event" — a false claim manufactured by omission. Unknown kinds
 * now get wording that is true of every call by construction (each names its
 * external resolver at creation), and the resolver itself refuses to score
 * kinds it does not know, so this is defence in depth, not the only wall.
 */
function claimWording(kind: string, resolvesOn: string): string {
  if (kind === 'fx_devaluation') return `currency depreciation by ${resolvesOn}`;
  if (kind === 'censorship_event') return `a confirmed censorship event by ${resolvesOn}`;
  return `the outcome it named against its declared external source by ${resolvesOn}`;
}

export function formatResolvedCallLines(
  rows: ResolvedCallRow[],
  stillDuePending: number,
  nameOf: Map<string, string> | undefined,
  // REQUIRED, deliberately. Round three caught the optional version: a caller
  // omitting totals silently fell back to rows.length — a PAGE — which is the
  // by_kind page-size defect with a default parameter for a disguise. The
  // aggregate comes from COUNT(*) or the caller does not compile.
  //
  // `corrections` are the window's calls the evidence records differently from
  // the published verdict, counted over the whole window like the totals. The
  // published counts stand; the corrections are stated beside them.
  totals: { total: number; hits: number; corrections?: Array<{ status: string; corrected_status: string }> },
  cap = 12,
  // The window the totals cover, as a phrase ("today", "in the last 7 days").
  // The aggregate used to print no window, so beside the ledger line's "N
  // resolved today" a reader saw two unlabelled counts and could not tell why
  // they differed (on Sundays the totals span 7 days, the ledger line one).
  windowLabel?: string,
): string[] {
  const total = totals.total;
  const hits = totals.hits;
  const corrections = totals.corrections ?? [];
  if (total === 0 && stillDuePending === 0) return [];
  const lines: string[] = [];
  // "Under the coverage-grace rule" was WRONG on 2026-09-06: 63 of the 74
  // due-pending rows were FX calls stuck on a resolver defect, and the brief
  // confidently attributed all of them to a rule that only governs
  // censorship coverage. A pending row has many possible reasons; the line
  // now states the fact (due, unresolved, never auto-missed) and only the
  // fact. The reason belongs to the ledger row, which carries it.
  const graceNote =
    stillDuePending > 0
      ? ` ${stillDuePending} due call${stillDuePending === 1 ? '' : 's'} remain${stillDuePending === 1 ? 's' : ''} unresolved — held, never scored as a miss by default; each row on the ledger carries its reason.`
      : '';
  if (total === 0) {
    // Due calls exist and NONE resolved — either everything is grace-held, or
    // the resolver did not run. Say which is knowable, and never go quiet.
    lines.push(`${stillDuePending} calls came due and none has resolved yet.${graceNote}`);
    return lines;
  }
  // Same words /ledger uses (describeCorrections). The verdicts above are as
  // published; the model is told which of them the evidence says otherwise.
  const correctionNote =
    corrections.length > 0 ? ` The counts are as published; ${describeCorrections(corrections)}.` : '';
  lines.push(
    `${total} calls settled${windowLabel ? ` ${windowLabel}` : ''} against external ground truth: ${hits} hit, ${total - hits} miss.${correctionNote}${graceNote}`,
  );
  const byInfo = [...rows].sort(
    (a, b) =>
      Math.abs((b.probability ?? 0) - (b.base_rate ?? b.probability ?? 0)) -
      Math.abs((a.probability ?? 0) - (a.base_rate ?? a.probability ?? 0)),
  );
  for (const r of byInfo.slice(0, cap)) {
    const name = nameOf?.get(r.country_code) ?? r.country_code;
    const published = r.status === 'hit' ? 'HIT' : 'MISS';
    const recorded = correctedOutcomeOf(r.status, r.corrected_status ?? null);
    const outcome =
      recorded === undefined
        ? published
        : `${published} as published, the evidence records as ${recorded === 1 ? 'HIT' : 'MISS'}`;
    const base = r.base_rate !== null ? ` (base rate ${(r.base_rate * 100).toFixed(0)}%)` : '';
    const evidence =
      r.kind === 'censorship_event' && r.evidence_count !== null && r.status === 'hit'
        ? ` — OONI confirmed blocking on ${r.evidence_count} day${r.evidence_count === 1 ? '' : 's'} in the window`
        : '';
    lines.push(
      `${name} (${r.country_code}): ${outcome} — we said ${(r.probability * 100).toFixed(0)}%${base} for ${claimWording(r.kind, r.resolves_on)}${evidence}`,
    );
  }
  const shown = Math.min(byInfo.length, cap);
  if (total > shown) lines.push(`…and ${total - shown} more, listed in full on the ledger.`);
  return lines;
}

/**
 * The open-call and resolved-call lines, for the prompt and the mechanical
 * edition. Database reads only, so the handler calls this on every run,
 * whether or not a model key is set. Until 2026-11-23 these reads sat inside
 * the key-only branch, so the first day with no key printed "No open calls
 * today." over a book of hundreds and dropped the day's resolutions. The
 * queries and formatting are unchanged, and the prompt receives the same
 * lines for the same data.
 *
 * Non-fatal, as before: a failure costs these lines, never the brief. The
 * open-call read is reported separately (`openCallsRead`), so the mechanical
 * edition can tell an empty book from one it could not read.
 */
async function gatherCallLines(
  sql: SqlTag,
  nameOf: Map<string, string>,
  isSunday: boolean,
): Promise<Pick<BriefData, 'openCallLines' | 'resolvedCallLines' | 'openCallsRead' | 'resolvedCallsRead'>> {
  let openCallLines: string[] = [];
  let resolvedCallLines: string[] = [];
  let openCallsRead = false;
  let resolvedCallsRead = false;
  try {
    // Ordered by DIVERGENCE from the base rate, not by probability.
    // Sorting by probability surfaced seven identical 84% calls — the
    // countries where blocking is constant and the forecast is simply the
    // climatology. Those are true and uninteresting. The calls worth a
    // sentence are the ones where recent activity has pulled us away from
    // the long-run rate: that is where we are actually saying something.
    const open = (await sql`
      SELECT kind, country_code, probability::float AS p, base_rate::float AS base,
             resolves_on::text AS resolves_on, threshold_pct::float AS threshold_pct
      FROM calls
      -- Calibration-harness calls (seismicity) are excluded EXPLICITLY,
      -- not by trusting their zero divergence to sort them out of the
      -- top 8 — and the per-kind phrasing below doesn't speak seismic.
      WHERE status = 'pending' AND base_rate IS NOT NULL AND NOT (kind = ANY(${[...CALIBRATION_KINDS]}))
      ORDER BY ABS(probability - base_rate) DESC, probability DESC
      LIMIT 8
    `) as unknown as Array<{
      kind: string;
      country_code: string;
      p: number;
      base: number;
      resolves_on: string;
      threshold_pct: number | null;
    }>;
    openCallLines = open.map((c) => {
      const delta = (c.p - c.base) * 100;
      const vs =
        Math.abs(delta) < 1
          ? 'in line with its base rate'
          : `${delta > 0 ? '+' : ''}${delta.toFixed(0)}pts vs its base rate of ${(c.base * 100).toFixed(0)}%`;
      // Phrase the claim by KIND. Before 2026-08-23 every call here was
      // described as "a confirmed censorship event" — including the FX
      // calls, which would have handed the model a false claim to
      // faithfully repeat.
      // No else-branch that lies: an unknown kind gets wording true of
      // every call by construction, same rule as claimWording above.
      const claim =
        c.kind === 'fx_devaluation'
          ? `${(c.p * 100).toFixed(0)}% chance the currency depreciates ${c.threshold_pct !== null ? `≥${c.threshold_pct}% ` : ''}peak-vs-issue by ${c.resolves_on}`
          : c.kind === 'censorship_event'
            ? `${(c.p * 100).toFixed(0)}% chance of a confirmed censorship event by ${c.resolves_on}`
            : `${(c.p * 100).toFixed(0)}% chance of the outcome it names, against its declared external source, by ${c.resolves_on}`;
      return `${nameOf.get(c.country_code) ?? c.country_code} (${c.country_code}): ${claim} — ${vs}`;
    });
    openCallsRead = true;

    // RESOLVED CALLS — the reason this block exists is 2026-09-05: the
    // first resolution day in the product's history, and the model led
    // with an unrelated FX call because nothing below selected anything
    // but status='pending'. The register's whole output was invisible to
    // its own writer.
    //
    // Window: today on weekdays; the last 7 days on Sunday, whose prompt
    // has asked "which calls resolved this week and how" since 08-23 —
    // an instruction that was unsatisfiable until this query existed.
    // Calendar-day semantics, not a rolling 24h: "today" must mean
    // resolved_at::date = CURRENT_DATE, or a late manual resolution
    // yesterday afternoon gets published as today's. Sunday looks back
    // 7 calendar days for "the week on the record".
    //
    // The exclusion DERIVES from CALIBRATION_KINDS — the canonical
    // "not a public claim" property in api/_lib/calls.ts — rather than
    // naming seismicity_window here. A future calibration kind is
    // excluded the day it is added to the set, not the day someone
    // remembers this file exists.
    const calibrationKinds = [...CALIBRATION_KINDS];
    // COUNTS FROM COUNT(*), DETAIL FROM THE PAGE — the same law the
    // ledger endpoint had to learn twice (by_kind published a page size
    // on 2026-08-30). The aggregate line quotes these totals; the paged
    // fetch below only supplies which INDIVIDUAL calls get a sentence.
    const resolvedTotals = (await sql`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'hit')::int AS hits
      FROM calls
      WHERE status = ANY(${[...SCORED_STATUSES]}) AND NOT (kind = ANY(${calibrationKinds}))
        AND resolved_at::date > CURRENT_DATE - ${isSunday ? 7 : 1}::int
    `) as unknown as Array<{ total: number; hits: number }>;
    // Corrections ride along (see the ledger line in the handler): the model must
    // be handed the corrected reading with the published verdict, or it
    // can restate a verdict the register has recorded as wrong.
    const resolvedRows = (await sql`
      SELECT c.kind, c.country_code, c.probability::float AS probability,
             c.base_rate::float AS base_rate, c.status,
             c.resolves_on::text AS resolves_on, c.evidence_count, cc.corrected_status
      FROM calls c
      LEFT JOIN (
        SELECT DISTINCT ON (call_id) call_id, corrected_status
        FROM call_corrections ORDER BY call_id, issued_on DESC
      ) cc ON cc.call_id = c.id
      WHERE c.status = ANY(${[...SCORED_STATUSES]}) AND NOT (c.kind = ANY(${calibrationKinds}))
        AND c.resolved_at::date > CURRENT_DATE - ${isSunday ? 7 : 1}::int
      ORDER BY ABS(c.probability - COALESCE(c.base_rate, c.probability)) DESC
      LIMIT 40
    `) as unknown as ResolvedCallRow[];
    // The aggregate's corrections come from the whole window, not the
    // 40-row page, for the same reason `resolvedTotals` does.
    const windowCorrections = (await sql`
      SELECT c.status, cc.corrected_status
      FROM calls c
      JOIN (
        SELECT DISTINCT ON (call_id) call_id, corrected_status
        FROM call_corrections ORDER BY call_id, issued_on DESC
      ) cc ON cc.call_id = c.id
      WHERE c.status = ANY(${[...SCORED_STATUSES]}) AND NOT (c.kind = ANY(${calibrationKinds}))
        AND c.resolved_at::date > CURRENT_DATE - ${isSunday ? 7 : 1}::int
    `) as unknown as Array<{ status: string; corrected_status: string }>;
    // Due-but-unresolved: matured rows still pending. Includes the
    // coverage-grace holds (expected, and the formatter says so) — and,
    // in the failure case, a resolver that did not run. Either way the
    // brief must not read like an ordinary day by silent omission.
    const dueStillPending = (await sql`
      SELECT COUNT(*)::int AS n FROM calls
      WHERE status = 'pending' AND resolves_on <= CURRENT_DATE
        AND NOT (kind = ANY(${calibrationKinds}))
    `) as unknown as Array<{ n: number }>;
    const duePending = dueStillPending[0]?.n ?? 0;
    if (resolvedRows.length === 0 && duePending > 0) {
      console.error(
        `[daily-brief] ${duePending} calls due but ZERO resolved in window — ` +
          'resolve-calls may not have run; the brief will say so rather than go quiet',
      );
    }
    resolvedCallLines = formatResolvedCallLines(
      resolvedRows,
      duePending,
      nameOf,
      {
        ...(resolvedTotals[0] ?? { total: resolvedRows.length, hits: 0 }),
        corrections: windowCorrections.filter((r) => correctedOutcomeOf(r.status, r.corrected_status) !== undefined),
      },
      undefined,
      isSunday ? 'in the last 7 days' : 'today',
    );
    resolvedCallsRead = true;
  } catch (callErr) {
    console.error(
      '[daily-brief] call lines unavailable (non-fatal):',
      callErr instanceof Error ? callErr.message : callErr,
    );
  }
  return { openCallLines, resolvedCallLines, openCallsRead, resolvedCallsRead };
}

/** A calls row as the record's queries select it, before the country name is attached. */
type RecordCallRow = Omit<RecordCall, 'name'>;

/**
 * The mechanical edition's reads (plan R1): today's scored resolutions and the
 * open book, from the calls table. Database reads only, run on every run, and
 * entirely separate from gatherCallLines, whose queries feed the model's prompt
 * and are left exactly as they were.
 *
 * TODAY MEANS THE CALENDAR DAY, every day of the week: the same filter as the
 * Ledger line's "N resolved today" and the subject's count (resolved_at::date =
 * CURRENT_DATE, scored statuses, calibration kinds excluded), so the three agree.
 * The open count is the Ledger line's too, and "next to resolve" uses its
 * definition of next: a resolution date after today.
 *
 * The two halves are read in separate trys with separate flags: a failure costs
 * that half's lines, says so, and never reads as an empty day or an empty book.
 * Counts come from COUNT(*); the lists are capped pages, ordered in SQL by the
 * same keys brief-record.ts sorts by, with the call id as the last tie-break.
 */
async function gatherRecord(sql: SqlTag, nameOf: Map<string, string>): Promise<BriefRecord> {
  const calKinds = [...CALIBRATION_KINDS];
  const scored = [...SCORED_STATUSES];
  const named = (rows: RecordCallRow[]): RecordCall[] =>
    rows.map((r) => ({ ...r, name: nameOf.get(r.country_code) ?? null }));

  let resolved: ResolvedRead = { read: false };
  try {
    const totals = (await sql`
      SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'hit')::int AS hits
      FROM calls
      WHERE status = ANY(${scored}) AND NOT (kind = ANY(${calKinds}))
        AND resolved_at::date = CURRENT_DATE
    `) as unknown as Array<{ total: number; hits: number }>;
    const page = (await sql`
      SELECT c.id::int AS id, c.kind, c.country_code, c.claim, c.probability::float AS probability,
             c.base_rate::float AS base_rate, c.threshold, c.threshold_pct::float AS threshold_pct,
             c.made_on::text AS made_on, c.resolves_on::text AS resolves_on, c.status,
             c.evidence_count, cc.corrected_status
      FROM calls c
      LEFT JOIN (
        SELECT DISTINCT ON (call_id) call_id, corrected_status
        FROM call_corrections ORDER BY call_id, issued_on DESC
      ) cc ON cc.call_id = c.id
      WHERE c.status = ANY(${scored}) AND NOT (c.kind = ANY(${calKinds}))
        AND c.resolved_at::date = CURRENT_DATE
      ORDER BY ABS(c.probability - COALESCE(c.base_rate, c.probability)) DESC, c.id ASC
      LIMIT ${RESOLVED_LIST_CAP}
    `) as unknown as RecordCallRow[];
    // Over the whole day, not the page, as the totals are.
    const corrections = (await sql`
      SELECT c.status, cc.corrected_status
      FROM calls c
      JOIN (
        SELECT DISTINCT ON (call_id) call_id, corrected_status
        FROM call_corrections ORDER BY call_id, issued_on DESC
      ) cc ON cc.call_id = c.id
      WHERE c.status = ANY(${scored}) AND NOT (c.kind = ANY(${calKinds}))
        AND c.resolved_at::date = CURRENT_DATE
    `) as unknown as Array<{ status: string; corrected_status: string }>;
    resolved = {
      read: true,
      total: totals[0]?.total ?? 0,
      hits: totals[0]?.hits ?? 0,
      corrections: corrections.filter((r) => correctedOutcomeOf(r.status, r.corrected_status) !== undefined),
      calls: named(page),
    };
  } catch (err) {
    console.error(
      '[daily-brief] record: resolved calls unavailable (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }

  let open: OpenRead = { read: false };
  try {
    const counts = (await sql`
      SELECT COUNT(*)::int AS open_total,
             COUNT(*) FILTER (WHERE resolves_on <= CURRENT_DATE)::int AS held
      FROM calls
      WHERE status = 'pending' AND NOT (kind = ANY(${calKinds}))
    `) as unknown as Array<{ open_total: number; held: number }>;
    const next = (await sql`
      SELECT c.id::int AS id, c.kind, c.country_code, c.claim, c.probability::float AS probability,
             c.base_rate::float AS base_rate, c.threshold, c.threshold_pct::float AS threshold_pct,
             c.made_on::text AS made_on, c.resolves_on::text AS resolves_on, c.status,
             c.evidence_count, NULL::text AS corrected_status
      FROM calls c
      WHERE c.status = 'pending' AND NOT (c.kind = ANY(${calKinds})) AND c.resolves_on > CURRENT_DATE
      ORDER BY c.resolves_on ASC, ABS(c.probability - COALESCE(c.base_rate, c.probability)) DESC, c.id ASC
      LIMIT ${OPEN_LIST_CAP}
    `) as unknown as RecordCallRow[];
    open = { read: true, total: counts[0]?.open_total ?? 0, held: counts[0]?.held ?? 0, next: named(next) };
  } catch (err) {
    console.error(
      '[daily-brief] record: open calls unavailable (non-fatal):',
      err instanceof Error ? err.message : err,
    );
  }

  // Repository data, not a read: /corrections answers 404 until a note is approved.
  return { resolved, open, correctionsPage: correctionsNewestFirst().length > 0 };
}

/**
 * The data archived beside the edition in daily_briefs.content.
 *
 * A model day archives what it always did: the model's inputs, unchanged (the
 * record is left out, so not one byte of a model day's row moves). A mechanical
 * day archives only the record it printed. The wire headlines, market quotes and
 * index rows it no longer prints stay out of its public JSON (/api/v1/brief,
 * the MCP get_brief tool), so that JSON says what the edition says. Nothing
 * reads those fields from a mechanical row: delivery ignores markets on a
 * mechanical day, and the share images no longer draw on the index.
 */
export function archivedData(data: BriefData, onFallback: boolean): object {
  if (onFallback) return { date: data.date, utcTime: data.utcTime, record: data.record ?? null };
  const modelDay: Partial<BriefData> = { ...data };
  delete modelDay.record;
  return modelDay;
}

/**
 * Why the mechanical edition shipped, as the reader is told it. Two cases, not
 * six: a reader needs to know whether a draft existed and was refused, or
 * whether none was written. Nine days in November 2026 said "a publish gate
 * withheld the draft" while the model API was failing and no draft existed.
 */
export type FallbackCause = 'draft-refused' | 'no-draft' | 'dry-run';

/**
 * The dry-run cause (BRIEF_MODEL_MODE is not `live` and the draft cleared every
 * gate). Neither of the other two is true that day: a draft was produced, and
 * no gate withheld it. Reader-facing; proposed for the owner's sign-off as
 * "A model-written draft is being tested and was not sent."
 */
export const DRY_RUN_CLAUSE = 'a model-written draft is being tested and was not sent';

/**
 * Every path that reaches buildFallbackText, and the cause it must pass. A
 * Record over a closed union, so a path added to the union without an entry
 * here does not compile, and the call-site test fails a call that omits it.
 * The cause is chosen here, at the call site, and never recovered from the
 * aiDebug string (reading a string where a flag belonged caused two earlier
 * bugs; see the fallback alarm below).
 */
export type FallbackPath =
  | 'no-api-key'
  | 'http-error'
  | 'exception'
  | 'empty-response'
  | 'grounding-refused'
  | 'structure-refused'
  | 'comparative-refused'
  | 'incomplete-reply'
  | 'dry-run';

export const FALLBACK_CAUSE: Record<FallbackPath, FallbackCause> = {
  'no-api-key': 'no-draft',
  'http-error': 'no-draft',
  exception: 'no-draft',
  'empty-response': 'no-draft',
  'grounding-refused': 'draft-refused',
  'structure-refused': 'draft-refused',
  // An unmarked "record" or "N blocks": a draft existed and a gate refused it.
  'comparative-refused': 'draft-refused',
  // Cut off, refused by the model, or an unexpected stop_reason: no complete
  // draft exists, and no gate withheld one.
  'incomplete-reply': 'no-draft',
  // A draft cleared every gate and was held back by BRIEF_MODEL_MODE.
  'dry-run': 'dry-run',
};

/**
 * The cause line: why there is no narrative today. Its words and its truth
 * conditions are exactly those of the line the mechanical edition has carried
 * since November 2026; only its position changed (it closes the edition now).
 */
export function causeLineFor(cause: FallbackCause): string {
  return `This is the mechanical edition: ${
    cause === 'draft-refused'
      ? 'the model draft was withheld by a publish gate'
      : cause === 'dry-run'
        ? DRY_RUN_CLAUSE
        : 'no model draft was produced today'
  }, so today carries data without narrative.`;
}

/**
 * The deterministic edition, published when the model's draft did not ship: a
 * gate refused it, none was produced (no key, API failure, empty or cut-off
 * reply), or it is a dry run. Since plan R1 it is the RECORD-ONLY edition
 * (api/_lib/brief-record.ts): what resolved today, what is open, one call
 * explained, a corrections line and this cause line, all built by code from
 * the calls table. The wire headline, the index board, the market block and
 * the long fuse are gone: none of them was the record.
 *
 * The Ledger line is not written here; the handler splices it into the first
 * section afterwards, as it does for a model draft. An unspecified or unknown
 * cause defaults to 'no-draft': claiming a gate refused a draft that never
 * existed is the one thing this must not do. A missing record reads as unread,
 * never as empty.
 */
export function buildFallbackText(data: BriefData, cause: FallbackCause = 'no-draft'): string {
  return buildRecordEdition(data.record, causeLineFor(cause));
}

function splitTextToChunks(text: string, maxLen: number): string[] {
  const chunks: string[] = [];
  let remaining = text;
  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // Try to split at a paragraph boundary
    let splitAt = remaining.lastIndexOf('\n\n', maxLen);
    if (splitAt < maxLen * 0.3) splitAt = remaining.lastIndexOf('\n', maxLen);
    if (splitAt < maxLen * 0.3) splitAt = maxLen;
    chunks.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt).replace(/^\n+/, '');
  }
  return chunks;
}
