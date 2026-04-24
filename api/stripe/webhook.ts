export const config = { runtime: 'edge' };

import { neon } from '@neondatabase/serverless';

/**
 * Stripe webhook handler.
 *
 * Handles:
 * - checkout.session.completed   — mark tier active, write reverse index, track founding cohort
 * - checkout.session.expired     — release founding reservation (user abandoned)
 * - customer.subscription.updated — refresh tier state on status changes
 * - customer.subscription.deleted — downgrade tier, release founding seat
 *
 * Architecture notes (fixed 2026-04-11):
 * - Reverse index `stripe-customer:{customerId} → userId` is written on
 *   checkout.session.completed so subsequent webhook events are O(1) lookups
 *   instead of O(n) KV SCANs across all `stripe:*` keys.
 * - Founding tier uses two counters:
 *   - `stripe-founding-reserved` = reservations including in-flight checkouts,
 *     gates new session creation
 *   - `stripe-founding-active`   = confirmed paid founding subscribers
 * - Processing errors are now logged loudly and return 500, so Stripe retries
 *   with its built-in exponential backoff. Prior behavior silently swallowed
 *   errors and returned 200, which left users paying without tier updates.
 */

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const encoder = new TextEncoder();
  const aBytes = encoder.encode(a);
  const bBytes = encoder.encode(b);
  let result = 0;
  for (let i = 0; i < aBytes.length; i++) {
    result |= aBytes[i] ^ bBytes[i];
  }
  return result === 0;
}

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: {
    object: Record<string, unknown>;
  };
}

