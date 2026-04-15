import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * GET /api/admin/marketing/posts?platform=x&status=posted&limit=30
 *
 * Returns the most recent marketing_posts rows joined with their
 * latest engagement snapshot.
 *
 * Query params (all optional):
 *   platform — x|linkedin|substack|medium|threads|bluesky|beehiiv
 *   status   — drafted|scheduled|posted|failed|suppressed|held
 *   limit    — default 30, max 100
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  const platform = typeof req.query.platform === 'string' ? req.query.platform : null;
  const status = typeof req.query.status === 'string' ? req.query.status : null;
  const rawLimit = typeof req.query.limit === 'string' ? parseInt(req.query.limit, 10) : 30;
  const limit = Math.min(Math.max(rawLimit || 30, 1), 100);

  try {
    const rows = (await sql`
      SELECT
        p.id, p.platform, p.pillar, p.topic_key, p.format,
        p.content, p.status, p.shadow_mode, p.voice_score, p.voice_violations,
        p.scheduled_at, p.posted_at, p.platform_post_id, p.platform_url,
        p.platform_error, p.created_at,
        COALESCE(latest.impressions, 0) AS impressions,
        COALESCE(latest.likes, 0) AS likes,
        COALESCE(latest.reposts, 0) AS reposts,
        COALESCE(latest.replies, 0) AS replies,
        COALESCE(latest.intel_buyer_signal, 0) AS intel_buyer_signal
      FROM marketing_posts p
      LEFT JOIN LATERAL (
        SELECT impressions, likes, reposts, replies, intel_buyer_signal
        FROM marketing_engagement e
        WHERE e.post_id = p.id
        ORDER BY e.polled_at DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE (${platform}::text IS NULL OR p.platform = ${platform}::text)
        AND (${status}::text IS NULL OR p.status = ${status}::text)
      ORDER BY p.created_at DESC
      LIMIT ${limit}
    `) as unknown as Array<Record<string, unknown>>;

    // Pillar distribution over the last 7 days for the same platform filter.
    const distribution = (await sql`
      SELECT pillar, COUNT(*)::int AS c
      FROM marketing_posts
      WHERE created_at > NOW() - INTERVAL '7 days'
        AND (${platform}::text IS NULL OR platform = ${platform}::text)
        AND pillar IS NOT NULL
      GROUP BY pillar
    `) as unknown as Array<{ pillar: string; c: number }>;

    return res.json({
      filter: { platform, status, limit },
      rows,
      pillar_distribution: distribution,
    });
  } catch (err) {
    console.error('[admin/marketing/posts]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'query_failed' });
  }
}
