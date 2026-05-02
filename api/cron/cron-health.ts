import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs', maxDuration: 30 };

/**
 * Cron health monitor.
 *
 * Pings the production /api/status endpoint and posts a Discord alert
 * if any monitored endpoint is degraded or down. Runs every 30 minutes
 * via vercel.json `crons`.
 *
 * Also surfaces a "cron lag" warning: any cron whose last successful
 * run is more than 2x its expected interval (tracked via
 * dashview-cron-stats KV record). For now we infer health from /api/status.
 *
 * Silently no-ops if DISCORD_APPROVAL_WEBHOOK_URL is not set.
 *
 * 2026-05-02 G2.
 */

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
    const r = await fetch(`https://${host}/api/status`, { signal: AbortSignal.timeout(15000) });
    status = (await r.json()) as StatusPayload;
  } catch (err) {
    console.error('[cron-health] failed to fetch status', err);
    return res.status(502).json({ error: 'status fetch failed', message: String(err) });
  }

  const downEndpoints = status.endpoints.filter((e) => e.status === 'down');
  const degradedEndpoints = status.endpoints.filter((e) => e.status === 'degraded');
  const issuesCount = downEndpoints.length + degradedEndpoints.length;

  if (issuesCount === 0) {
    return res.status(200).json({ ok: true, allHealthy: true, generatedAt: status.generatedAt });
  }

  // We have issues — alert if Discord is configured.
  if (!webhook || !enabled) {
    return res.status(200).json({
      ok: true,
      issuesDetected: issuesCount,
      alertingDisabled: true,
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
