/**
 * The alarm bell — one place, and it reaches a person with what is already
 * configured.
 *
 * WHY THIS EXISTS. Every monitoring component in this repo posted to
 * `DISCORD_APPROVAL_WEBHOOK_URL`, and that variable has never been set in
 * production — verified 2026-08-28 against `vercel env ls`. So `cron-health`
 * silently no-opped, and the outcome was exactly what this project's own
 * governance predicts: a delivery channel failed for 41 consecutive days,
 * writing a `failed` row every single morning, and nobody found out until a
 * human ran a query by hand.
 *
 * A check whose result does not reach a person is a log line. So the alarm no
 * longer depends on a channel that was never wired: it prefers Discord when a
 * webhook exists, and otherwise sends email through Resend to ADMIN_EMAILS —
 * both of which ARE configured in production today. Nothing to set up, which
 * is the point; a monitoring plan gated on a five-minute task nobody does is
 * a monitoring plan that does not exist.
 *
 * It returns which channel carried the alert so callers can report honestly
 * rather than assume delivery.
 */

export type AlertChannel = 'discord' | 'email' | 'none' | 'suppressed';

export interface AlertResult {
  delivered: boolean;
  channel: AlertChannel;
  detail: string;
  /** The provider's id for the message, when its response gave one. */
  messageId?: string;
  /** How many addresses an email went to. A count, never the addresses. */
  recipients?: number;
}

export type Severity = 'critical' | 'warning' | 'info';

/**
 * How each severity is announced, EXHAUSTIVE by construction. A fourth
 * severity added to the union above is a type error here until it is given a
 * label — it cannot fall through to a yellow "[WARNING]" by omission, which is
 * what the two ternaries this replaces would have done.
 */
const SEVERITY_LABEL: Record<Severity, { emoji: string; tag: string }> = {
  critical: { emoji: '🔴', tag: 'CRITICAL' },
  warning: { emoji: '🟡', tag: 'WARNING' },
  info: { emoji: '🔵', tag: 'INFO' },
};

/**
 * The label for a severity — DELIVERING even for a value this module has
 * never heard of. Two reviews pulled opposite ways here: the first wanted a
 * new severity to be a type error rather than a silent "[WARNING]", which the
 * Record above makes true; the second pointed out that an untyped runtime
 * caller passing a stray value would then throw inside delivery and turn an
 * alert into an undelivered one — the exact failure this module exists to
 * end. So the type is exhaustive and the runtime is forgiving but LOUD: an
 * unknown value goes out as WARNING and the log says what it was.
 */
function labelFor(severity: string | undefined): { emoji: string; tag: string } {
  const known = SEVERITY_LABEL[(severity ?? 'warning') as Severity];
  if (known) return known;
  console.error(`[alert] unknown severity ${JSON.stringify(severity)} — delivering as WARNING`);
  return SEVERITY_LABEL.warning;
}

export interface AlertInput {
  /** Short, specific. Becomes the Discord heading and the email subject. */
  title: string;
  /** Plain text. Keep it readable in a phone notification. */
  body: string;
  /**
   * `info` is for a scheduled report that is not a problem — the weekly cost
   * check. It exists so that report can ride the same delivery path as every
   * alarm instead of a private Discord-only poster that, with the webhook
   * never configured, delivered nothing for four months.
   */
  severity?: Severity;
  /**
   * STABLE identity of the condition — e.g. the sorted set of affected
   * endpoints. Two raises with the same key are the same ongoing problem, and
   * only the first one notifies until the reminder interval elapses.
   *
   * Deliberately supplied by the caller rather than hashed from the body:
   * bodies carry live numbers ("3934ms") that change on every run, so hashing
   * them would defeat deduplication silently and send the flood anyway.
   *
   * Omit it and the alert always sends — appropriate for genuinely one-off
   * events, wrong for anything a cron evaluates repeatedly.
   */
  key?: string;
}

/**
 * How long a CONTINUING condition stays quiet between reminders.
 *
 * Not silence: a problem that is still happening six hours later is worth
 * saying again, because the first notification may have arrived at 3am. But
 * every thirty minutes is not a reminder, it is noise — and on 2026-08-28 that
 * is exactly what happened: nine identical [CRITICAL] emails for one
 * continuous /api/cii timeout.
 */
export const ALERT_REMINDER_HOURS = 6;

