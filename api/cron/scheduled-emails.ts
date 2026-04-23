// api/cron/scheduled-emails.ts
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 120 };

interface ScheduledEmail {
  id: number;
  user_id: string;
  email: string;
  tier: string;
  template: string;
}

function buildEmailContent(template: string, currentTier: string): { subject: string; html: string } | null {
  if (template === 'welcome_d0') {
    return {
      subject: "You're in — here's what NexusWatch shows right now",
      html: `<div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:32px;max-width:600px;margin:0 auto;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#22c55e;margin-bottom:24px;">NEXUSWATCH</div><h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px;">Welcome to NexusWatch.</h1><p style="font-size:14px;color:#888;line-height:1.6;margin:0 0 24px;">Your ${currentTier} access is active. Three things to do right now:</p><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:12px;"><a href="https://nexuswatch.dev/#/intel" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Open the Intel Map</a><p style="font-size:12px;color:#666;margin:4px 0 0;">45+ live layers. 150+ countries. Add your first watchlist country.</p></div><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:12px;"><a href="https://nexuswatch.dev/#/intel?open=ai-terminal" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Run a Sitrep</a><p style="font-size:12px;color:#666;margin:4px 0 0;">Ask the AI analyst: "What's the current situation in [region]?"</p></div><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:24px;"><a href="https://nexuswatch.dev/#/briefs" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Read the Brief Archive</a><p style="font-size:12px;color:#666;margin:4px 0 0;">Daily intelligence briefs, every morning.</p></div><p style="font-size:11px;color:#555;margin:0;">NexusWatch — nexuswatch.dev</p></div>`,
    };
  }

  if (template === 'nudge_d3') {
    return {
      subject: 'Have you run a sitrep yet?',
      html: `<div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:32px;max-width:600px;margin:0 auto;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#22c55e;margin-bottom:24px;">NEXUSWATCH</div><h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px;">The AI analyst is waiting.</h1><p style="font-size:14px;color:#888;line-height:1.6;margin:0 0 24px;">Ask it anything — regional instability, crisis trajectories, CII movement. It synthesizes live data across 45+ sources in seconds.</p><a href="https://nexuswatch.dev/#/intel?open=ai-terminal" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:13px;letter-spacing:1px;padding:12px 24px;border-radius:4px;text-decoration:none;margin-bottom:24px;">RUN YOUR FIRST SITREP →</a><p style="font-size:11px;color:#555;margin:0;">NexusWatch — nexuswatch.dev</p></div>`,
    };
  }

  if (template === 'upgrade_d7') {
    if (currentTier === 'pro') return null;

    const upgradeTarget = currentTier === 'analyst' ? 'Pro' : 'Analyst';
    const upgradeDesc =
      currentTier === 'analyst'
        ? 'Unlock unlimited scenario simulations, portfolio geopolitical exposure, and REST API access.'
        : 'Unlock unlimited AI queries, full evidence chains, and daily intelligence briefs.';
    const upgradeHref =
      currentTier === 'analyst'
        ? 'https://nexuswatch.dev/#/pricing?highlight=pro'
        : 'https://nexuswatch.dev/#/pricing?highlight=analyst';

    return {
      subject: 'What are you tracking?',
      html: `<div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:32px;max-width:600px;margin:0 auto;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#22c55e;margin-bottom:24px;">NEXUSWATCH</div><h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px;">You've been in NexusWatch for a week.</h1><p style="font-size:14px;color:#888;line-height:1.6;margin:0 0 24px;">${upgradeDesc}</p><a href="${upgradeHref}" style="display:inline-block;background:#22c55e;color:#000;font-weight:700;font-size:13px;letter-spacing:1px;padding:12px 24px;border-radius:4px;text-decoration:none;margin-bottom:24px;">SEE ${upgradeTarget.toUpperCase()} TIER →</a><p style="font-size:11px;color:#555;margin:0;">NexusWatch — nexuswatch.dev</p></div>`,
    };
  }

  return null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers.authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const dbUrl = process.env.DATABASE_URL;
  const resendKey = process.env.RESEND_API_KEY;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!dbUrl || !resendKey) {
    return res.status(200).json({ success: false, reason: 'Missing DATABASE_URL or RESEND_API_KEY' });
  }

  const sql = neon(dbUrl);

  const dueEmails = (await sql`
    SELECT id, user_id, email, tier, template
    FROM scheduled_emails
    WHERE send_at <= NOW() AND sent_at IS NULL
    ORDER BY send_at ASC
    LIMIT 100
  `) as ScheduledEmail[];

  if (dueEmails.length === 0) {
    return res.status(200).json({ success: true, sent: 0, skipped: 0 });
  }

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of dueEmails) {
    let currentTier = row.tier;
    if (row.template === 'upgrade_d7' && kvUrl && kvToken) {
      try {
        const kvRes = await fetch(`${kvUrl}/get/stripe:${encodeURIComponent(row.user_id)}`, {
          headers: { Authorization: `Bearer ${kvToken}` },
        });
        if (kvRes.ok) {
          const kvData = (await kvRes.json()) as { result: string | null };
          if (kvData.result) {
            let parsed: unknown = JSON.parse(kvData.result);
            if (typeof parsed === 'string') parsed = JSON.parse(parsed);
            const stripeObj = parsed as { paidTier?: string };
            if (stripeObj.paidTier) currentTier = stripeObj.paidTier;
          }
        }
      } catch {
        // Fall back to stored tier on KV failure
      }
    }

    const content = buildEmailContent(row.template, currentTier);

    if (!content) {
      await sql`UPDATE scheduled_emails SET sent_at = NOW() WHERE id = ${row.id}`;
      skipped++;
      continue;
    }

    try {
      const emailRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'NexusWatch <hello@nexuswatch.dev>',
          to: row.email,
          subject: content.subject,
          html: content.html,
        }),
      });

      if (emailRes.ok) {
        await sql`UPDATE scheduled_emails SET sent_at = NOW() WHERE id = ${row.id}`;
        sent++;
      } else {
        const body = await emailRes.text();
        errors.push(`id=${row.id}: ${emailRes.status} ${body.slice(0, 100)}`);
      }
    } catch (err) {
      errors.push(`id=${row.id}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }

  return res.status(200).json({ success: true, sent, skipped, errors });
}
