import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth';
import { renderDossierEmail } from '../../cron/daily-brief';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Admin — Daily Brief email preview (Track A.6.1).
 *
 *   GET /api/admin/brief/preview
 *     → renders the latest brief in the Light Intel Dossier shell and
 *       returns it as text/html (the full standalone email shell, exactly
 *       what Resend sends to subscribers).
 *
 *   GET /api/admin/brief/preview?date=YYYY-MM-DD
 *     → renders a specific historical brief.
 *
 *   GET /api/admin/brief/preview?date=YYYY-MM-DD&view=beehiiv
 *     → returns the inner-modules-only HTML that goes to beehiiv as the
 *       post body (no shell chrome).
 *
 *   GET /api/admin/brief/preview?date=YYYY-MM-DD&view=text
 *     → returns the plain-text multipart fallback as text/plain.
 *
 * Purpose: iterate on the email template visually without waiting for the
 * daily cron. Load any historical brief, tweak renderDossierEmail or the
 * email-tokens, refresh. Unblocks the A.6.2 cross-client test matrix —
 * every client test starts from a stable, deterministic render of a known
 * historical payload.
 *
 * Admin-gated because the brief content IS public (it ships to subscribers
 * and is indexed on /brief/:date), but the admin preview exposes raw
 * pre-rendered HTML including any future drafts sitting in daily_briefs.
 * Keep the iteration surface private.
 */

interface BriefRow {
  brief_date: string;
  content: unknown;
  summary: string | null;
  generated_at: string | null;
}

interface BriefContent {
  briefText?: string;
  utcTime?: string;
  markets?: Array<{ symbol: string; price: string; change: string; direction: 'up' | 'down' | 'flat' }>;
}

function formatGeneratedAt(iso: string | null): string {
  if (!iso) return 'PREVIEW';
  try {
    const d = new Date(iso);
    const hh = d.getUTCHours().toString().padStart(2, '0');
    const mm = d.getUTCMinutes().toString().padStart(2, '0');
    return `${hh}:${mm} UTC`;
  } catch {
    return 'PREVIEW';
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method_not_allowed' });
  }

  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  const dateParam = typeof req.query.date === 'string' ? req.query.date : null;
  const view = typeof req.query.view === 'string' ? req.query.view : 'email';

  // Validate date format before it hits SQL.
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return res.status(400).json({ error: 'invalid_date_format', hint: 'Expected YYYY-MM-DD' });
  }
  if (view !== 'email' && view !== 'beehiiv' && view !== 'text') {
    return res.status(400).json({ error: 'invalid_view', hint: 'Expected email|beehiiv|text' });
  }

  try {
    const sql = neon(dbUrl);

    let rows: BriefRow[];
    if (dateParam) {
      rows = (await sql`
        SELECT brief_date, content, summary, generated_at
        FROM daily_briefs
        WHERE brief_date = ${dateParam}
        LIMIT 1
      `) as unknown as BriefRow[];
    } else {
      rows = (await sql`
        SELECT brief_date, content, summary, generated_at
        FROM daily_briefs
        ORDER BY brief_date DESC
        LIMIT 1
      `) as unknown as BriefRow[];
    }

    if (rows.length === 0) {
      return res.status(404).json({
        error: 'brief_not_found',
        date: dateParam ?? 'latest',
      });
    }

    const row = rows[0];

    // Parse the content JSON blob. daily-brief.ts stores it as
    //   { ...briefData, briefText }
    // where briefData includes `markets` and `utcTime`.
    let content: BriefContent;
    if (typeof row.content === 'string') {
      try {
        content = JSON.parse(row.content) as BriefContent;
      } catch {
        return res.status(500).json({ error: 'content_parse_failed' });
      }
    } else if (row.content && typeof row.content === 'object') {
      content = row.content as BriefContent;
    } else {
      return res.status(500).json({ error: 'content_missing' });
    }

    const briefText = content.briefText;
    if (!briefText) {
      return res.status(500).json({ error: 'brief_text_missing' });
    }

    const dossier = renderDossierEmail({
      briefText,
      date: row.brief_date,
      time: content.utcTime ?? formatGeneratedAt(row.generated_at),
      markets: content.markets ?? [],
    });

    // Disable browser cache so iteration-time reloads always fetch fresh.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');

    if (view === 'beehiiv') {
      // Wrap the inner modules in a minimal HTML page so the browser
      // renders them even without the dossier shell — useful for
      // comparing "what beehiiv will receive" against the full shell.
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>beehiiv preview · ${row.brief_date}</title><style>body{margin:0;padding:24px;background:#FAF8F3;}</style></head><body>${dossier.beehiivHtml}</body></html>`,
      );
    }

    if (view === 'text') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(dossier.plainText);
    }

    // Default: full email shell (what Resend actually sends).
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(dossier.emailHtml);
  } catch (err) {
    console.error('[admin/brief/preview] query failed:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'preview_failed' });
  }
}
