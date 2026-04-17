import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveAdmin } from '../_auth.js';
import { setPaused, setShadowMode, setPlatformEnabled, type Platform } from '../../marketing/lib/flags.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

const VALID_PLATFORMS: Platform[] = ['x', 'linkedin', 'substack', 'medium', 'threads', 'bluesky', 'beehiiv'];

/**
 * POST /api/admin/marketing/pause
 *
 * Body shapes:
 *   { action: 'pause' | 'resume' }                  — global pause toggle
 *   { action: 'shadow' | 'live' }                   — shadow-mode toggle
 *   { action: 'enable' | 'disable', platform: 'x' } — per-platform toggle
 *
 * The PAUSE flag is THE kill switch — every cron checks it first.
 * Setting paused=true halts all marketing automation in <1s globally
 * (KV propagation). Use this for any incident response.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = (req.body ?? {}) as { action?: string; platform?: string };
  const action = body.action;

  if (action === 'pause') {
    const ok = await setPaused(true);
    return res.json({ ok, paused: true });
  }
  if (action === 'resume') {
    const ok = await setPaused(false);
    return res.json({ ok, paused: false });
  }
  if (action === 'shadow') {
    const ok = await setShadowMode(true);
    return res.json({ ok, shadow_mode: true });
  }
  if (action === 'live') {
    const ok = await setShadowMode(false);
    return res.json({ ok, shadow_mode: false });
  }
  if (action === 'enable' || action === 'disable') {
    const platform = body.platform as Platform | undefined;
    if (!platform || !VALID_PLATFORMS.includes(platform)) {
      return res.status(400).json({ error: 'invalid_platform' });
    }
    const ok = await setPlatformEnabled(platform, action === 'enable');
    return res.json({ ok, platform, enabled: action === 'enable' });
  }
  return res.status(400).json({ error: 'invalid_action' });
}
