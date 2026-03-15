export const config = { runtime: 'edge' };

export default async function handler(req: Request) {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Read session cookie
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
  const priceId = process.env.STRIPE_PRICE_ID;
  const foundingPriceId = process.env.STRIPE_FOUNDING_PRICE_ID;

  if (!kvUrl || !kvToken || !stripeKey || !priceId) {
    return new Response(JSON.stringify({ error: 'Stripe not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Look up session to get user info
  try {
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

    // Check for founding member pricing
    const url = new URL(req.url);
    const founding = url.searchParams.get('founding') === 'true';
    const selectedPrice = founding && foundingPriceId ? foundingPriceId : priceId;

    const origin = url.origin;

    // Create Stripe Checkout Session via raw fetch
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('line_items[0][price]', selectedPrice);
    params.append('line_items[0][quantity]', '1');
    params.append('success_url', `${origin}/#/app?upgraded=true`);
    params.append('cancel_url', `${origin}/#/app`);
    params.append('client_reference_id', user.id);
    params.append('customer_email', user.email);
    params.append('metadata[sessionId]', sessionId);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(stripeKey + ':')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const stripeData = (await stripeRes.json()) as { url?: string; error?: { message: string } };

    if (!stripeRes.ok || !stripeData.url) {
      return new Response(
        JSON.stringify({ error: stripeData.error?.message || 'Failed to create checkout session' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify({ url: stripeData.url }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
