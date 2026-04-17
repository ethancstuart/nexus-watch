/**
 * Shared enqueue logic — Track C.2.
 *
 * Extracted from api/social/enqueue.ts so internal server-side callers
 * (the daily-brief cron, future C.2-C.4 drafter crons) can enqueue
 * drafts without routing through HTTP. The HTTP handler in enqueue.ts
 * becomes a thin wrapper over this function; both paths share the
 * same kill switch, validation, rate limit, and audit log behavior.
 *
 * Keeping the kill switch check INSIDE this core function is
 * deliberate — a cron that accidentally bypasses the HTTP handler
 * cannot also bypass SOCIAL_AUTONOMY_ENABLED. The invariant is that
 * nothing reaches the queue when autonomy is disabled, regardless of
 * which entry point is used.
 */

import { postApprovalNeeded } from '../_discord/notify.js';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NeonSql = any;

export type EnqueuePlatform = 'x' | 'linkedin' | 'reddit' | 'dm';
export type EnqueueActionType = 'reply' | 'post' | 'thread' | 'comment';

export interface EnqueueDraftInput {
  platform: EnqueuePlatform;
  action_type: EnqueueActionType;
  draft_content: string;
  rationale?: string;
  source?: string;
  source_url?: string;
  voice_score?: number;
}

/**
 * Outcome shape returned to the caller. The HTTP handler converts
 * this into a JSON response; the cron handler uses the `ok` flag to
 * decide whether to log success or fall through to its legacy path.
 *
 * Status codes match what the original HTTP handler returned, so
 * the wrapper can forward them 1:1 without extra translation.
 */
export interface EnqueueResult {
  ok: boolean;
  status: number;
  body: Record<string, unknown>;
}

// Per-platform draft caps. Keep in sync with enqueue.ts comments.
const DRAFT_CAP_PER_24H: Record<EnqueuePlatform, number> = {
  x: 100,
  linkedin: 30,
  reddit: 20,
  dm: 20,
};

// Per-platform content length caps.
const MAX_CONTENT_CHARS: Record<EnqueuePlatform, number> = {
  x: 280,
  linkedin: 3500,
  reddit: 9000,
  dm: 1500,
};

function isPlatform(p: unknown): p is EnqueuePlatform {
  return p === 'x' || p === 'linkedin' || p === 'reddit' || p === 'dm';
}
function isActionType(a: unknown): a is EnqueueActionType {
  return a === 'reply' || a === 'post' || a === 'thread' || a === 'comment';
}

/**
 * Core enqueue — takes a sql handle, a draft payload, and runs the
 * full validation + rate limit + insert + audit sequence. Returns
 * an EnqueueResult for the caller to interpret.
 *
 * Never throws. All error paths return { ok: false, status, body }
 * so callers can react uniformly.
 */
export async function enqueueDraftCore(sql: NeonSql, input: unknown): Promise<EnqueueResult> {
  // Kill switch — the invariant. Same env var the HTTP handler checks.
  if (process.env.SOCIAL_AUTONOMY_ENABLED !== 'true') {
    return {
      ok: false,
      status: 503,
      body: {
        error: 'autonomy_disabled',
        hint: 'SOCIAL_AUTONOMY_ENABLED env var is not set to "true". Drafting queue accepts nothing.',
      },
    };
  }

  const body = (input ?? {}) as Partial<EnqueueDraftInput>;

  if (!isPlatform(body.platform)) {
    return {
      ok: false,
      status: 400,
      body: { error: 'invalid_platform', hint: 'Expected x|linkedin|reddit|dm' },
    };
  }
  if (!isActionType(body.action_type)) {
    return {
      ok: false,
      status: 400,
      body: { error: 'invalid_action_type', hint: 'Expected reply|post|thread|comment' },
    };
  }

  const draftContent = typeof body.draft_content === 'string' ? body.draft_content.trim() : '';
  if (!draftContent) {
    return { ok: false, status: 400, body: { error: 'empty_draft_content' } };
  }
  if (draftContent.length > MAX_CONTENT_CHARS[body.platform]) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'draft_too_long',
        max_chars: MAX_CONTENT_CHARS[body.platform],
        got: draftContent.length,
      },
    };
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
    // Enforce per-platform 24-hour drafting cap.
    const countRows = (await sql`
      SELECT COUNT(*)::int AS c
      FROM social_queue
      WHERE platform = ${body.platform}
        AND created_at > NOW() - INTERVAL '24 hours'
    `) as unknown as Array<{ c: number }>;
    const currentCount = countRows[0]?.c ?? 0;
    if (currentCount >= DRAFT_CAP_PER_24H[body.platform]) {
      return {
        ok: false,
        status: 429,
        body: {
          error: 'draft_cap_exceeded',
          platform: body.platform,
          drafts_in_last_24h: currentCount,
          cap: DRAFT_CAP_PER_24H[body.platform],
          retry_after_seconds: 3600,
        },
      };
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
      return { ok: false, status: 500, body: { error: 'insert_failed' } };
    }
    const row = inserted[0];

    // Audit log — initial enqueue row so every draft has at least
    // one social_actions entry from moment-of-entry.
    await sql`
      INSERT INTO social_actions (queue_id, action, actor, from_status, to_status, note)
      VALUES (${row.id}, 'enqueue', 'system', NULL, 'pending', ${source})
    `;

    // Discord approval notification (Chairman D-14).
    // Best-effort: a failed notify does NOT fail the enqueue — the web UI at
    // /#/admin/social-queue remains authoritative. If the webhook is not
    // configured, postApprovalNeeded returns {skipped: 'no_webhook'}.
    let discordMessageId: string | null = null;
    try {
      const notify = await postApprovalNeeded({
        queue_id: row.id,
        platform: body.platform,
        action_type: body.action_type,
        draft_content: draftContent,
        rationale,
        source,
        source_url: sourceUrl,
        voice_score: voiceScore,
      });
      if (notify.ok && notify.message_id) {
        discordMessageId = notify.message_id;
        await sql`UPDATE social_queue SET discord_message_id = ${discordMessageId} WHERE id = ${row.id}`;
      } else if (notify.error) {
        console.warn('[social/enqueue-core] discord notify failed:', notify.error);
      }
    } catch (err) {
      console.warn('[social/enqueue-core] discord notify threw:', err instanceof Error ? err.message : err);
    }

    return {
      ok: true,
      status: 201,
      body: {
        id: row.id,
        status: 'pending',
        platform: body.platform,
        action_type: body.action_type,
        draft_cap_remaining: Math.max(0, DRAFT_CAP_PER_24H[body.platform] - currentCount - 1),
        discord_message_id: discordMessageId,
      },
    };
  } catch (err) {
    console.error('[social/enqueue-core] insert failed:', err instanceof Error ? err.message : err);
    return { ok: false, status: 500, body: { error: 'enqueue_failed' } };
  }
}
