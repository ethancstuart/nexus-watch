import type { VercelRequest } from '@vercel/node';

/**
 * API key validation + rate limiting for v2 endpoints and MCP.
 *
 * Key types:
 *   - Full keys (API_V2_KEYS env var) — unlimited
 *   - Public MCP key (NW_MCP_PUBLIC_KEY env var) — rate-limited to 100/hour
 *
 * Rate limiting uses Vercel KV with a sliding window counter.
 */

interface AuthResult {
  valid: boolean;
  key: string | null;
  tier: 'full' | 'public' | 'none';
  rateLimited?: boolean;
}

export function extractApiKey(req: VercelRequest): string | null {
  const fromHeader = req.headers['x-api-key'];
  const fromQuery = typeof req.query.apikey === 'string' ? req.query.apikey : null;
  const key = (typeof fromHeader === 'string' ? fromHeader : fromQuery) || null;
  return key;
}

export async function validateApiKey(req: VercelRequest): Promise<AuthResult> {
  const key = extractApiKey(req);
  if (!key) return { valid: false, key: null, tier: 'none' };

  // Check full-access keys
  const fullKeys = (process.env.API_V2_KEYS || '').split(',').filter(Boolean);
  if (fullKeys.includes(key)) {
    return { valid: true, key, tier: 'full' };
  }

  // Check public MCP key
  const publicKey = process.env.NW_MCP_PUBLIC_KEY;
  if (publicKey && key === publicKey) {
    // Rate limit check
    const limited = await checkRateLimit(key, 100);
    if (limited) {
      return { valid: true, key, tier: 'public', rateLimited: true };
    }
    return { valid: true, key, tier: 'public' };
  }

  return { valid: false, key, tier: 'none' };
}

/**
 * Sliding window rate limit using Vercel KV.
 * Returns true if rate limited (over quota).
 */
async function checkRateLimit(key: string, maxPerHour: number): Promise<boolean> {
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return false; // No KV = no rate limiting

  const hourBucket = Math.floor(Date.now() / 3600000);
  const rlKey = `ratelimit:${key}:${hourBucket}`;

  try {
    // Atomic increment
    const incrRes = await fetch(`${kvUrl}/incr/${encodeURIComponent(rlKey)}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const incrData = (await incrRes.json()) as { result: number };
    const count = incrData.result;

    // Set TTL on first use (expire after 2 hours for cleanup)
    if (count === 1) {
      await fetch(`${kvUrl}/expire/${encodeURIComponent(rlKey)}/7200`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${kvToken}` },
      }).catch(() => {
        /* best-effort TTL */
      });
    }

    return count > maxPerHour;
  } catch {
    return false; // Fail open — don't block on KV errors
  }
}
