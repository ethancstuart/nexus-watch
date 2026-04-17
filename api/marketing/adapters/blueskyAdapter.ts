/**
 * Bluesky adapter — posts via AT Protocol XRPC endpoints.
 *
 * Bluesky is free, no paid tier needed, and the AT Protocol is open.
 * Auth flow:
 *   1. POST /xrpc/com.atproto.server.createSession with { identifier, password }
 *      — identifier is the handle (nexuswatch.bsky.social), password is an
 *      app password from https://bsky.app/settings/app-passwords (NOT the
 *      account password)
 *   2. Use the returned accessJwt and did to POST to com.atproto.repo.createRecord
 *
 * For brevity v1 creates a fresh session per post. v2 should cache the
 * session JWT in KV for ~30min and only refresh on 401.
 */

import { type AdapterPostResult, type PlatformAdapter, shadowResult, stubResult } from './types.js';

const PDS = 'https://bsky.social';

interface BskySession {
  accessJwt: string;
  did: string;
  handle: string;
}

async function createSession(identifier: string, password: string): Promise<BskySession | null> {
  try {
    const res = await fetch(`${PDS}/xrpc/com.atproto.server.createSession`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return (await res.json()) as BskySession;
  } catch {
    return null;
  }
}

async function postToBluesky(content: string): Promise<AdapterPostResult> {
  const handle = process.env.BLUESKY_HANDLE;
  const appPassword = process.env.BLUESKY_APP_PASSWORD;
  if (!handle || !appPassword) {
    return { ok: false, error: 'BLUESKY_HANDLE or BLUESKY_APP_PASSWORD not set' };
  }
  const session = await createSession(handle, appPassword);
  if (!session) return { ok: false, error: 'bluesky: createSession failed' };

  // Bluesky enforces 300 grapheme limit. Trim defensively.
  const text = content.length > 300 ? content.slice(0, 297) + '...' : content;

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    langs: ['en'],
  };

  try {
    const res = await fetch(`${PDS}/xrpc/com.atproto.repo.createRecord`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.accessJwt}`,
      },
      body: JSON.stringify({
        repo: session.did,
        collection: 'app.bsky.feed.post',
        record,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: `bluesky ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { uri?: string; cid?: string };
    return {
      ok: true,
      platform_post_id: data.uri ? `bluesky:${data.uri}` : undefined,
      platform_url: data.uri
        ? `https://bsky.app/profile/${session.handle}/post/${data.uri.split('/').pop()}`
        : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const blueskyAdapter: PlatformAdapter = {
  platform: 'bluesky',
  async post(input, shadow) {
    if (shadow) return shadowResult('bluesky', input.content);
    if (!process.env.BLUESKY_HANDLE || !process.env.BLUESKY_APP_PASSWORD) {
      return stubResult('bluesky', input.content);
    }
    return postToBluesky(input.content);
  },
};
