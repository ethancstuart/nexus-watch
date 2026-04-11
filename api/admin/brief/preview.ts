import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resolveAdmin } from '../_auth';
import { renderDossierEmail, type WatchlistCountry } from '../../cron/daily-brief';
import {
  DEFAULT_INTERESTS,
  type Interests,
  type RegionId,
  type ThreatId,
  type SectorId,
} from '../../../src/services/interests-types';

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
  topRiskCountries?: Array<{
    code?: string;
    name?: string;
    score?: number;
    components?: Record<string, number>;
  }>;
}

/**
 * Parse a CSV-style interests query param into the structured
 * Interests object renderDossierEmail expects. Accepts a compact
 * shape like:
 *
 *   ?interests=regions:asia,middle-east;threats:conflict,cyber;sectors:energy;freq:daily
 *
 * Any missing groups fall back to the DEFAULT_INTERESTS values so
 * a caller can test with just `?interests=regions:oceania` and get
 * a sensible render. Marks onboarded=true so the renderer treats
 * these as deliberate picks, not inferred defaults.
 */
function parseInterestsQueryParam(raw: string | undefined): Interests | undefined {
  if (!raw) return undefined;
  const parts: Record<string, string[]> = {};
  for (const segment of raw.split(';')) {
    const [group, values] = segment.split(':');
    if (!group || !values) continue;
    parts[group.trim()] = values
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean);
  }

  const regions: RegionId[] = (parts.regions ?? []).filter((r): r is RegionId =>
    ['africa', 'asia', 'europe', 'north-america', 'south-america', 'oceania', 'middle-east', 'caribbean'].includes(r),
  ) as RegionId[];
  const threats: ThreatId[] = (parts.threats ?? []).filter((t): t is ThreatId =>
    ['conflict', 'disasters', 'disease', 'cyber', 'markets', 'space'].includes(t),
  ) as ThreatId[];
  const sectors: SectorId[] = (parts.sectors ?? []).filter((s): s is SectorId =>
    ['energy', 'shipping', 'defense', 'tech', 'crypto', 'agriculture'].includes(s),
  ) as SectorId[];

  const rawFreq = parts.freq?.[0];
  const frequency: Interests['frequency'] =
    rawFreq === 'daily' || rawFreq === 'mwf' || rawFreq === 'weekly' ? rawFreq : 'daily';

  return {
    regions: regions.length > 0 ? regions : DEFAULT_INTERESTS.regions,
    threats: threats.length > 0 ? threats : DEFAULT_INTERESTS.threats,
    sectors,
    frequency,
    updatedAt: new Date().toISOString(),
    onboarded: true,
  };
}

/**
 * Build the WatchlistCountry projection the renderer expects from
 * whatever topRiskCountries shape is in the stored content. Best-
 * effort: if a country lacks code/name we drop it rather than
 * render garbage.
 *
 * Does NOT yet infer regionIds from country codes — that mapping
 * table will ship with Track A.9.2 alongside the per-user Resend
 * loop. Until then Watchlist matches on topThreat only, which is
 * derived from whichever component has the highest weight on that
 * country's CII.
 */
function toWatchlistCountries(countries: BriefContent['topRiskCountries']): WatchlistCountry[] {
  if (!countries) return [];
  return countries
    .filter(
      (c): c is { code?: string; name: string; score: number; components?: Record<string, number> } =>
        typeof c.name === 'string' && typeof c.score === 'number',
    )
    .map((c) => {
      // Pick the component with the highest value as the "top
      // threat" for matching. conflict/disasters/governance
      // components map to the equivalent threat IDs where possible.
      const componentToThreat: Record<string, WatchlistCountry['topThreat']> = {
        conflict: 'conflict',
        disasters: 'disasters',
        sentiment: 'conflict',
        infrastructure: 'cyber',
        marketExposure: 'markets',
        governance: 'conflict',
      };
      let topThreat: WatchlistCountry['topThreat'];
      if (c.components) {
        const entries = Object.entries(c.components).sort(([, a], [, b]) => b - a);
        if (entries.length > 0) topThreat = componentToThreat[entries[0][0]];
      }
      return { code: c.code, name: c.name, score: c.score, topThreat };
    });
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

    // Optional per-recipient personalization. When the caller passes
    // ?interests=regions:asia;threats:conflict the renderer appends a
    // Your Watchlist section filtered against those interests. This is
    // how we visually verify Track A.9 without needing a real logged-in
    // user with stored interests.
    const interestsParam = typeof req.query.interests === 'string' ? req.query.interests : undefined;
    const interests = parseInterestsQueryParam(interestsParam);
    const watchlistCountries = interests ? toWatchlistCountries(content.topRiskCountries) : undefined;

    const dossier = renderDossierEmail({
      briefText,
      date: row.brief_date,
      time: content.utcTime ?? formatGeneratedAt(row.generated_at),
      markets: content.markets ?? [],
      interests,
      watchlistCountries,
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
