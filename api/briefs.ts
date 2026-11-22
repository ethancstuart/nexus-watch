import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { briefPreviewText, SUBJECT_PATTERN, decodeSubject } from './_lib/brief-preview.js';
import { approvedNoteFor, briefDateKey } from './_lib/corrections.js';

export const config = { runtime: 'nodejs' };

/**
 * `{ correctedOn }` when the owner has approved a correction note for this
 * edition, else nothing: the /briefs card shows "Correction added <date>." from
 * it. Every other brief's entry is exactly what it was.
 */
function correctedMarker(briefDate: unknown): { correctedOn?: string } {
  const note = approvedNoteFor(briefDateKey(briefDate));
  return note ? { correctedOn: note.correctedOn } : {};
}

// Public brief archive — SEO-indexable, no auth required
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const date = req.query.date as string | undefined;
  const sql = neon(dbUrl);

  try {
    if (date) {
      // Single brief
      const rows = await sql`
        SELECT brief_date, summary, generated_at FROM daily_briefs WHERE brief_date = ${date}
      `;
      if (rows.length === 0) return res.status(404).json({ error: 'No brief for this date' });

      return res.setHeader('Cache-Control', 'public, max-age=3600').json({
        date: rows[0].brief_date,
        summary: rows[0].summary,
        generatedAt: rows[0].generated_at,
        ...correctedMarker(rows[0].brief_date),
      });
    }

    // Archive — last 30 briefs. Each card gets the day's subject (stored in
    // content by the brief cron) and a plain-text preview. The preview used to
    // be the first 300 characters of the summary HTML, which always ended
    // mid-tag and printed as raw markup; 8,000 characters of prefix comfortably
    // holds the inline-styled opening and the first paragraph of text.
    //
    // THE SUBJECT IS READ WITHOUT A CAST THAT CAN THROW. A `content::jsonb`
    // cast parses every row, so one row that is not valid JSON failed the whole
    // archive with a 500 — and /api/status pings this endpoint, so it would
    // page as a core outage (review 2b). `content::text` cannot fail for a
    // text, json or jsonb column (the column's type is not in the repo); the
    // pattern pulls the first "subject" string (at any depth: see
    // SUBJECT_PATTERN in brief-preview.ts), still JSON-escaped, and it
    // is decoded per row below. A row that does not match, or does not decode,
    // gets no subject and its card falls back to the date title. An occurrence
    // inside another string value is escaped (\"subject\") and cannot match.
    const rows = await sql`
      SELECT brief_date, substring(summary from 1 for 8000) AS head,
             substring(content::text from ${SUBJECT_PATTERN}) AS subject_json, generated_at
      FROM daily_briefs ORDER BY brief_date DESC LIMIT 30
    `;

    return res.setHeader('Cache-Control', 'public, max-age=3600').json({
      briefs: rows.map((r) => ({
        date: r.brief_date,
        subject: decodeSubject(r.subject_json),
        preview: briefPreviewText(String(r.head ?? '')),
        generatedAt: r.generated_at,
        ...correctedMarker(r.brief_date),
      })),
      count: rows.length,
    });
  } catch (err) {
    console.error('Briefs archive error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Failed to load briefs' });
  }
}
