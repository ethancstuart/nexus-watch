/**
 * GET /api/audio/list
 *
 * Returns the last 50 audio briefs for the /#/audio page.
 *
 * 2026-05 tier-up Phase 4.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=900');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.json({ briefs: [], note: 'db_not_configured' });

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql: any = neon(dbUrl);
    const rows = (await sql`
      SELECT brief_date::text AS brief_date, duration_sec, bytes, blob_url, script, created_at
      FROM audio_briefs
      ORDER BY brief_date DESC
      LIMIT 50
    `) as unknown as Array<{
      brief_date: string;
      duration_sec: number | null;
      bytes: number | null;
      blob_url: string;
      script: string | null;
      created_at: string;
    }>;
    return res.json({ briefs: rows });
  } catch (e) {
    console.error('[audio/list]', e instanceof Error ? e.message : e);
    return res.json({ briefs: [], error: 'query_failed' });
  }
}
