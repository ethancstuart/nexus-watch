import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'edge' };

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

export default async function handler(req: VercelRequest, _res: VercelResponse) {
  const url = new URL(req.url!, 'https://localhost');
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error || !code) {
    return new Response(JSON.stringify({ error: error || 'No authorization code' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return new Response(JSON.stringify({ error: 'Spotify not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

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

  const origin = url.origin === 'https://localhost' ? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:5173') : url.origin;
  const redirectUri = `${origin}/api/spotify/callback`;

  // Exchange code for tokens
  const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response(JSON.stringify({ error: 'Token exchange failed', detail: err }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // Store tokens in KV
  if (KV_URL && KV_TOKEN) {
    await fetch(`${KV_URL}/set/spotify:${userId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: JSON.stringify({
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: Date.now() + tokens.expires_in * 1000,
      }),
    });
  }

  // Redirect back to app with connected param
  return Response.redirect(`${origin}/#/app?spotify=connected`, 302);
}