async function verifySignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  const parts = sigHeader.split(',').reduce(
    (acc, part) => {
      const [key, value] = part.split('=');
      if (key === 't') acc.timestamp = value;
      if (key === 'v1') acc.signatures.push(value);
      return acc;
    },
    { timestamp: '', signatures: [] as string[] },
  );

  if (!parts.timestamp || parts.signatures.length === 0) return false;

  // Reject if timestamp is older than 5 minutes
  const age = Math.floor(Date.now() / 1000) - parseInt(parts.timestamp, 10);
  if (age > 300) return false;

  const signedPayload = `${parts.timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const computed = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return parts.signatures.some((sig) => timingSafeEqual(sig, computed));
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!webhookSecret || !kvUrl || !kvToken) {
    console.error('[stripe/webhook] Missing required env vars');
    return new Response('Not configured', { status: 500 });
  }

  const sigHeader = req.headers.get('stripe-signature');
  if (!sigHeader) {
    return new Response('Missing signature', { status: 400 });
  }

  const body = await req.text();

  const valid = await verifySignature(body, sigHeader, webhookSecret);
  if (!valid) {
    return new Response('Invalid signature', { status: 400 });
  }

  const event = JSON.parse(body) as StripeEvent;

  // Phase 1: check permanent idempotency key (already processed successfully).
  try {
    const doneRes = await fetch(`${kvUrl}/get/stripe-event:${event.id}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const doneData = (await doneRes.json()) as { result: string | null };
    if (doneData.result !== null) {
      return new Response('OK', { status: 200 }); // already processed
    }
  } catch (err) {
    console.error('[stripe/webhook] Idempotency check failed:', err instanceof Error ? err.message : err);
    // Continue — a failed read should not block processing
  }

  // Phase 2: acquire short-lived lock to prevent concurrent duplicate processing.
  // Lock expires in 60s. On transient failure, Stripe retries after ~30s minimum,
  // so the lock will have expired and the retry can proceed.
  try {
    const lockRes = await fetch(`${kvUrl}/set/stripe-lock:${event.id}/1?NX=true&EX=60`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const lockData = (await lockRes.json()) as { result: string | null };
    if (lockData.result === null) {
      return new Response('OK', { status: 200 }); // concurrent duplicate, skip
    }
  } catch (err) {
    console.error('[stripe/webhook] Lock acquisition failed:', err instanceof Error ? err.message : err);
    return new Response('Lock acquisition error', { status: 500 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id as string;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const metadata = (session.metadata as Record<string, string>) || {};
        const sessionIdMeta = metadata.sessionId;
        const tierMeta = metadata.tier as 'insider' | 'analyst' | 'pro' | 'founding' | undefined;

        if (!userId) {
          console.error('[stripe/webhook] checkout.session.completed missing client_reference_id');
          break;
        }

        const sessionEmailRaw =
          (session.customer_email as string | null) ||
          (session.customer_details as { email?: string } | null)?.email ||
          '';

        // Store forward mapping (stripe:{userId} → customer/subscription/status/paidTier)
        await kvSet(kvUrl, kvToken, `stripe:${userId}`, {
          customerId,
          subscriptionId,
          status: 'active',
          paidTier: tierMeta || 'insider',
          email: sessionEmailRaw,
        });

        // Write reverse index so subsequent webhook events are O(1).
        // This replaces the O(n) KV SCAN that was the pre-A.2 hot path.
        if (customerId) {
          await kvSet(kvUrl, kvToken, `stripe-customer:${customerId}`, userId);
        }

        // Update user session tier — keep binary `tier` for backward compat
        // and add granular `paidTier` for new code.
        await updateUserSessions(kvUrl, kvToken, userId, 'premium', tierMeta);

        // Update specific session if provided in metadata (faster propagation).
        if (sessionIdMeta) {
          await updateSessionTier(kvUrl, kvToken, sessionIdMeta, 'premium', tierMeta);
        }

        // Founding tier: INCR the confirmed-active counter. Reservation counter
        // already counted this session when checkout.ts created the Stripe session.
        if (tierMeta === 'insider') {
          await kvIncr(kvUrl, kvToken, 'stripe-founding-active');
        }

        // Insert 3-email onboarding sequence into scheduled_emails
        const dbUrl = process.env.DATABASE_URL;
        if (dbUrl && sessionEmailRaw) {
          const sql = neon(dbUrl);
          try {
            await sql`
              INSERT INTO scheduled_emails (user_id, email, tier, template, send_at) VALUES
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'welcome_d0',  NOW()),
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'nudge_d3',   NOW() + INTERVAL '3 days'),
              (${userId}, ${sessionEmailRaw}, ${tierMeta || 'insider'}, 'upgrade_d7', NOW() + INTERVAL '7 days')
              ON CONFLICT (user_id, template) DO NOTHING
            `;
          } catch (err) {
            console.error('[stripe/webhook] scheduled_emails insert failed:', err instanceof Error ? err.message : err);
          }

          // Attempt immediate welcome email. On success, mark the cron row sent_at = NOW()
          // so the cron skips it. On failure, the cron row remains for pickup within 60 min.
          const resendKey = process.env.RESEND_API_KEY;
          if (resendKey && sessionEmailRaw) {
            const activeTier = tierMeta || 'insider';
            try {
              const welcomeRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                signal: AbortSignal.timeout(15000),
                body: JSON.stringify({
                  from: 'NexusWatch <hello@nexuswatch.dev>',
                  to: sessionEmailRaw,
                  subject: "You're in — here's what NexusWatch shows right now",
                  html: `<div style="font-family:monospace;background:#0a0a0a;color:#e0e0e0;padding:32px;max-width:600px;margin:0 auto;"><div style="font-size:11px;text-transform:uppercase;letter-spacing:3px;color:#22c55e;margin-bottom:24px;">NEXUSWATCH</div><h1 style="font-size:22px;font-weight:700;color:#fff;margin:0 0 16px;">Welcome to NexusWatch.</h1><p style="font-size:14px;color:#888;line-height:1.6;margin:0 0 24px;">Your ${activeTier} access is active. Three things to do right now:</p><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:12px;"><a href="https://nexuswatch.dev/#/intel" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Open the Intel Map</a><p style="font-size:12px;color:#666;margin:4px 0 0;">45+ live layers. 150+ countries. Add your first watchlist country.</p></div><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:12px;"><a href="https://nexuswatch.dev/#/intel?open=ai-terminal" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Run a Sitrep</a><p style="font-size:12px;color:#666;margin:4px 0 0;">Ask the AI analyst: "What's the current situation in [region]?"</p></div><div style="border:1px solid #1e1e1e;border-radius:6px;padding:16px;margin-bottom:24px;"><a href="https://nexuswatch.dev/#/briefs" style="color:#22c55e;text-decoration:none;font-size:13px;font-weight:700;">→ Read the Brief Archive</a><p style="font-size:12px;color:#666;margin:4px 0 0;">Daily intelligence briefs, every morning.</p></div><p style="font-size:11px;color:#555;margin:0;">NexusWatch — nexuswatch.dev</p></div>`,
                }),
              });
              if (welcomeRes.ok) {
                try {
                  await sql`UPDATE scheduled_emails SET sent_at = NOW() WHERE user_id = ${userId} AND template = 'welcome_d0' AND sent_at IS NULL`;
                  console.log(`[stripe/webhook] welcome_d0 sent immediately to ${sessionEmailRaw}`);
                } catch (updateErr) {
                  console.warn('[stripe/webhook] welcome_d0 sent but cron row mark failed (cron will re-attempt send):', updateErr instanceof Error ? updateErr.message : updateErr);
                }
              } else {
                console.warn(`[stripe/webhook] welcome_d0 send failed (${welcomeRes.status}), cron fallback active`);
              }
            } catch (err) {
              console.warn('[stripe/webhook] welcome_d0 send failed (exception), cron fallback active:', err instanceof Error ? err.message : err);
            }
          }
        }

        // Referral attribution
        const referredBy = metadata.referredBy as string | undefined;
        if (referredBy && referredBy.trim()) {
          const referrerId = referredBy.trim();
          if (!/^[\w-]{1,128}$/.test(referrerId)) {
            console.warn('[stripe/webhook] Skipping referral: suspicious referrerId format:', referrerId);
          } else if (referrerId === userId) {
            console.warn('[stripe/webhook] Skipping self-referral for user:', userId);
          } else {
            try {
              await kvIncr(kvUrl, kvToken, `referral:count:${referrerId}`);
              await kvSet(kvUrl, kvToken, `referral:conversion:${userId}`, referrerId);

              // Phase 2: Stripe credit — gated behind env var, defaults off
              if (process.env.REFERRAL_CREDITS_ENABLED === 'true') {
                const referrerStripe = await kvGetJson<{ customerId?: string }>(kvUrl, kvToken, `stripe:${referrerId}`);
                const referrerCustomerId = referrerStripe?.customerId;
                const referralCountRaw = await kvGetStr(kvUrl, kvToken, `referral:count:${referrerId}`);
                const referralCount = referralCountRaw ? parseInt(referralCountRaw, 10) : 1;
                const stripeKey = process.env.STRIPE_SECRET_KEY;

                if (referrerCustomerId && referralCount <= 12 && stripeKey) {
                  const creditRes = await fetch(
                    `https://api.stripe.com/v1/customers/${referrerCustomerId}/balance_transactions`,
                    {
                      method: 'POST',
                      headers: {
                        Authorization: `Basic ${btoa(stripeKey + ':')}`,
                        'Content-Type': 'application/x-www-form-urlencoded',
                      },
                      body: new URLSearchParams({
                        amount: '-2900',
                        currency: 'usd',
                        description: 'NexusWatch referral conversion',
                      }).toString(),
                    },
                  );

                  if (creditRes.ok) {
                    const resendKey = process.env.RESEND_API_KEY;
                    const referrerData = await kvGetJson<{ email?: string }>(kvUrl, kvToken, `stripe:${referrerId}`);
                    const referrerEmail = referrerData?.email;
                    if (resendKey && referrerEmail) {
                      await fetch('https://api.resend.com/emails', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          from: 'NexusWatch <hello@nexuswatch.dev>',
                          to: referrerEmail,
                          subject: 'Someone used your link — a free month added',
                          html: `<p>Someone just signed up using your NexusWatch referral link. A $29 credit has been applied to your account — it will automatically offset your next renewal.</p>`,
                        }),
                      });
                    }
                  } else {
                    console.error('[stripe/webhook] Stripe referral credit failed:', creditRes.status);
                  }
                }
              }
            } catch (err) {
              console.error('[stripe/webhook] referral attribution failed:', err instanceof Error ? err.message : err);
            }
          }
        }
        break;
      }

      case 'checkout.session.expired': {
        // User abandoned checkout — release the founding reservation we took
        // when the session was created.
        const session = event.data.object;
        const metadata = (session.metadata as Record<string, string>) || {};
        if (metadata.tier === 'insider') {
          await kvDecr(kvUrl, kvToken, 'stripe-founding-reserved');
          console.log(`[stripe/webhook] Released founding reservation for expired session (user ${metadata.userId})`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const status = subscription.status as string;
        const customerId = subscription.customer as string;

        const userId = await findUserByCustomerId(kvUrl, kvToken, customerId);
        if (!userId) {
          console.error(`[stripe/webhook] subscription.updated: no user found for customer ${customerId}`);
          break;
        }

        // Read existing record to preserve the paidTier and email across status transitions.
        const existing = await kvGetJson<{
          paidTier?: 'insider' | 'analyst' | 'pro' | 'founding';
          email?: string;
        }>(kvUrl, kvToken, `stripe:${userId}`);
        const paidTier = existing?.paidTier;
        const existingEmail = existing?.email ?? '';

        const tier = status === 'active' || status === 'trialing' ? 'premium' : 'free';
        await kvSet(kvUrl, kvToken, `stripe:${userId}`, {
          customerId,
          subscriptionId: subscription.id as string,
          status,
          paidTier,
          email: existingEmail,
        });
        await updateUserSessions(kvUrl, kvToken, userId, tier, tier === 'premium' ? paidTier : undefined);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        const userId = await findUserByCustomerId(kvUrl, kvToken, customerId);
        if (!userId) {
          console.error(`[stripe/webhook] subscription.deleted: no user found for customer ${customerId}`);
          break;
        }

        const existing = await kvGetJson<{
          paidTier?: 'insider' | 'analyst' | 'pro' | 'founding';
        }>(kvUrl, kvToken, `stripe:${userId}`);
        const wasFounding = existing?.paidTier === 'insider' || existing?.paidTier === 'founding';

        await kvSet(kvUrl, kvToken, `stripe:${userId}`, {
          customerId,
          subscriptionId: subscription.id as string,
          status: 'canceled',
          paidTier: undefined,
        });
        await updateUserSessions(kvUrl, kvToken, userId, 'free', undefined);

        // Release founding seat so the next subscriber can claim it.
        if (wasFounding) {
          await kvDecr(kvUrl, kvToken, 'stripe-founding-active');
          await kvDecr(kvUrl, kvToken, 'stripe-founding-reserved');
        }
        break;
      }

      default:
        // Unhandled event type — ignore silently but log for visibility.
        console.log(`[stripe/webhook] Ignoring unhandled event type: ${event.type}`);
        break;
    }
  } catch (err) {
    // Processing failed. Log loudly and return 500 so Stripe retries.
    // The permanent idempotency key is NOT written on failure, so Stripe's retry
    // will re-process the event (the short-lived lock will have expired by then).
    console.error(
      `[stripe/webhook] Processing error for event ${event.id} (${event.type}):`,
      err instanceof Error ? err.message : err,
      err instanceof Error ? err.stack : undefined,
    );
    return new Response('Processing error — Stripe will retry', { status: 500 });
  }

  // Write permanent idempotency key only after successful processing.
  try {
    await fetch(`${kvUrl}/set/stripe-event:${event.id}/1?NX=true&EX=86400`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
  } catch {
    // Non-fatal — worst case is re-processing a duplicate event
  }

  return new Response('OK', { status: 200 });
}

