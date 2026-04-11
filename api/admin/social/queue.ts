import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Admin — Social drafting queue management (Track C.1).
 *
 *   GET /api/admin/social/queue
 *     → list drafts awaiting review (default: status=pending)
 *
 *   GET /api/admin/social/queue?status=approved&platform=x&limit=20
 *     → filter by status, platform, and limit
 *
 *   POST /api/admin/social/queue
 *     {
 *       id: number,
 *       action: 'approve' | 'reject' | 'hold',
 *       final_content?: string,  // optional edit before approval
 *       note?: string            // free-text context for the audit log
 *     }
 *     → transition a draft's status. Writes a social_actions row
 *       recording actor + from/to status + note. If action is 'approve'
 *       and final_content is provided, stores the edit — the Track C.2+
 *       send worker will use final_content instead of draft_content
 *       when it actually posts to the platform.
 *
 * Admin-gated via resolveAdmin from api/admin/_auth.ts. This endpoint
 * is the only surface between a drafted social action and the platform
 * send; it's the most security-critical admin route in the codebase.
 *
 * This endpoint does NOT send to platforms. It transitions status.
 * The send worker is a separate cron (Track C.2+) that picks up
 * approved rows and performs the platform POST.
 */

type QueueAction = 'approve' | 'reject' | 'hold';

interface QueueRow {
  id: number;
  platform: string;
  action_type: string;
  source: string | null;
  source_url: string | null;
  draft_content: string;
  rationale: string | null;
  voice_score: number | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  sent_at: string | null;
  platform_post_id: string | null;
  platform_error: string | null;
  final_content: string | null;
  created_at: string;
}

const VALID_STATUSES = ['pending', 'approved', 'sent', 'rejected', 'held', 'retracted'] as const;
const VALID_PLATFORMS = ['x', 'linkedin', 'reddit', 'dm'] as const;

function isValidStatus(s: unknown): s is (typeof VALID_STATUSES)[number] {
  return typeof s === 'string' && (VALID_STATUSES as readonly string[]).includes(s);
}
function isValidPlatform(p: unknown): p is (typeof VALID_PLATFORMS)[number] {
  return typeof p === 'string' && (VALID_PLATFORMS as readonly string[]).includes(p);
}
function isQueueAction(a: unknown): a is QueueAction {
  return a === 'approve' || a === 'reject' || a === 'hold';
}

const ACTION_TO_STATUS: Record<QueueAction, string> = {
  approve: 'approved',
  reject: 'rejected',
  hold: 'held',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  if (req.method === 'GET') return handleList(req, res, sql);
  if (req.method === 'POST') return handleTransition(req, res, sql, user.email ?? user.id ?? 'admin');

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'method_not_allowed' });
}

// ---------------------------------------------------------------------------
// GET — list drafts
// ---------------------------------------------------------------------------

async function handleList(
  req: VercelRequest,
  res: VercelResponse,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
): Promise<void> {
  const statusParam = typeof req.query.status === 'string' ? req.query.status : 'pending';
  const platformParam = typeof req.query.platform === 'string' ? req.query.platform : null;
  const limitParam = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 50;
  const limit = Math.max(1, Math.min(200, Number.isFinite(limitParam) ? limitParam : 50));

  if (!isValidStatus(statusParam)) {
    res.status(400).json({ error: 'invalid_status' });
    return;
  }
  if (platformParam && !isValidPlatform(platformParam)) {
    res.status(400).json({ error: 'invalid_platform' });
    return;
  }

  try {
    // Neon's tagged-template SQL doesn't compose dynamic WHERE clauses
    // cleanly, so branch on whether platform is provided.
    const rows = platformParam
      ? ((await sql`
          SELECT id, platform, action_type, source, source_url, draft_content,
                 rationale, voice_score, status, reviewed_by, reviewed_at,
                 sent_at, platform_post_id, platform_error, final_content,
                 created_at
          FROM social_queue
          WHERE status = ${statusParam}
            AND platform = ${platformParam}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `) as unknown as QueueRow[])
      : ((await sql`
          SELECT id, platform, action_type, source, source_url, draft_content,
                 rationale, voice_score, status, reviewed_by, reviewed_at,
                 sent_at, platform_post_id, platform_error, final_content,
                 created_at
          FROM social_queue
          WHERE status = ${statusParam}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `) as unknown as QueueRow[]);

    // Roll-up counts for the dashboard header. Cheap aggregate query.
    const countsRows = (await sql`
      SELECT platform, status, COUNT(*)::int AS c
      FROM social_queue
      GROUP BY platform, status
    `) as unknown as Array<{ platform: string; status: string; c: number }>;

    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).json({
      filter: { status: statusParam, platform: platformParam, limit },
      rows,
      counts: countsRows,
    });
  } catch (err) {
    console.error('[admin/social/queue] list failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'query_failed' });
  }
}