async function viaDiscord(webhook: string, a: AlertInput): Promise<AlertResult> {
  const emoji = labelFor(a.severity).emoji;
  const res = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: `${emoji} **${a.title}**\n${a.body}`.slice(0, 1900), username: 'NexusWatch' }),
    signal: AbortSignal.timeout(8000),
  });
  return res.ok
    ? { delivered: true, channel: 'discord', detail: 'posted' }
    : { delivered: false, channel: 'discord', detail: `discord_${res.status}` };
}

async function viaEmail(key: string, to: string[], a: AlertInput): Promise<AlertResult> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'NexusWatch Alerts <brief@nexuswatch.dev>',
      to,
      subject: `[${labelFor(a.severity).tag}] ${a.title}`,
      text: a.body,
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (res.ok) {
    // Resend answers `{ "id": "..." }`. A body that is missing or unparseable
    // must not turn a delivered email into a failure, so it only costs the id.
    const sent = (await res.json().catch(() => null)) as { id?: unknown } | null;
    const messageId = typeof sent?.id === 'string' ? sent.id : undefined;
    return {
      delivered: true,
      channel: 'email',
      detail: `sent to ${to.length} address(es)`,
      recipients: to.length,
      ...(messageId ? { messageId } : {}),
    };
  }
  const detail = await res.text().catch(() => '');
  // SCRUB FIRST, THEN CUT. A body is scrubbed whole before it is shortened:
  // cutting first can leave the front of an address with no "@" for the scrub
  // to recognise (a review found the local part reaching the log that way).
  // Scrubbing here also keeps addresses out of the `detail` that callers return
  // in their own responses.
  return { delivered: false, channel: 'email', detail: `resend_${res.status}: ${scrubForLog(detail).slice(0, 120)}` };
}

/**
 * Should this condition notify a person right now?
 *
 * FAILS OPEN, and that direction is deliberate: if the state table is
 * unreachable we send. A duplicate email is an annoyance; a swallowed alert is
 * the failure this whole module exists to end. Never let the deduplicator
 * become a new way to hear nothing.
 */
/**
 * The deduplication rule, as a pure function so it can be tested.
 *
 * Kept in TypeScript rather than in the SQL CASE it replaced: a rule expressed
 * in a query is a rule nothing can unit-test, and this one decides whether a
 * person hears about an outage.
 */
export function isNotificationDue(
  lastSent: Date | null,
  now: Date = new Date(),
  reminderHours: number = ALERT_REMINDER_HOURS,
): boolean {
  if (!lastSent) return true; // never told anyone
  const elapsedHours = (now.getTime() - lastSent.getTime()) / 3_600_000;
  return elapsedHours >= reminderHours;
}

/** Whole hours a condition has been going on, for the reminder wording. */
export function ongoingHoursSince(firstSeen: Date | null, now: Date = new Date()): number {
  if (!firstSeen) return 0;
  return Math.max(0, Math.floor((now.getTime() - firstSeen.getTime()) / 3_600_000));
}

/**
 * Should this condition notify a person right now?
 *
 * FAILS OPEN, and that direction is deliberate: if the state table is
 * unreachable we send. A duplicate email is an annoyance; a swallowed alert is
 * the failure this whole module exists to end. The deduplicator must never
 * become a new way to hear nothing.
 */
/**
 * Atomically CLAIM the right to notify for this condition.
 *
 * The first version read `last_sent`, decided in TypeScript, and wrote it back
 * after delivering. An independent review pointed out the obvious race: two
 * overlapping cron invocations both read "not sent", and both send — which
 * defeats the entire guarantee this change exists to provide. Vercel crons can
 * overlap and can be retried, so this is not theoretical.
 *
 * So the decision and the write are ONE statement. The UPDATE only matches when
 * the reminder interval has elapsed, and `RETURNING` tells us whether we were
 * the one that matched. Exactly one concurrent caller can win.
 *
 * FAILS OPEN: if the state table is unreachable we send. A duplicate email is
 * an annoyance; a swallowed alert is the failure this module exists to end.
 */
