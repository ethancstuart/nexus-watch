import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { personalizeUnsubscribe, unsubscribeUrl } from '../_lib/unsubscribe-token.js';
import { editionFromStoredContent, renderDossierEmail } from './daily-brief.js';
import { requireCron } from '../_cron-utils.js';
import { deliveryTimeZone, isDueForBrief } from '../_lib/brief-window.js';

export const config = { runtime: 'nodejs', maxDuration: 120 };

/**
 * Timezone-aware brief delivery cron (D-2, 2026-04-18).
 *
 * Runs hourly. Serves the latest renderable brief: today's (today = the UTC
 * date) once it exists, before that yesterday's. Sends it via Resend to every
 * subscriber who has not had it and whose window for it is open — from their
 * own 07:00 local to the end of that local day; see api/_lib/brief-window.ts
 * for the rule and why.
 *
 * The daily-brief.ts cron generates content at 10:00 UTC and stores it in
 * daily_briefs. This cron only delivers — it never generates. Readers whose
 * 07:00 comes before that (about UTC−2 to UTC+7, and anyone stored as `UTC`)
 * are sent at the first run after the brief is renderable; a run that sends
 * nothing (no brief yet, Resend down) is caught up by a later run while the
 * reader's window is open. Yesterday's brief is carried over only until
 * today's exists, so UTC+8 readers (07:00 = 23:00Z) are not down to one run.
 *
 * Schedule: 0 * * * * (every hour on the hour)
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!requireCron(req, res)) return;

  const sql = neon(process.env.DATABASE_URL!);
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const currentUtcHour = now.getUTCHours();

  // 1. The latest renderable brief: today's, else yesterday's.
  // `email_html`/`plain_text` arrive with 2026-09-05-brief-email-html.sql.
  // Probe rather than assume: naming a missing column fails the whole SELECT
  // and stops delivery entirely; an absent column just means the legacy path.
  let hasEmailColumns = false;
  try {
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'daily_briefs' AND column_name IN ('email_html', 'plain_text')
    `;
    hasEmailColumns = cols.length === 2;
  } catch (probeErr) {
    console.error('[deliver-briefs] column probe failed, assuming legacy schema:', probeErr);
  }

  // What a subscriber actually receives is ALWAYS the full document —
  // masthead, footer, unsubscribe. `summary` is beehiivHtml, an embeddable
  // fragment with none of that chrome; sending it directly was the
  // compliance hole this file carried for months.
  //
  // Preference order, and why the fragment is NOT in it:
  //   1. stored email_html (written by daily-brief since the migration) —
  //      cheap, byte-identical to what generation produced;
  //   2. rendered NOW from the archived briefText via renderDossierEmail —
  //      the same renderer generation uses, so a missing column or failed
  //      storage write costs a re-render, never a non-compliant send;
  //   3. skip with an explicit reason. The rule-2 review caught the first
  //      version falling back to `summary`: an email without a way out does
  //      not go, full stop — a skipped hour retries, a sent fragment is
  //      unrecallable.
  async function loadBrief(
    date: string,
  ): Promise<{ content: unknown; html: string; plain: string | null } | { skip: string }> {
    const briefs = hasEmailColumns
      ? await sql`
          SELECT brief_date, summary, content, email_html, plain_text FROM daily_briefs
          WHERE brief_date = ${date}
          LIMIT 1
        `
      : await sql`
          SELECT brief_date, summary, content FROM daily_briefs
          WHERE brief_date = ${date}
          LIMIT 1
        `;
    if (briefs.length === 0) {
      return { skip: `No brief generated yet for ${date}. Waiting for daily-brief cron.` };
    }
    const row = briefs[0] as { email_html?: unknown; plain_text?: unknown; summary: string; content: unknown };
    const storedEmailHtml = typeof row.email_html === 'string' && row.email_html.length > 0 ? row.email_html : null;
    const storedPlainText = typeof row.plain_text === 'string' && row.plain_text.length > 0 ? row.plain_text : null;
    if (storedEmailHtml) return { content: row.content, html: storedEmailHtml, plain: storedPlainText };

    const content = (typeof row.content === 'object' && row.content !== null ? row.content : {}) as {
      briefText?: unknown;
      markets?: unknown;
    };
    if (typeof content.briefText === 'string' && content.briefText.length > 0) {
      const rendered = renderDossierEmail({
        briefText: content.briefText,
        date,
        time: '10:00 UTC',
        markets: Array.isArray(content.markets) ? (content.markets as never[]) : [],
        archiveUrl: `https://nexuswatch.dev/brief/${date}`,
        // From the archived row, written at generation time. Without it the
        // re-render would silently turn a mechanical day into a model one.
        edition: editionFromStoredContent(row.content),
      });
      console.warn(`[deliver-briefs] ${date}: no stored email_html — rendered at delivery time instead.`);
      return { content: row.content, html: rendered.emailHtml, plain: rendered.plainText };
    }
    // No stored document and nothing renderable. Never send the fragment.
    return {
      skip: `Brief for ${date} has no renderable full email document; refusing to send the summary fragment (no unsubscribe link). The next run retries; anyone already due is sent then.`,
    };
  }

  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().split('T')[0];
  let briefDate = today;
  let brief = await loadBrief(today);
  // Carry-over: until today's brief is renderable, yesterday's stays on offer
  // to readers whose window for it is still open (isDueForBrief bounds it by
  // their local midnight). Once today's exists, yesterday's is closed.
  const carriedOver = 'skip' in brief;
  if ('skip' in brief) {
    const previous = await loadBrief(yesterday);
    if ('skip' in previous) {
      return res.status(200).json({ success: true, skipped: true, reason: brief.skip });
    }
    brief = previous;
    briefDate = yesterday;
  }
  const briefHtml = brief.html;
  const briefPlain = brief.plain;

  // 2. Subscribers who have not been sent this brief. The zone is NOT
  // used in SQL any more: the window is decided below by isDueForBrief, a pure
  // function over the runtime's tzdata, so it can be tested without a
  // database and so the zone never reaches Postgres. That matters because an
  // unrecognised zone in `AT TIME ZONE` raises an ERROR that aborts the whole
  // query — one bad row stopping the brief for everyone. Here a bad zone
  // (null, empty, unknown) falls back to UTC for that row alone.
  //
  // A carried-over brief is never anyone's FIRST: only readers already sent
  // an earlier brief get one. Without that, the day this ships would send
  // yesterday's brief late to readers the old exact-hour rule never reached.
  const undelivered = carriedOver
    ? await sql`
        SELECT es.email, es.timezone
        FROM email_subscribers es
        WHERE es.unsubscribed = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM brief_subscriber_delivery bsd
            WHERE bsd.subscriber_email = es.email
              AND bsd.brief_date = ${briefDate}
          )
          AND EXISTS (
            SELECT 1 FROM brief_subscriber_delivery prior
            WHERE prior.subscriber_email = es.email
              AND prior.brief_date < ${briefDate}
          )
      `
    : await sql`
        SELECT es.email, es.timezone
        FROM email_subscribers es
        WHERE es.unsubscribed = FALSE
          AND NOT EXISTS (
            SELECT 1 FROM brief_subscriber_delivery bsd
            WHERE bsd.subscriber_email = es.email
              AND bsd.brief_date = ${briefDate}
          )
      `;

  // 3. Of those, the ones whose window for this brief is open now.
  const subscribers = undelivered.filter((s) => isDueForBrief(s.timezone, briefDate, now));
  const fallbackZones = undelivered.filter((s) => deliveryTimeZone(s.timezone) !== s.timezone).length;
  if (fallbackZones > 0) {
    // Count only — no addresses in logs.
    console.warn(
      `[deliver-briefs] ${fallbackZones} undelivered subscriber(s) have an unusable timezone; treated as UTC.`,
    );
  }

  // Admin copies, independent of the subscriber window and unchanged by it.
  // Note this is why the old lost-subscriber defect was invisible: the
  // operator's own copy always arrived.
  const adminEmail = process.env.ADMIN_EMAILS;
  const adminEmails: string[] = [];
  if (adminEmail) {
    for (const e of adminEmail.split(',')) {
      const trimmed = e.trim();
      if (trimmed) adminEmails.push(trimmed);
    }
  }

  // Combine subscriber + admin emails, dedup
  const allEmails = new Set<string>();
  subscribers.forEach((s) => allEmails.add(s.email as string));

  // Admin emails: deliver at 13:00 UTC+ (6am PDT / 5am PST — early enough for morning review).
  // Today's brief only, as before: the admin copy is never carried over.
  if (adminEmails.length > 0 && currentUtcHour >= 13 && !carriedOver) {
    const adminDelivered = await sql`
      SELECT subscriber_email FROM brief_subscriber_delivery
      WHERE brief_date = ${briefDate}
        AND subscriber_email = ANY(${adminEmails})
    `;
    const alreadySent = new Set(adminDelivered.map((r) => r.subscriber_email as string));
    adminEmails.forEach((e) => {
      if (!alreadySent.has(e)) allEmails.add(e);
    });
  }

  if (allEmails.size === 0) {
    return res.status(200).json({
      success: true,
      sent: 0,
      reason: `No subscribers due for delivery at UTC hour ${currentUtcHour}.`,
    });
  }

  // 4. Send via Resend batch API
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    return res.status(200).json({
      success: false,
      error: 'RESEND_API_KEY not set',
    });
  }

  // The subject is the day's story, extracted at generation time from Top
  // Signal (brief-structure.ts). A date-only subject promises nothing; it
  // survives only as the fallback when extraction found no headline.
  const storedSubject = (() => {
    try {
      const c = brief.content as { subject?: unknown } | null;
      return typeof c?.subject === 'string' && c.subject.trim().length >= 4 ? c.subject.trim() : null;
    } catch {
      return null;
    }
  })();
  const subject = storedSubject
    ? `${storedSubject} — The NexusWatch Brief`
    : `NexusWatch Intelligence Brief — ${briefDate}`;
  const from = 'NexusWatch Intelligence <brief@nexuswatch.dev>';
  const BATCH_SIZE = 100;
  let sent = 0;
  let failed = 0;
  let deferred = 0;

  // 5. Per chunk: claim, send, release on refusal — in that order, one chunk
  // at a time.
  //
  // Claim first because the window stays open for the rest of the day: a send
  // whose dedup row was never written would be sent again every hour. Only
  // rows this statement actually inserted are sent, so two overlapping runs
  // cannot both send.
  //
  // Per chunk because the function can be killed at maxDuration. Whatever is
  // claimed but not yet sent at that moment looks delivered and is never sent;
  // claiming one chunk at a time limits that to the chunk in flight.
  const due = Array.from(allEmails);
  for (let i = 0; i < due.length; i += BATCH_SIZE) {
    const candidates = due.slice(i, i + BATCH_SIZE);

    let chunk: string[];
    try {
      // One statement per chunk. Parameterised: the array and the date are
      // values, never spliced into SQL.
      const claimed = await sql`
        INSERT INTO brief_subscriber_delivery (subscriber_email, brief_date, channel)
        SELECT e, ${briefDate}::date, 'resend' FROM unnest(${candidates}::text[]) AS e
        ON CONFLICT (subscriber_email, brief_date) DO NOTHING
        RETURNING subscriber_email
      `;
      const mine = new Set(claimed.map((r) => r.subscriber_email as string));
      chunk = candidates.filter((e) => mine.has(e));
    } catch (err) {
      // Nothing claimed, nothing sent: the next run picks these up.
      console.error(
        '[deliver-briefs] Delivery claim failed; retrying next run:',
        err instanceof Error ? err.message : err,
      );
      deferred += candidates.length;
      continue;
    }
    if (chunk.length === 0) continue;

    const payload = chunk.map((email) => ({
      from,
      to: [email],
      subject,
      // The unsubscribe link is per-recipient: one body is rendered for the
      // whole day, the signed URL is substituted here at send time.
      html: personalizeUnsubscribe(briefHtml, email),
      ...(briefPlain ? { text: personalizeUnsubscribe(briefPlain, email) } : {}),
      // RFC 8058 one-click. Mail clients surface their own unsubscribe
      // button off these headers — the path most readers actually use.
      headers: {
        'List-Unsubscribe': `<${unsubscribeUrl(email)}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }));

    let refused = false;
    try {
      const resp = await fetch('https://api.resend.com/emails/batch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendKey}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(30000),
      });

      if (resp.ok) {
        sent += chunk.length;
      } else {
        const body = await resp.text().catch(() => '');
        console.error(`[deliver-briefs] Resend batch error: ${resp.status} ${body.slice(0, 200)}`);
        failed += chunk.length;
        refused = true;
      }
    } catch (err) {
      // Timeout or network error: Resend may have sent it. The claim is KEPT,
      // so this chunk may miss today's brief rather than risk getting it twice.
      console.error(
        `[deliver-briefs] Resend batch exception (outcome unknown, not retried today):`,
        err instanceof Error ? err.message : err,
      );
      failed += chunk.length;
    }

    if (refused) {
      // Resend answered and refused: nothing went out. Release now, not after
      // the loop, so a kill later in the run cannot strand these claims. If
      // the release itself fails, these readers miss today rather than risk a
      // second copy.
      try {
        await sql`
          DELETE FROM brief_subscriber_delivery
          WHERE brief_date = ${briefDate}::date AND subscriber_email = ANY(${chunk}::text[])
        `;
      } catch (err) {
        console.error(
          '[deliver-briefs] Claim release failed; those readers miss today:',
          err instanceof Error ? err.message : err,
        );
      }
    }

    // Pace between batches
    if (i + BATCH_SIZE < due.length) {
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  console.log(
    `[deliver-briefs] UTC ${currentUtcHour}:00 — sent=${sent}, failed=${failed}, deferred=${deferred}, total_due=${allEmails.size}`,
  );

  return res.status(200).json({
    success: true,
    utcHour: currentUtcHour,
    sent,
    failed,
    deferred,
    totalDue: allEmails.size,
    date: briefDate,
    carriedOver,
  });
}
