/**
 * Dry run for the model-written brief (Option 1 of the send-hold design).
 *
 * WHY. After the reviewed fixes, the only thing between a model-written draft
 * and every reader was the gates. The first draft from a new model should be
 * read by the owner before any reader sees one. So, unless one setting says so
 * in as many words, a draft that clears every gate is NOT sent: readers get the
 * mechanical edition, exactly as on a day a gate refuses the draft, and the
 * draft goes to a private table and to the operator's inbox.
 *
 * THE SETTING. `BRIEF_MODEL_MODE`. Exactly `live` lets a draft that passes every
 * gate ship. Anything else (unset, empty, `LIVE `, `true`, `1`, a typo) is a
 * dry run. The default is dry run on purpose: adding credit alone cannot put a
 * model-written brief in front of readers.
 *
 * WHAT IS KEPT PRIVATE. The draft and its declared subject go to
 * `brief_dry_runs` (docs/migrations/2026-11-22-brief-dry-runs.sql), which
 * nothing public reads, and to ADMIN_EMAILS through `emailAdmins`, the email
 * branch of api/_lib/alert.ts. Never through `raiseAlert`: that path posts to a
 * Discord webhook first whenever one is set, and who reads that channel is not
 * known here. The general alert for a dry-run day (`dryRunAlert`) carries the
 * date, the gate verdicts and "DRY RUN", and nothing the model wrote.
 *
 * FAIL SAFE. The handler takes the draft out of the reader's path before
 * anything here runs, so nothing here can promote a draft: a storage failure is
 * logged and alerted, an email failure is logged, and nothing here throws.
 *
 * This file makes no model call and holds no model host name; the one billed
 * call stays in api/cron/daily-brief.ts, where scripts/check-llm-spend.ts sees it.
 */
import { emailAdmins, raiseAlert, scrubForLog, type AlertInput, type AlertResult } from './alert.js';
import type { GroundingReport } from './grounding.js';
import type { StructureReport } from './brief-structure.js';
import { comparativeClaimLabel, type ComparativeClaimReport } from './comparative-claims.js';

type Env = Record<string, string | undefined>;

export type BriefModelMode = 'live' | 'dry-run';

/** The setting's name. Its value is never logged or stored. */
export const BRIEF_MODEL_MODE_VAR = 'BRIEF_MODEL_MODE';

/**
 * `live` only for the exact string `live`: no trimming, no case folding. A
 * value that is almost `live` is a dry run, because the cost of a wrong guess
 * in that direction is one more mechanical day, and in the other a reader.
 * Never throws.
 */
export function getBriefModelMode(env: Env = process.env): BriefModelMode {
  try {
    return env[BRIEF_MODEL_MODE_VAR] === 'live' ? 'live' : 'dry-run';
  } catch {
    return 'dry-run';
  }
}

export type GateVerdict = 'pass' | 'refused' | 'not-run';

export interface GateResult {
  verdict: GateVerdict;
  /** Why, in the gate's own terms. May quote the draft: private surfaces only. */
  reason: string | null;
}

/** The three publish gates, in the order the handler applies them. */
export interface DryRunGates {
  grounding: GateResult;
  structure: GateResult;
  claims: GateResult;
}

const NOT_RUN: GateResult = { verdict: 'not-run', reason: null };

/** What the handler learns about the model call as it goes. */
export interface DryRunAttempt {
  model: string | null;
  usage: { input_tokens?: unknown; output_tokens?: unknown; cache_read_input_tokens?: unknown } | null;
  stopReason: string | null;
  /** The declared subject the draft carried, if it was usable as one. */
  draftSubject: string | null;
  /** The draft body exactly as the model wrote it, subject line removed. */
  draftText: string | null;
  /** Null until all three gates have scored a draft. */
  gates: DryRunGates | null;
}

export function newDryRunAttempt(): DryRunAttempt {
  return { model: null, usage: null, stopReason: null, draftSubject: null, draftText: null, gates: null };
}

