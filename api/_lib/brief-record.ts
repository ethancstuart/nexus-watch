/**
 * THE RECORD-ONLY EDITION: what the daily brief says on a day the model does
 * not write it (plan R1, "the open forecast record", DISCOVERY.md §5).
 *
 * "The daily email narrows to the record: what resolved, what is open, one
 * call explained. The off-mission wire headline and the duplicated market
 * block go." The mechanical edition used to carry the model edition's section
 * spine with a wire headline ("we give you the lead as the wire carried it"),
 * the CII board, market prices twice and a long-fuse trajectory. None of that
 * is the record. This module builds the edition from the calls table alone.
 *
 * In order, every day (Sunday included):
 *   1. The Ledger line. Spliced in by the handler (spliceLedgerLine) at the top
 *      of the first section, exactly as before; this module never writes it.
 *   2. What resolved today: one line per resolved call, each linked to its
 *      call page, capped, then "…and N more" with a link to /ledger.
 *   3. What is open: the count, the held count, and the next calls to resolve,
 *      each linked.
 *   4. One call explained, chosen by RULE (chooseExplainedCall), from the
 *      call's own fields by template text. No model text, ever.
 *   5. One sentence linking /corrections, when that page exists.
 *   6. The honest cause line, passed in by the caller, its words unchanged.
 *
 * "Today" is the calendar day the Ledger line and the subject count, on every
 * day of the week, so the three numbers a reader sees agree.
 *
 * A READ THAT FAILED IS NEVER REPORTED AS AN EMPTY ONE. The resolved and open
 * reads each carry their own `read` flag, and a missing record (a caller that
 * never read anything) counts as unread. "No open calls today." prints only
 * when the open read succeeded and found none; that sentence went out falsely
 * over a book of hundreds on 23 Nov 2026.
 *
 * Pure: no database, no clock, no network. Every string a reader sees is in
 * this file, so the owner signs off one list.
 */
import { correctedOutcomeOf, describeCorrections, isScored } from './calls.js';

export const SITE = 'https://nexuswatch.dev';
export const LEDGER_URL = `${SITE}/ledger`;
export const CORRECTIONS_URL = `${SITE}/corrections`;
export function callUrl(id: number): string {
  return `${SITE}/call/${id}`;
}

/** How many of the day's resolutions get a line of their own. */
export const RESOLVED_LIST_CAP = 10;
/** How many of the next open calls get a line of their own. */
export const OPEN_LIST_CAP = 5;

/** The edition's sections, in order. The Ledger line goes inside the first. */
export const RECORD_SECTIONS = [
  '## 🏁 What resolved today',
  '## 📂 What is open',
  '## 🔎 One call explained',
  '## 📝 About this edition',
] as const;

/** One call, as the record reads it. Every field is the call's own, frozen at issue, except status. */
export interface RecordCall {
  id: number;
  kind: string;
  country_code: string;
  /** The country's display name (api/_lib/country-names.ts, else the index row); null when neither knows the code. */
  name: string | null;
  claim: string;
  probability: number;
  base_rate: number | null;
  /** Qualifying-event count the resolver needs (censorship and other kinds). */
  threshold: number | null;
  /** FX only: the depreciation, in percent, the claim names. */
  threshold_pct: number | null;
  made_on: string;
  resolves_on: string;
  status: string;
  evidence_count: number | null;
  /** From call_corrections, when the call has one. Never replaces `status`. */
  corrected_status: string | null;
}

/** Today's scored resolutions. Counts come from COUNT(*); `calls` is a capped page. */
export type ResolvedRead =
  | {
      read: true;
      total: number;
      hits: number;
      /** Today's calls whose verdict the evidence records differently, over the whole day. */
      corrections: Array<{ status: string; corrected_status: string }>;
      calls: RecordCall[];
    }
  | { read: false };

/** The open book. `held` counts open calls already past their date. */
export type OpenRead = { read: true; total: number; held: number; next: RecordCall[] } | { read: false };

