import type { VercelRequest, VercelResponse } from '@vercel/node';
import { raiseAlert } from '../_lib/alert.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

/**
 * Weekly cost-and-quota check. Runs Monday 09:00 UTC.
 *
 * A calendared reminder with a deep link per provider that bills or meters
 * this product. Most of them expose no usage API, so this is a "go and look"
 * pulse rather than a measurement.
 *
 * WHY IT GOES THROUGH raiseAlert NOW. From 2026-05-02 to 2026-09-12 this
 * posted to DISCORD_APPROVAL_WEBHOOK_URL and returned `alertingDisabled` when
 * that was unset — and it has never been set in production. Nineteen Mondays,
 * nothing delivered, `ok: true` every time. The week it would have mattered,
 * the Anthropic account ran out of prepaid credit on 2026-09-10 and the daily
 * brief shipped its mechanical edition for three days before anyone noticed.
 * raiseAlert takes whatever channel exists: Discord if configured, otherwise
 * email to ADMIN_EMAILS through Resend, which is how every other alarm here
 * reaches a person.
 *
 * Unkeyed on purpose: a weekly report is a genuinely one-off event, and the
 * dedup rule is for conditions a cron re-evaluates.
 *
 * 2026-05-02 G4.
 */

/**
 * Only providers still wired into the product. Windy (webcams), EIA (energy)
 * and Stripe left with the Intel Map and the paid tiers in September 2026; a
 * reminder to check the billing of a service you no longer call is noise
 * dressed as diligence.
 */
const PROVIDERS = [
  {
    name: 'Anthropic',
    dashboardUrl: 'https://console.anthropic.com/settings/billing',
    note: 'PREPAID CREDIT. The daily brief is the only caller (~$0.04/day measured). When the balance hits zero the brief silently ships its mechanical edition — check the balance, not just the usage.',
  },
  {
    name: 'Vercel',
    dashboardUrl: 'https://vercel.com/dashboard/usage',
    note: 'Function invocations + bandwidth. 17 crons; source-ooni is the one that times out.',
  },
  {
    name: 'Neon',
    dashboardUrl: 'https://console.neon.tech',
    note: 'Compute hours + storage. Measured 2026-09-12: 1.67 GB, of which country_cii_history is 1.31 GB.',
  },
  {
    name: 'Upstash KV',
    dashboardUrl: 'https://console.upstash.com',
    note: 'Free tier: 10k req/day, 256MB. Rate-limit + cache reads count.',
  },
  {
    name: 'Sentry',
    dashboardUrl: 'https://sentry.io/organizations/',
    note: 'Free tier: 5k errors/month. Watch for spikes.',
  },
  {
    name: 'Resend',
    dashboardUrl: 'https://resend.com/dashboard',
    note: 'Free tier: 3k emails/month, 100/day. Brief delivery AND every alarm this product sends.',
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const lines = PROVIDERS.map((p) => `• ${p.name} — ${p.note}\n  → ${p.dashboardUrl}`);
  const body = ['Weekly check-in for the past 7 days. Open each link and verify usage and balance.', '', ...lines].join(
    '\n',
  );

  const result = await raiseAlert({
    severity: 'info',
    title: 'NexusWatch — weekly cost & quota check',
    body,
  });

  return res.status(200).json({
    ok: true,
    delivered: result.delivered,
    channel: result.channel,
    detail: result.detail,
    providersChecked: PROVIDERS.length,
  });
}
