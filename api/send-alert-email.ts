import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

const CORS_ORIGIN = 'https://dashpulse.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return res.status(500).json({ error: 'RESEND_API_KEY not configured' });

  const { to, subject, alertText, severity, lat, lon } = req.body as {
    to: string;
    subject: string;
    alertText: string;
    severity: string;
    lat?: number;
    lon?: number;
  };

  if (!to || !subject || !alertText) {
    return res.status(400).json({ error: 'to, subject, alertText required' });
  }

  const sevColor = severity === 'critical' ? '#dc2626' : severity === 'elevated' ? '#f97316' : '#eab308';
  const mapLink = lat && lon ? `https://dashpulse.app/#/intel?v=${btoa(JSON.stringify({ c: [lon, lat], z: 6, p: 10, b: 0, l: [] }))}` : 'https://dashpulse.app';

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${resendKey}`,
      },
      body: JSON.stringify({
        from: 'NexusWatch Alerts <alerts@dashpulse.app>',
        to: [to],
        subject,
        html: `
          <div style="font-family: 'Courier New', monospace; background: #0a0a0a; color: #e0e0e0; padding: 24px; max-width: 600px;">
            <div style="border-bottom: 2px solid #ff6600; padding-bottom: 12px; margin-bottom: 16px;">
              <span style="font-size: 11px; letter-spacing: 3px; color: #ff6600; font-weight: bold;">NEXUSWATCH ALERT</span>
            </div>
            <div style="display: inline-block; padding: 2px 8px; background: ${sevColor}20; border: 1px solid ${sevColor}50; border-radius: 2px; font-size: 10px; color: ${sevColor}; letter-spacing: 1px; font-weight: bold; margin-bottom: 12px;">
              ${severity.toUpperCase()}
            </div>
            <div style="font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
              ${alertText}
            </div>
            <a href="${mapLink}" style="display: inline-block; padding: 8px 16px; background: #ff660020; border: 1px solid #ff660050; color: #ff6600; text-decoration: none; font-size: 11px; letter-spacing: 1px; border-radius: 3px;">
              VIEW ON MAP →
            </a>
            <div style="margin-top: 24px; padding-top: 12px; border-top: 1px solid #1a1a1a; font-size: 9px; color: #444;">
              NexusWatch Intelligence Platform · dashpulse.app · Unsubscribe in account settings
            </div>
          </div>
        `,
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Resend error:', err);
      return res.status(502).json({ error: 'Email delivery failed' });
    }

    const data = await response.json();
    return res.json({ success: true, id: (data as Record<string, unknown>).id });
  } catch (err) {
    console.error('Email error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'Email delivery failed' });
  }
}