// ---------------------------------------------------------------------------
// POST — transition draft state
// ---------------------------------------------------------------------------

interface TransitionBody {
  id?: unknown;
  action?: unknown;
  final_content?: unknown;
  note?: unknown;
}

async function handleTransition(
  req: VercelRequest,
  res: VercelResponse,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sql: any,
  actor: string,
): Promise<void> {
  const body = (req.body ?? {}) as TransitionBody;

  const id = typeof body.id === 'number' ? body.id : NaN;
  if (!Number.isFinite(id) || id <= 0) {
    res.status(400).json({ error: 'invalid_id' });
    return;
  }

  if (!isQueueAction(body.action)) {
    res.status(400).json({ error: 'invalid_action', hint: 'Expected approve|reject|hold' });
    return;
  }

  const finalContent =
    typeof body.final_content === 'string' && body.final_content.trim().length > 0 ? body.final_content : null;
  const note = typeof body.note === 'string' ? body.note : null;
  const toStatus = ACTION_TO_STATUS[body.action];

  try {
    // Fetch the current row so we can record from_status and enforce
    // allowed transitions.
    const existing = (await sql`
      SELECT id, status
      FROM social_queue
      WHERE id = ${id}
      LIMIT 1
    `) as unknown as Array<{ id: number; status: string }>;

    if (existing.length === 0) {
      res.status(404).json({ error: 'not_found' });
      return;
    }

    const fromStatus = existing[0].status;
    // Only pending and held drafts can transition via this endpoint.
    // 'sent' rows transition only via the send worker; 'rejected' and
    // 'retracted' are terminal.
    if (fromStatus !== 'pending' && fromStatus !== 'held') {
      res.status(409).json({
        error: 'invalid_transition',
        from: fromStatus,
        to: toStatus,
        hint: 'Only pending and held drafts can be approved/rejected/held.',
      });
      return;
    }

    // State update. Neon's serverless driver doesn't expose true
    // transactions over a single call, so we run two statements back
    // to back. Both writes are idempotent and an audit row arriving
    // slightly after the state update is acceptable.
    await sql`
      UPDATE social_queue
      SET status = ${toStatus},
          reviewed_by = ${actor},
          reviewed_at = NOW(),
          final_content = COALESCE(${finalContent}, final_content)
      WHERE id = ${id}
    `;

    // If the reviewer edited the draft, log an 'edit' action in
    // addition to the transition. This is what the C.7 feedback
    // loop will cluster into voice spec updates.
    if (finalContent !== null) {
      await sql`
        INSERT INTO social_actions (queue_id, action, actor, from_status, to_status, note)
        VALUES (${id}, 'edit', ${actor}, ${fromStatus}, ${fromStatus}, ${note ?? 'reviewer edit before approval'})
      `;
    }

    await sql`
      INSERT INTO social_actions (queue_id, action, actor, from_status, to_status, note)
      VALUES (${id}, ${body.action}, ${actor}, ${fromStatus}, ${toStatus}, ${note})
    `;

    res.status(200).json({
      id,
      from_status: fromStatus,
      to_status: toStatus,
      actor,
      final_content_updated: finalContent !== null,
    });
  } catch (err) {
    console.error('[admin/social/queue] transition failed:', err instanceof Error ? err.message : err);
    res.status(500).json({ error: 'transition_failed' });
  }
}
