import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { approvedNoteFor, briefDateKey, correctionPayload } from '../_lib/corrections.js';

export const config = { runtime: 'nodejs' };

const CORS = 'https://nexuswatch.dev';

/**
 * The stored row, plus `correction` when, and only when, the owner has
 * approved a correction note for that edition. The SPA's single-brief page
 * renders from this response, and so does the MCP get_brief tool, so this is
 * where a reader or an agent meets the note. Every other brief's response is
 * exactly the stored row, as before. The row itself is never altered.
 */
function withCorrection(row: Record<string, unknown>): Record<string, unknown> {
  const note = approvedNoteFor(briefDateKey(row.brief_date));
  return note ? { ...row, correction: correctionPayload(note) } : row;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Rate limiting handled at Vercel platform level

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const date = req.query.date as string | undefined;
  const sql = neon(dbUrl);

  try {
    if (date) {
      // Specific date
      const rows = await sql`
        SELECT brief_date, content, summary, generated_at
        FROM daily_briefs WHERE brief_date = ${date}
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'No brief for this date' });
      return res.json(withCorrection(rows[0]));
    }

    // Latest brief
    const rows = await sql`
      SELECT brief_date, content, summary, generated_at
      FROM daily_briefs ORDER BY brief_date DESC LIMIT 1
    `;
    if (rows.length === 0) return res.status(404).json({ error: 'No briefs generated yet' });
    return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json(withCorrection(rows[0]));
  } catch (err) {
    console.error('API v1 brief error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
