/**
 * dispatcher.ts — single entry point for "draft + log + maybe post"
 *
 * Each platform cron calls runDispatch(platform). This:
 *   1. preflight() — checks pause/shadow/enabled flags
 *   2. selectTopic() — picks a topic or returns null (skip)
 *   3. buildVoiceProfile() — assembles system prompt + few-shots
 *   4. generateContent() — calls Claude
 *   5. evaluateVoice() — calls existing /api/voice/eval
 *   6. INSERT into marketing_posts (always — shadow and live)
 *   7. If voice passed AND not held: dispatch via the platform adapter
 *   8. UPDATE marketing_posts with platform results
 *   9. recordTopicUsed for dedup
 *   10. recordRun for last-run timestamp
 *
 * Returns a summary describing what happened.
 */

import { neon } from '@neondatabase/serverless';
import { type Platform, preflight, recordRun, checkAndIncrementAnthropicCounter } from './flags.js';
import { selectTopic, recordTopicUsed, type PostType, type Topic } from './topicSelector.js';
import { buildVoiceProfile } from './marketingVoice.js';
import { generateContent, evaluateVoice } from './contentGenerator.js';
import { getConfig } from './config.js';
import { pickVariant } from './variants.js';
import type { PlatformAdapter } from '../adapters/types.js';
import { xAdapter } from '../adapters/xAdapter.js';
import { linkedinAdapter } from '../adapters/linkedinAdapter.js';
import { substackAdapter } from '../adapters/substackAdapter.js';
import { mediumAdapter } from '../adapters/mediumAdapter.js';
import { threadsAdapter } from '../adapters/threadsAdapter.js';
import { blueskyAdapter } from '../adapters/blueskyAdapter.js';
import { instagramAdapter } from '../adapters/instagramAdapter.js';

const ADAPTERS: Partial<Record<Platform, PlatformAdapter>> = {
  x: xAdapter,
  linkedin: linkedinAdapter,
  substack: substackAdapter,
  medium: mediumAdapter,
  threads: threadsAdapter,
  bluesky: blueskyAdapter,
  instagram: instagramAdapter,
};

const VOICE_HOLD_THRESHOLD = 70;

const PLATFORM_CHAR_LIMITS: Partial<Record<Platform, number>> = {
  x: 280,
  bluesky: 300,
  threads: 500,
  instagram: 2200,
};

function validateContentLength(platform: Platform, content: string): string | null {
  const limit = PLATFORM_CHAR_LIMITS[platform];
  if (!limit) return null;
  const len = [...content].length;
  if (len > limit) return `content too long for ${platform}: ${len}/${limit} chars`;
  return null;
}

export interface DispatchSummary {
  platform: Platform;
  proceeded: boolean;
  shadow?: boolean;
  reason?: string;
  topic_key?: string;
  pillar?: string;
  voice_score?: number;
  voice_passed?: boolean;
  status?: string;
  post_id?: number;
  platform_post_id?: string;
  platform_error?: string;
  stub?: boolean;
}

const SOCIAL_BASE_URL = 'https://nexuswatch.dev';

export function buildImageUrl(postType: PostType, topic: Topic): string | undefined {
  const t = encodeURIComponent(topic.hook.slice(0, 80));
  const country = topic.entity_keys[0] ? `&country=${encodeURIComponent(topic.entity_keys[0])}` : '';
  const metric =
    topic.metadata?.cii_score != null
      ? `&metric=${encodeURIComponent(`CII ${topic.metadata.cii_score}`).replace(/%20/g, '+')}`
      : '';
  const layer = topic.source_layer ? `&layer=${encodeURIComponent(topic.source_layer.toUpperCase())}` : '';

  if (postType === 'alert') {
    return `${SOCIAL_BASE_URL}/api/og/social?type=alert&title=${t}${country}${metric}${layer}`;
  }
  if (postType === 'data_story') {
    return `${SOCIAL_BASE_URL}/api/og/social?type=data_story&title=${t}${layer}`;
  }
  if (postType === 'cta') {
    return `${SOCIAL_BASE_URL}/api/og/social?type=cta&title=${encodeURIComponent('158 countries. Real-time intelligence.')}`;
  }
  if (postType === 'product_update') {
    return `${SOCIAL_BASE_URL}/api/og/social?type=product_update&title=${t}`;
  }
  return undefined;
}

