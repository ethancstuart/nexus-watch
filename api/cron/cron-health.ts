import type { VercelRequest, VercelResponse } from '@vercel/node';
import { raiseAlert, clearStaleAlerts } from '../_lib/alert.js';
import { checkDateFor, ledgerTruthVerdict, PAST_GRACE_DAYS } from '../_lib/ledger-truth.js';
import { neon } from '@neondatabase/serverless';

// 60, not 30: a degraded reading is now re-checked before it pages (below),
// and that is a second /api/status round trip after a short wait.
export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Cron health monitor. Runs every 30 minutes via vercel.json `crons`.
 *
 * Two checks, both delivered through raiseAlert — Discord when configured,
 * otherwise email to ADMIN_EMAILS through Resend:
 *
 *   1. ENDPOINTS. Pings /api/status. An endpoint that is DOWN pages at once.
 *      An endpoint that is merely SLOW is re-checked before anyone is told:
 *      between 2026-09-01 and 09-09 the slow reading was a cold start at a
 *      quiet hour (03:00, 09:00, 20:00, 22:30 UTC) that had recovered by the
 *      next tick, and each one cost two emails — the warning and its
 *      all-clear. Nineteen of them in a week. A cold start is real for the
 *      one visitor who hit it, but it is not something an operator can act on
 *      at 3am, and the status page still records it. Sustained slowness
 *      survives the re-check and pages.
 *
 *   2. LEDGER TRUTH. Whether the resolver ran and whether it skipped anything,
 *      decided by api/_lib/ledger-truth.ts, which carries the reasoning and the
 *      tests. The previous version of this check paged CRITICAL 23 times in
 *      one week on calls that were held by the published grace rule.
 */

/** How long to let a cold endpoint warm before believing it is slow. */
const DEGRADED_RECHECK_DELAY_MS = 8000;

interface StatusEndpoint {
  path: string;
  status: 'ok' | 'degraded' | 'down';
  latencyMs: number;
  httpCode: number;
  lastError?: string;
}

interface StatusPayload {
  generatedAt: string;
  overallHealth: 'ok' | 'degraded' | 'down';
  endpoints: StatusEndpoint[];
}

async function fetchStatus(host: string): Promise<StatusPayload> {
  const r = await fetch(`https://${host}/api/status`, { signal: AbortSignal.timeout(15000) });
  return (await r.json()) as StatusPayload;
}

