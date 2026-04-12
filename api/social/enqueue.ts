import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { enqueueDraftCore } from './enqueue-core';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Social drafting queue — HTTP enqueue endpoint (Track C.1 + C.2).
 *
 *   POST /api/social/enqueue
 *     {
 *       platform: 'x' | 'linkedin' | 'reddit' | 'dm',
 *       action_type: 'reply' | 'post' | 'thread' | 'comment',
 *       draft_content: string,
 *       rationale?: string,
 *       source?: string,
 *       source_url?: string,
 *       voice_score?: number,
 *     }
 *     → 201 { id, status: 'pending', draft_cap_remaining }
 *     → 503 { error: 'autonomy_disabled' }  if the kill switch is off
 *     → 429 { error: 'draft_cap_exceeded' } if platform cap hit
 *     → 400 { error: ... }                   on validation failures
 *
 * As of Track C.2, the actual enqueue logic lives in
 * ./enqueue-core.ts so internal server-side callers (daily-brief
 * cron, future C.3/C.4 drafter crons) can enqueue without routing
 * through HTTP. This handler is now a thin wrapper that:
 *
 *   1. Enforces the HTTP-specific concerns (method, optional
 *      bearer token)
 *   2. Delegates to enqueueDraftCore for everything else
 *   3. Forwards the result to the response
 *
 * The kill switch + validation + rate limit + insert + audit log
 * all happen inside the core function, so the HTTP handler cannot
 * accidentally bypass them.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  // Optional bearer token — if SOCIAL_ENQUEUE_TOKEN is set, the caller
  // must present it. Keeps C.2-C.4 external drafter agents on a
  // short leash while the internal cron path uses direct function
  // calls that bypass the HTTP handler entirely.
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

  const sql = neon(dbUrl);
  const result = await enqueueDraftCore(sql, req.body);
  return res.status(result.status).json(result.body);
}
