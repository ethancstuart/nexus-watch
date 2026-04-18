/**
 * Marketing automation runtime flags — Track M.1
 *
 * All flags are stored in Vercel KV for sub-second propagation. Cron jobs
 * check these flags FIRST before doing any work — the kill switch is the
 * single most-load-bearing surface in this whole module.
 *
 * Keys:
 *   marketing:pause                       — global PAUSE-ALL boolean
 *   marketing:shadow_mode                 — global SHADOW-MODE boolean (default true)
 *   marketing:enabled:{platform}          — per-platform enabled boolean (default false)
 *   marketing:daily_anthropic_calls:{YYYY-MM-DD} — daily Claude call counter
 *   marketing:last_run:{platform}         — last run ISO timestamp per platform
 */

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export type Platform = 'x' | 'linkedin' | 'substack' | 'medium' | 'threads' | 'bluesky' | 'beehiiv' | 'instagram';

const ALL_PLATFORMS: Platform[] = ['x', 'linkedin', 'substack', 'medium', 'threads', 'bluesky', 'beehiiv', 'instagram'];

const DAILY_ANTHROPIC_CAP = 200;

async function kvGet(key: string): Promise<string | null> {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: string | null };
    return data.result;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: string): Promise<boolean> {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const res = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(value)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function kvIncr(key: string): Promise<number> {
  if (!KV_URL || !KV_TOKEN) return 0;
  try {
    const res = await fetch(`${KV_URL}/incr/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as { result: number };
    return data.result ?? 0;
  } catch {
    return 0;
  }
}

export async function isPaused(): Promise<boolean> {
  // Default to PAUSED if KV unavailable — fail safe.
  const v = await kvGet('marketing:pause');
  if (v === null) return true;
  return v === 'true' || v === '1';
}

export async function isShadowMode(): Promise<boolean> {
  // Default to SHADOW if KV unavailable or unset.
  const v = await kvGet('marketing:shadow_mode');
  if (v === null) return true;
  return v !== 'false' && v !== '0';
}

export async function isPlatformEnabled(platform: Platform): Promise<boolean> {
  // Default to DISABLED if KV unavailable or unset.
  const v = await kvGet(`marketing:enabled:${platform}`);
  if (v === null) return false;
  return v === 'true' || v === '1';
}

export async function setPaused(paused: boolean): Promise<boolean> {
  return kvSet('marketing:pause', paused ? 'true' : 'false');
}

export async function setShadowMode(shadow: boolean): Promise<boolean> {
  return kvSet('marketing:shadow_mode', shadow ? 'true' : 'false');
}

export async function setPlatformEnabled(platform: Platform, enabled: boolean): Promise<boolean> {
  return kvSet(`marketing:enabled:${platform}`, enabled ? 'true' : 'false');
}

export async function recordRun(platform: Platform): Promise<void> {
  await kvSet(`marketing:last_run:${platform}`, new Date().toISOString());
}

export async function getLastRun(platform: Platform): Promise<string | null> {
  return kvGet(`marketing:last_run:${platform}`);
}

/**
 * Single-call entry point for crons. Returns whether the cron should
 * proceed and the rationale for skip if not.
 */
export interface PreflightResult {
  proceed: boolean;
  shadow: boolean;
  reason?: string;
}

export async function preflight(platform: Platform): Promise<PreflightResult> {
  if (process.env.MARKETING_AUTOMATION_ENABLED !== 'true') {
    return { proceed: false, shadow: true, reason: 'env_disabled' };
  }
  const paused = await isPaused();
  if (paused) return { proceed: false, shadow: true, reason: 'paused' };
  const enabled = await isPlatformEnabled(platform);
  const shadow = (await isShadowMode()) || !enabled;
  // Even in shadow mode we still proceed — we generate and log, just don't post.
  return { proceed: true, shadow };
}

/**
 * Daily Anthropic call counter. Returns true if under cap (caller may
 * proceed); false if cap reached. Increments on every call regardless.
 */
export async function checkAndIncrementAnthropicCounter(): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const key = `marketing:daily_anthropic_calls:${today}`;
  const newCount = await kvIncr(key);
  return newCount <= DAILY_ANTHROPIC_CAP;
}

export async function getAnthropicCountToday(): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const v = await kvGet(`marketing:daily_anthropic_calls:${today}`);
  return v ? parseInt(v, 10) || 0 : 0;
}

export function listAllPlatforms(): Platform[] {
  return [...ALL_PLATFORMS];
}
