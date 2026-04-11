import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Social drafting queue — enqueue endpoint (Track C.1).
 *
 *   POST /api/social/enqueue
 *     {
 *       platform: 'x' | 'linkedin' | 'reddit' | 'dm',
 *       action_type: 'reply' | 'post' | 'thread' | 'comment',
 *       draft_content: string,
 *       rationale?: string,
 *       source?: string,        // "mention from @user", "daily X thread", etc.
 *       source_url?: string,    // link to the original item being responded to
 *       voice_score?: number,   // 0-100 from /api/voice/eval, if the caller ran it
 *     }
 *     → 201 { id, status: 'pending' }   if accepted into the queue
 *     → 503 { error }                    if the kill switch is off
 *     → 429 { error, retry_after_seconds } if platform draft cap hit
 *     → 400 { error }                    on validation failures
 *
 * Called by the per-platform drafting agents in Track C.2-C.4 after
 * they've generated a candidate draft and scored it through
 * /api/voice/eval. This endpoint is INTENTIONALLY thin — it does
 * not re-run voice eval (defense in depth lives in the admin
 * approval step, not here), does not hit any platform API, and
 * does not know anything about X/LinkedIn/Reddit internals.
 *
 * What it does do, in order:
 *
 *   1. Check the SOCIAL_AUTONOMY_ENABLED kill switch. If anything
 *      other than the literal string 'true', return 503 and refuse
 *      to touch the DB. One env var flip halts every agent instantly.
 *
 *   2. Validate the payload shape (platform enum, action_type enum,
 *      non-empty content, content length under platform cap).
 *
 *   3. Enforce the per-platform drafting cap. Agents are allowed to
 *      draft MORE than the reviewer will end up approving — see the
 *      v5 plan Track C.1 rate limits table. The cap here is the
 *      hard upper bound of "how many drafts per platform per 24h
 *      should land in the queue" to protect the reviewer's attention.
 *
 *   4. INSERT into social_queue with status='pending' and write an
 *      'enqueue' row to social_actions so the audit log starts
 *      from the moment the draft arrived.
 *
 * NOT done here (by design):
 *   - Voice eval — the agent that called us is expected to have
 *     run /api/voice/eval itself. If it didn't, the reviewer in the
 *     approval queue is the final gate.
 *   - Deduplication — the same mention could in theory produce two
 *     drafts from two agent runs. That's fine: both land in the
 *     queue, reviewer picks one or neither.
 *   - Platform send — /api/social/enqueue never touches X/LinkedIn/
 *     Reddit. Only the send worker (Track C.2+) does that, and only
 *     for rows in the 'approved' status.
 *
 * Authentication: this endpoint is expected to be called FROM our
 * own server-side crons (Track C.2 X drafter, C.3 LinkedIn drafter,
 * C.4 Reddit drafter). It doesn't validate cookies or admin
 * sessions. In production the endpoint should be restricted via a
 * shared SOCIAL_ENQUEUE_TOKEN env var — C.1 ships the simplest
 * version and adds an optional Authorization: Bearer check when
 * the token is configured. Without the token set, it's open
 * (appropriate for staging / initial integration testing, where
 * SOCIAL_AUTONOMY_ENABLED is false anyway).
 */

type Platform = 'x' | 'linkedin' | 'reddit' | 'dm';
type ActionType = 'reply' | 'post' | 'thread' | 'comment';

// Per-platform draft caps enforced on the queue side. These are
// higher than the APPROVED-send caps because the reviewer filters
// roughly 2-3x — the plan allows the drafter to overproduce so the
// queue never sits empty. See NEXUSWATCH-COMPLETION-PLAN.md Track C.1.
const DRAFT_CAP_PER_24H: Record<Platform, number> = {
  x: 100,
  linkedin: 30,
  reddit: 20,
  dm: 20,
};

// Per-platform max content length at enqueue time. Stricter than the
// platform-API max because we want the reviewer to see the final
// shape, not an unfinished draft that would be rejected by the
// platform anyway.
const MAX_CONTENT_CHARS: Record<Platform, number> = {
  x: 280,
  linkedin: 3500,
  reddit: 9000,
  dm: 1500,
};

function isPlatform(p: unknown): p is Platform {
  return p === 'x' || p === 'linkedin' || p === 'reddit' || p === 'dm';
}

function isActionType(a: unknown): a is ActionType {
  return a === 'reply' || a === 'post' || a === 'thread' || a === 'comment';
}

