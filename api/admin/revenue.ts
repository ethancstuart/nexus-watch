import type { VercelRequest, VercelResponse } from '@vercel/node';
import { resolveAdmin } from './_auth';

export const config = { runtime: 'nodejs', maxDuration: 15 };

/**
 * GET /api/admin/revenue
 *
 * Revenue cockpit data. Pulls directly from Stripe (single source of truth)
 * so the numbers here match the Stripe dashboard exactly — no DB caching.
 *
 * Returns:
 *   {
 *     mrr: { total, analyst, pro, founding },
 *     arr,
 *     subs: { active, canceling, canceled, total },
 *     by_tier: { analyst: n, pro: n, founding: n },
 *     founding: { cap, active, reserved, remaining },
 *     recent_events: [ { type, at, amount, tier, customer_email } ],
 *     mtd_new, mtd_churned,
 *     churn_30d_pct,
 *   }
 *
 * Admin-gated via resolveAdmin().
 *
 * Notes on architecture:
 *   - Stripe is paginated 100 at a time; we cap at 3 pages (~300 subs) to
 *     keep latency reasonable. For > 300 subs, implement a daily Neon
 *     rollup cron.
 *   - We count founding cohort off the `metadata.tier` field set at checkout.
 *   - STRIPE_ANALYST_PRICE_ID / STRIPE_PRO_PRICE_ID / STRIPE_FOUNDING_PRICE_ID
 *     let us fall back to price-id match when metadata is missing.
 */

interface StripeListResp<T> {
  object: 'list';
  data: T[];
  has_more: boolean;
}

interface StripeSub {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number;
  created: number;
  canceled_at: number | null;
  customer: string;
  metadata: Record<string, string>;
  items: {
    data: Array<{
      price: { id: string; unit_amount: number; currency: string; recurring?: { interval: string } };
      quantity: number;
    }>;
  };
}