async function claimNotification(
  key: string,
  a: AlertInput,
): Promise<{ send: boolean; ongoingHours: number; previousSent: string | null }> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return { send: true, ongoingHours: 0, previousSent: null };
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(dbUrl);

    // Observe the condition. This also refreshes last_seen, which is what
    // clearStaleAlerts uses to tell a live condition from an abandoned row.
    await sql`
      INSERT INTO alert_state (fingerprint, title, severity, first_seen, last_seen)
      VALUES (${key}, ${a.title}, ${a.severity ?? 'warning'}, NOW(), NOW())
      ON CONFLICT (fingerprint) DO UPDATE
        SET last_seen = NOW(), title = EXCLUDED.title, severity = EXCLUDED.severity
    `;

    // Claim. One statement decides AND records, so a concurrent run cannot
    // also decide yes.
    // `prior` is captured EXPLICITLY from a pre-update snapshot rather than by
    // a sub-SELECT inside RETURNING. The sub-SELECT form happens to read the
    // statement-start snapshot under MVCC and so returns the old value, but
    // relying on that is fragile and non-obvious — and this value is what a
    // failed delivery restores.
    const claimed = (await sql`
      UPDATE alert_state a
      SET last_sent = NOW(), send_count = a.send_count + 1
      FROM (SELECT fingerprint, last_sent AS prior FROM alert_state WHERE fingerprint = ${key}) old
      WHERE a.fingerprint = old.fingerprint
        AND (a.last_sent IS NULL OR NOW() - a.last_sent >= (${ALERT_REMINDER_HOURS} || ' hours')::interval)
      RETURNING a.first_seen, old.prior
    `) as unknown as Array<{ first_seen: string; prior: string | null }>;

    if (claimed.length === 0) return { send: false, ongoingHours: 0, previousSent: null };
    return {
      send: true,
      ongoingHours: ongoingHoursSince(claimed[0]?.first_seen ? new Date(claimed[0].first_seen) : null),
      previousSent: claimed[0]?.prior ?? null,
    };
  } catch {
    return { send: true, ongoingHours: 0, previousSent: null };
  }
}

/**
 * Give the claim back when delivery failed, so the next tick retries instead of
 * waiting out the whole reminder interval on an alert nobody received.
 */
async function releaseClaim(key: string, previousSent: string | null): Promise<void> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return;
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(dbUrl);
    await sql`
      UPDATE alert_state
      SET last_sent = ${previousSent}, send_count = GREATEST(0, send_count - 1)
      WHERE fingerprint = ${key}
    `;
  } catch {
    // Best effort; the cost is one delayed reminder, not a lost alert.
  }
}

/**
 * The condition cleared. Send an all-clear if we had told anyone about it, and
 * forget it either way.
 *
 * This is what makes the alarm trustworthy rather than merely loud: without it,
 * silence after an alert is ambiguous between "fixed" and "the monitor died".
 * On 2026-08-28 the /api/cii alerts simply stopped when the perf fix deployed,
 * and nothing said so — the operator had to infer it from the absence.
 */
