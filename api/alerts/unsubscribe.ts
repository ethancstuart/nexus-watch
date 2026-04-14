import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * GET /api/alerts/verify?token=XXX → marks subscription verified.
 * GET /api/alerts/unsubscribe?token=XXX → marks inactive.
 *
 * Handles both verify and unsubscribe based on the path.
 * Returns HTML confirmation page.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const token = String(req.query.token || '');
  if (!token) {
    return res.status(400).send(pageHtml('Invalid link', 'Missing token.', false));
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).send(pageHtml('Error', 'Database not configured.', false));

  const isUnsub = req.url?.includes('/unsubscribe');

  try {
    const sql = neon(dbUrl);
    if (isUnsub) {
      const result = (await sql`
        UPDATE email_alert_subscriptions SET active = FALSE
        WHERE unsubscribe_token = ${token}
        RETURNING email
      `) as unknown as Array<{ email: string }>;
      if (result.length === 0) {
        return res.status(404).send(pageHtml('Not found', 'Invalid unsubscribe link.', false));
      }
      res.setHeader('Content-Type', 'text/html');
      return res.send(
        pageHtml('Unsubscribed', `You've been unsubscribed from NexusWatch alerts. Sorry to see you go.`, true),
      );
    }

    const result = (await sql`
      UPDATE email_alert_subscriptions
      SET verified = TRUE, verification_token = NULL
      WHERE verification_token = ${token}
      RETURNING email, country_codes, cii_threshold, cadence
    `) as unknown as Array<{
      email: string;
      country_codes: string[];
      cii_threshold: number;
      cadence: string;
    }>;

    if (result.length === 0) {
      return res.status(404).send(pageHtml('Not found', 'Invalid or expired verification link.', false));
    }

    const sub = result[0];
    res.setHeader('Content-Type', 'text/html');
    return res.send(
      pageHtml(
        'Confirmed',
        `You'll receive ${sub.cadence} alerts for ${sub.country_codes.join(', ')} when CII ≥ ${sub.cii_threshold}.`,
        true,
      ),
    );
  } catch (err) {
    console.error('[alerts/verify]', err instanceof Error ? err.message : err);
    return res.status(500).send(pageHtml('Error', 'Something went wrong.', false));
  }
}

function pageHtml(title: string, message: string, success: boolean): string {
  const color = success ? '#22c55e' : '#dc2626';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} — NexusWatch</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, Inter, sans-serif;
      background: #faf8f3;
      color: #12161c;
      margin: 0;
      padding: 80px 20px;
      text-align: center;
    }
    .container {
      max-width: 480px;
      margin: 0 auto;
      padding: 40px 30px;
      background: #fff;
      border: 1px solid #e5e0d4;
      border-radius: 8px;
    }
    .brand {
      font-family: 'JetBrains Mono', monospace;
      font-size: 10px;
      letter-spacing: 2px;
      color: #9a1b1b;
      margin-bottom: 12px;
    }
    h1 { margin: 0 0 16px 0; font-size: 28px; color: ${color}; }
    p { color: #3b4252; line-height: 1.6; }
    a {
      display: inline-block;
      margin-top: 24px;
      padding: 10px 20px;
      background: #9a1b1b;
      color: #fff;
      text-decoration: none;
      border-radius: 4px;
      font-weight: 600;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="brand">NEXUSWATCH INTELLIGENCE</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <a href="https://nexuswatch.dev/#/intel">Open NexusWatch →</a>
  </div>
</body>
</html>`;
}
