import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth.js';
import { selectTopic } from '../../marketing/lib/topicSelector.js';
import { buildVoiceProfile } from '../../marketing/lib/marketingVoice.js';
import { generateContent, evaluateVoice } from '../../marketing/lib/contentGenerator.js';
import type { Platform } from '../../marketing/lib/flags.js';

export const config = { runtime: 'nodejs', maxDuration: 60 };

const VALID_PLATFORMS: Platform[] = ['x', 'linkedin', 'substack', 'medium', 'threads', 'bluesky'];

/**
 * POST /api/admin/marketing/preview
 *   { platform: 'x' | 'linkedin' | ... }
 *
 * Generates a preview draft WITHOUT logging it to marketing_posts and
 * WITHOUT posting it anywhere. Lets the chairman ask "what would the
 * engine post next" without any side effects.
 *
 * Bypasses the pause flag — preview must work even when the engine is
 * paused so the chairman can review what the engine WOULD have done.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const body = (req.body ?? {}) as { platform?: string };
  const platform = body.platform as Platform;
  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: 'invalid_platform' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    const topic = await selectTopic(sql, platform);
    if (!topic) {
      return res.json({ ok: false, reason: 'no_eligible_topic' });
    }
    const voice = await buildVoiceProfile(sql, platform);
    const gen = await generateContent({ platform, topic, voiceProfile: voice });
    if (!gen) return res.json({ ok: false, reason: 'generation_failed', topic });
    const baseUrl = `${req.headers['x-forwarded-proto'] ?? 'https'}://${req.headers.host}`;
    const evalResult = await evaluateVoice(baseUrl, platform, gen.content);
    return res.json({
      ok: true,
      platform,
      topic: {
        topic_key: topic.topic_key,
        pillar: topic.pillar,
        hook: topic.hook,
        entity_keys: topic.entity_keys,
        source_layer: topic.source_layer,
      },
      generated: {
        content: gen.content,
        format: gen.format,
        model: gen.model,
        input_tokens: gen.input_tokens,
        output_tokens: gen.output_tokens,
      },
      voice_eval: evalResult,
    });
  } catch (err) {
    console.error('[admin/marketing/preview]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'preview_failed' });
  }
}
