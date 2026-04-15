import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * /api/admin/marketing/variants
 *
 * GET           — list all variants + rolled-up per-variant stats
 *                 (n_posts, mean_score, last_post_at).
 * POST          — create a new variant.
 *                 body: { experiment_key, platform?, pillar?, label,
 *                         prompt_suffix, weight?, is_control? }
 * PATCH  id=N   — update weight / status / notes.
 *                 body: { weight?, status?, notes? }
 * DELETE id=N   — hard-delete a variant (only allowed when it has no
 *                 attached marketing_posts rows).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    if (req.method === 'GET') {
      const rows = (await sql`
        SELECT
          v.id, v.experiment_key, v.platform, v.pillar, v.label,
          v.prompt_suffix, v.weight, v.is_control, v.status,
          v.started_at, v.retired_at, v.notes,
          COALESCE(stats.n_posts, 0) AS n_posts,
          COALESCE(stats.mean_score, 0)::float AS mean_score,
          stats.last_post_at
        FROM marketing_prompt_variants v
        LEFT JOIN LATERAL (
          SELECT
            COUNT(*)::int AS n_posts,
            AVG(
              COALESCE(e.impressions, 0) * 1
              + COALESCE(e.likes, 0) * 2
              + COALESCE(e.reposts, 0) * 5
              + COALESCE(e.replies, 0) * 3
              + COALESCE(e.intel_buyer_signal, 0) * 5
            ) AS mean_score,
            MAX(p.posted_at) AS last_post_at
          FROM marketing_posts p
          LEFT JOIN LATERAL (
            SELECT impressions, likes, reposts, replies, intel_buyer_signal
            FROM marketing_engagement
            WHERE post_id = p.id
            ORDER BY polled_at DESC LIMIT 1
          ) e ON TRUE
          WHERE p.variant_id = v.id
            AND p.shadow_mode = FALSE
            AND p.status = 'posted'
        ) stats ON TRUE
        ORDER BY v.experiment_key, v.is_control DESC, v.label
      `) as unknown as Array<Record<string, unknown>>;
      return res.json({ rows });
    }

    if (req.method === 'POST') {
      const body = (req.body ?? {}) as {
        experiment_key?: string;
        platform?: string | null;
        pillar?: string | null;
        label?: string;
        prompt_suffix?: string;
        weight?: number;
        is_control?: boolean;
        notes?: string;
      };
      if (!body.experiment_key || !body.label || !body.prompt_suffix) {
        return res.status(400).json({ error: 'missing_required_fields' });
      }
      const weight = typeof body.weight === 'number' ? Math.max(0, Math.min(1, body.weight)) : 0.5;
      const rows = (await sql`
        INSERT INTO marketing_prompt_variants
          (experiment_key, platform, pillar, label, prompt_suffix, weight, is_control, notes)
        VALUES
          (${body.experiment_key}, ${body.platform ?? null}, ${body.pillar ?? null},
           ${body.label}, ${body.prompt_suffix}, ${weight}, ${Boolean(body.is_control)}, ${body.notes ?? null})
        RETURNING id
      `) as unknown as Array<{ id: number }>;
      return res.json({ ok: true, id: rows[0]?.id });
    }

    if (req.method === 'PATCH') {
      const id = parseInt(String(req.query.id ?? ''), 10);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
      const body = (req.body ?? {}) as { weight?: number; status?: string; notes?: string };
      const weight = typeof body.weight === 'number' ? Math.max(0, Math.min(1, body.weight)) : null;
      const status =
        body.status && ['running', 'paused', 'retired', 'winner'].includes(body.status) ? body.status : null;
      const notes = typeof body.notes === 'string' ? body.notes : null;
      if (weight === null && status === null && notes === null) {
        return res.status(400).json({ error: 'nothing_to_update' });
      }
      await sql`
        UPDATE marketing_prompt_variants
        SET
          weight     = COALESCE(${weight}, weight),
          status     = COALESCE(${status}, status),
          notes      = COALESCE(${notes}, notes),
          retired_at = CASE WHEN ${status} IN ('retired', 'winner') THEN NOW() ELSE retired_at END
        WHERE id = ${id}
      `;
      return res.json({ ok: true, id });
    }

    if (req.method === 'DELETE') {
      const id = parseInt(String(req.query.id ?? ''), 10);
      if (!Number.isFinite(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' });
      const posts = (await sql`
        SELECT COUNT(*)::int AS c FROM marketing_posts WHERE variant_id = ${id}
      `) as unknown as Array<{ c: number }>;
      if ((posts[0]?.c ?? 0) > 0) {
        return res.status(409).json({
          error: 'variant_in_use',
          hint: 'Retire the variant instead of deleting it so the audit trail stays intact.',
        });
      }
      await sql`DELETE FROM marketing_prompt_variants WHERE id = ${id}`;
      return res.json({ ok: true, id });
    }

    return res.status(405).json({ error: 'method_not_allowed' });
  } catch (err) {
    console.error('[admin/marketing/variants]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'query_failed' });
  }
}