export interface BriefRecord {
  resolved: ResolvedRead;
  open: OpenRead;
  /** True when /corrections is published (at least one approved note); it answers 404 otherwise. */
  correctionsPage: boolean;
}

/** A record in which nothing was read. */
export const UNREAD_RECORD: BriefRecord = { resolved: { read: false }, open: { read: false }, correctionsPage: false };

// ---------------------------------------------------------------------------
// The rule for "one call explained"
// ---------------------------------------------------------------------------

/**
 * How far what we said sits from the base rate, in THOUSANDTHS, an integer.
 * Both columns are NUMERIC(4,3), so this is exact: in floating point 0.3 − 0.1
 * is less than 0.5 − 0.3, and a decimal tie would not go to the lower id as the
 * rule says (review finding 5). Postgres orders the same NUMERIC values exactly.
 */
function gap(c: RecordCall): number {
  return Math.abs(Math.round(c.probability * 1000) - Math.round((c.base_rate ?? c.probability) * 1000));
}

/**
 * Most informative first: a call with a stored base rate before one without
 * (which sits nowhere), then the larger gap, then the lower id. Total, so the
 * order never depends on the database's.
 */
function byInformation(a: RecordCall, b: RecordCall): number {
  return Number(a.base_rate === null) - Number(b.base_rate === null) || gap(b) - gap(a) || a.id - b.id;
}

/** Soonest first: the earlier date, then the larger gap, then the lower id. */
function byNextToResolve(a: RecordCall, b: RecordCall): number {
  return a.resolves_on < b.resolves_on ? -1 : a.resolves_on > b.resolves_on ? 1 : byInformation(a, b);
}

export type ExplainedCall =
  /** Today's most informative resolution. */
  | { call: RecordCall; why: 'resolved' }
  /** None resolved today: the next call due, most informative among those due that day. */
  | { call: RecordCall; why: 'next-none-resolved' }
  /** Today's resolutions could not be read: the same pick from the open book. */
  | { call: RecordCall; why: 'next-resolved-unread' }
  /** Today's resolutions were counted but could not be listed (a count above 0, an empty page): the same pick. */
  | { call: RecordCall; why: 'next-resolved-unlisted' }
  /** Every read succeeded and there is no candidate. */
  | { call: null; why: 'none' }
  /** No candidate, and at least one read failed. */
  | { call: null; why: 'unread' };

/**
 * THE RULE, deterministic for any input:
 *   1. If any call resolved today, the one whose stated probability sat
 *      furthest from its base rate (the most informative resolution: a hit at
 *      16% against a 10% base says more than a hit at 84% against 90%),
 *      compared exactly in thousandths. Ties go to the lower call id. A call
 *      with no stored base rate ranks after every call that has one.
 *   2. Otherwise the next open call to resolve: the earliest resolution date
 *      after today, then the same order as rule 1.
 *   3. Otherwise none, and the edition says why.
 * A failed read is never treated as "none resolved": the fallback to rule 2
 * says the resolutions could not be read.
 */
export function chooseExplainedCall(record: BriefRecord | undefined): ExplainedCall {
  const r = record ?? UNREAD_RECORD;
  // A count above zero with an empty page is a read we cannot list from.
  const unlisted = r.resolved.read && r.resolved.total > 0 && r.resolved.calls.length === 0;
  const resolvedListed = r.resolved.read && !unlisted;
  // The page is used only beside a count that agrees there was something to list.
  if (r.resolved.read && r.resolved.total > 0 && r.resolved.calls.length > 0) {
    return { call: [...r.resolved.calls].sort(byInformation)[0], why: 'resolved' };
  }
  if (r.open.read && r.open.next.length > 0) {
    const call = [...r.open.next].sort(byNextToResolve)[0];
    if (unlisted) return { call, why: 'next-resolved-unlisted' };
    return resolvedListed ? { call, why: 'next-none-resolved' } : { call, why: 'next-resolved-unread' };
  }
  return resolvedListed && r.open.read ? { call: null, why: 'none' } : { call: null, why: 'unread' };
}

