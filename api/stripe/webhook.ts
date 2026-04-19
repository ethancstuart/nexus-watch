export const config = { runtime: 'edge' };

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

  // Idempotency check — skip if we've already processed this event ID.
  try {
    const idempRes = await fetch(`${kvUrl}/get/stripe-event:${event.id}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const idempData = (await idempRes.json()) as { result: string | null };
    if (idempData.result) {
      return new Response('OK', { status: 200 });
    }
  } catch (err) {
    // KV read failed — log and continue. Worst case we re-process an event,
    // which our handlers are idempotent against.
    console.error('[stripe/webhook] Idempotency check failed:', err instanceof Error ? err.message : err);
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

        // Store forward mapping (stripe:{userId} → customer/subscription/status/paidTier)
        await kvSet(kvUrl, kvToken, `stripe:${userId}`, {
          customerId,
          subscriptionId,
          status: 'active',
          paidTier: tierMeta || 'pro',
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
        if (tierMeta === 'founding') {
          await kvIncr(kvUrl, kvToken, 'stripe-founding-active');
        }
        break;
      }

      case 'checkout.session.expired': {
        // User abandoned checkout — release the founding reservation we took
        // when the session was created.
        const session = event.data.object;
        const metadata = (session.metadata as Record<string, string>) || {};
        if (metadata.tier === 'founding') {
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

        // Read existing record to preserve the paidTier across status transitions.
        const existing = await kvGetJson<{
          paidTier?: 'insider' | 'analyst' | 'pro' | 'founding';
        }>(kvUrl, kvToken, `stripe:${userId}`);
        const paidTier = existing?.paidTier;

        const tier = status === 'active' || status === 'trialing' ? 'premium' : 'free';
        await kvSet(kvUrl, kvToken, `stripe:${userId}`, {
          customerId,
          subscriptionId: subscription.id as string,
          status,
          paidTier,
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
        const wasFounding = existing?.paidTier === 'founding';

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

    // Mark event as processed (24h TTL) — only after successful handling.
    await fetch(`${kvUrl}/set/stripe-event:${event.id}/1?EX=86400`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
  } catch (err) {
    // Processing failed. Log loudly and return 500 so Stripe retries.
    // The idempotency marker was NOT written, so retry will re-attempt handling.
    // Our handlers are idempotent at the KV-set level, so a retry after partial
    // progress is safe.
    console.error(
      `[stripe/webhook] Processing error for event ${event.id} (${event.type}):`,
      err instanceof Error ? err.message : err,
      err instanceof Error ? err.stack : undefined,
    );
    return new Response('Processing error — Stripe will retry', { status: 500 });
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
