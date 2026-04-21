/**
 * config.ts — unified V2 config for the marketing automation module
 *
 * Stored as a single JSON blob in Vercel KV at `marketing:config`.
 * One-read-one-write per cron run. Defaults returned when KV is
 * unavailable OR when a field is missing (forward-compatible).
 *
 * Fields:
 *   cadence     — posts/day per platform (1-5), caps daily dispatcher runs
 *   pillarMix   — target distribution across the 5 content pillars, normalized to 1.0
 *   voiceKnobs  — 0-100 dials that inject calibration language into the voice system prompt
 *   embargo     — list of {key, kind: 'topic'|'entity', until: ISO date} — topicSelector skips these
 *   abTest      — A/B test state for voice / prompt variants (V2 add)
 *
 * Chairman-locked defaults match D-6 (pillar mix 40/20/15/15/10) and
 * leave every voice knob at 50 (neutral) to not disturb v1 behavior.
 */

import type { Platform } from './flags.js';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;
const CONFIG_KEY = 'marketing:config';

export type Pillar = 'signal' | 'pattern' | 'methodology' | 'product' | 'context';

export interface VoiceKnobs {
  /** 0 = very casual / 100 = boardroom formal. 50 = v1 default. */
  formality: number;
  /** 0 = assertive / 100 = heavily hedged ("appears", "reports indicate"). 50 = v1 default. */
  hedging: number;
  /** 0 = narrative-first / 100 = numbers-first, citation-dense. 50 = v1 default. */
  dataDensity: number;
  /** 0 = zero emoji / 100 = brand-set max (1/X, 2/LinkedIn, etc.). 50 = v1 default. */
  emoji: number;
}

export interface EmbargoEntry {
  /** Either a topic_key or entity_name (determined by `kind`). */
  key: string;
  kind: 'topic' | 'entity';
  /** ISO timestamp — after this, the embargo expires automatically. */
  until: string;
  /** Optional reason, shown in admin. */
  reason?: string;
}

export interface MarketingConfig {
  cadence: Record<Platform, number>;
  pillarMix: Record<Pillar, number>;
  voiceKnobs: VoiceKnobs;
  embargo: EmbargoEntry[];
  /** Monotonic counter — incremented on every write. Used for etag-style conflict detection. */
  version: number;
  /** Last write ISO timestamp. */
  updatedAt: string;
  /** Admin user id who made the last write, if known. */
  updatedBy?: string;
  /**
   * Per-platform-per-type kill switches. Key: `${platform}:${post_type}`.
   * If absent or true → enabled. false → skip this type on this platform.
   * Example: { "x:alert": false } disables alert posts on X only.
   */
  killSwitches?: Record<string, boolean>;
  /**
   * Optional CTA headline override. Editable without deploy.
   * If set, dispatcher uses this as the topic hook for cta posts instead of generating it.
   */
  ctaHeadline?: string;
}

export const DEFAULT_CONFIG: MarketingConfig = {
  cadence: {
    x: 3,
    linkedin: 1,
    substack: 1, // weekly in practice; cadence here means "max per day"
    medium: 1,
    threads: 1,
    bluesky: 2,
    beehiiv: 1,
    instagram: 2,
  },
  pillarMix: {
    signal: 0.4,
    pattern: 0.2,
    methodology: 0.15,
    product: 0.15,
    context: 0.1,
  },
  voiceKnobs: {
    formality: 50,
    hedging: 50,
    dataDensity: 50,
    emoji: 50,
  },
  embargo: [],
  version: 0,
  updatedAt: new Date(0).toISOString(),
  killSwitches: {},
  ctaHeadline: undefined,
};

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
    const res = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'text/plain' },
      body: value,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Deep-merge loaded config over defaults so newly-added fields get sane defaults
 * without requiring a KV migration.
 */
function hydrate(raw: unknown): MarketingConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_CONFIG };
  const r = raw as Partial<MarketingConfig>;
  return {
    cadence: { ...DEFAULT_CONFIG.cadence, ...(r.cadence ?? {}) },
    pillarMix: { ...DEFAULT_CONFIG.pillarMix, ...(r.pillarMix ?? {}) },
    voiceKnobs: { ...DEFAULT_CONFIG.voiceKnobs, ...(r.voiceKnobs ?? {}) },
    embargo: Array.isArray(r.embargo) ? r.embargo : [],
    version: typeof r.version === 'number' ? r.version : 0,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : DEFAULT_CONFIG.updatedAt,
    updatedBy: r.updatedBy,
    killSwitches: typeof r.killSwitches === 'object' && r.killSwitches !== null && !Array.isArray(r.killSwitches)
      ? (r.killSwitches as Record<string, boolean>)
      : {},
    ctaHeadline: typeof r.ctaHeadline === 'string' ? r.ctaHeadline : undefined,
  };
}

export async function getConfig(): Promise<MarketingConfig> {
  const raw = await kvGet(CONFIG_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    return hydrate(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(patch: Partial<MarketingConfig>, updatedBy?: string): Promise<MarketingConfig> {
  const current = await getConfig();
  const next: MarketingConfig = {
    ...current,
    ...patch,
    cadence: { ...current.cadence, ...(patch.cadence ?? {}) },
    pillarMix: { ...current.pillarMix, ...(patch.pillarMix ?? {}) },
    voiceKnobs: { ...current.voiceKnobs, ...(patch.voiceKnobs ?? {}) },
    embargo: patch.embargo ?? current.embargo,
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy ?? current.updatedBy,
  };
  // Normalize pillar mix so callers can't accidentally break invariant.
  next.pillarMix = normalizePillarMix(next.pillarMix);
  // Clamp cadence into [0, 10].
  for (const p of Object.keys(next.cadence) as Platform[]) {
    next.cadence[p] = Math.max(0, Math.min(10, Math.round(next.cadence[p])));
  }
  // Clamp voice knobs.
  next.voiceKnobs = {
    formality: clamp01(next.voiceKnobs.formality),
    hedging: clamp01(next.voiceKnobs.hedging),
    dataDensity: clamp01(next.voiceKnobs.dataDensity),
    emoji: clamp01(next.voiceKnobs.emoji),
  };
  // Drop expired embargoes on every write — keeps list tidy.
  const now = Date.now();
  next.embargo = next.embargo.filter((e) => {
    const t = Date.parse(e.until);
    return isFinite(t) && t > now;
  });
  await kvSet(CONFIG_KEY, JSON.stringify(next));
  return next;
}

function clamp01(n: number): number {
  if (!isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizePillarMix(mix: Record<Pillar, number>): Record<Pillar, number> {
  const keys = Object.keys(DEFAULT_CONFIG.pillarMix) as Pillar[];
  const sum = keys.reduce((s, k) => s + Math.max(0, mix[k] ?? 0), 0);
  if (sum <= 0) return { ...DEFAULT_CONFIG.pillarMix };
  const out = {} as Record<Pillar, number>;
  for (const k of keys) out[k] = Math.max(0, mix[k] ?? 0) / sum;
  return out;
}

/**
 * Returns true if a topic_key OR any of the entity_keys are currently embargoed.
 * Used by topicSelector to drop candidates before scoring.
 */
export function isEmbargoed(config: MarketingConfig, topicKey: string, entityKeys: string[]): boolean {
  const now = Date.now();
  for (const e of config.embargo) {
    const t = Date.parse(e.until);
    if (!isFinite(t) || t <= now) continue;
    if (e.kind === 'topic' && e.key === topicKey) return true;
    if (e.kind === 'entity' && entityKeys.includes(e.key)) return true;
  }
  return false;
}