interface StripeEvent {
  id: string;
  type: string;
  created: number;
  data: { object: Record<string, unknown> };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = await resolveAdmin(req);
  if (!user) return res.status(403).json({ error: 'forbidden' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'stripe_not_configured' });
  }

  const analystPrice = process.env.STRIPE_ANALYST_PRICE_ID ?? '';
  const proPrice = process.env.STRIPE_PRO_PRICE_ID ?? '';
  const foundingPrice = process.env.STRIPE_FOUNDING_PRICE_ID ?? '';
  const foundingCap = parseInt(process.env.STRIPE_FOUNDING_STOCK ?? '100', 10);

  try {
    const subs = await fetchAllSubscriptions(stripeKey);
    const events = await fetchRecentEvents(stripeKey);

    let mrrAnalyst = 0;
    let mrrPro = 0;
    let mrrFounding = 0;
    let active = 0;
    let canceling = 0;
    let canceled = 0;
    let foundingActive = 0;
    let analystCount = 0;
    let proCount = 0;

    for (const s of subs) {
      const metaTier = s.metadata.tier;
      const priceId = s.items.data[0]?.price.id ?? '';
      const amt = (s.items.data[0]?.price.unit_amount ?? 0) * (s.items.data[0]?.quantity ?? 1);
      // Stripe amount is in minor units (cents) — normalize to dollars.
      const dollars = amt / 100;

      const tier: 'analyst' | 'pro' | 'founding' | 'other' =
        metaTier === 'analyst' || metaTier === 'pro' || metaTier === 'founding'
          ? metaTier
          : priceId && priceId === analystPrice
            ? 'analyst'
            : priceId && priceId === proPrice
              ? 'pro'
              : priceId && priceId === foundingPrice
                ? 'founding'
                : 'other';

      if (s.status === 'active' || s.status === 'trialing') {
        active++;
        if (s.cancel_at_period_end) canceling++;
        if (tier === 'analyst') {
          mrrAnalyst += dollars;
          analystCount++;
        } else if (tier === 'pro') {
          mrrPro += dollars;
          proCount++;
        } else if (tier === 'founding') {
          mrrFounding += dollars;
          foundingActive++;
        }
      } else if (s.status === 'canceled') {
        canceled++;
      }
    }

    const mrr = mrrAnalyst + mrrPro + mrrFounding;

    // Churn: cancellations in last 30d / active at start of window.
    const thirtyDaysAgo = Date.now() / 1000 - 30 * 86400;
    const canceled30d = subs.filter((s) => s.canceled_at && s.canceled_at > thirtyDaysAgo).length;
    const activeAtStart = active + canceled30d;
    const churn30dPct = activeAtStart > 0 ? Math.round((canceled30d / activeAtStart) * 1000) / 10 : 0;

    // MTD new / churned.
    const mtdStart = mtdEpoch();
    const mtdNew = subs.filter((s) => s.created > mtdStart).length;
    const mtdChurned = subs.filter((s) => s.canceled_at && s.canceled_at > mtdStart).length;

    // Recent events for the timeline.
    const recent = events.slice(0, 25).map((e) => {
      const obj = e.data.object as { amount?: number; metadata?: Record<string, string>; customer_email?: string };
      return {
        type: e.type,
        at: new Date(e.created * 1000).toISOString(),
        amount: typeof obj.amount === 'number' ? obj.amount / 100 : null,
        tier: obj.metadata?.tier ?? null,
        customer_email: obj.customer_email ?? null,
      };
    });

    // Founding reservation count from KV so we don't miss in-flight checkouts.
    let foundingReserved = 0;
    try {
      const kvUrl = process.env.KV_REST_API_URL;
      const kvToken = process.env.KV_REST_API_TOKEN;
      if (kvUrl && kvToken) {
        const r = await fetch(`${kvUrl}/get/stripe-founding-reserved`, {
          headers: { Authorization: `Bearer ${kvToken}` },
        });
        if (r.ok) {
          const d = (await r.json()) as { result: string | null };
          foundingReserved = parseInt(d.result ?? '0', 10) || 0;
        }
      }
    } catch {
      /* non-fatal */
    }

    return res.json({
      mrr: { total: round(mrr), analyst: round(mrrAnalyst), pro: round(mrrPro), founding: round(mrrFounding) },
      arr: round(mrr * 12),
      subs: { active, canceling, canceled, total: subs.length },
      by_tier: { analyst: analystCount, pro: proCount, founding: foundingActive },
      founding: {
        cap: foundingCap,
        active: foundingActive,
        reserved: foundingReserved,
        remaining: Math.max(0, foundingCap - foundingActive - foundingReserved),
      },
      mtd_new: mtdNew,
      mtd_churned: mtdChurned,
      churn_30d_pct: churn30dPct,
      recent_events: recent,
      fetched_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[admin/revenue]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'stripe_query_failed' });
  }
}

async function fetchAllSubscriptions(stripeKey: string): Promise<StripeSub[]> {
  const out: StripeSub[] = [];
  let startingAfter: string | null = null;
  for (let page = 0; page < 3; page++) {
    const url = new URL('https://api.stripe.com/v1/subscriptions');
    url.searchParams.set('limit', '100');
    url.searchParams.set('status', 'all');
    url.searchParams.set('expand[]', 'data.items.data.price');
    if (startingAfter) url.searchParams.set('starting_after', startingAfter);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${stripeKey}` },
    });
    if (!res.ok) throw new Error(`stripe_${res.status}`);
    const data = (await res.json()) as StripeListResp<StripeSub>;
    out.push(...data.data);
    if (!data.has_more || data.data.length === 0) break;
    startingAfter = data.data[data.data.length - 1].id;
  }
  return out;
}

async function fetchRecentEvents(stripeKey: string): Promise<StripeEvent[]> {
  const url = new URL('https://api.stripe.com/v1/events');
  url.searchParams.set('limit', '50');
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${stripeKey}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as StripeListResp<StripeEvent>;
  return data.data ?? [];
}

function mtdEpoch(): number {
  const d = new Date();
  return Math.floor(new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