interface EnqueueBody {
  platform?: unknown;
  action_type?: unknown;
  draft_content?: unknown;
  rationale?: unknown;
  source?: unknown;
  source_url?: unknown;
  voice_score?: unknown;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Kill switch — the single env var that halts every agent at once.
  const autonomyEnabled = process.env.SOCIAL_AUTONOMY_ENABLED === 'true';
  if (!autonomyEnabled) {
    return res.status(503).json({
      error: 'autonomy_disabled',
      hint: 'SOCIAL_AUTONOMY_ENABLED env var is not set to "true". Drafting queue accepts nothing.',
    });
  }

  // Optional bearer token — if SOCIAL_ENQUEUE_TOKEN is set, the caller
  // must present it. If unset, any caller is allowed (appropriate only
  // for local/staging integration). Production should always set the
  // token.
  const expectedToken = process.env.SOCIAL_ENQUEUE_TOKEN;
  if (expectedToken) {
    const authHeader = req.headers.authorization || '';
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match || match[1] !== expectedToken) {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  const body = (req.body ?? {}) as EnqueueBody;

  if (!isPlatform(body.platform)) {
    return res.status(400).json({ error: 'invalid_platform', hint: 'Expected x|linkedin|reddit|dm' });
  }
  if (!isActionType(body.action_type)) {
    return res.status(400).json({ error: 'invalid_action_type', hint: 'Expected reply|post|thread|comment' });
  }
  const draftContent = typeof body.draft_content === 'string' ? body.draft_content.trim() : '';
  if (!draftContent) {
    return res.status(400).json({ error: 'empty_draft_content' });
  }
  if (draftContent.length > MAX_CONTENT_CHARS[body.platform]) {
    return res.status(400).json({
      error: 'draft_too_long',
      max_chars: MAX_CONTENT_CHARS[body.platform],
      got: draftContent.length,
    });
  }

  const rationale = typeof body.rationale === 'string' ? body.rationale.slice(0, 500) : null;
  const source = typeof body.source === 'string' ? body.source.slice(0, 300) : null;
  const sourceUrl = typeof body.source_url === 'string' ? body.source_url.slice(0, 500) : null;
  const voiceScoreRaw = typeof body.voice_score === 'number' ? body.voice_score : null;
  const voiceScore =
    voiceScoreRaw !== null && Number.isFinite(voiceScoreRaw)
      ? Math.max(0, Math.min(100, Math.round(voiceScoreRaw)))
      : null;

  try {
    const sql = neon(dbUrl);

    // Enforce the per-platform 24-hour drafting cap. A cron agent
    // that's misbehaving shouldn't be able to flood the queue.
    const countRows = (await sql`
      SELECT COUNT(*)::int AS c
      FROM social_queue
      WHERE platform = ${body.platform}
        AND created_at > NOW() - INTERVAL '24 hours'
    `) as unknown as Array<{ c: number }>;
    const currentCount = countRows[0]?.c ?? 0;
    if (currentCount >= DRAFT_CAP_PER_24H[body.platform]) {
      return res.status(429).json({
        error: 'draft_cap_exceeded',
        platform: body.platform,
        drafts_in_last_24h: currentCount,
        cap: DRAFT_CAP_PER_24H[body.platform],
        retry_after_seconds: 3600,
      });
    }

    // Insert the queue row.
    const inserted = (await sql`
      INSERT INTO social_queue (
        platform, action_type, source, source_url,
        draft_content, rationale, voice_score, status
      ) VALUES (
        ${body.platform}, ${body.action_type}, ${source}, ${sourceUrl},
        ${draftContent}, ${rationale}, ${voiceScore}, 'pending'
      )
      RETURNING id, created_at
    `) as unknown as Array<{ id: number; created_at: string }>;

    if (inserted.length === 0) {
      return res.status(500).json({ error: 'insert_failed' });
    }
    const row = inserted[0];

    // Audit log — the initial "draft arrived" row. Every draft in the
    // queue has at least this one social_actions row so the audit log
    // is complete from moment-of-entry.
    await sql`
      INSERT INTO social_actions (queue_id, action, actor, from_status, to_status, note)
      VALUES (${row.id}, 'enqueue', 'system', NULL, 'pending', ${source})
    `;

    return res.status(201).json({
      id: row.id,
      status: 'pending',
      platform: body.platform,
      action_type: body.action_type,
      draft_cap_remaining: Math.max(0, DRAFT_CAP_PER_24H[body.platform] - currentCount - 1),
    });
  } catch (err) {
    console.error('[social/enqueue] insert failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'enqueue_failed' });
  }
}
