export const config = { runtime: 'edge' };

/**
 * Stripe checkout session creator — 4-tier model.
 *
 * Tiers:
 * - insider  — $19/mo or $199/yr, STRIPE_INSIDER_PRICE_ID / STRIPE_INSIDER_ANNUAL_PRICE_ID
 * - analyst  — $29/mo or $299/yr, STRIPE_ANALYST_PRICE_ID / STRIPE_ANALYST_ANNUAL_PRICE_ID
 * - pro      — $99/mo or $999/yr, STRIPE_PRO_PRICE_ID / STRIPE_PRO_ANNUAL_PRICE_ID
 *
 * Backward compat: `tier=founding` maps to insider.
 * Body params: { tier: string, interval?: 'month' | 'year' }
 */

type Tier = 'insider' | 'analyst' | 'pro';
type Interval = 'month' | 'year';

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

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

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

  if (!kvUrl || !kvToken || !stripeKey) {
    return jsonResponse(500, { error: 'Stripe not configured (core env)' });
  }

  // Parse tier + interval from body or query params
  const url = new URL(req.url);
  let bodyTier: string | null = null;
  let bodyInterval: string | null = null;
  let bodyReferredBy: string | null = null;

  try {
    const body = (await req.json()) as { tier?: string; interval?: string; referredBy?: string };
    bodyTier = body.tier || null;
    bodyInterval = body.interval || null;
    bodyReferredBy = body.referredBy || null;
  } catch {
    // No JSON body — fall back to query params
  }

  const rawTier = bodyTier || url.searchParams.get('tier');
  // Backward compat: founding → insider
  const resolvedTier = rawTier === 'founding' ? 'insider' : rawTier;
  const interval: Interval =
    (bodyInterval || url.searchParams.get('interval') || 'month') === 'year' ? 'year' : 'month';

  if (resolvedTier !== 'insider' && resolvedTier !== 'analyst' && resolvedTier !== 'pro') {
    return jsonResponse(400, {
      error: 'Invalid or missing tier. Expected tier=insider|analyst|pro',
    });
  }
  const tier = resolvedTier as Tier;

  // Founding-100 seat cap — enforce before any Stripe API call
  if (tier === 'insider') {
    try {
      const reservedRaw = await kvGet(kvUrl, kvToken, 'stripe-founding-reserved');
      const reserved = reservedRaw !== null ? parseInt(reservedRaw, 10) : 0;
      if (reserved >= 100) {
        return jsonResponse(409, {
          error: 'founding_cohort_full',
          message: 'The Founding-100 cohort is full. Choose the Analyst or Pro tier.',
        });
      }
      // Atomically reserve a seat
      await fetch(`${kvUrl}/incr/stripe-founding-reserved`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}` },
      });
    } catch (err) {
      // Fail open — log but allow checkout to proceed
      console.error('[stripe/checkout] Founding seat cap KV check failed:', err instanceof Error ? err.message : err);
    }
  }

  // Price ID mapping — monthly and annual for each tier
  const PRICE_MAP: Record<Tier, Record<Interval, string | undefined>> = {
    insider: {
      month: process.env.STRIPE_INSIDER_PRICE_ID || process.env.STRIPE_FOUNDING_PRICE_ID,
      year: process.env.STRIPE_INSIDER_ANNUAL_PRICE_ID,
    },
    analyst: {
      month: process.env.STRIPE_ANALYST_PRICE_ID,
      year: process.env.STRIPE_ANALYST_ANNUAL_PRICE_ID,
    },
    pro: {
      month: process.env.STRIPE_PRO_PRICE_ID,
      year: process.env.STRIPE_PRO_ANNUAL_PRICE_ID,
    },
  };

  const selectedPrice = PRICE_MAP[tier][interval];
  if (!selectedPrice) {
    return jsonResponse(500, {
      error: `${tier} tier (${interval}) not configured. Set STRIPE_${tier.toUpperCase()}_${interval === 'year' ? 'ANNUAL_' : ''}PRICE_ID`,
    });
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

  // Create Stripe Checkout Session
  const origin = url.origin;
  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('line_items[0][price]', selectedPrice);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', `${origin}/#/intel?upgraded=${tier}`);
  params.append('cancel_url', `${origin}/#/pricing?canceled=1`);
  params.append('client_reference_id', user.id);
  if (user.email) params.append('customer_email', user.email);
  params.append('metadata[sessionId]', sessionId);
  params.append('metadata[tier]', tier);
  params.append('metadata[userId]', user.id);
  params.append('metadata[interval]', interval);
  if (bodyReferredBy) {
    params.append('metadata[referredBy]', bodyReferredBy);
  }

  // 14-day trial for all paid tiers
  params.append('subscription_data[trial_period_days]', '14');

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
      console.error(
        '[stripe/checkout] Stripe session create failed:',
        stripeRes.status,
        stripeData.error?.message || 'unknown',
      );
      return jsonResponse(500, {
        error: stripeData.error?.message || 'Failed to create checkout session',
      });
    }

    return jsonResponse(200, { url: stripeData.url, tier, interval });
  } catch (err) {
    console.error('[stripe/checkout] Unexpected error:', err instanceof Error ? err.message : err);
    return jsonResponse(500, { error: 'Internal error' });
  }
}
