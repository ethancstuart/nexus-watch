/**
 * API v1 Authentication + Rate Limiting
 *
 * API keys are stored in Postgres (api_keys table).
 * Rate limiting tracked in-memory with module-level Map (Fluid Compute reuses instances).
 * Falls back to IP-based limiting for unauthenticated requests.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { createHash } from 'crypto';

interface ApiKeyInfo {
  id: number;
  name: string;
  tier: string;
  rateLimit: number;
}

// In-memory rate limit counters (reset every minute)
const rateCounts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 60_000; // 1 minute window

// Free tier limits for unauthenticated requests
const FREE_RATE_LIMIT = 10; // 10 req/min

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

function checkRateLimit(identifier: string, limit: number): boolean {
  const now = Date.now();
  const entry = rateCounts.get(identifier);

  if (!entry || now > entry.resetAt) {
    rateCounts.set(identifier, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

export async function authenticateRequest(
  req: VercelRequest,
  res: VercelResponse,
): Promise<{ authenticated: boolean; tier: string; keyInfo?: ApiKeyInfo } | null> {
  const authHeader = req.headers.authorization;

  // No auth header → free tier with IP-based rate limiting
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 'unknown';
    if (!checkRateLimit(`ip:${ip}`, FREE_RATE_LIMIT)) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        limit: FREE_RATE_LIMIT,
        window: '1 minute',
        message: 'Add an API key for higher limits. See /api/v1/docs',
      });
      return null;
    }
    return { authenticated: false, tier: 'free' };
  }

  // Validate API key
  const apiKey = authHeader.slice(7);
  const keyHash = hashKey(apiKey);

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return { authenticated: false, tier: 'free' };
  }

  try {
    const sql = neon(dbUrl);
    const rows = await sql`
      SELECT id, name, tier, rate_limit FROM api_keys WHERE key_hash = ${keyHash}
    `;

    if (rows.length === 0) {
      res.status(401).json({ error: 'Invalid API key' });
      return null;
    }

    const key = rows[0] as { id: number; name: string; tier: string; rate_limit: number };
    const keyInfo: ApiKeyInfo = { id: key.id, name: key.name, tier: key.tier, rateLimit: key.rate_limit };

    // Rate limit by key
    if (!checkRateLimit(`key:${key.id}`, keyInfo.rateLimit)) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        limit: keyInfo.rateLimit,
        window: '1 minute',
        tier: keyInfo.tier,
      });
      return null;
    }

    // Update last_used (fire and forget)
    void sql`UPDATE api_keys SET last_used = NOW() WHERE id = ${key.id}`;

    return { authenticated: true, tier: keyInfo.tier, keyInfo };
  } catch {
    // DB error → allow through as free tier
    return { authenticated: false, tier: 'free' };
  }
}

/** Generate a new API key and store its hash */
export async function createApiKey(name: string, tier = 'free', rateLimit = 100): Promise<{ key: string; id: number } | null> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return null;

  const key = `nw_${tier}_${crypto.randomUUID().replace(/-/g, '')}`;
  const keyHash = hashKey(key);

  try {
    const sql = neon(dbUrl);
    const rows = await sql`
      INSERT INTO api_keys (key_hash, name, tier, rate_limit)
      VALUES (${keyHash}, ${name}, ${tier}, ${rateLimit})
      RETURNING id
    `;
    return { key, id: rows[0].id as number };
  } catch {
    return null;
  }
}
