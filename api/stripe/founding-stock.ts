export const config = { runtime: 'edge' };

/**
 * Returns current founding-100 tier availability.
 *
 * GET /api/stripe/founding-stock → { remaining, max, soldOut }
 *
 * Used by the landing page to conditionally show the "Join Founding" banner
 * and seat count. `max` defaults to 100 and is overridden by STRIPE_FOUNDING_STOCK.
 * Remaining is derived from the `stripe-founding-reserved` KV counter, which
 * includes both confirmed subscriptions AND in-flight checkout sessions (so the
 * UI reflects real-time availability, not just confirmed paid subs).
 *
 * If KV isn't configured we return the full max as remaining so the UI doesn't
 * silently sell out due to infra issues.
 */
export default async function handler(): Promise<Response> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  const max = parseInt(process.env.STRIPE_FOUNDING_STOCK || '100', 10);

  const json = (body: unknown, status = 200): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'Content-Type': 'application/json',
        // Short cache so the badge updates quickly as seats fill
        'Cache-Control': 'public, max-age=10, s-maxage=10',
      },
    });

  if (!kvUrl || !kvToken) {
    return json({ remaining: max, max, soldOut: false, source: 'default' });
  }

  try {
    const res = await fetch(`${kvUrl}/get/stripe-founding-reserved`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    const reserved = data.result ? parseInt(data.result, 10) || 0 : 0;
    const remaining = Math.max(0, max - reserved);
    return json({ remaining, max, soldOut: remaining <= 0, source: 'kv' });
  } catch (err) {
    console.error(
      '[stripe/founding-stock] KV read failed, returning default max:',
      err instanceof Error ? err.message : err,
    );
    return json({ remaining: max, max, soldOut: false, source: 'fallback' });
  }
}
