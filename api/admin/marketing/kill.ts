import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * POST /api/admin/marketing/kill
 *
 * Delete or suppress a queued/shadow marketing post before it goes live.
 *
 * Body:
 *   { id: number, mode?: 'delete' | 'suppress' }
 *
 * Semantics:
 *   mode = 'suppress' (default) — flips status to 'suppressed' and clears
 *     scheduled_at. Keeps the row for auditability. Recommended default so
 *     you can see what was killed in history.
 *   mode = 'delete' — hard-deletes the row + any engagement rows via cascade.
 *     Only allowed on posts that were never posted live (status ≠ 'posted').
 *
 * Guards:
 *   - Rejects kill on already-posted LIVE rows (status='posted' AND
 *     shadow_mode=FALSE) — that's a retraction, not a kill. Retraction needs
 *     a platform-side delete and should flow through a different endpoint.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  const body = (req.body ?? {}) as { id?: number; mode?: 'delete' | 'suppress' };
  const id = typeof body.id === 'number' ? body.id : parseInt(String(body.id ?? ''), 10);
  const mode = body.mode === 'delete' ? 'delete' : 'suppress';
  if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });

  try {
    const existing = (await sql`
      SELECT id, status, shadow_mode, platform
      FROM marketing_posts
      WHERE id = ${id}
      LIMIT 1
    `) as unknown as Array<{ id: number; status: string; shadow_mode: boolean; platform: string }>;
    if (existing.length === 0) return res.status(404).json({ error: 'not_found' });
    const row = existing[0];

    if (row.status === 'posted' && !row.shadow_mode) {
      return res.status(409).json({
        error: 'already_posted_live',
        hint: 'Live posts require a retraction via the platform — kill is only for queued/shadow rows.',
      });
    }

    if (mode === 'delete') {
      await sql`DELETE FROM marketing_engagement WHERE post_id = ${id}`;
      await sql`DELETE FROM marketing_topics_used WHERE post_id = ${id}`;
      await sql`DELETE FROM marketing_posts WHERE id = ${id}`;
      return res.json({ ok: true, id, mode, previous_status: row.status });
    }

    // suppress
    await sql`
      UPDATE marketing_posts
      SET status = 'suppressed',
          scheduled_at = NULL,
          platform_error = COALESCE(platform_error, '') || E'\n[killed by admin at ' || NOW()::text || ']'
      WHERE id = ${id}
    `;
    return res.json({ ok: true, id, mode, previous_status: row.status });
  } catch (err) {
    console.error('[admin/marketing/kill]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'kill_failed' });
  }
}