// ---------------------------------------------------------------------------
// Words. Every reader-facing string of the edition is below.
// ---------------------------------------------------------------------------

/**
 * Database text placed into Markdown. Code writes every claim and the country
 * table writes every name, so on real data this changes nothing. It exists so
 * stored text can never add structure: no newline (a stray "## " would start a
 * section), no emphasis or code markers, no link brackets. HTML escaping is the
 * renderers' job and they all do it.
 */
export function plainText(s: string): string {
  return s.replace(/\s+/g, ' ').replace(/[*`]/g, '').replace(/\[/g, '(').replace(/\]/g, ')').trim();
}

/** A Markdown link to one of our own pages. Only renderers that know the edition turn it into a link. */
function link(label: string, url: string): string {
  return `[${label}](${url})`;
}

/**
 * The FX threshold as stored and scored (calls.threshold_pct, three decimals at
 * most), printed as the call page prints it. The claim's own text rounds it to
 * two decimals, so the two can differ in the third.
 */
function thresholdPct(x: number): string {
  return String(Math.round(x * 1000) / 1000);
}

function pct(x: number): number {
  return Math.round(x * 100);
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/**
 * "Uganda (UG)". A country with no known name prints its code alone, once
 * ("SE"), never twice ("SE (SE)"). Names come from api/_lib/country-names.ts
 * (repository data, every run), then the index row (gatherRecord).
 */
function who(c: RecordCall): string {
  const code = plainText(c.country_code);
  const name = c.name ? plainText(c.name) : '';
  return name && name !== code ? `${name} (${code})` : code;
}

/** What the call claims, in a phrase, by kind. No default that lies: an unknown kind gets words true of every call. */
function claimPhrase(c: RecordCall): string {
  const by = plainText(c.resolves_on);
  if (c.kind === 'fx_devaluation') {
    return c.threshold_pct !== null && Number.isFinite(c.threshold_pct)
      ? `currency depreciation of ${thresholdPct(c.threshold_pct)}% or more against USD by ${by}`
      : `currency depreciation by ${by}`;
  }
  if (c.kind === 'censorship_event') return `a confirmed censorship event by ${by}`;
  return `the outcome it names, against its declared external source, by ${by}`;
}

/**
 * HIT or MISS for a scored call, with the correction beside it when there is
 * one. Only a scored status is ever mapped to HIT or MISS: a pending call is
 * never printed as a MISS (review finding 3), and any other status prints as
 * itself.
 */
function verdict(c: RecordCall): string {
  if (!isScored(c.status)) return plainText(c.status).toUpperCase();
  const published = c.status === 'hit' ? 'HIT' : 'MISS';
  const recorded = correctedOutcomeOf(c.status, c.corrected_status);
  if (recorded !== undefined) {
    return `${published} as published, the evidence records as ${recorded === 1 ? 'HIT' : 'MISS'}`;
  }
  // A correction to an unscored status (unresolvable, void) changes no verdict
  // the score uses, but it is still a correction, and it is stated (finding 9).
  if (corrected(c)) {
    return `${published} as published; a correction records it as ${plainText(c.corrected_status ?? '').toUpperCase()}`;
  }
  return published;
}

/** The call carries a correction whose status differs from the published one. */
function corrected(c: RecordCall): boolean {
  return c.corrected_status !== null && c.corrected_status !== c.status;
}

function baseNote(c: RecordCall): string {
  return c.base_rate !== null ? ` (base rate ${pct(c.base_rate)}%)` : '';
}

export function resolvedLine(c: RecordCall): string {
  const evidence =
    c.kind === 'censorship_event' && c.evidence_count !== null && c.status === 'hit'
      ? ` — OONI confirmed blocking on ${c.evidence_count} ${plural(c.evidence_count, 'day', 'days')} in the window`
      : '';
  return (
    `${who(c)}: ${verdict(c)} — we said ${pct(c.probability)}%${baseNote(c)} for ${claimPhrase(c)}${evidence}. ` +
    link(`Call #${c.id}`, callUrl(c.id))
  );
}

export function openLine(c: RecordCall): string {
  return `${who(c)}: we say ${pct(c.probability)}%${baseNote(c)} for ${claimPhrase(c)}. ${link(`Call #${c.id}`, callUrl(c.id))}`;
}

export const RESOLVED_UNREAD = 'Resolved calls could not be read today.';
/**
 * Scored statuses only, as the Ledger line counts them: a day that closed only
 * unresolvable or void calls scored none (review finding 12).
 */
export const NONE_RESOLVED = 'No call was scored today.';
export const OPEN_UNREAD = 'Open calls could not be read today.';
export const NONE_OPEN = 'No open calls today.';

function resolvedSection(r: ResolvedRead): string[] {
  if (!r.read) return [RESOLVED_UNREAD];
  if (r.total === 0) return [NONE_RESOLVED];
  const correctionNote =
    r.corrections.length > 0 ? ` The counts are as published; ${describeCorrections(r.corrections)}.` : '';
  const out = [
    `${r.total} ${plural(r.total, 'call', 'calls')} settled today against external ground truth: ` +
      `${r.hits} hit, ${r.total - r.hits} miss.${correctionNote}`,
  ];
  const shown = [...r.calls].sort(byInformation).slice(0, RESOLVED_LIST_CAP);
  if (shown.length > 0) out.push(shown.map((c) => `- ${resolvedLine(c)}`).join('\n'));
  if (r.total > shown.length) {
    const ledger = `${link('The ledger', LEDGER_URL)} lists the latest resolutions.`;
    out.push(shown.length > 0 ? `…and ${r.total - shown.length} more. ${ledger}` : ledger);
  }
  return out;
}

function openSection(o: OpenRead): string[] {
  if (!o.read) return [OPEN_UNREAD];
  if (o.total === 0) return [NONE_OPEN];
  const held =
    o.held > 0
      ? ` ${o.held} due ${plural(o.held, 'call remains', 'calls remain')} unresolved — held, never scored as a miss ` +
        'by default.'
      : '';
  const out = [`${o.total} ${plural(o.total, 'call is', 'calls are')} open.${held}`];
  const next = [...o.next].sort(byNextToResolve).slice(0, OPEN_LIST_CAP);
  if (next.length > 0) {
    out.push('Next to resolve:');
    out.push(next.map((c) => `- ${openLine(c)}`).join('\n'));
  }
  if (o.total > next.length) {
    out.push(
      next.length > 0
        ? `More open calls are on ${link('the ledger', LEDGER_URL)}.`
        : `${link('The ledger', LEDGER_URL)} lists open calls.`,
    );
  }
  return out;
}

const WHY: Record<Exclude<ExplainedCall['why'], 'none' | 'unread'>, string> = {
  resolved: "Why this call: of today's resolutions, it is the one where what we said differed most from its base rate.",
  'next-none-resolved':
    'Why this call: no call resolved today. Of the calls due to resolve next, it is the one where what we say ' +
    'differs most from its base rate.',
  'next-resolved-unread':
    "Why this call: today's resolutions could not be read. Of the calls due to resolve next, it is the one where " +
    'what we say differs most from its base rate.',
  'next-resolved-unlisted':
    "Why this call: today's resolutions could not be listed. Of the calls due to resolve next, it is the one where " +
    'what we say differs most from its base rate.',
};
/** The reason when the chosen call has no stored base rate (every candidate then has none: finding 6). */
export const WHY_NO_BASE = 'Why this call: none of these calls has a stored base rate; it is the lowest-numbered.';
export const NO_CALL_TO_EXPLAIN = 'No call to explain today: none resolved, and none is due to resolve after today.';
export const NO_CALL_READ = 'No call can be explained today: the calls could not all be read.';

function thresholdPhrase(c: RecordCall): string {
  if (c.kind === 'fx_devaluation' && c.threshold_pct !== null && Number.isFinite(c.threshold_pct)) {
    return `a depreciation of ${thresholdPct(c.threshold_pct)}% or more against USD within the window`;
  }
  if (c.kind !== 'fx_devaluation' && c.threshold !== null && Number.isFinite(c.threshold)) {
    return `at least ${c.threshold} qualifying ${plural(c.threshold, 'event', 'events')} inside the window`;
  }
  return 'as stated in the claim';
}

/** The explanation, from the call's own fields. `open` changes only the tense. */
export function explainCall(e: Extract<ExplainedCall, { call: RecordCall }>): string[] {
  const c = e.call;
  // A pending call is open whatever path chose it: it never gets an outcome
  // (review finding 3). Neither does any status that is not scored.
  const open = e.why !== 'resolved' || c.status === 'pending';
  const said = pct(c.probability);
  let baseSentence: string;
  if (c.base_rate === null) {
    baseSentence = 'No base rate is stored for this call.';
  } else {
    const base = pct(c.base_rate);
    const d = said - base;
    const sit = open ? 'We sit' : 'We sat';
    // Thousandths, exact: equal rounded percents are not always a match (finding 8).
    const exact = Math.round(c.probability * 1000) - Math.round(c.base_rate * 1000);
    baseSentence =
      `How often it happens anyway, its base rate at issue: ${base}%. ` +
      (d !== 0
        ? `${sit} ${Math.abs(d)} ${plural(Math.abs(d), 'point', 'points')} ${d > 0 ? 'above' : 'below'} it.`
        : exact === 0
          ? `What we ${open ? 'say matches' : 'said matched'} the base rate.`
          : `${sit} less than a point ${exact > 0 ? 'above' : 'below'} it.`);
  }
  let outcome: string;
  if (open) {
    outcome = `The status: open. It resolves on ${plainText(c.resolves_on)}, and is not scored until then.`;
  } else if (!isScored(c.status) || corrected(c)) {
    // The published verdict and the correction's, side by side (or a status
    // that is not scored, as itself); nothing more is claimed.
    outcome = `The outcome: ${verdict(c)}.`;
  } else {
    // A MISS means the declared source did not record the event, not that it
    // did not happen: absence of evidence is not evidence of absence (review
    // finding 2; calls.ts, missHoldReason).
    outcome =
      `The outcome: ${verdict(c)}. ` +
      (c.status === 'hit'
        ? 'Its declared source recorded what the claim names inside the window.'
        : 'Its declared source did not record what the claim names inside the window.');
  }
  return [
    `**${who(c)}, call #${c.id}.** ${c.base_rate === null ? WHY_NO_BASE : WHY[e.why]}`,
    `The claim, frozen when the call was made on ${plainText(c.made_on)}: “${plainText(c.claim)}”`,
    `The threshold: ${thresholdPhrase(c)}. What we ${open ? 'say' : 'said'}: ${said}%. ${baseSentence}`,
    `${outcome} ${link(`Read call #${c.id}`, callUrl(c.id))}`,
  ];
}

function explainedSection(record: BriefRecord | undefined): string[] {
  const e = chooseExplainedCall(record);
  if (e.call === null) return [e.why === 'none' ? NO_CALL_TO_EXPLAIN : NO_CALL_READ];
  return explainCall(e);
}

export const CORRECTIONS_LINE = `Corrections to earlier editions of this brief are listed on ${link('the corrections page', CORRECTIONS_URL)}.`;

/**
 * The whole edition, in Markdown. `causeLine` is the mechanical edition's
 * cause sentence, chosen by the caller from the path that led here and printed
 * as given.
 */
export function buildRecordEdition(record: BriefRecord | undefined, causeLine: string): string {
  const r = record ?? UNREAD_RECORD;
  const sections: Array<[string, string[]]> = [
    [RECORD_SECTIONS[0], resolvedSection(r.resolved)],
    [RECORD_SECTIONS[1], openSection(r.open)],
    [RECORD_SECTIONS[2], explainedSection(r)],
    [RECORD_SECTIONS[3], [...(r.correctionsPage ? [CORRECTIONS_LINE] : []), causeLine]],
  ];
  return sections.map(([header, blocks]) => `${header}\n\n${blocks.join('\n\n')}\n`).join('\n');
}
