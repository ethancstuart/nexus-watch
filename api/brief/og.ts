import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { markdownToHtml } from '../_lib/markdown.js';
import { countedSubject } from '../_lib/brief-structure.js';
import { approvedNoteFor, correctionBlockHtml, CORRECTION_BLOCK_CSS } from '../_lib/corrections.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Server-rendered landing page for `/brief/:date` share links (Track A.10).
 *
 * Wired via a vercel.json rewrite so that `/brief/YYYY-MM-DD` hits this
 * endpoint instead of serving the SPA index.html. Purpose:
 *
 *   1. Return an HTML page with proper Open Graph + Twitter Card meta
 *      tags for social crawlers (Facebook, Twitter, LinkedIn, Slack).
 *      Without this, /brief/:date unfurls would show the generic
 *      landing-page OG image.
 *
 *   2. Set a canonical URL pointing at the clean non-hash path so
 *      search engines index the stable permalink.
 *
 *   3. Bounce human visitors to the SPA at `#/brief/:date` via a
 *      meta-refresh + JS fallback. Crawlers ignore the refresh and
 *      just read the meta tags.
 *
 * Soft-fails: if the DB query fails or the brief doesn't exist, we
 * return a 200 with a generic landing page rather than a 404 — that
 * way any mis-dated social share still renders something share-worthy
 * instead of breaking the unfurl.
 */

interface BriefRow {
  brief_date: string;
  summary: string | null;
  content: unknown;
}

interface BriefContent {
  briefText?: string;
  /** The edition's subject line, archived by the brief cron (archiveContent). */
  subject?: unknown;
  /** 'model' or 'mechanical'; absent on rows archived before 2026-11-16. */
  edition?: unknown;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return map[c] || c;
  });
}

/**
 * TITLE AND DESCRIPTION COME FROM THE EDITION ITSELF.
 *
 * The title used to be `NexusWatch · <topRiskCountries[0]> · <date>`: the
 * country with the highest index score that morning, which the brief often
 * did not mention (15 Nov 2026 was titled "Yemen"; the brief does not say
 * Yemen). The description fell back to the whole brief with only bold and
 * italics stripped whenever there was no "Good Morning" section, which since
 * the 23 Aug restructure only the Sunday model edition has (brief-structure.ts),
 * so search results showed raw Markdown ("## 🎯 Today's Call …").
 * Source: lanes2/GTM.md §1.
 *
 * NOTHING THE BRIEF SAYS IS REPEATED IN THE TITLE OR THE DESCRIPTION. Both
 * are one of exactly two things:
 *   - the date title these pages already used, for every edition; or
 *   - for a mechanical edition whose archived subject is in fallbackSubject's
 *     COUNTED form, "<N> calls settled, <H> hit — mechanical edition, <date>",
 *     that subject: code wrote it from the day's resolved-call counts.
 *
 * WHY NOT THE BRIEF'S OWN WORDS (independent review, 22 Nov 2026, M1). Every
 * edition since 8 Sep opens with the Ledger line, which code splices in and
 * which carries "OONI Brier 0.058 over 263, -2% vs base rate": 54 of those 263
 * verdicts are wrong and /ledger prints a different figure (lanes2/LANE-K.md).
 * Older editions open with "skill withheld" or "Your daily intelligence edge",
 * and on Sundays the next sentence is the model's own record claim, which the
 * correction drafts say was false (13 Sep, 11 Oct, 1 Nov). A description cut
 * from the opening repeats whichever of these comes first.
 *
 * WHY NOT A MODEL SUBJECT. The unpublished correction drafts quote at least
 * eight model subjects as false or misleading ("Russia and Iran hit record
 * censorship in the same week"). As titles they would become each edition's
 * headline and search result with no correction beside them, and this page
 * cannot see which editions are under correction: drafts are readable only
 * through the corrections gate, and only once approved.
 *
 * WHY ONLY THE COUNTED MECHANICAL FORM (review M2). fallbackSubject also
 * writes "The Ledger, unchanged — mechanical edition, <date>" (the day was read
 * and none settled) and, since R1, "The Ledger — mechanical edition, <date>"
 * (no read of the day succeeded; until R1 that case also said "unchanged",
 * which could be false). Neither carries a count. Any subject not in the
 * counted form, for this page's date, gets the date title.
 *
 * Every possible output, for sign-off: `NexusWatch Situation Brief · <date>`
 * (title and description), `NexusWatch · <N> calls settled, <H> hit —
 * mechanical edition, <date>` (title) with `<N> calls settled, <H> hit —
 * mechanical edition, <date>` (description), and, on the dateless shell,
 * `Daily Briefs · NexusWatch`. real-editions.fixture.json holds real archived
 * rows that og.test.ts renders to prove it.
 */