/**
 * Each gate's verdict and reason. All three are recorded even though the
 * handler acts on the first refusal, so a row says everything that was wrong.
 */
export function summariseGates(
  grounding: GroundingReport,
  structure: StructureReport,
  claims: ComparativeClaimReport,
): DryRunGates {
  const unsupported = grounding.unsupported.slice(0, 8).join(', ');
  return {
    grounding: {
      verdict: grounding.pass ? 'pass' : 'refused',
      reason: `${grounding.unsupported.length}/${grounding.draftNumerals.length} unsupported numerals${unsupported ? ` [${unsupported}]` : ''}`,
    },
    structure: {
      verdict: structure.pass ? 'pass' : 'refused',
      reason: structure.pass
        ? null
        : `missing=[${structure.missing.join('; ')}] extra=[${structure.extra.join('; ')}]${structure.misordered ? ' misordered' : ''}${structure.missingChangeOurMind ? ' no-change-our-mind-clause' : ''}`,
    },
    claims: { verdict: claims.pass ? 'pass' : 'refused', reason: claims.pass ? null : comparativeClaimLabel(claims) },
  };
}

/** One row of `brief_dry_runs`. */
export interface DryRunRecord {
  briefDate: string;
  runId: string;
  model: string | null;
  /** The handler's label for the attempt before the dry run replaced it. */
  outcome: string;
  wouldHaveShipped: boolean;
  stopReason: string | null;
  gates: DryRunGates;
  draftSubject: string | null;
  draftText: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadInputTokens: number | null;
}

const count = (v: unknown): number | null =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 2_147_483_647 ? v : null;

export function buildDryRunRecord(input: {
  briefDate: string;
  runId: string;
  outcome: string;
  wouldHaveShipped: boolean;
  attempt: DryRunAttempt;
}): DryRunRecord {
  const { attempt } = input;
  return {
    briefDate: input.briefDate,
    runId: input.runId,
    model: attempt.model,
    outcome: input.outcome,
    wouldHaveShipped: input.wouldHaveShipped,
    stopReason: attempt.stopReason,
    gates: attempt.gates ?? { grounding: NOT_RUN, structure: NOT_RUN, claims: NOT_RUN },
    draftSubject: attempt.draftSubject,
    draftText: attempt.draftText ? attempt.draftText : null,
    inputTokens: count(attempt.usage?.input_tokens),
    outputTokens: count(attempt.usage?.output_tokens),
    cacheReadInputTokens: count(attempt.usage?.cache_read_input_tokens),
  };
}

const yesNo = (b: boolean) => (b ? 'yes' : 'no');

/**
 * The general alert for a dry-run day on which the draft reached the gates.
 * It replaces the "shipped as the mechanical edition" alarm on those days, and
 * goes by whatever channel raiseAlert prefers, Discord included. So it carries
 * ONLY the date, each gate's verdict and the words DRY RUN: no reason (a
 * reason can quote the draft) and nothing the model wrote. It takes no draft,
 * so it cannot be handed one.
 */
export function dryRunAlert(date: string, gates: DryRunGates | null, wouldHaveShipped: boolean): AlertInput {
  const g = gates ?? { grounding: NOT_RUN, structure: NOT_RUN, claims: NOT_RUN };
  return {
    severity: 'info',
    title: `DRY RUN ${date}`,
    body: [
      `DRY RUN ${date}`,
      `Grounding gate: ${g.grounding.verdict}`,
      `Structure gate: ${g.structure.verdict}`,
      `Claim gate: ${g.claims.verdict}`,
      `Would have shipped: ${yesNo(wouldHaveShipped)}`,
    ].join('\n'),
  };
}

const gateLine = (name: string, r: GateResult) => `- ${name}: ${r.verdict}${r.reason ? ` (${r.reason})` : ''}`;

/**
 * The operator email: the draft and everything the gates said about it. Goes
 * only to ADMIN_EMAILS, by emailAdmins. Operator-facing, not reader-facing.
 */
