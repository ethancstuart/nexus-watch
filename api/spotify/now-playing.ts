import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'edge' };

const KV_URL = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

interface SpotifyArtist {
  name: string;
}

interface SpotifyImage {
  url: string;
  width: number;
  height: number;
}

interface SpotifyAlbum {
  name: string;
  images: SpotifyImage[];
}

interface SpotifyTrackItem {
  id: string;
  name: string;
  artists: SpotifyArtist[];
  album: SpotifyAlbum;
  duration_ms: number;
}

interface SpotifyCurrentlyPlaying {
  is_playing: boolean;
  progress_ms: number;
  item: SpotifyTrackItem;
}

interface SpotifyRecentItem {
  track: SpotifyTrackItem;
  played_at: string;
}

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

  if (!KV_URL || !KV_TOKEN) {
    return new Response(JSON.stringify({ error: 'KV not configured' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Get tokens from KV
  const kvRes = await fetch(`${KV_URL}/get/spotify:${userId}`, {
    headers: { Authorization: `Bearer ${KV_TOKEN}` },
  });
  const kvData = (await kvRes.json()) as { result: string | null };
  if (!kvData.result) {
    return new Response(JSON.stringify({ error: 'Spotify not connected' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let tokens: SpotifyTokens = JSON.parse(kvData.result);

  // Refresh token if expired
  if (Date.now() >= tokens.expiresAt - 60000) {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return new Response(JSON.stringify({ error: 'Spotify not configured' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const refreshRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: tokens.refreshToken,
      }),
    });

    if (!refreshRes.ok) {
      return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const refreshed = (await refreshRes.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    tokens = {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token || tokens.refreshToken,
      expiresAt: Date.now() + refreshed.expires_in * 1000,
    };

    // Store updated tokens
    await fetch(`${KV_URL}/set/spotify:${userId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: JSON.stringify(tokens),
    });
  }

  // Fetch currently playing
  const currentRes = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${tokens.accessToken}` },
  });

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  };

  // 204 = nothing playing
  if (currentRes.status === 204 || currentRes.status === 202) {
    // Fetch recent tracks instead
    const recentRes = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=10', {
      headers: { Authorization: `Bearer ${tokens.accessToken}` },
    });

    if (!recentRes.ok) {
      return new Response(
        JSON.stringify({ currentTrack: null, recentTracks: [], isPlaying: false, fetchedAt: Date.now() }),
        { headers },
      );
    }

    const recentData = (await recentRes.json()) as { items: SpotifyRecentItem[] };
    const recentTracks = (recentData.items || []).map((item) => ({
      id: item.track.id,
      name: item.track.name,
      artist: item.track.artists.map((a) => a.name).join(', '),
      album: item.track.album.name,
      albumArt:
        item.track.album.images.find((i) => i.width === 64)?.url ||
        item.track.album.images[item.track.album.images.length - 1]?.url ||
        '',
      durationMs: item.track.duration_ms,
      progressMs: 0,
    }));

    return new Response(JSON.stringify({ currentTrack: null, recentTracks, isPlaying: false, fetchedAt: Date.now() }), {
      headers,
    });
  }

  if (!currentRes.ok) {
    return new Response(JSON.stringify({ error: 'Failed to fetch currently playing' }), {
      status: 500,
      headers,
    });
  }

  const currentData = (await currentRes.json()) as SpotifyCurrentlyPlaying;
  const track = currentData.item;

  const currentTrack = {
    id: track.id,
    name: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    album: track.album.name,
    albumArt:
      track.album.images.find((i) => i.width === 64)?.url ||
      track.album.images[track.album.images.length - 1]?.url ||
      '',
    durationMs: track.duration_ms,
    progressMs: currentData.progress_ms || 0,
  };

  return new Response(
    JSON.stringify({
      currentTrack,
      recentTracks: [],
      isPlaying: currentData.is_playing,
      fetchedAt: Date.now(),
    }),
    { headers },
  );
}
