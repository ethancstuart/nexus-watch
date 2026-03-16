import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'edge' };

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req: VercelRequest, _res: VercelResponse) {
  // Get userId from session cookie
  const cookies = (req.headers as unknown as Record<string, string>)['cookie'] || '';
  const sessionMatch = cookies.match(/dashview-session=([^;]+)/);
  if (!sessionMatch) {
    return new Response(JSON.stringify({ error: 'Not authenticated' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const userId = sessionMatch[1];

  // Delete tokens from KV
  if (KV_URL && KV_TOKEN) {
    await fetch(`${KV_URL}/del/spotify:${userId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
