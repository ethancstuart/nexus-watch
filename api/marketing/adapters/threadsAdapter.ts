/**
 * Threads adapter — posts via Meta's Threads Graph API.
 *
 * Setup:
 *   1. Create the @nexuswatchintel Threads account (requires Instagram)
 *   2. App via developers.facebook.com → Threads use case
 *   3. Get long-lived user access token + user id
 *   4. Set THREADS_ACCESS_TOKEN and THREADS_USER_ID
 *
 * Posting is a two-step flow per Meta's API:
 *   1. POST /{user_id}/threads with media_type=TEXT and text=...
 *      → returns a creation_id
 *   2. POST /{user_id}/threads_publish with creation_id=...
 *      → publishes
 */

import { type AdapterPostResult, type PlatformAdapter, shadowResult, stubResult } from './types';

const META_API = 'https://graph.threads.net/v1.0';

async function postToThreads(content: string): Promise<AdapterPostResult> {
  const token = process.env.THREADS_ACCESS_TOKEN;
  const userId = process.env.THREADS_USER_ID;
  if (!token || !userId) {
    return { ok: false, error: 'THREADS_ACCESS_TOKEN or THREADS_USER_ID not set' };
  }
  try {
    // Step 1: create container.
    const containerRes = await fetch(`${META_API}/${encodeURIComponent(userId)}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        media_type: 'TEXT',
        text: content,
        access_token: token,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!containerRes.ok) {
      const t = await containerRes.text().catch(() => '');
      return { ok: false, error: `threads-container ${containerRes.status}: ${t.slice(0, 200)}` };
    }
    const containerData = (await containerRes.json()) as { id?: string };
    const creationId = containerData.id;
    if (!creationId) return { ok: false, error: 'threads: no creation_id returned' };

    // Step 2: publish.
    const publishRes = await fetch(`${META_API}/${encodeURIComponent(userId)}/threads_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: token }),
      signal: AbortSignal.timeout(15000),
    });
    if (!publishRes.ok) {
      const t = await publishRes.text().catch(() => '');
      return { ok: false, error: `threads-publish ${publishRes.status}: ${t.slice(0, 200)}` };
    }
    const publishData = (await publishRes.json()) as { id?: string };
    return {
      ok: true,
      platform_post_id: publishData.id ? `threads:${publishData.id}` : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const threadsAdapter: PlatformAdapter = {
  platform: 'threads',
  async post(input, shadow) {
    if (shadow) return shadowResult('threads', input.content);
    if (!process.env.THREADS_ACCESS_TOKEN || !process.env.THREADS_USER_ID) {
      return stubResult('threads', input.content);
    }
    return postToThreads(input.content);
  },
};
