/**
 * IP-based rate limiter backed by Upstash KV.
 *
 * Use this on any unauthenticated endpoint that can drain quota or run
 * up cost (Anthropic spend, Windy webcam, etc.).
 *
 *   const rl = await rateLimit(req, { key: 'briefs-sample', limit: 30, windowSec: 60 });
 *   if (!rl.ok) return res.status(429).setHeader('Retry-After', String(rl.retryAfterSec)).json({...});
 *
 * Algorithm: sliding fixed-window via INCR + EX. Each (key, ip) pair gets a
 * counter that resets after `windowSec`. Requests beyond `limit` in the
 * window get rejected.
 *
 * Silently no-ops when KV env is missing (so dev still works).
 *
 * 2026-05-02 L2.
 */

import type { VercelRequest } from '@vercel/node';

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  limit: number;
  retryAfterSec: number;
}

interface RateLimitOpts {
  /** Logical bucket name (e.g., 'briefs-sample'). Combined with IP. */
  key: string;
  /** Max requests per window. */
  limit: number;
  /** Window length in seconds. */
  windowSec: number;
}

function getClientIp(req: VercelRequest): string {
  // Vercel sets x-forwarded-for; first hop is the client.
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff.length > 0) return xff[0].split(',')[0].trim();
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string') return realIp;
  return 'unknown';
}

async function kvIncrEx(bucketKey: string, ttlSec: number): Promise<number> {
  if (!KV_URL || !KV_TOKEN) return 0;
  try {
    // Atomic pipeline: INCR then EXPIRE on first hit only.
    const url = `${KV_URL}/pipeline`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([
        ['INCR', bucketKey],
        ['EXPIRE', bucketKey, String(ttlSec), 'NX'],
      ]),
    });
    if (!res.ok) return 0;
    const data = (await res.json()) as Array<{ result: number | string }>;
    const incr = Number(data[0]?.result ?? 0);
    return incr;
  } catch {
    return 0;
  }
}

export async function rateLimit(req: VercelRequest, opts: RateLimitOpts): Promise<RateLimitResult> {
  // No KV configured = no rate limit (dev path).
  if (!KV_URL || !KV_TOKEN) {
    return { ok: true, remaining: opts.limit, limit: opts.limit, retryAfterSec: 0 };
  }
  const ip = getClientIp(req);
  const bucket = `nw:rl:${opts.key}:${ip}`;
  const count = await kvIncrEx(bucket, opts.windowSec);
  // If KV failed, count = 0 → fail open. We prefer availability over
  // strict enforcement here.
  if (count === 0) {
    return { ok: true, remaining: opts.limit, limit: opts.limit, retryAfterSec: 0 };
  }
  const ok = count <= opts.limit;
  const remaining = Math.max(0, opts.limit - count);
  return {
    ok,
    remaining,
    limit: opts.limit,
    retryAfterSec: ok ? 0 : opts.windowSec,
  };
}

/**
 * Convenience: returns true if request should be denied. Sets standard
 * rate-limit headers on the response either way. Caller still must
 * issue the 429 status + body.
 */
export function applyRateLimitHeaders(
  res: { setHeader: (name: string, value: string | number) => unknown },
  result: RateLimitResult,
): void {
  res.setHeader('X-RateLimit-Limit', result.limit);
  res.setHeader('X-RateLimit-Remaining', result.remaining);
  if (!result.ok) {
    res.setHeader('Retry-After', result.retryAfterSec);
  }
}
