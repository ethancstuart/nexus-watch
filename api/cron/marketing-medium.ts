import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { preflight, recordRun } from '../marketing/lib/flags';
import { mediumAdapter } from '../marketing/adapters/mediumAdapter';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Marketing Medium cron — Track M.1
 *
 * Runs Sundays at 14:00 UTC — exactly 24h after the Substack Sunday
 * long-form went out. Medium gets the same content as a cross-post
 * with a canonical link back to Substack (SEO hygiene).
 *
 * Unlike the other marketing crons, this one does NOT call the topic
 * selector or content generator. Instead it pulls the most recent
 * Substack post from marketing_posts, rebuilds it with a canonical
 * URL header, and POSTs to Medium.
 */
export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const pf = await preflight('medium');
  if (!pf.proceed) return res.json({ proceeded: false, reason: pf.reason });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  // Find the most recent posted Substack issue not yet cross-posted to Medium.
  const candidates = (await sql`
    SELECT id, content, platform_url, topic_key, entity_keys, pillar
    FROM marketing_posts
    WHERE platform = 'substack'
      AND status = 'posted'
      AND shadow_mode = FALSE
      AND posted_at > NOW() - INTERVAL '7 days'
      AND NOT EXISTS (
        SELECT 1 FROM marketing_posts m2
        WHERE m2.platform = 'medium'
          AND m2.parent_post_id = marketing_posts.id
          AND m2.status IN ('posted', 'scheduled')
      )
    ORDER BY posted_at DESC
    LIMIT 1
  `) as unknown as Array<{
    id: number;
    content: string;
    platform_url: string | null;
    topic_key: string;
    entity_keys: string[];
    pillar: string | null;
  }>;

  const source = candidates[0];
  if (!source) {
    await recordRun('medium');
    return res.json({ proceeded: true, shadow: pf.shadow, reason: 'no_substack_to_crosspost' });
  }

  // Insert marketing_posts row first so we have an id.
  const insertRows = (await sql`
    INSERT INTO marketing_posts (
      platform, pillar, topic_key, entity_keys, format, content, metadata,
      status, shadow_mode, parent_post_id, scheduled_at
    )
    VALUES (
      'medium', ${source.pillar}, ${source.topic_key}, ${source.entity_keys},
      'longform', ${source.content},
      ${JSON.stringify({ canonical_url: source.platform_url, parent_substack_id: source.id })}::jsonb,
      'scheduled', ${pf.shadow}, ${source.id}, NOW()
    )
    RETURNING id
  `) as unknown as Array<{ id: number }>;
  const postId = insertRows[0]?.id;

  const result = await mediumAdapter.post(
    {
      content: source.content,
      format: 'longform',
      metadata: { canonical_url: source.platform_url ?? undefined },
    },
    pf.shadow,
  );

  if (result.ok && postId) {
    await sql`
      UPDATE marketing_posts
      SET status = 'posted',
          posted_at = NOW(),
          platform_post_id = ${result.platform_post_id ?? null},
          platform_url = ${result.platform_url ?? null},
          platform_error = NULL
      WHERE id = ${postId}
    `;
  } else if (postId) {
    await sql`
      UPDATE marketing_posts
      SET status = 'failed', platform_error = ${result.error ?? 'unknown'}
      WHERE id = ${postId}
    `;
  }

  await recordRun('medium');
  return res.json({
    proceeded: true,
    shadow: pf.shadow,
    parent_substack_id: source.id,
    post_id: postId,
    platform_post_id: result.platform_post_id,
    stub: result.stub,
    error: result.error,
  });
}