export function operatorEmail(r: DryRunRecord, stored: boolean): AlertInput {
  const tokens = (v: number | null) => (v === null ? 'not reported' : String(v));
  return {
    severity: 'info',
    title: `DRY RUN, not sent to readers: ${r.briefDate}`,
    body: [
      `DRY RUN, not sent to readers. Readers received the mechanical edition for ${r.briefDate}.`,
      '',
      `Would have shipped: ${yesNo(r.wouldHaveShipped)}`,
      `Outcome: ${r.outcome}`,
      `Model: ${r.model ?? 'unknown'}`,
      `Stop reason: ${r.stopReason ?? 'none'}`,
      `Tokens: input ${tokens(r.inputTokens)}, output ${tokens(r.outputTokens)}, cache read ${tokens(r.cacheReadInputTokens)}`,
      `Stored in brief_dry_runs: ${stored ? `yes (run ${r.runId})` : 'NO, see the runtime log'}`,
      '',
      'Gates',
      gateLine('Grounding', r.gates.grounding),
      gateLine('Structure', r.gates.structure),
      gateLine('Claims', r.gates.claims),
      '',
      `Declared subject: ${r.draftSubject ?? '(none usable)'}`,
      '',
      'The draft as the model wrote it:',
      '',
      r.draftText ?? '(no draft)',
    ].join('\n'),
  };
}

/** A neon tagged-template query function, or anything shaped like one. */
export type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown>;

export async function insertDryRun(sql: SqlTag, r: DryRunRecord): Promise<void> {
  await sql`
    INSERT INTO brief_dry_runs
      (brief_date, run_id, model, outcome, would_have_shipped, stop_reason,
       grounding_verdict, grounding_reason, structure_verdict, structure_reason,
       claims_verdict, claims_reason, draft_subject, draft_text,
       input_tokens, output_tokens, cache_read_input_tokens)
    VALUES
      (${r.briefDate}, ${r.runId}, ${r.model}, ${r.outcome}, ${r.wouldHaveShipped}, ${r.stopReason},
       ${r.gates.grounding.verdict}, ${r.gates.grounding.reason}, ${r.gates.structure.verdict}, ${r.gates.structure.reason},
       ${r.gates.claims.verdict}, ${r.gates.claims.reason}, ${r.draftSubject}, ${r.draftText},
       ${r.inputTokens}, ${r.outputTokens}, ${r.cacheReadInputTokens})
  `;
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * Store the dry run and send the operator email. NEVER THROWS, and never
 * touches daily_briefs: by the time this runs the reader's edition is already
 * the mechanical one and archived.
 *
 * Storage fails: logged (message scrubbed: a database error may quote a value)
 * and alerted without any draft text; the email still goes, saying so.
 * The email fails: logged by emailAdmins, as every alert outcome is.
 * No email when there is no draft: the model call failed, and the existing
 * alarm for that already fires.
 */
export async function recordDryRun(
  sql: SqlTag,
  record: DryRunRecord,
): Promise<{ stored: boolean; emailed: AlertResult | null }> {
  let stored = false;
  try {
    await insertDryRun(sql, record);
    stored = true;
  } catch (err) {
    try {
      console.error(
        `[daily-brief] dry run NOT stored for ${record.briefDate} (readers unaffected; is docs/migrations/2026-11-22-brief-dry-runs.sql applied?): ${scrubForLog(messageOf(err))}`,
      );
      await raiseAlert({
        severity: 'warning',
        title: `Dry run not stored: ${record.briefDate}`,
        body:
          `${record.briefDate}: the dry-run record could not be written to brief_dry_runs. ` +
          'Readers received the mechanical edition. The cause is in the runtime log; ' +
          'check that docs/migrations/2026-11-22-brief-dry-runs.sql has been applied.',
      });
    } catch {
      // Reporting must never be the reason the run fails.
    }
  }

  let emailed: AlertResult | null = null;
  try {
    if (record.draftText) emailed = await emailAdmins(operatorEmail(record, stored));
  } catch (err) {
    emailed = { delivered: false, channel: 'email', detail: scrubForLog(messageOf(err)) };
  }
  return { stored, emailed };
}
