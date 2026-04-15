import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth';

export const config = { runtime: 'nodejs', maxDuration: 15 };

/**
 * GET /api/admin/marketing/engagement?days=14
 *
 * V2 engagement dashboard data source. Returns five rollups in one call:
 *
 *   1. daily         — per-day posted count + total engagement across all platforms
 *   2. byPlatform    — total engagement breakdown per platform
 *   3. byPillar      — total engagement breakdown per pillar
 *   4. movingAverage — 14-day moving average of the composite engagement score
 *   5. topPosts      — 10 highest-scoring posts in the window
 *
 * Score formula (kept in sync with runVoiceRetune):
 *   impressions×1 + likes×2 + reposts×5 + replies×3 + intel_buyer_signal×5
 *
 * Default window: 14 days. Query param `days` accepts 1-90.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  const rawDays = typeof req.query.days === 'string' ? parseInt(req.query.days, 10) : 14;
  const days = Math.min(Math.max(rawDays || 14, 1), 90);

  try {
    // Per-post scored rows within the window — base for all rollups.
    const scored = (await sql`
      SELECT
        p.id, p.platform, p.pillar, p.topic_key, p.shadow_mode, p.status,
        p.content, p.posted_at, p.created_at, p.platform_url, p.voice_score,
        COALESCE(latest.impressions, 0) AS impressions,
        COALESCE(latest.likes, 0)       AS likes,
        COALESCE(latest.reposts, 0)     AS reposts,
        COALESCE(latest.replies, 0)     AS replies,
        COALESCE(latest.intel_buyer_signal, 0) AS intel_buyer_signal,
        (COALESCE(latest.impressions, 0) * 1
         + COALESCE(latest.likes, 0) * 2
         + COALESCE(latest.reposts, 0) * 5
         + COALESCE(latest.replies, 0) * 3
         + COALESCE(latest.intel_buyer_signal, 0) * 5) AS score
      FROM marketing_posts p
      LEFT JOIN LATERAL (
        SELECT impressions, likes, reposts, replies, intel_buyer_signal
        FROM marketing_engagement e
        WHERE e.post_id = p.id
        ORDER BY e.polled_at DESC
        LIMIT 1
      ) latest ON TRUE
      WHERE p.created_at > NOW() - (${days}::int || ' days')::interval
    `) as unknown as Array<{
      id: number;
      platform: string;
      pillar: string | null;
      topic_key: string | null;
      shadow_mode: boolean;
      status: string;
      content: string;
      posted_at: string | null;
      created_at: string;
      platform_url: string | null;
      voice_score: number | null;
      impressions: number;
      likes: number;
      reposts: number;
      replies: number;
      intel_buyer_signal: number;
      score: number;
    }>;

    const byPlatform: Record<string, { posts: number; score: number; impressions: number; engagement: number }> = {};
    const byPillar: Record<string, { posts: number; score: number; impressions: number; engagement: number }> = {};
    const daily: Record<string, { date: string; posts: number; score: number; impressions: number }> = {};

    for (const r of scored) {
      const plat = r.platform;
      const pill = r.pillar ?? 'unknown';
      const day = (r.posted_at ?? r.created_at).slice(0, 10);
      if (!byPlatform[plat]) byPlatform[plat] = { posts: 0, score: 0, impressions: 0, engagement: 0 };
      if (!byPillar[pill]) byPillar[pill] = { posts: 0, score: 0, impressions: 0, engagement: 0 };
      if (!daily[day]) daily[day] = { date: day, posts: 0, score: 0, impressions: 0 };
      const engagement = r.likes + r.reposts + r.replies;
      byPlatform[plat].posts++;
      byPlatform[plat].score += r.score;
      byPlatform[plat].impressions += r.impressions;
      byPlatform[plat].engagement += engagement;
      byPillar[pill].posts++;
      byPillar[pill].score += r.score;
      byPillar[pill].impressions += r.impressions;
      byPillar[pill].engagement += engagement;
      daily[day].posts++;
      daily[day].score += r.score;
      daily[day].impressions += r.impressions;
    }

    const dailySeries = Object.values(daily).sort((a, b) => a.date.localeCompare(b.date));

    // 14-day moving average of daily composite score.
    const window = Math.min(14, dailySeries.length);
    const movingAverage: Array<{ date: string; avg_score: number }> = [];
    for (let i = 0; i < dailySeries.length; i++) {
      const start = Math.max(0, i - window + 1);
      const slice = dailySeries.slice(start, i + 1);
      const avg = slice.reduce((s, d) => s + d.score, 0) / slice.length;
      movingAverage.push({ date: dailySeries[i].date, avg_score: Math.round(avg) });
    }

    const topPosts = [...scored]
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((r) => ({
        id: r.id,
        platform: r.platform,
        pillar: r.pillar,
        content: r.content.slice(0, 220),
        score: r.score,
        impressions: r.impressions,
        likes: r.likes,
        reposts: r.reposts,
        replies: r.replies,
        posted_at: r.posted_at,
        platform_url: r.platform_url,
      }));

    return res.json({
      window_days: days,
      total_posts: scored.length,
      byPlatform,
      byPillar,
      daily: dailySeries,
      movingAverage,
      topPosts,
    });
  } catch (err) {
    console.error('[admin/marketing/engagement]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'query_failed' });
  }
}