async function postDiscord(webhook: string, content: string, embeds: unknown[]): Promise<boolean> {
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, embeds, username: 'NexusWatch Health' }),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Captured before ANY alert is raised, including the ledger check below.
  // Every active condition refreshes its last_seen after this instant, so a row
  // older than it was genuinely not observed on this run — which is what lets
  // clearStaleAlerts derive staleness from stored state instead of trusting a
  // caller to pass a complete active set.
  const runStartedAt = new Date();
  // Vercel cron auth
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const webhook = process.env.DISCORD_APPROVAL_WEBHOOK_URL;
  const enabled = process.env.DISCORD_APPROVAL_ENABLED !== 'false';

  // Pull current status snapshot
  const host = req.headers.host || 'nexuswatch.dev';
  let status: StatusPayload;
  try {
    status = await fetchStatus(host);
  } catch (err) {
    console.error('[cron-health] failed to fetch status', err);
    return res.status(502).json({ error: 'status fetch failed', message: String(err) });
  }

  // LEDGER TRUTH. resolve-calls runs unattended at 09:45 UTC. If it silently
  // fails, calls sit past their resolution date and the product's entire
  // pre-commitment claim quietly stops being true, with nothing on any surface
  // saying so. Absence of resolution is exactly the failure that looks like
  // nothing happening.
  //
  // The decision lives in api/_lib/ledger-truth.ts, where it is tested against
  // the week of 2026-09-07. In short: a day with calls due and nothing disposed
  // of is a silent resolver (same-day); a pending call strictly more than
  // PAST_GRACE_DAYS past its date is a skipped row. A call held under the
  // published coverage rule satisfies neither, by construction — the previous
  // query paged on exactly those, 23 times in a week.
  let ledgerIssue: { checkDate: string; alerts: string[] } | null = null;
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const sql = neon(dbUrl);
      const checkDate = checkDateFor(runStartedAt);
      const rows = (await sql`
        SELECT
          (SELECT COUNT(*)::int FROM calls WHERE resolves_on = ${checkDate}::date) AS due_on_check_date,
          (SELECT COUNT(*)::int FROM calls WHERE resolved_at::date = ${checkDate}::date) AS disposed_on_check_date,
          (SELECT COUNT(*)::int FROM calls
             WHERE status = 'pending' AND resolves_on < CURRENT_DATE - ${PAST_GRACE_DAYS}::int) AS past_grace,
          (SELECT MIN(resolves_on)::text FROM calls
             WHERE status = 'pending' AND resolves_on < CURRENT_DATE - ${PAST_GRACE_DAYS}::int) AS oldest_past_grace
      `) as unknown as Array<{
        due_on_check_date: number;
        disposed_on_check_date: number;
        past_grace: number;
        oldest_past_grace: string | null;
      }>;
      const r = rows[0];
      const alerts = ledgerTruthVerdict({
        checkDate,
        dueOnCheckDate: r?.due_on_check_date ?? 0,
        disposedOnCheckDate: r?.disposed_on_check_date ?? 0,
        pastGrace: r?.past_grace ?? 0,
        oldestPastGrace: r?.oldest_past_grace ?? null,
      });
      for (const a of alerts) await raiseAlert(a);
      // Whatever ledger condition is NOT in this run's verdict is stood down
      // with an all-clear — derived from last_seen, so a key this run did not
      // refresh is one this run did not observe.
      await clearStaleAlerts(
        'ledger:',
        alerts.map((a) => a.key),
        runStartedAt,
      );
      if (alerts.length > 0) ledgerIssue = { checkDate, alerts: alerts.map((a) => a.key) };
    } catch (err) {
      console.error('[cron-health] ledger truth check failed:', err instanceof Error ? err.message : err);
    }
  }

  let downEndpoints = status.endpoints.filter((e) => e.status === 'down');
  let degradedEndpoints = status.endpoints.filter((e) => e.status === 'degraded');

  // A SLOW reading has to survive a second look before it pages. Nothing is
  // down, something is merely slow: give the cold function a moment to warm
  // and measure again. If the second reading is clean, the first was a cold
  // start and the operator hears nothing. If the re-check itself fails, the
  // first reading stands — a doubt about slowness must not hide an outage.
  let recheck: 'not-needed' | 'cleared' | 'confirmed' | 'failed' = 'not-needed';
  if (downEndpoints.length === 0 && degradedEndpoints.length > 0) {
    await new Promise((resolve) => setTimeout(resolve, DEGRADED_RECHECK_DELAY_MS));
    try {
      const second = await fetchStatus(host);
      status = second;
      downEndpoints = second.endpoints.filter((e) => e.status === 'down');
      degradedEndpoints = second.endpoints.filter((e) => e.status === 'degraded');
      recheck = downEndpoints.length + degradedEndpoints.length === 0 ? 'cleared' : 'confirmed';
    } catch (err) {
      recheck = 'failed';
      console.error('[cron-health] degraded re-check failed; keeping the first reading', err);
    }
  }

  const issuesCount = downEndpoints.length + degradedEndpoints.length;

  if (issuesCount === 0) {
    // EVERYTHING RECOVERED — say so. Without this, silence after an alert is
    // ambiguous between "fixed" and "the monitor itself died", and the
    // operator has to infer recovery from an absence. On 2026-08-28 the
    // /api/cii alerts simply stopped when the perf fix deployed and nothing
    // announced it.
    const cleared = await clearStaleAlerts('endpoints:', [], runStartedAt);
    return res.status(200).json({
      ok: true,
      allHealthy: true,
      ledgerIssue,
      recheck,
      clearedAlerts: cleared,
      generatedAt: status.generatedAt,
    });
  }

  // ALERT ON WHATEVER CHANNEL EXISTS. This used to return `alertingDisabled`
  // and stop, because DISCORD_APPROVAL_WEBHOOK_URL has never been set in
  // production — so the health monitor detected issues and told nobody, for
  // months. raiseAlert() prefers Discord when configured and otherwise emails
  // ADMIN_EMAILS through Resend, both of which ARE configured today.
  if (!webhook || !enabled) {
    const summary = [
      ...downEndpoints.map(
        (e) => `DOWN  ${e.path} — HTTP ${e.httpCode}${e.lastError ? ` — ${e.lastError.slice(0, 100)}` : ''}`,
      ),
      ...degradedEndpoints.map((e) => `SLOW  ${e.path} — ${e.latencyMs}ms`),
    ].join('\n');
    // Keyed on WHICH endpoints are affected, not on the message. Latencies
    // change every run ("3934ms"), so keying on the body would have deduped
    // nothing and sent the flood anyway.
    const affected = [...downEndpoints, ...degradedEndpoints].map((e) => e.path).sort();
    const key = `endpoints:${affected.join(',')}`;
    const alert = await raiseAlert({
      key,
      title: `${issuesCount} endpoint issue(s) on nexuswatch.dev`,
      body: `${summary}\n\nChecked ${status.endpoints.length} endpoints at ${status.generatedAt}.`,
      severity: downEndpoints.length > 0 ? 'critical' : 'warning',
    });
    // Any endpoint condition that is no longer present gets an all-clear.
    await clearStaleAlerts('endpoints:', [key], runStartedAt);
    return res.status(200).json({
      ok: true,
      issuesDetected: issuesCount,
      recheck,
      ledgerIssue,
      alert,
      issues: [...downEndpoints, ...degradedEndpoints],
    });
  }

  const lines: string[] = [];
  if (downEndpoints.length > 0) {
    lines.push(`🔴 **${downEndpoints.length} endpoint(s) DOWN**`);
    downEndpoints.forEach((e) => {
      lines.push(`  • \`${e.path}\` — HTTP ${e.httpCode}${e.lastError ? ` — ${e.lastError.slice(0, 80)}` : ''}`);
    });
  }
  if (degradedEndpoints.length > 0) {
    lines.push(`🟡 **${degradedEndpoints.length} endpoint(s) DEGRADED**`);
    degradedEndpoints.forEach((e) => {
      lines.push(`  • \`${e.path}\` — ${e.latencyMs}ms`);
    });
  }

  const colour = downEndpoints.length > 0 ? 0xdc2626 : 0xeab308;
  const ok = await postDiscord(webhook, '', [
    {
      title: `NexusWatch Health Alert — ${status.overallHealth.toUpperCase()}`,
      description: lines.join('\n'),
      color: colour,
      timestamp: status.generatedAt,
      footer: { text: 'nexuswatch.dev/api/status' },
    },
  ]);

  return res.status(200).json({
    ok: true,
    alertSent: ok,
    issuesDetected: issuesCount,
    overallHealth: status.overallHealth,
  });
}
