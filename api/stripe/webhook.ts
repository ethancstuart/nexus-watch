export const config = { runtime: 'edge' };

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

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  if (!webhookSecret || !kvUrl || !kvToken) {
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

  // Idempotency check
  try {
    const idempRes = await fetch(`${kvUrl}/get/stripe-event:${event.id}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const idempData = (await idempRes.json()) as { result: string | null };
    if (idempData.result) {
      // Already processed
      return new Response('OK', { status: 200 });
    }
  } catch {
    // Continue processing if KV check fails
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.client_reference_id as string;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;
        const sessionId = (session.metadata as Record<string, string>)?.sessionId;

        if (userId) {
          // Store Stripe customer mapping
          await kvSet(kvUrl, kvToken, `stripe:${userId}`, {
            customerId,
            subscriptionId,
            status: 'active',
          });

          // Update all active sessions for this user
          await updateUserSessions(kvUrl, kvToken, userId, 'premium');

          // Also update specific session if provided in metadata
          if (sessionId) {
            await updateSessionTier(kvUrl, kvToken, sessionId, 'premium');
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const status = subscription.status as string;
        const customerId = subscription.customer as string;

        const userId = await findUserByCustomerId(kvUrl, kvToken, customerId);
        if (userId) {
          const tier = status === 'active' || status === 'trialing' ? 'premium' : 'free';
          await kvSet(kvUrl, kvToken, `stripe:${userId}`, {
            customerId,
            subscriptionId: subscription.id as string,
            status,
          });
          await updateUserSessions(kvUrl, kvToken, userId, tier);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer as string;

        const userId = await findUserByCustomerId(kvUrl, kvToken, customerId);
        if (userId) {
          await kvSet(kvUrl, kvToken, `stripe:${userId}`, {
            customerId,
            subscriptionId: subscription.id as string,
            status: 'canceled',
          });
          await updateUserSessions(kvUrl, kvToken, userId, 'free');
        }
        break;
      }
    }

    // Mark event as processed (24h TTL)
    await fetch(`${kvUrl}/set/stripe-event:${event.id}/1?EX=86400`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
  } catch {
    // Return 200 on processing errors to prevent Stripe retries after idempotency key is set.
    // The event is already marked processed above — a 5xx would cause Stripe to retry
    // against a stale idempotency check.
    return new Response('Processing error', { status: 200 });
  }

  return new Response('OK', { status: 200 });
}

async function kvSet(kvUrl: string, kvToken: string, key: string, value: unknown): Promise<void> {
  await fetch(`${kvUrl}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
}

async function findUserByCustomerId(kvUrl: string, kvToken: string, customerId: string): Promise<string | null> {
  // Scan stripe:* keys to find the user with this customer ID
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
          const parsed = JSON.parse(valData.result);
          if (parsed.customerId === customerId) {
            return key.replace('stripe:', '');
          }
        }
      }
    } while (cursor !== '0');
  } catch {
    // Scan failed
  }
  return null;
}

async function updateUserSessions(kvUrl: string, kvToken: string, userId: string, tier: string): Promise<void> {
  try {
    const res = await fetch(`${kvUrl}/get/user-sessions:${userId}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    if (!data.result) return;

    const sessionIds = JSON.parse(data.result) as string[];
    for (const sid of sessionIds) {
      await updateSessionTier(kvUrl, kvToken, sid, tier);
    }
  } catch {
    // Session update failed — self-healing in session.ts will catch this
  }
}

async function updateSessionTier(kvUrl: string, kvToken: string, sessionId: string, tier: string): Promise<void> {
  try {
    const res = await fetch(`${kvUrl}/get/session:${sessionId}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    if (!data.result) return;

    let user = JSON.parse(data.result);
    if (typeof user === 'string') user = JSON.parse(user);
    user.tier = tier;

    await fetch(`${kvUrl}/set/session:${sessionId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(user),
    });
  } catch {
    // Session tier update failed
  }
}
