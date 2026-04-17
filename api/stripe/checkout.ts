export const config = { runtime: 'edge' };

/**
 * Stripe checkout session creator.
 *
 * Tiers (locked 2026-04-11 — see project_nexuswatch_decisions_apr11.md):
 * - analyst  — $29/mo, STRIPE_ANALYST_PRICE_ID
 * - pro      — $99/mo, STRIPE_PRO_PRICE_ID
 * - founding — $19/mo lifetime, STRIPE_FOUNDING_PRICE_ID, capped at
 *              STRIPE_FOUNDING_STOCK seats (default 100). Grants Analyst
 *              feature set at a locked price.
 *
 * Founding stock is reserved via an atomic INCR on the `stripe-founding-reserved`
 * counter at session creation. The counter is released via webhook on
 * `checkout.session.expired` (user abandoned) or `customer.subscription.deleted`
 * (cancellation). Some slippage is acceptable — we'd rather undersell than oversell.
 */

type Tier = 'analyst' | 'pro' | 'founding';

interface SessionUser {
  id: string;
  email: string;
  name?: string;
  tier?: string;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function kvGet(kvUrl: string, kvToken: string, key: string): Promise<string | null> {
  const res = await fetch(`${kvUrl}/get/${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  const data = (await res.json()) as { result: string | null };
  return data.result;
}

async function kvIncr(kvUrl: string, kvToken: string, key: string): Promise<number> {
  const res = await fetch(`${kvUrl}/incr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
  const data = (await res.json()) as { result: number };
  return data.result;
}

async function kvDecr(kvUrl: string, kvToken: string, key: string): Promise<void> {
  await fetch(`${kvUrl}/decr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}` },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // Read session cookie
  const cookies = req.headers.get('cookie') || '';
  const sessionCookie = cookies
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('__Host-session='));
  const sessionId = sessionCookie?.split('=')[1];

  if (!sessionId) {
    return jsonResponse(401, { error: 'Not authenticated' });
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const analystPriceId = process.env.STRIPE_ANALYST_PRICE_ID;
  const proPriceId = process.env.STRIPE_PRO_PRICE_ID;
  const foundingPriceId = process.env.STRIPE_FOUNDING_PRICE_ID;
  const foundingStockMax = parseInt(process.env.STRIPE_FOUNDING_STOCK || '100', 10);

  if (!kvUrl || !kvToken || !stripeKey) {
    return jsonResponse(500, { error: 'Stripe not configured (core env)' });
  }

  // Parse and validate tier parameter
  const url = new URL(req.url);
  const rawTier = url.searchParams.get('tier');
  // Legacy support: ?founding=true → tier=founding (kept briefly for stale clients)
  const legacyFounding = url.searchParams.get('founding') === 'true';
  const resolvedTier: string | null = legacyFounding ? 'founding' : rawTier;

  if (resolvedTier !== 'analyst' && resolvedTier !== 'pro' && resolvedTier !== 'founding') {
    return jsonResponse(400, {
      error: 'Invalid or missing tier. Expected tier=analyst|pro|founding',
    });
  }
  const tier = resolvedTier as Tier;

  // A/B test: if variant=b and STRIPE_ANALYST_PRICE_B is set, use the $19 price
  const variant = url.searchParams.get('variant') || 'a';
  const analystPriceB = process.env.STRIPE_ANALYST_PRICE_B;

  // Explicit tier → price mapping. Reject if the configured price is missing —
  // no silent fallback to a legacy default (that was the pre-A.2 bug).
  let selectedPrice: string;
  if (tier === 'analyst') {
    if (variant === 'b' && analystPriceB) {
      selectedPrice = analystPriceB;
    } else if (!analystPriceId) {
      return jsonResponse(500, { error: 'Analyst tier not configured (STRIPE_ANALYST_PRICE_ID)' });
    } else {
      selectedPrice = analystPriceId;
    }
  } else if (tier === 'pro') {
    if (!proPriceId) {
      return jsonResponse(500, { error: 'Pro tier not configured (STRIPE_PRO_PRICE_ID)' });
    }
    selectedPrice = proPriceId;
  } else {
    if (!foundingPriceId) {
      return jsonResponse(500, {
        error: 'Founding tier not configured (STRIPE_FOUNDING_PRICE_ID)',
      });
    }
    selectedPrice = foundingPriceId;
  }

  // Look up session to get user info
  let user: SessionUser;
  try {
    const raw = await kvGet(kvUrl, kvToken, `session:${sessionId}`);
    if (!raw) {
      return jsonResponse(401, { error: 'Session expired' });
    }
    let parsed = JSON.parse(raw);
    if (typeof parsed === 'string') parsed = JSON.parse(parsed);
    user = parsed as SessionUser;
  } catch (err) {
    console.error('[stripe/checkout] Session lookup failed:', err instanceof Error ? err.message : err);
    return jsonResponse(500, { error: 'Session lookup failed' });
  }

  // For founding tier: atomically reserve a seat before creating the Stripe
  // session. The counter is released by the webhook on session.expired or
  // subscription.deleted. Overshoot is corrected by the webhook's DECR.
  if (tier === 'founding') {
    try {
      const reserved = await kvIncr(kvUrl, kvToken, 'stripe-founding-reserved');
      if (reserved > foundingStockMax) {
        // Roll back the overshoot immediately — don't hold the seat we can't sell.
        await kvDecr(kvUrl, kvToken, 'stripe-founding-reserved');
        return jsonResponse(403, {
          error: 'Founding tier is sold out',
          maxSeats: foundingStockMax,
        });
      }
    } catch (err) {
      console.error('[stripe/checkout] Founding stock reservation failed:', err instanceof Error ? err.message : err);
      return jsonResponse(500, { error: 'Unable to reserve founding seat' });
    }
  }

  // Create Stripe Checkout Session via raw fetch
  const origin = url.origin;
  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('line_items[0][price]', selectedPrice);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', `${origin}/#/intel?upgraded=${tier}`);
  params.append('cancel_url', `${origin}/#/intel?canceled=1`);
  params.append('client_reference_id', user.id);
  if (user.email) params.append('customer_email', user.email);
  params.append('metadata[sessionId]', sessionId);
  params.append('metadata[tier]', tier);
  params.append('metadata[userId]', user.id);
  params.append('metadata[variant]', variant);

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(stripeKey + ':')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const stripeData = (await stripeRes.json()) as {
      url?: string;
      error?: { message: string };
    };

    if (!stripeRes.ok || !stripeData.url) {
      // Release the founding reservation if we took one — Stripe rejected the session.
      if (tier === 'founding') {
        await kvDecr(kvUrl, kvToken, 'stripe-founding-reserved').catch((err) => {
          console.error(
            '[stripe/checkout] Failed to release founding reservation after Stripe error:',
            err instanceof Error ? err.message : err,
          );
        });
      }
      console.error(
        '[stripe/checkout] Stripe session create failed:',
        stripeRes.status,
        stripeData.error?.message || 'unknown',
      );
      return jsonResponse(500, {
        error: stripeData.error?.message || 'Failed to create checkout session',
      });
    }

    return jsonResponse(200, { url: stripeData.url, tier });
  } catch (err) {
    // Release founding reservation on unexpected errors too.
    if (tier === 'founding') {
      await kvDecr(kvUrl, kvToken, 'stripe-founding-reserved').catch(() => {
        /* best-effort release */
      });
    }
    console.error(
      '[stripe/checkout] Unexpected error during Stripe session create:',
      err instanceof Error ? err.message : err,
    );
    return jsonResponse(500, { error: 'Internal error' });
  }
}
