import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { resubscribeUrl, verifyResubscribeToken } from './_lib/unsubscribe-token.js';
// `s` and `ts` used to be defined locally here, and both built the style
// attribute WITHOUT escaping — which truncated every declaration list at the
// first quote in a font stack. This is the WELCOME email, so that made the
// first thing a new subscriber ever saw the worst-rendered of the three.
// They are now aliases for the shared, escaping helpers.
import {
  colors,
  fonts,
  type,
  space,
  layout,
  styleAttrOf as s,
  typeStyleAttr as ts,
} from '../src/styles/email-tokens.js';
import { beehiivPublicationId } from './_lib/beehiiv-config.js';

export const config = { runtime: 'nodejs' };

/** True only for a zone this runtime's tzdata actually knows. */
function isRealTimeZone(tz: unknown): boolean {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    // Throws RangeError on an unknown zone. That throw IS the check.
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * The one page shell these confirmation screens use. Colour comes from
 * src/styles/email-tokens.ts, never from a hex literal here — the same rule
 * every other public renderer follows.
 */
function shell(title: string, inner: string): string {
  return (
    `<!doctype html><meta charset="utf-8"><title>${title} · NexusWatch</title>` +
    `<meta name="robots" content="noindex">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<body style="font-family:Georgia,serif;background:${colors.bgPage};color:${colors.textPrimary};display:grid;place-items:center;min-height:90vh;margin:0">` +
    `<div style="max-width:28rem;padding:2rem;text-align:center">` +
    `<h1 style="font-size:1.4rem;font-weight:600">${title}</h1>${inner}</div>`
  );
}

/**
 * Reactivate or create the beehiiv subscription for an address.
 *
 * Extracted so the CONFIRMED RESUBSCRIBE path runs it too. The first version
 * of that path flipped the local `unsubscribed` flag and returned, which would
 * have left a reader subscribed here and still inactive at beehiiv — a split
 * brain that only shows up as "I confirmed and nothing arrives". An
 * independent review caught it. Non-blocking by design: the local row is the
 * record, beehiiv is a mirror, and a mirror being down must never fail a
 * subscription.
 */
async function syncBeehiiv(email: string, source: string): Promise<void> {
  const beehiivKey = process.env.BEEHIIV_API_KEY;
  const beehiivPubId = beehiivPublicationId();
  if (!beehiivKey || !beehiivPubId) return;
  try {
    const beehiivRes = await fetch(`https://api.beehiiv.com/v2/publications/${beehiivPubId}/subscriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${beehiivKey}` },
      body: JSON.stringify({
        email: email.toLowerCase().trim(),
        reactivate_existing: true,
        send_welcome_email: false,
        utm_source: source,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!beehiivRes.ok) {
      const errText = await beehiivRes.text().catch(() => '');
      console.error(`[subscribe] beehiiv sync failed: ${beehiivRes.status} — ${errText.slice(0, 200)}`);
    }
  } catch (err) {
    console.error('[subscribe] beehiiv sync error:', err instanceof Error ? err.message : err);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // CONSENT IS RESTORED BY THE MAILBOX, NOT BY A STRANGER. A GET carrying a
  // signed re-subscribe token is the ONLY way `unsubscribed` goes back to
  // FALSE (see the ON CONFLICT below and _lib/unsubscribe-token.ts).
  // The re-subscribe link is answered on BOTH methods, and only POST changes
  // anything. The first version of this branch mutated on GET — the very bug
  // just fixed in api/unsubscribe.ts, reintroduced on the opposite door, where
  // a mail scanner following the confirmation link would have restored consent
  // without the reader. An independent review caught it.
  const resubEmail = String(req.query.e ?? '')
    .trim()
    .toLowerCase();
  const resubToken = String(req.query.t ?? '');
  if (resubEmail || resubToken) {
    const e = resubEmail;
    const t = resubToken;
    const confirmPage = (title: string, body: string, code: number): unknown =>
      res
        .status(code)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(shell(title, `<p style="line-height:1.6;color:${colors.textSecondary}">${body}</p>`));
    if (!e || !t || !verifyResubscribeToken(e, t)) {
      return confirmPage('That link didn’t work', 'The confirmation link is invalid or has expired.', 400);
    }
    if (req.method !== 'POST') {
      const action = `/api/subscribe?e=${encodeURIComponent(e)}&t=${encodeURIComponent(t)}`;
      return res
        .status(200)
        .setHeader('Content-Type', 'text/html; charset=utf-8')
        .send(
          shell(
            'Start the brief again?',
            `<p style="line-height:1.6;color:${colors.textSecondary}">Nothing has changed yet. One click and the daily brief resumes.</p>` +
              `<form method="post" action="${action}">` +
              `<button type="submit" style="font:inherit;font-size:1rem;padding:0.7rem 1.6rem;background:${colors.accent};color:${colors.textInverse};border:0;border-radius:4px;cursor:pointer">Yes, send it again</button>` +
              `</form>`,
          ),
        );
    }
    const url = process.env.DATABASE_URL;
    if (!url) return confirmPage('Something broke', 'Please try again later.', 500);
    try {
      const sql2 = neon(url);
      await sql2`UPDATE email_subscribers SET unsubscribed = FALSE WHERE LOWER(email) = ${e}`;
    } catch (err) {
      console.error('[subscribe] resubscribe failed:', err instanceof Error ? err.message : err);
      return confirmPage('Something broke', 'Please try again later.', 500);
    }
    // The mirror must be reactivated too, or the reader confirms and nothing
    // arrives. Same call the normal subscribe path makes.
    await syncBeehiiv(e, 'resubscribe');
    return confirmPage('You’re back on the list', 'The next brief will arrive at 7am your time.', 200);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const { email, source, timezone } = req.body as { email?: string; source?: string; timezone?: string };
  if (!email || !email.includes('@') || email.length < 5) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  // SHAPE IS NOT VALIDITY. This used to test the string against a regex for
  // the shape of an IANA name, and the comment right here claimed that made
  // an unknown zone fall back to UTC. It did not: `America/Not_A_Zone` is
  // perfectly IANA-shaped. deliver-briefs buckets on
  // `NOW() AT TIME ZONE es.timezone`, and Postgres answers an unrecognised
  // zone with an ERROR that aborts the whole subscriber query — so one public
  // POST could stop the brief reaching EVERY subscriber, indefinitely, until
  // someone found and deleted the row. Verified against production on
  // 2026-09-12: the regex accepts it and Postgres raises
  // `time zone "America/Not_A_Zone" not recognized`.
  //
  // Ask the platform's own zone database instead of describing it. Intl
  // throws on a zone it does not know, which is the property we actually
  // want, and a new zone added to the tzdata ships with the runtime rather
  // than waiting for someone to update a list here.
  const tz = isRealTimeZone(timezone) ? (timezone as string) : 'UTC';

  try {
    const sql = neon(dbUrl);
    const rows = (await sql`
      INSERT INTO email_subscribers (email, source, timezone)
      VALUES (${email.toLowerCase().trim()}, ${source || 'landing'}, ${tz})
      -- The unsubscribed column IS NOT TOUCHED HERE. It used to be set FALSE on
      -- conflict, so an unauthenticated POST with someone else's address
      -- silently put them back on the list after they had opted out. A
      -- returning reader gets a signed confirmation link by email instead
      -- (the RETURNING below decides whether to send one).
      ON CONFLICT (email) DO UPDATE
        SET timezone = COALESCE(email_subscribers.timezone, EXCLUDED.timezone)
      RETURNING unsubscribed
    `) as unknown as Array<{ unsubscribed: boolean }>;

    // Previously opted out: do not resurrect them. Send the one link that can,
    // to the only place that proves ownership — their mailbox. The response
    // below is identical either way, so this endpoint never reveals whether an
    // address is on the list.
    if (rows[0]?.unsubscribed === true) {
      const link = resubscribeUrl(email);
      const key = process.env.RESEND_API_KEY;
      if (link && key) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              from: 'NexusWatch <brief@nexuswatch.dev>',
              to: [email.toLowerCase().trim()],
              subject: 'Confirm you want the brief again',
              html:
                `<p style="font-family:Georgia,serif;color:${colors.textPrimary};line-height:1.6">` +
                `Someone asked to put this address back on the NexusWatch brief. ` +
                `If that was you, confirm it here:</p>` +
                `<p><a href="${link}" style="color:${colors.accent}">Yes, send me the brief again</a></p>` +
                `<p style="font-family:Georgia,serif;color:${colors.textSecondary};font-size:13px">` +
                `If it wasn't you, ignore this and nothing changes.</p>`,
              text: `Someone asked to put this address back on the NexusWatch brief.\n\nIf that was you: ${link}\n\nIf it wasn't, ignore this and nothing changes.`,
            }),
          });
        } catch (err) {
          console.error('[subscribe] resubscribe mail failed:', err instanceof Error ? err.message : err);
        }
      }
      return res.json({ success: true, message: 'Subscribed to NexusWatch Intelligence Brief' });
    }

    // Send welcome email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'NexusWatch <hello@nexuswatch.dev>',
            to: [email.toLowerCase().trim()],
            subject: 'Welcome to NexusWatch Intelligence',
            html: `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Welcome to NexusWatch</title></head>
<body ${s({ margin: '0', padding: '0', background: colors.bgPage, fontFamily: fonts.sans })}>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" ${s({ background: colors.bgPage, padding: `${space.xl} ${space.md}` })}>
    <tr><td align="center">
      <table role="presentation" width="${layout.contentWidth}" cellpadding="0" cellspacing="0" border="0" ${s({ maxWidth: layout.contentWidth, background: colors.bgCard, borderRadius: layout.radiusCard, border: `1px solid ${colors.border}`, padding: layout.gutter })}>
        <tr><td>
          <div ${s({ borderBottom: `2px solid ${colors.divider}`, paddingBottom: space.md, marginBottom: space.lg, textAlign: 'center' })}>
            <span ${ts(type.masthead, { color: colors.textPrimary, letterSpacing: '-0.01em' })}>NexusWatch</span>
          </div>
          <p ${ts(type.bodyLarge, { color: colors.textPrimary, margin: `0 0 ${space.md} 0` })}>You're now subscribed to the NexusWatch Daily Intelligence Brief.</p>
          <p ${ts(type.body, { color: colors.textSecondary, margin: `0 0 ${space.lg} 0` })}>Every morning, you'll receive an AI-generated intelligence briefing covering:</p>
          <div ${s({ margin: `0 0 ${space.xl} 0` })}>
            <div ${ts(type.body, { color: colors.textPrimary, margin: `0 0 ${space.sm} 0`, paddingLeft: space.lg })}><span ${s({ color: colors.accent, marginRight: space.sm })}>▸</span>Top stories — the developments worth your attention</div>
            <div ${ts(type.body, { color: colors.textPrimary, margin: `0 0 ${space.sm} 0`, paddingLeft: space.lg })}><span ${s({ color: colors.accent, marginRight: space.sm })}>▸</span>Country Instability Index — risk scores across 50+ nations</div>
            <div ${ts(type.body, { color: colors.textPrimary, margin: `0 0 ${space.sm} 0`, paddingLeft: space.lg })}><span ${s({ color: colors.accent, marginRight: space.sm })}>▸</span>US impact analysis — why it matters if you're stateside</div>
            <div ${ts(type.body, { color: colors.textPrimary, margin: `0 0 ${space.sm} 0`, paddingLeft: space.lg })}><span ${s({ color: colors.accent, marginRight: space.sm })}>▸</span>Market signal — energy, commodities, and index moves</div>
            <div ${ts(type.body, { color: colors.textPrimary, margin: `0 0 ${space.sm} 0`, paddingLeft: space.lg })}><span ${s({ color: colors.accent, marginRight: space.sm })}>▸</span>48-hour outlook — what to watch next</div>
          </div>
          <div ${s({ textAlign: 'center', margin: `${space.xl} 0` })}>
            <a href="https://nexuswatch.dev" ${s({ display: 'inline-block', padding: `${space.md} ${space.xl}`, background: colors.accent, color: colors.textInverse, textDecoration: 'none', borderRadius: layout.radiusCallout, fontFamily: fonts.mono, fontSize: '11px', fontWeight: '700', letterSpacing: '0.12em', textTransform: 'uppercase' })}>Open NexusWatch →</a>
          </div>
          <div ${s({ marginTop: space.xl, paddingTop: space.md, borderTop: `1px solid ${colors.border}`, textAlign: 'center' })}>
            <span ${ts(type.caption, { color: colors.textTertiary })}>NexusWatch Intelligence · Real-time geopolitical monitoring for 50+ countries</span>
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`,
          }),
        });
      } catch {
        /* Welcome email failed — subscription still saved */
      }
    }

    // Sync to beehiiv publication (non-blocking — subscription is already saved).
    await syncBeehiiv(email, (source as string) || 'landing');

    return res.json({ success: true, message: 'Subscribed to NexusWatch Intelligence Brief' });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Subscribe error:', msg);
    // Duplicate email (unique constraint) is expected — treat as success
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return res.json({ success: true, message: 'Already subscribed' });
    }
    return res.status(500).json({ success: false, error: 'Subscription failed — try again' });
  }
}