export async function clearAlert(key: string, note?: string): Promise<AlertResult> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return { delivered: false, channel: 'none', detail: 'no_db' };
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(dbUrl);
    // READ FIRST, DELETE LAST. The first version deleted the row and then
    // tried to deliver, so a failed send lost the all-clear permanently — the
    // next call would find nothing to stand down. Now the row survives until a
    // human has actually been told, and a failed send simply retries.
    const rows = (await sql`
      SELECT title, last_sent, EXTRACT(EPOCH FROM (NOW() - first_seen)) / 3600 AS ongoing_hours
      FROM alert_state WHERE fingerprint = ${key}
    `) as unknown as Array<{ title: string; last_sent: string | null; ongoing_hours: number }>;
    const row = rows[0];
    if (!row) return { delivered: false, channel: 'suppressed', detail: 'nothing_to_clear' };
    // Detected but never announced: drop it silently, there is nothing to
    // stand down from.
    if (!row.last_sent) {
      await sql`DELETE FROM alert_state WHERE fingerprint = ${key}`;
      return { delivered: false, channel: 'suppressed', detail: 'nothing_to_clear' };
    }
    const hours = Math.floor(Number(row.ongoing_hours ?? 0));
    const result = await deliver({
      title: `RESOLVED — ${row.title}`,
      body: `${note ? `${note}\n\n` : ''}This condition is no longer detected. It lasted about ${hours}h.`,
      severity: 'warning',
    });
    logOutcome({ title: `RESOLVED — ${row.title}`, body: '', key }, result);
    if (result.delivered) await sql`DELETE FROM alert_state WHERE fingerprint = ${key}`;
    return result;
  } catch (err) {
    return { delivered: false, channel: 'none', detail: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Send on the best channel available, with no deduplication. Logs nothing:
 * the caller writes the one line for the outcome (see logOutcome), so a result
 * is never reported twice.
 */
async function deliver(a: AlertInput): Promise<AlertResult> {
  const webhook = process.env.DISCORD_APPROVAL_WEBHOOK_URL;
  const discordEnabled = process.env.DISCORD_APPROVAL_ENABLED !== 'false';
  const resendKey = process.env.RESEND_API_KEY;
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);

  let discordFailure: AlertResult | null = null;
  try {
    if (webhook && discordEnabled) {
      const r = await viaDiscord(webhook, a);
      if (r.delivered) return r;
      // Fall through to email rather than swallowing the failure — a webhook
      // that 404s is indistinguishable from an unset one to the person who
      // needed the alert.
      discordFailure = r;
    }
    if (resendKey && admins.length > 0) return await viaEmail(resendKey, admins, a);
  } catch (err) {
    return { delivered: false, channel: 'none', detail: err instanceof Error ? err.message : String(err) };
  }

  // Say WHY, so an unreachable alarm is fixable. If Discord was tried and
  // refused, that refusal is part of the reason: reporting only the missing
  // email setup would send the reader looking in the wrong place.
  const why = !resendKey ? 'RESEND_API_KEY unset' : admins.length === 0 ? 'ADMIN_EMAILS empty' : 'no channel';
  if (discordFailure) return { ...discordFailure, detail: `${discordFailure.detail}; ${why}` };
  return { delivered: false, channel: 'none', detail: why };
}

/**
 * Email ADMIN_EMAILS directly: the email branch only, never Discord.
 *
 * For content that must reach the operator and nobody else, such as the
 * model's draft on a dry-run day (api/_lib/brief-dry-run.ts). deliver() posts
 * to a Discord webhook first whenever one is set, and who reads that channel
 * is not known here, so it cannot carry anything private. Same Resend call and
 * the same one log line as every alert; no deduplication. Never throws.
 */
export async function emailAdmins(a: AlertInput): Promise<AlertResult> {
  let result: AlertResult;
  try {
    const resendKey = process.env.RESEND_API_KEY;
    // Parsed exactly as deliver() parses it.
    const admins = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map((e) => e.trim())
      .filter(Boolean);
    if (!resendKey) result = { delivered: false, channel: 'none', detail: 'RESEND_API_KEY unset' };
    else if (admins.length === 0) result = { delivered: false, channel: 'none', detail: 'ADMIN_EMAILS empty' };
    else result = await viaEmail(resendKey, admins, a);
  } catch (err) {
    result = { delivered: false, channel: 'email', detail: err instanceof Error ? err.message : String(err) };
  }
  logOutcome(a, result);
  return result;
}

/** How much of a provider body is ever examined; far more than a reason needs. */
const SCRUB_INPUT_MAX = 4096;

/**
 * A reason is safe to log only after the things a provider or a transport error
 * may echo back are removed: addresses (a 4xx body names the one it refused)
 * and URLs (a Discord webhook URL carries its own token), and the sending key
 * itself should a provider quote it. Anything left is short and ours.
 */
export function scrubForLog(text: string): string {
  // BOUND THE INPUT FIRST. The address pattern is quadratic on a long run with
  // no delimiter (a 200KB body took ~19s), and a provider body is outside our
  // control. If the cap cuts the text, the last token is dropped: it may be
  // the front of an address whose "@" fell on the other side of the cut.
  const bounded = text.length > SCRUB_INPUT_MAX ? text.slice(0, SCRUB_INPUT_MAX).replace(/\S+$/, '') : text;
  const key = process.env.RESEND_API_KEY;
  const unkeyed = key ? bounded.split(key).join('[key]') : bounded;
  return unkeyed
    .replace(/\bre_[A-Za-z0-9_-]{8,}/g, '[key]')
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/[^\s<>"',;:()]+@[^\s<>"',;:()]+/g, '[address]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

/**
 * EXACTLY ONE LINE per raiseAlert outcome — the observability the nine
 * mechanical-edition days (2026-11-07 to 11-15) lacked. A successful send used
 * to log nothing, so "sent" and "never attempted" looked the same in the
 * runtime log and nobody could say whether the emails arrived.
 *
 * Never logs an address, a body or a key: recipients are a COUNT, the provider
 * reason is scrubbed, and the title is the caller's short heading, not the
 * body. Never throws.
 */
function logOutcome(a: AlertInput, r: AlertResult): void {
  try {
    const key = a.key ? ` key=${a.key}` : '';
    if (r.channel === 'suppressed') {
      console.log(`[alert] suppressed (${scrubForLog(r.detail)})${key} — ${a.title}`);
    } else if (r.delivered) {
      const recipients = r.recipients !== undefined ? ` recipients=${r.recipients}` : '';
      console.log(`[alert] delivered channel=${r.channel} id=${r.messageId ?? 'none'}${recipients}${key} — ${a.title}`);
    } else {
      console.error(`[alert] undelivered channel=${r.channel} reason=${scrubForLog(r.detail)}${key} — ${a.title}`);
    }
  } catch {
    // Logging must never be the reason an alert fails.
  }
}

/**
 * Clear every condition under `prefix` that is no longer active.
 *
 * The reason this exists rather than a single clearAlert call: an endpoint
 * condition is keyed by WHICH endpoints are affected, so the key changes when
 * the set changes. Without this, "cii and briefs-sample are down" resolving to
 * "only briefs-sample is down" would leave the first condition on the books
 * forever, and its all-clear would never be sent.
 *
 * Returns the keys it stood down, so a caller can report honestly.
 */
export async function clearStaleAlerts(
  prefix: string,
  activeKeys: string[],
  /**
   * REQUIRED, and required on purpose. When this defaulted to `new Date()` the
   * cutoff was taken AFTER active conditions had refreshed their last_seen, so
   * every row looked stale and a live condition missing from `activeKeys` would
   * be stood down. A caller must capture this before raising any alert, which
   * makes the safe usage the only usage the type system allows.
   */
  notSeenSince: Date,
): Promise<string[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return [];
  try {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(dbUrl);
    // TWO conditions, and the second is the one that matters. `activeKeys` is
    // what the caller observed this run — useful, but a caller bug that omits a
    // live key would stand down a real alert. `last_seen` is stored state:
    // every active condition refreshes it at the top of raiseAlert, so a row
    // untouched since this run began was genuinely not observed. Derived from
    // the data rather than from the caller being complete.
    const cutoff = notSeenSince.toISOString();
    const rows = (await sql`
      SELECT fingerprint FROM alert_state
      WHERE fingerprint LIKE ${prefix + '%'}
        AND NOT (fingerprint = ANY(${activeKeys}))
        AND last_seen < ${cutoff}
    `) as unknown as Array<{ fingerprint: string }>;
    const cleared: string[] = [];
    for (const r of rows) {
      const result = await clearAlert(r.fingerprint);
      // Only report what actually stood down. clearAlert keeps the row when
      // delivery fails so it can retry, and reporting it as cleared anyway
      // would tell the operator a condition was resolved when nobody was told.
      if (result.delivered || result.detail === 'nothing_to_clear') cleared.push(r.fingerprint);
    }
    return cleared;
  } catch {
    return [];
  }
}

/**
 * Raise an alert on the best channel actually available. Never throws.
 *
 * With a `key`, one ongoing condition produces ONE notification plus a
 * reminder every ALERT_REMINDER_HOURS — not one per cron tick. Without a key
 * it always sends, which is right for genuinely one-off events and wrong for
 * anything a cron evaluates on a schedule.
 */
export async function raiseAlert(a: AlertInput): Promise<AlertResult> {
  const result = await raiseAlertUnlogged(a);
  logOutcome(a, result);
  return result;
}

async function raiseAlertUnlogged(a: AlertInput): Promise<AlertResult> {
  if (!a.key) return await deliver(a);

  const { send, ongoingHours, previousSent } = await claimNotification(a.key, a);
  // Not in someone's inbox for the ninth time, but still on the record: the
  // caller's log line says it was suppressed.
  if (!send) return { delivered: false, channel: 'suppressed', detail: `ongoing_${ongoingHours}h` };

  const body = ongoingHours > 0 ? `${a.body}\n\nOngoing for about ${ongoingHours}h — still not resolved.` : a.body;
  const result = await deliver({ ...a, body });
  // Delivery failed after we claimed the slot — give it back, or the next tick
  // stays silent for the whole reminder interval on an alert nobody received.
  if (!result.delivered) await releaseClaim(a.key, previousSent);
  return result;
}