// ── KV helpers ─────────────────────────────────────────────────────────────

async function kvSet(kvUrl: string, kvToken: string, key: string, value: unknown): Promise<void> {
  await fetch(`${kvUrl}/set/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

async function kvGetJson<T>(kvUrl: string, kvToken: string, key: string): Promise<T | null> {
  try {
    const res = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    if (!data.result) return null;
    let parsed: unknown = JSON.parse(data.result);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    return parsed as T;
  } catch {
    return null;
  }
}

async function kvGetStr(kvUrl: string, kvToken: string, key: string): Promise<string | null> {
  try {
    const res = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    return data.result;
  } catch {
    return null;
  }
}

async function kvIncr(kvUrl: string, kvToken: string, key: string): Promise<void> {
  await fetch(`${kvUrl}/incr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
}

async function kvDecr(kvUrl: string, kvToken: string, key: string): Promise<void> {
  await fetch(`${kvUrl}/decr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
}

/**
 * Resolve a userId from a Stripe customerId.
 *
 * First checks the O(1) reverse index `stripe-customer:{customerId}`. Falls
 * back to the legacy O(n) SCAN for customers created before the reverse index
 * existed (pre-A.2). Opportunistically writes the reverse index on successful
 * scan hits so future lookups become O(1).
 */
async function findUserByCustomerId(kvUrl: string, kvToken: string, customerId: string): Promise<string | null> {
  // Fast path: reverse index
  try {
    const res = await fetch(`${kvUrl}/get/stripe-customer:${customerId}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    if (data.result) {
      // Upstash can return the string with or without quotes depending on write path.
      const userId = data.result.replace(/^"|"$/g, '');
      return userId;
    }
  } catch (err) {
    console.error(
      '[stripe/webhook] Reverse-index lookup failed, falling back to scan:',
      err instanceof Error ? err.message : err,
    );
  }

  // Fallback: legacy SCAN. Kept for customers created before the reverse
  // index existed. Writes the reverse index on hit so future lookups are O(1).
  try {
    let cursor = '0';
    do {
      const res = await fetch(`${kvUrl}/scan/${cursor}?MATCH=stripe:*&COUNT=100`, {
        headers: { Authorization: `Bearer ${kvToken}` },
      });
      const data = (await res.json()) as { result: [string, string[]] };
      cursor = data.result[0];
      for (const key of data.result[1]) {
        const valRes = await fetch(`${kvUrl}/get/${key}`, {
          headers: { Authorization: `Bearer ${kvToken}` },
        });
        const valData = (await valRes.json()) as { result: string | null };
        if (valData.result) {
          let parsed: unknown = JSON.parse(valData.result);
          if (typeof parsed === 'string') parsed = JSON.parse(parsed);
          if ((parsed as { customerId?: string }).customerId === customerId) {
            const userId = key.replace('stripe:', '');
            // Backfill reverse index for next time
            await kvSet(kvUrl, kvToken, `stripe-customer:${customerId}`, userId);
            return userId;
          }
        }
      }
    } while (cursor !== '0');
  } catch (err) {
    console.error('[stripe/webhook] Legacy scan fallback failed:', err instanceof Error ? err.message : err);
  }
  return null;
}

async function updateUserSessions(
  kvUrl: string,
  kvToken: string,
  userId: string,
  tier: string,
  paidTier?: 'insider' | 'analyst' | 'pro' | 'founding',
): Promise<void> {
  try {
    const res = await fetch(`${kvUrl}/get/user-sessions:${userId}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    if (!data.result) return;

    const sessionIds = JSON.parse(data.result) as string[];
    for (const sid of sessionIds) {
      await updateSessionTier(kvUrl, kvToken, sid, tier, paidTier);
    }
  } catch (err) {
    console.error(
      '[stripe/webhook] updateUserSessions failed — session.ts self-heal will retry on next load:',
      err instanceof Error ? err.message : err,
    );
  }
}

async function updateSessionTier(
  kvUrl: string,
  kvToken: string,
  sessionId: string,
  tier: string,
  paidTier?: 'insider' | 'analyst' | 'pro' | 'founding',
): Promise<void> {
  try {
    const res = await fetch(`${kvUrl}/get/session:${sessionId}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    if (!data.result) return;

    let user: Record<string, unknown> = JSON.parse(data.result);
    if (typeof user === 'string') user = JSON.parse(user);
    user.tier = tier;
    if (paidTier) {
      user.paidTier = paidTier;
    } else if (tier === 'free') {
      delete user.paidTier;
    }

    await fetch(`${kvUrl}/set/session:${sessionId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
  } catch (err) {
    console.error(
      '[stripe/webhook] updateSessionTier failed for session',
      sessionId,
      err instanceof Error ? err.message : err,
    );
  }
}
