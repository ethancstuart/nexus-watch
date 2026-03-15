export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const cookies = req.headers.get('cookie') || '';
  const sessionCookie = cookies
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('__Host-session='));
  const sessionId = sessionCookie?.split('=')[1];

  if (!sessionId) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const stripeKey = process.env.STRIPE_SECRET_KEY;

  if (!kvUrl || !kvToken || !stripeKey) {
    return new Response(JSON.stringify({ error: 'Not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Look up session to get user ID
    const sessionRes = await fetch(`${kvUrl}/get/session:${sessionId}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const sessionData = (await sessionRes.json()) as { result: string | null };

    if (!sessionData.result) {
      return new Response(JSON.stringify({ error: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let user = JSON.parse(sessionData.result);
    if (typeof user === 'string') user = JSON.parse(user);

    // Look up Stripe customer ID
    const stripeRes = await fetch(`${kvUrl}/get/stripe:${user.id}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const stripeData = (await stripeRes.json()) as { result: string | null };

    if (!stripeData.result) {
      return new Response(JSON.stringify({ error: 'No billing information found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const stripeInfo = JSON.parse(stripeData.result);
    const url = new URL(req.url);

    // Create Stripe Billing Portal Session
    const params = new URLSearchParams();
    params.append('customer', stripeInfo.customerId);
    params.append('return_url', `${url.origin}/#/app`);

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(stripeKey + ':')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const portalData = (await portalRes.json()) as { url?: string; error?: { message: string } };

    if (!portalRes.ok || !portalData.url) {
      return new Response(JSON.stringify({ error: portalData.error?.message || 'Failed to create portal session' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ url: portalData.url }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
