/**
 * THE FRONT DOOR'S VERDICT: one plain, dated statement of what the record
 * shows, opening both `/` and `/ledger`.
 *
 * This module WORDS figures; it never holds one. Every number is handed in by
 * the caller, read at request time from the ledger's own queries and scoring
 * functions: the server page from the queries in api/ledger.ts, the landing
 * from /api/calls/ledger. So the verdict cannot say a number the ledger beneath
 * it does not, and it cannot go stale the way a literal would.
 * verdict-words.test.ts fails on any numeric literal here other than 0, 1 and
 * 100.
 *
 * NO SKILL CLAIM THE DATA DOES NOT MAKE. "Skill" is said positively only when
 * an interval is supplied, is well formed, contains the estimate, and lies
 * wholly above zero. The ledger computes no interval today, so no caller
 * passes one and that branch is unreachable in production. It is written and
 * tested so that it is right on the day an interval exists, and so that a
 * positive point estimate on its own is never read as skill.
 *
 * Words only, and the owner signs off every one of them (lanes12/FRONTDOOR.md).
 *
 * CLIENT-SAFE, AND IT MUST STAY THAT WAY: src/pages/landing.ts imports this
 * module (check:client-safe-imports holds it to no package imports).
 */
import { CORRECTIONS_PATH, formatCorrectionDate, isIsoDate } from './correction-words.js';

/** A skill interval, as fractions (e.g. -0.072 to 0.04 at level 0.95). */
export interface SkillInterval {
  lo: number;
  hi: number;
  /** Coverage, a fraction strictly between 0 and 1. */
  level: number;
}

/** The currency (FX) figures, as the ledger computes them. */
export interface FxFigures {
  /** publishableSkill over every scored FX call; null when the ledger withholds it. */
  skill: number | null;
  /** Distinct resolution batches among those calls. */
  batches: number;
  /** The ledger's batch threshold for publishing skill; null when not known. */
  minBatches: number | null;
  /** Only if the ledger computes one. It does not today. */
  interval?: SkillInterval | null;
}

export interface VerdictFigures {
  /** The day the figures were read, YYYY-MM-DD (UTC). */
  asOn: string;
  /** Scored calls, the calibration harness excluded: the ledger's own count. */
  scored: number;
  /** Open calls, the calibration harness excluded: the ledger's own count. */
  open: number;
  /** Null when no currency call has been scored. */
  fx: FxFigures | null;
  /** Whether /corrections is live. No live page, no sentence and no link. */
  correctionsPage: boolean;
}

export interface Verdict {
  /** "As of 27 Nov 2026:" */
  dateline: string;
  /** The counts and the currency sentence. */
  body: string;
  /** The corrections sentence around its one link; null when there is no corrections page. */
  corrections: { before: string; link: string; after: string; href: string } | null;
  /** The whole verdict as one plain-text string: dateline, body, corrections sentence. */
  text: string;
}

// ── The fixed words. Each needs the owner's sign-off (lanes12/FRONTDOOR.md). ──

const MINUS = '−';
const CORRECTIONS_BEFORE = 'Corrections to our censorship reporting are published on ';
const CORRECTIONS_LINK = 'our corrections page';
const CORRECTIONS_AFTER = '.';

