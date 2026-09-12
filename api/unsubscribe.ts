import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { verifyUnsubscribeToken } from './_lib/unsubscribe-token.js';

export const config = { runtime: 'nodejs' };

/**
 * One-click unsubscribe. GET ASKS; POST acts. RFC 8058
 * (List-Unsubscribe-Post) is a POST, which is what mail clients send when the
 * reader taps their built-in unsubscribe button, so one-click is unaffected.
 *
 * GET USED TO MUTATE. The UPDATE ran before the method was ever examined, so
 * any GET unsubscribed the reader — and mail-provider link scanners, preview
 * fetchers and prefetchers issue GETs against every URL in a message without
 * a human touching anything. A reader could be removed from the list by
 * their own mail client. Found by two independent reviewers on 2026-09-12.
 *
 * The token is an HMAC over the email (see _lib/unsubscribe-token.ts): the
 * endpoint mutates a single boolean for a single address and only for a link
 * that could only have come from that address's own email. No session, no
 * cookie — a reader clicking from their mail client has neither.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const email = String(req.query.e ?? '')
    .trim()
    .toLowerCase();
  const token = String(req.query.t ?? '');

  const page = (title: string, body: string, status = 200) =>
    res
      .status(status)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<title>${title}</title>` +
          `<body style="font-family:Georgia,serif;background:#FAF8F3;color:#12161C;display:grid;place-items:center;min-height:90vh;margin:0">` +
          `<div style="max-width:28rem;padding:2rem;text-align:center">` +
          `<h1 style="font-size:1.4rem;font-weight:600">${title}</h1>` +
          `<p style="line-height:1.6;color:#4a4f57">${body}</p></div>`,
      );

  if (!email || !token || !verifyUnsubscribeToken(email, token)) {
    // Invalid or forged link. Say so without confirming whether the address
    // is subscribed — this endpoint must not be an existence oracle.
    return page(
      'That link didn’t work',
      'The unsubscribe link is invalid or has expired. Reply to any brief and a human will remove you.',
      400,
    );
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return page('Something broke', 'Please reply to any brief and a human will remove you.', 500);

  // METHOD FIRST, MUTATION SECOND. Anything that is not a POST only asks.
  if (req.method !== 'POST') {
    const action = `/api/unsubscribe?e=${encodeURIComponent(email)}&t=${encodeURIComponent(token)}`;
    return res
      .status(200)
      .setHeader('Content-Type', 'text/html; charset=utf-8')
      .send(
        `<!doctype html><meta charset="utf-8"><title>Unsubscribe · NexusWatch</title>` +
          `<meta name="robots" content="noindex">` +
          `<meta name="viewport" content="width=device-width,initial-scale=1">` +
          `<body style="font-family:Georgia,serif;background:#FAF8F3;color:#12161C;display:grid;place-items:center;min-height:90vh;margin:0">` +
          `<div style="max-width:28rem;padding:2rem;text-align:center">` +
          `<h1 style="font-size:1.4rem;font-weight:600">Unsubscribe?</h1>` +
          `<p style="line-height:1.6;color:#4a4f57">One click and the briefs stop. Nothing has changed yet.</p>` +
          `<form method="post" action="${action}">` +
          `<input type="hidden" name="ui" value="1">` +
          `<button type="submit" style="font:inherit;font-size:1rem;padding:0.7rem 1.6rem;background:#9A1B1B;color:#FAF8F3;border:0;border-radius:4px;cursor:pointer">Yes, unsubscribe me</button>` +
          `</form></div>`,
      );
  }

  try {
    const sql = neon(dbUrl);
    await sql`UPDATE email_subscribers SET unsubscribed = TRUE WHERE LOWER(email) = ${email}`;
  } catch (err) {
    console.error('[unsubscribe] update failed:', err instanceof Error ? err.message : err);
    return page('Something broke', 'Please reply to any brief and a human will remove you.', 500);
  }

  // RFC 8058 clients want a quiet 200 and read no body; a human who pressed
  // the button above wants to be told it worked. Decide on OUR OWN marker,
  // not on guessing the caller: the confirm form posts ui=1, a mail client
  // posts List-Unsubscribe=One-Click and nothing else.
  const posted = (req.body ?? {}) as Record<string, unknown>;
  if (posted.ui !== '1') return res.status(200).json({ ok: true });
  return page(
    'You’re unsubscribed',
    'No more briefs. If this was a mistake, you can subscribe again on the site and we will email you a link to confirm it is you.',
  );
}