export function isPostTypeEnabled(
  killSwitches: Record<string, boolean> | undefined,
  platform: Platform,
  postType: PostType,
): boolean {
  if (!killSwitches) return true;
  const key = `${platform}:${postType}`;
  return killSwitches[key] !== false;
}

export async function runDispatch(platform: Platform, baseUrl: string): Promise<DispatchSummary> {
  const summary: DispatchSummary = { platform, proceeded: false };

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    summary.reason = 'no_database_url';
    return summary;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  const pf = await preflight(platform);
  if (!pf.proceed) {
    summary.reason = pf.reason;
    return summary;
  }
  summary.proceeded = true;
  summary.shadow = pf.shadow;

  // Cadence cap (V2) — skip if platform already at its daily post quota.
  // Only counts LIVE posts (shadow dispatches are exempt so shadow mode can still
  // exercise the whole pipeline freely). `cadence[platform]` = max posts/day.
  const cfg = await getConfig().catch(() => null);
  const cadence = cfg?.cadence?.[platform] ?? 3;
  if (cadence <= 0) {
    summary.reason = 'cadence_zero';
    return summary;
  }
  if (!pf.shadow) {
    const todaysCount = (await sql`
      SELECT COUNT(*)::int AS c
      FROM marketing_posts
      WHERE platform = ${platform}
        AND shadow_mode = FALSE
        AND status = 'posted'
        AND posted_at > CURRENT_DATE
    `) as unknown as Array<{ c: number }>;
    const count = todaysCount[0]?.c ?? 0;
    if (count >= cadence) {
      summary.reason = 'cadence_cap_reached';
      return summary;
    }
  }

  // Anthropic spend cap.
  const underCap = await checkAndIncrementAnthropicCounter();
  if (!underCap) {
    summary.reason = 'anthropic_daily_cap_reached';
    return summary;
  }

  // 1. Pick topic.
  let topic = await selectTopic(sql, platform);
  if (!topic) {
    summary.reason = 'no_eligible_topic';
    await recordRun(platform);
    return summary;
  }
  summary.topic_key = topic.topic_key;
  summary.pillar = topic.pillar;

  // Platform gate: alert posts only go to X.
  if (topic.post_type === 'alert' && platform === 'linkedin') {
    summary.reason = 'alert_skipped_linkedin';
    await recordRun(platform);
    return summary;
  }

  // Per-platform-per-type kill switch from KV config.
  if (!isPostTypeEnabled(cfg?.killSwitches, platform, topic.post_type)) {
    summary.reason = `kill_switch_${platform}_${topic.post_type}`;
    await recordRun(platform);
    return summary;
  }

  // CTA headline override from KV config — editable without deploy.
  if (topic.post_type === 'cta' && cfg?.ctaHeadline) {
    topic = { ...topic, hook: cfg.ctaHeadline };
  }

  // 2. Build voice profile.
  const voice = await buildVoiceProfile(sql, platform);

  // 2a. V2: pick an A/B prompt variant for this scope (if one is running).
  const variant = await pickVariant(sql, platform, topic.pillar).catch(() => null);
  if (variant) {
    voice.systemPrompt = `${voice.systemPrompt}\n\n--- EXPERIMENT ${variant.experiment_key} / ${variant.label} ---\n${variant.prompt_suffix}`;
  }

  // 3. Generate content.
  const gen = await generateContent({ platform, topic, voiceProfile: voice, postType: topic.post_type });
  if (!gen) {
    summary.reason = 'generation_failed';
    return summary;
  }

  // Pre-flight content length check — fail fast before spending a voice eval call.
  const lengthError = validateContentLength(platform, gen.content);
  if (lengthError) {
    summary.reason = 'content_too_long';
    summary.platform_error = lengthError;
    return summary;
  }

  // 4. Voice evaluation.
  const evalResult = await evaluateVoice(baseUrl, platform, gen.content);
  const voicePassed = evalResult?.passed ?? true;
  const voiceScore = evalResult?.voice_score ?? 0;
  const voiceViolations = evalResult?.violations ?? [];
  summary.voice_score = voiceScore;
  summary.voice_passed = voicePassed;

  // Image URL: only for X. LinkedIn gets undefined — text-only performs better.
  const imageUrl = platform === 'x' ? buildImageUrl(topic.post_type, topic) : undefined;

  // 5. Decide status.
  const isForbiddenViolation = voiceViolations.some(
    (v) => v.toLowerCase().includes('forbidden') || v.toLowerCase().includes('partisan'),
  );
  // voiceScore === 0 with voicePassed === true means semantic check was skipped/errored.
  // In that case we don't hold — only hold on explicit failure or a real low score.
  const semanticSkipped = voicePassed && voiceScore === 0;
  let status: 'drafted' | 'scheduled' | 'posted' | 'failed' | 'suppressed' | 'held';
  if (isForbiddenViolation) status = 'suppressed';
  else if (!voicePassed || (!semanticSkipped && voiceScore < VOICE_HOLD_THRESHOLD)) status = 'held';
  else status = 'scheduled';

  // 6. INSERT marketing_posts (always log).
  const insertRows = (await sql`
    INSERT INTO marketing_posts (
      platform, pillar, topic_key, entity_keys, format, content, metadata,
      status, shadow_mode, voice_score, voice_violations, scheduled_at, variant_id,
      post_type
    )
    VALUES (
      ${platform}, ${topic.pillar}, ${topic.topic_key}, ${topic.entity_keys},
      ${gen.format}, ${gen.content}, ${JSON.stringify({ source_url: topic.source_url, source_layer: topic.source_layer, rationale: gen.rationale, model: gen.model, input_tokens: gen.input_tokens, output_tokens: gen.output_tokens, variant: variant ? { experiment: variant.experiment_key, label: variant.label } : null })}::jsonb,
      ${status}, ${pf.shadow}, ${voiceScore}, ${voiceViolations}, NOW(), ${variant?.id ?? null},
      ${topic.post_type}
    )
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  const postId = insertRows[0]?.id;
  summary.post_id = postId;
  summary.status = status;

  // Record dedup immediately so the same topic isn't regenerated while held.
  if (postId) {
    await recordTopicUsed(sql, topic.topic_key, topic.entity_keys, platform, postId).catch(() => {});
  }

  // 7. Dispatch only if scheduled.
  if (status === 'scheduled' && postId) {
    const adapter = ADAPTERS[platform];
    if (!adapter) {
      summary.reason = 'no_adapter';
      summary.platform_error = `no adapter registered for ${platform}`;
      await sql`UPDATE marketing_posts SET status = 'failed', platform_error = ${summary.platform_error} WHERE id = ${postId}`;
      return summary;
    }
    const result = await adapter.post(
      { content: gen.content, format: gen.format, image_url: imageUrl, metadata: { source_url: topic.source_url } },
      pf.shadow,
    );
    summary.platform_post_id = result.platform_post_id;
    summary.stub = result.stub;
    summary.platform_error = result.error;

    if (result.ok) {
      await sql`
        UPDATE marketing_posts
        SET status = 'posted',
            posted_at = NOW(),
            platform_post_id = ${result.platform_post_id ?? null},
            platform_url = ${result.platform_url ?? null},
            platform_error = NULL
        WHERE id = ${postId}
      `;
      summary.status = 'posted';
    } else {
      await sql`
        UPDATE marketing_posts
        SET status = 'failed',
            platform_error = ${result.error ?? 'unknown'}
        WHERE id = ${postId}
      `;
      summary.status = 'failed';
    }
  }

  await recordRun(platform);
  return summary;
}
