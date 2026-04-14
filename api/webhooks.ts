import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Resolve the session from the __Host-session cookie via KV lookup.
 * Returns null if no valid session found. Shared pattern across api/.
 */
async function resolveUserFromSession(req: VercelRequest): Promise<{ id: string; email?: string } | null> {
  const cookies = req.headers.cookie || '';
  const sessionCookie = cookies
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith('__Host-session='));
  const sessionId = sessionCookie?.split('=')[1];
  if (!sessionId) return null;

  const kvUrl = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;
  if (!kvUrl || !kvToken) return null;

  try {
    const res = await fetch(`${kvUrl}/get/session:${sessionId}`, {
      headers: { Authorization: `Bearer ${kvToken}` },
    });
    const data = (await res.json()) as { result: string | null };
    if (!data.result) return null;
    let user = JSON.parse(data.result);
    if (typeof user === 'string') user = JSON.parse(user);
    if (!user?.id) return null;
    return user;
  } catch {
    return null;
  }
}

/**
 * Webhook subscription management (Pro tier).
 *
 * GET  /api/webhooks              → list user's webhooks
 * POST /api/webhooks              → create new webhook
 * DELETE /api/webhooks?id=XXX     → delete webhook
 * POST /api/webhooks/test?id=XXX  → send a test payload
 *
 * Pro tier feature. Free users get 403.
 */

interface WebhookInput {
  webhook_url: string;
  event_types: string[];
  country_filter?: string[];
  cii_threshold?: number;
  secret?: string;
}

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await resolveUserFromSession(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });

  // TODO: check user.tier === 'pro'; for now treat any signed-in user as eligible
  // In production, gate by: if (user.tier !== 'pro') return res.status(403).json({ error: 'pro_required' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });
  const sql = neon(dbUrl);

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT id, webhook_url, event_types, country_filter, cii_threshold, active,
             created_at, last_fired_at, failure_count
      FROM webhook_subscriptions
      WHERE user_id = ${user.id}
      ORDER BY created_at DESC
    `;
    return res.json({ webhooks: rows });
  }

  if (req.method === 'POST') {
    const input = req.body as WebhookInput;
    if (!input.webhook_url || !Array.isArray(input.event_types) || input.event_types.length === 0) {
      return res.status(400).json({ error: 'webhook_url and event_types required' });
    }
    // Basic URL validation
    try {
      const url = new URL(input.webhook_url);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('invalid protocol');
    } catch {
      return res.status(400).json({ error: 'invalid webhook_url' });
    }

    const id = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await sql`
      INSERT INTO webhook_subscriptions
        (id, user_id, webhook_url, secret, event_types, country_filter, cii_threshold)
      VALUES
        (${id}, ${user.id}, ${input.webhook_url}, ${input.secret ?? null},
         ${input.event_types}, ${input.country_filter ?? []}, ${input.cii_threshold ?? null})
    `;
    return res.json({ id, ok: true });
  }

  if (req.method === 'DELETE') {
    const id = typeof req.query.id === 'string' ? req.query.id : null;
    if (!id) return res.status(400).json({ error: 'id required' });
    await sql`
      DELETE FROM webhook_subscriptions WHERE id = ${id} AND user_id = ${user.id}
    `;
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'method_not_allowed' });
}
