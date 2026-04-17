import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * GET /api/admin/marketing/voice-context?platform=x&category=loved
 *   → list voice context examples
 *
 * POST /api/admin/marketing/voice-context
 *   { platform: 'all'|'x'|..., category: 'loved'|'hated'|'neutral',
 *     content: string, notes?: string }
 *   → add a new example
 *
 * DELETE /api/admin/marketing/voice-context?id=123
 *   → remove an example
 *
 * Voice context is the chairman's primary lever for steering the engine
 * — drop loved/hated examples in here and the next cron run picks them
 * up via buildVoiceProfile().
 */
const VALID_PLATFORMS = ['all', 'x', 'linkedin', 'substack', 'medium', 'threads', 'bluesky', 'beehiiv'];
const VALID_CATEGORIES = ['loved', 'hated', 'neutral'];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  if (req.method === 'GET') {
    const platform = typeof req.query.platform === 'string' ? req.query.platform : null;
    const category = typeof req.query.category === 'string' ? req.query.category : null;
    const rows = (await sql`
      SELECT id, platform, category, content, notes, created_at, created_by
      FROM marketing_voice_context
      WHERE (${platform}::text IS NULL OR platform = ${platform}::text)
        AND (${category}::text IS NULL OR category = ${category}::text)
      ORDER BY created_at DESC
      LIMIT 200
    `) as unknown as Array<Record<string, unknown>>;
    return res.json({ rows });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as {
      platform?: string;
      category?: string;
      content?: string;
      notes?: string;
    };
    const platform = body.platform ?? 'all';
    const category = body.category;
    const content = body.content;
    const notes = body.notes ?? null;
    if (!VALID_PLATFORMS.includes(platform)) return res.status(400).json({ error: 'invalid_platform' });
    if (!category || !VALID_CATEGORIES.includes(category)) return res.status(400).json({ error: 'invalid_category' });
    if (!content || typeof content !== 'string' || content.length < 5) {
      return res.status(400).json({ error: 'invalid_content' });
    }
    const inserted = (await sql`
      INSERT INTO marketing_voice_context (platform, category, content, notes, created_by)
      VALUES (${platform}, ${category}, ${content}, ${notes}, ${user.email ?? user.id ?? 'admin'})
      RETURNING id
    `) as unknown as Array<{ id: number }>;
    return res.json({ ok: true, id: inserted[0]?.id });
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? parseInt(req.query.id, 10) : NaN;
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    await sql`DELETE FROM marketing_voice_context WHERE id = ${id}`;
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
