import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { promoteWinners } from '../marketing/lib/variants';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Marketing A/B test promotion cron — Track M.2 (V2)
 *
 * Runs Mondays at 05:00 UTC (shortly after voice-learn). Walks every
 * running experiment in marketing_prompt_variants and:
 *   - If ≥14 days elapsed AND every variant has ≥10 live posts AND the
 *     winner's margin is ≥5%, promotes the winner and retires losers.
 *   - Otherwise leaves the experiment alone (retries next week).
 *
 * See api/marketing/lib/variants.ts for the promotion math.
 *
 * Returns a summary object that the admin UI reads to surface recent
 * auto-promotions.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  if (process.env.MARKETING_AUTOMATION_ENABLED !== 'true') {
    return res.json({ skipped: true, reason: 'env_disabled' });
  }
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);
  try {
    const summary = await promoteWinners(sql);
    return res.json(summary);
  } catch (err) {
    console.error('[marketing-abtest-promote] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'promote_failed' });
  }
}
