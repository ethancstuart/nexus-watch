import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  const { email, source } = req.body as { email?: string; source?: string };
  if (!email || !email.includes('@') || email.length < 5) {
    return res.status(400).json({ error: 'Valid email required' });
  }

  try {
    const sql = neon(dbUrl);
    await sql`
      INSERT INTO email_subscribers (email, source)
      VALUES (${email.toLowerCase().trim()}, ${source || 'landing'})
      ON CONFLICT (email) DO UPDATE SET unsubscribed = FALSE
    `;

    // Send welcome email via Resend
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${resendKey}` },
          body: JSON.stringify({
            from: 'NexusWatch <onboarding@resend.dev>',
            to: [email.toLowerCase().trim()],
            subject: 'Welcome to NexusWatch Intelligence',
            html: `<div style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #e0e0e0; padding: 24px; max-width: 600px;">
              <div style="border-bottom: 2px solid #ff6600; padding-bottom: 12px; margin-bottom: 16px;">
                <span style="font-size: 14px; letter-spacing: 3px; color: #ff6600; font-weight: bold;">NEXUSWATCH</span>
              </div>
              <p style="font-size: 14px; line-height: 1.7;">You're now subscribed to the NexusWatch Daily Intelligence Brief.</p>
              <p style="font-size: 13px; line-height: 1.7; color: rgba(255,255,255,0.7);">Every morning at 06:00 UTC, you'll receive an AI-generated intelligence briefing covering:</p>
              <ul style="font-size: 12px; color: rgba(255,255,255,0.6); line-height: 2;">
                <li>Bottom Line Up Front (BLUF) — the single most important development</li>
                <li>Top risk countries with Country Instability Index scores</li>
                <li>Regional highlights across 5 theaters</li>
                <li>Market implications with specific index/commodity data</li>
                <li>Indicators to watch for the next 24-48 hours</li>
              </ul>
              <div style="margin-top: 20px;"><a href="https://dashpulse.app" style="display:inline-block;padding:10px 20px;background:#ff6600;color:#000;text-decoration:none;font-size:12px;font-weight:bold;letter-spacing:1px;border-radius:3px;">OPEN NEXUSWATCH →</a></div>
              <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #1a1a1a; font-size: 9px; color: #444;">NexusWatch Intelligence Platform · Real-time geopolitical monitoring for 50+ countries</div>
            </div>`,
          }),
        });
      } catch {
        /* Welcome email failed — subscription still saved */
      }
    }

    return res.json({ success: true, message: 'Subscribed to NexusWatch Intelligence Brief' });
  } catch (err) {
    console.error('Subscribe error:', err instanceof Error ? err.message : err);
    // Duplicate email returns success (ON CONFLICT handles it)
    return res.json({ success: true, message: 'Already subscribed' });
  }
}