const isCount = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n) && n >= 0;
const isFiniteNumber = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** 5693 -> "5,693". From the digits, not a locale, so it reads the same everywhere. */
function grouped(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** -0.0299 -> "−3%", 0.021 -> "+2%", -0.004 -> "0%". Whole points, as the ledger's own row prints them. */
function points(v: number): string {
  const r = Math.round(v * 100);
  if (r === 0) return '0%';
  return `${r > 0 ? '+' : MINUS}${Math.abs(r)}%`;
}

/** -0.072 -> "−7.2%": an interval's ends, to one decimal. */
function pointsOneDecimal(v: number): string {
  const a = Math.abs(v * 100).toFixed(1);
  if (Number(a) === 0) return `${(0).toFixed(1)}%`;
  return `${v > 0 ? '+' : MINUS}${a}%`;
}

/** An interval is used only if it is well formed and contains the estimate it qualifies. */
function usableInterval(i: unknown, skill: number): SkillInterval | null {
  if (!i || typeof i !== 'object') return null;
  const { lo, hi, level } = i as Record<string, unknown>;
  if (!isFiniteNumber(lo) || !isFiniteNumber(hi) || !isFiniteNumber(level)) return null;
  if (lo > hi || level <= 0 || level >= 1) return null;
  if (skill < lo || skill > hi) return null;
  return { lo, hi, level };
}

function currencySentence(fx: FxFigures): string {
  const skill = isFiniteNumber(fx.skill) ? fx.skill : null;
  if (skill === null) {
    if (isCount(fx.minBatches) && isCount(fx.batches) && fx.batches < fx.minBatches) {
      return (
        'Currency forecasts have no skill figure yet: it is withheld until they have resolved in ' +
        `${fx.minBatches} separate batches.`
      );
    }
    return 'Currency forecasts carry no published skill figure.';
  }

  const lead = `Currency forecasts score ${points(skill)} against their base rate`;
  const interval = usableInterval(fx.interval, skill);
  if (!interval) {
    return skill > 0
      ? `${lead}. No interval is computed for that figure, so it does not show skill.`
      : `${lead}: no detectable skill.`;
  }

  const range =
    `${Math.round(interval.level * 100)}% interval ${pointsOneDecimal(interval.lo)} to ` +
    `${pointsOneDecimal(interval.hi)}`;
  if (interval.lo > 0) return `${lead} (${range}, which excludes zero): detectable skill.`;
  if (interval.hi < 0) return `${lead} (${range}, which excludes zero): worse than their base rate.`;
  return `${lead} (${range}, which includes zero): no detectable skill.`;
}

/**
 * The verdict, or null when the figures cannot be stood behind: a date that is
 * not a real calendar date, or a count that is not a whole, non-negative
 * number. No verdict is better than a wrong one.
 */
export function frontDoorVerdict(f: VerdictFigures): Verdict | null {
  if (!isIsoDate(f.asOn) || !isCount(f.scored) || !isCount(f.open)) return null;

  const dateline = `As of ${formatCorrectionDate(f.asOn)}:`;
  const counts = `${grouped(f.scored)} forecast${f.scored === 1 ? '' : 's'} scored, ${grouped(f.open)} open.`;
  const body = f.fx ? `${counts} ${currencySentence(f.fx)}` : counts;
  const corrections = f.correctionsPage
    ? { before: CORRECTIONS_BEFORE, link: CORRECTIONS_LINK, after: CORRECTIONS_AFTER, href: CORRECTIONS_PATH }
    : null;
  const text =
    `${dateline} ${body}` + (corrections ? ` ${corrections.before}${corrections.link}${corrections.after}` : '');
  return { dateline, body, corrections, text };
}

/**
 * The verdict's figures from /api/calls/ledger's JSON, as the landing page
 * receives it. Read defensively: anything the response does not carry in the
 * expected shape gives no figures (and so no verdict), never a guess.
 *
 *  - the date is `generated_at`, the server's clock when it answered;
 *  - the counts are `counts.resolved` and `counts.open`, the ledger's COUNT(*)s;
 *  - the currency figures are `by_kind.fx_devaluation`, the ledger's per-kind
 *    scoring, and are absent when no currency call is scored;
 *  - the JSON carries no interval, so none is passed.
 */
export function figuresFromLedgerJson(json: unknown, correctionsPage: boolean): VerdictFigures | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  if (typeof j.generated_at !== 'string') return null;
  const asOn = j.generated_at.split('T')[0];
  if (!isIsoDate(asOn)) return null;

  const counts = j.counts as Record<string, unknown> | null | undefined;
  if (!counts || typeof counts !== 'object' || !isCount(counts.resolved) || !isCount(counts.open)) return null;

  const byKind = (j.by_kind && typeof j.by_kind === 'object' ? j.by_kind : {}) as Record<string, unknown>;
  const k = byKind.fx_devaluation as Record<string, unknown> | undefined;
  let fx: FxFigures | null = null;
  if (k && typeof k === 'object' && isCount(k.resolved) && k.resolved > 0 && isCount(k.batches)) {
    fx = {
      skill: isFiniteNumber(k.skill_vs_base_rate) ? k.skill_vs_base_rate : null,
      batches: k.batches,
      minBatches: isCount(j.min_batches_for_skill) && j.min_batches_for_skill > 0 ? j.min_batches_for_skill : null,
      interval: null,
    };
  }

  return { asOn, scored: counts.resolved, open: counts.open, fx, correctionsPage };
}
