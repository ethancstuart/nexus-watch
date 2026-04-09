import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { createHash, randomUUID } from 'crypto';

export const config = { runtime: 'nodejs' };

const CORS = 'https://dashpulse.app';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const dbUrl = process.env.DATABASE_URL;
  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!dbUrl) return res.status(500).json({ error: 'Database not configured' });

  // Authenticate via session cookie
  const cookies = req.headers.cookie || '';
  const sessionCookie = cookies
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('__Host-session='));
  const sessionId = sessionCookie?.split('=')[1];

  if (!sessionId || !kvUrl || !kvToken) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // Verify session
  let userId: string;
  try {
    const kvRes = await fetch(`${kvUrl}/get/session:${sessionId}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const kvData = (await kvRes.json()) as { result: string | null };
    if (!kvData.result) return res.status(401).json({ error: 'Invalid session' });
    let user = JSON.parse(kvData.result);
    if (typeof user === 'string') user = JSON.parse(user);
    userId = user.id;
  } catch {
    return res.status(401).json({ error: 'Session verification failed' });
  }

  const sql = neon(dbUrl);

  if (req.method === 'GET') {
    // List user's API keys (without the actual key values)
    const rows = await sql`
      SELECT id, name, tier, rate_limit, created_at, last_used
      FROM api_keys WHERE name LIKE ${'user:' + userId + ':%'}
      ORDER BY created_at DESC
    `;
    return res.json({ keys: rows });
  }

  if (req.method === 'POST') {
    // Generate new API key
    const { name } = (req.body || {}) as { name?: string };
    const keyName = `user:${userId}:${name || 'default'}`;

    // Check limit (max 5 keys per user)
    const existing = await sql`
      SELECT COUNT(*) as count FROM api_keys WHERE name LIKE ${'user:' + userId + ':%'}
    `;
    if (Number(existing[0]?.count) >= 5) {
      return res.status(400).json({ error: 'Maximum 5 API keys per account' });
    }

    const rawKey = `nw_${randomUUID().replace(/-/g, '')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    await sql`
      INSERT INTO api_keys (key_hash, name, tier, rate_limit)
      VALUES (${keyHash}, ${keyName}, 'free', 100)
    `;

    // Return the key ONCE (never stored in plaintext)
    return res.json({
      key: rawKey,
      name: name || 'default',
      tier: 'free',
      rateLimit: 100,
      message: 'Save this key — it will not be shown again.',
    });
  }

  if (req.method === 'DELETE') {
    const { keyId } = (req.body || {}) as { keyId?: number };
    if (!keyId) return res.status(400).json({ error: 'keyId required' });

    await sql`
      DELETE FROM api_keys WHERE id = ${keyId} AND name LIKE ${'user:' + userId + ':%'}
    `;
    return res.json({ success: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