/** The title of every edition without a counted mechanical subject; also its description. */
export function dateTitle(date: string): string {
  return `NexusWatch Situation Brief · ${date}`;
}

/**
 * The archived subject when it is fallbackSubject's counted form for this
 * date, on a row not flagged as a model edition; otherwise null. It lives in
 * brief-structure.ts beside fallbackSubject, so the share images (one of them
 * an edge function) apply the same rule; re-exported here for its callers.
 */
export { countedSubject };

/** `NexusWatch · <counted subject>`, else the date title. */
export function briefTitle(date: string, content: { subject?: unknown; edition?: unknown }): string {
  const s = countedSubject(date, content);
  return s ? `NexusWatch · ${s}` : dateTitle(date);
}

/** The counted subject, else the date title. Never the brief's text. */
export function briefDescription(date: string, content: { subject?: unknown; edition?: unknown }): string {
  return countedSubject(date, content) ?? dateTitle(date);
}

/**
 * JSON for inside a <script> element. JSON.stringify leaves `<` alone, so a
 * title carrying `</script>` would end the element. Each `<` becomes its JSON
 * unicode escape, which a JSON parser reads back as the same string.
 */
function scriptJson(v: string): string {
  return JSON.stringify(v).replace(/</g, '\\u003c');
}

function renderShell(opts: {
  date: string;
  title: string;
  description: string;
  imageUrl: string;
  canonicalUrl: string;
  spaRedirectUrl: string;
  /** Full brief, already rendered to semantic HTML. Empty when unavailable. */
  bodyHtml?: string;
  /**
   * An approved correction note, already rendered and escaped
   * (api/_lib/corrections.ts). It sits ABOVE the brief and never inside it:
   * the brief's own HTML is emitted exactly as it would be without it. When
   * empty, neither the block nor its CSS is emitted, so the page is byte for
   * byte what it was before corrections existed.
   */
  correctionHtml?: string;
}): string {
  const { date, title, description, imageUrl, canonicalUrl, spaRedirectUrl, bodyHtml, correctionHtml } = opts;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const img = escapeHtml(imageUrl);
  const canonical = escapeHtml(canonicalUrl);
  const redirect = escapeHtml(spaRedirectUrl);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${t}</title>
  <meta name="description" content="${d}">
  <link rel="canonical" href="${canonical}">

  <!-- Open Graph -->
  <meta property="og:type" content="article">
  <meta property="og:title" content="${t}">
  <meta property="og:description" content="${d}">
  <meta property="og:image" content="${img}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:site_name" content="NexusWatch">
  <meta property="article:published_time" content="${escapeHtml(date)}T10:00:00Z">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${t}">
  <meta name="twitter:description" content="${d}">
  <meta name="twitter:image" content="${img}">

  <!-- Structured data for search engines -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": ${scriptJson(title)},
    "description": ${scriptJson(description)},
    "image": ${scriptJson(imageUrl)},
    "datePublished": "${escapeHtml(date)}T10:00:00Z",
    "dateModified": "${escapeHtml(date)}T10:00:00Z",
    "author": { "@type": "Organization", "name": "NexusWatch" },
    "publisher": {
      "@type": "Organization",
      "name": "NexusWatch",
      "logo": { "@type": "ImageObject", "url": "https://nexuswatch.dev/icon-512.png" }
    },
    "mainEntityOfPage": ${scriptJson(canonicalUrl)}
  }
  </script>

  <!-- No meta refresh. Google treats a zero-second refresh as a redirect and
       passes indexing to the target, which was a hash fragment and therefore
       not indexable — so 132 briefs of real daily writing indexed as nothing.
       The full brief is rendered below instead; this page IS the article. -->
  <style>
    body { background: #faf8f3; color: #12161c; font-family: 'Inter', -apple-system, 'Segoe UI', sans-serif; margin: 0; }
    .wrap { max-width: 680px; margin: 64px auto; padding: 0 32px; }
    .brief { text-align: left; }
    .brief h2 { font-family: 'Tiempos Headline', Georgia, serif; font-size: 22px; margin: 40px 0 12px; }
    .brief h3 { font-size: 17px; margin: 28px 0 8px; }
    .brief p, .brief li { font-size: 17px; line-height: 1.62; color: #12161c; }
    .brief ul, .brief ol { padding-left: 22px; }
    .brief li { margin: 0 0 8px; }
    .brief hr { border: 0; border-top: 1px solid #c9c3b4; margin: 40px 0; }
    .brief a { font: inherit; letter-spacing: normal; text-transform: none; border: 0; padding: 0; border-radius: 0; display: inline; text-decoration: underline; }
    .more { margin-top: 48px; }
    .kicker { font-family: 'JetBrains Mono', Menlo, monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.2em; color: #9a1b1b; text-transform: uppercase; margin-bottom: 12px; }
    h1 { font-family: 'Tiempos Headline', Georgia, serif; font-size: 32px; font-weight: 600; margin: 0 0 16px 0; }
    p { font-size: 15px; line-height: 1.6; color: #3b4252; margin: 0 0 24px 0; }
    a { color: #9a1b1b; font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; text-decoration: none; border: 1px solid #c9c3b4; padding: 12px 24px; border-radius: 4px; display: inline-block; }
    a:hover { border-color: #9a1b1b; }
${correctionHtml ? CORRECTION_BLOCK_CSS : ''}  </style>
</head>
<body>
  <article class="wrap">
    <div class="kicker">SITUATION BRIEF · ${escapeHtml(date)}</div>
    <h1>${t}</h1>
    ${correctionHtml ? `${correctionHtml}\n    ` : ''}${bodyHtml ? `<div class="brief">${bodyHtml}</div>` : d !== t ? `<p>${d}</p>` : ''}
    <p class="more"><a href="${redirect}">Open NexusWatch →</a></p>
  </article>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).send('method_not_allowed');
  }

  // The rewrite injects the date as a query param (see vercel.json).
  const rawDate = typeof req.query.date === 'string' ? req.query.date : '';
  // Defensive: only accept YYYY-MM-DD shapes; anything else → generic shell.
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : '';

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=600, s-maxage=3600');

  if (!date) {
    return res.send(
      renderShell({
        date: new Date().toISOString().slice(0, 10),
        // The archive's own title (src/utils/seo.ts, /briefs), since this
        // shell's canonical is /briefs. It replaces "Daily Geopolitical
        // Intelligence" and a three-minute, 5 AM ET claim.
        title: 'Daily Briefs · NexusWatch',
        description: 'Daily Briefs · NexusWatch',
        imageUrl: 'https://nexuswatch.dev/api/brief/screenshot?size=og',
        canonicalUrl: 'https://nexuswatch.dev/briefs',
        spaRedirectUrl: 'https://nexuswatch.dev/briefs',
      }),
    );
  }

  // An approved correction for this edition, if the owner has approved one.
  // Drafts never get past approvedNoteFor. It is shown on every path below,
  // including the soft-fail shells, so a database hiccup cannot hide it.
  const note = approvedNoteFor(date);
  const correctionHtml = note ? correctionBlockHtml(note) : '';

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.send(
      renderShell({
        date,
        title: dateTitle(date),
        description: dateTitle(date),
        imageUrl: `https://nexuswatch.dev/api/brief/screenshot?date=${encodeURIComponent(date)}&size=og`,
        canonicalUrl: `https://nexuswatch.dev/brief/${date}`,
        spaRedirectUrl: 'https://nexuswatch.dev/briefs',
        correctionHtml,
      }),
    );
  }

  try {
    const sql = neon(dbUrl);
    const rows = (await sql`
      SELECT brief_date, summary, content
      FROM daily_briefs
      WHERE brief_date = ${date}
      LIMIT 1
    `) as unknown as BriefRow[];

    let title = dateTitle(date);
    let description = dateTitle(date);
    let bodyHtml = '';

    if (rows.length > 0) {
      const row = rows[0];
      let content: BriefContent = {};
      try {
        content =
          typeof row.content === 'string'
            ? (JSON.parse(row.content) as BriefContent)
            : ((row.content as BriefContent) ?? {});
      } catch {
        /* non-JSON content — leave defaults */
      }

      if (typeof content.briefText === 'string' && content.briefText) {
        // The whole point: the article is the page, not a teaser in front of a
        // redirect.
        bodyHtml = markdownToHtml(content.briefText);
      }

      title = briefTitle(date, content);
      description = briefDescription(date, content);
    }

    return res.send(
      renderShell({
        date,
        title,
        description,
        imageUrl: `https://nexuswatch.dev/api/brief/screenshot?date=${encodeURIComponent(date)}&size=og`,
        canonicalUrl: `https://nexuswatch.dev/brief/${date}`,
        spaRedirectUrl: 'https://nexuswatch.dev/briefs',
        bodyHtml,
        correctionHtml,
      }),
    );
  } catch (err) {
    console.error('[brief/og] DB query failed:', err instanceof Error ? err.message : err);
    // Soft-fail to generic shell so the share link still unfurls.
    return res.send(
      renderShell({
        date,
        title: dateTitle(date),
        description: dateTitle(date),
        imageUrl: `https://nexuswatch.dev/api/brief/screenshot?date=${encodeURIComponent(date)}&size=og`,
        canonicalUrl: `https://nexuswatch.dev/brief/${date}`,
        spaRedirectUrl: 'https://nexuswatch.dev/briefs',
        correctionHtml,
      }),
    );
  }
}
