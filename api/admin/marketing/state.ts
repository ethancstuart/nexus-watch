import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveAdmin } from '../_auth';
import {
  isPaused,
  isShadowMode,
  isPlatformEnabled,
  getLastRun,
  getAnthropicCountToday,
  listAllPlatforms,
} from '../../marketing/lib/flags';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * GET /api/admin/marketing/state — read all runtime flags.
 *
 * Returns:
 *   {
 *     paused: boolean,
 *     shadow_mode: boolean,
 *     platforms: { x: { enabled: boolean, last_run: string|null }, ... },
 *     anthropic_calls_today: number
 *   }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });

  const platforms = listAllPlatforms();
  const platformStates: Record<string, { enabled: boolean; last_run: string | null }> = {};
  for (const p of platforms) {
    platformStates[p] = {
      enabled: await isPlatformEnabled(p),
      last_run: await getLastRun(p),
    };
  }

  return res.json({
    paused: await isPaused(),
    shadow_mode: await isShadowMode(),
    platforms: platformStates,
    anthropic_calls_today: await getAnthropicCountToday(),
  });
}
