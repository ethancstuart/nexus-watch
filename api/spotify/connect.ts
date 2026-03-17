import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'edge' };

export default async function handler(req: VercelRequest, _res: VercelResponse) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) {
    return new Response(JSON.stringify({ error: 'Spotify not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url!, 'https://localhost');
  const origin =
    url.origin === 'https://localhost'
      ? process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:5173'
      : url.origin;
  const redirectUri = `${origin}/api/spotify/callback`;

  const scopes = 'user-read-currently-playing user-read-recently-played';

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);

  return Response.redirect(authUrl.toString(), 302);
}
