import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Email Alert Subscriptions — simpler than webhooks, free tier.
 *
 * POST /api/alerts/subscribe
 *   Body: { email, country_codes[], cii_threshold?, cadence? }
 *   Sends verification email.
 *
 * GET /api/alerts/verify?token=XXX
 *   Marks subscription verified.
 *
 * GET /api/alerts/unsubscribe?token=XXX
 *   Marks subscription inactive.
 */

function randomToken(n = 32): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let out = '';
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });

  const body = req.body as {
    email?: string;
    country_codes?: string[];
    cii_threshold?: number;
    cadence?: 'daily' | 'weekly' | 'immediate';
  };

  if (!body.email || !isValidEmail(body.email)) {
    return res.status(400).json({ error: 'valid email required' });
  }
  if (!Array.isArray(body.country_codes) || body.country_codes.length === 0) {
    return res.status(400).json({ error: 'country_codes array required' });
  }

  const id = `eas_${Date.now()}_${randomToken(6)}`;
  const verificationToken = randomToken(40);
  const unsubscribeToken = randomToken(40);
  const codes = body.country_codes.map((c) => c.toUpperCase()).slice(0, 20);
  const threshold = Math.max(0, Math.min(100, body.cii_threshold ?? 60));
  const cadence = body.cadence || 'daily';

  try {
    const sql = neon(dbUrl);
    await sql`
      INSERT INTO email_alert_subscriptions
        (id, email, verification_token, country_codes, cii_threshold, cadence, unsubscribe_token)
      VALUES
        (${id}, ${body.email.toLowerCase()}, ${verificationToken}, ${codes},
         ${threshold}, ${cadence}, ${unsubscribeToken})
      ON CONFLICT (email, country_codes) DO UPDATE SET
        cii_threshold = EXCLUDED.cii_threshold,
        cadence = EXCLUDED.cadence,
        active = TRUE
    `;

    // Send verification email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      const verifyUrl = `https://nexuswatch.dev/api/alerts/verify?token=${verificationToken}`;
      const unsubUrl = `https://nexuswatch.dev/api/alerts/unsubscribe?token=${unsubscribeToken}`;
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
        body: JSON.stringify({
          from: 'NexusWatch Alerts <alerts@nexuswatch.dev>',
          to: [body.email],
          subject: 'Confirm your NexusWatch alert subscription',
          html: `
            <div style="font-family:Inter,sans-serif;max-width:560px;padding:24px;background:#faf8f3;color:#12161c;">
              <div style="font-family:JetBrains Mono,monospace;font-size:10px;letter-spacing:2px;color:#9a1b1b;margin-bottom:8px;">NEXUSWATCH INTELLIGENCE</div>
              <h1 style="font-size:22px;margin:0 0 12px 0;">Confirm your alert subscription</h1>
              <p style="line-height:1.6;color:#3b4252;">You'll receive ${cadence} alerts when CII scores for <strong>${codes.join(', ')}</strong> meet or exceed <strong>${threshold}</strong>.</p>
              <p style="margin:24px 0;">
                <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background:#9a1b1b;color:#fff;text-decoration:none;border-radius:4px;font-weight:600;">Confirm subscription</a>
              </p>
              <p style="font-size:11px;color:#888;">If you didn't request this, you can safely ignore. <a href="${unsubUrl}" style="color:#9a1b1b;">Unsubscribe here</a>.</p>
            </div>
          `,
        }),
      }).catch(() => {
        /* non-fatal; subscription still stored */
      });
    }

    return res.json({
      ok: true,
      message: "Check your email to confirm. You won't receive alerts until verified.",
      subscription_id: id,
    });
  } catch (err) {
    console.error('[alerts/subscribe]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'subscribe_failed' });
  }
}
