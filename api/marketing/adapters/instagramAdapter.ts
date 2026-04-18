/**
 * Instagram adapter (D-7, 2026-04-18).
 *
 * Posts images via Meta's Instagram Graph API v18+.
 * Requires:
 *   - Instagram Business Account linked to a Facebook Page
 *   - INSTAGRAM_ACCESS_TOKEN (long-lived)
 *   - INSTAGRAM_USER_ID
 *
 * Flow:
 *   1. POST /{ig-user-id}/media with image_url + caption → creation_id
 *   2. POST /{ig-user-id}/media_publish with creation_id → published
 *
 * Instagram requires an image_url for every post (no text-only).
 * If no image_url is provided, the adapter returns a stub result.
 *
 * Image format: 1080x1080 square cards from /api/og/social?size=1080x1080
 */

import { type AdapterPostResult, type PlatformAdapter, shadowResult, stubResult } from './types.js';

const META_API = 'https://graph.facebook.com/v18.0';

async function postToInstagram(caption: string, imageUrl: string): Promise<AdapterPostResult> {
  const token = process.env.INSTAGRAM_ACCESS_TOKEN;
  const userId = process.env.INSTAGRAM_USER_ID;
  if (!token || !userId) {
    return { ok: false, error: 'INSTAGRAM_ACCESS_TOKEN or INSTAGRAM_USER_ID not set' };
  }

  try {
    // Step 1: Create media container
    const containerRes = await fetch(`${META_API}/${encodeURIComponent(userId)}/media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_url: imageUrl,
        caption,
        access_token: token,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!containerRes.ok) {
      const t = await containerRes.text().catch(() => '');
      return { ok: false, error: `instagram-container ${containerRes.status}: ${t.slice(0, 200)}` };
    }

    const containerData = (await containerRes.json()) as { id?: string };
    const creationId = containerData.id;
    if (!creationId) return { ok: false, error: 'instagram: no creation_id returned' };

    // Step 2: Publish
    const publishRes = await fetch(`${META_API}/${encodeURIComponent(userId)}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ creation_id: creationId, access_token: token }),
      signal: AbortSignal.timeout(30000),
    });

    if (!publishRes.ok) {
      const t = await publishRes.text().catch(() => '');
      return { ok: false, error: `instagram-publish ${publishRes.status}: ${t.slice(0, 200)}` };
    }

    const publishData = (await publishRes.json()) as { id?: string };
    return {
      ok: true,
      platform_post_id: publishData.id ? `instagram:${publishData.id}` : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const instagramAdapter: PlatformAdapter = {
  platform: 'instagram',
  async post(input, shadow) {
    if (shadow) return shadowResult('instagram', input.content);

    // Instagram requires an image — can't post text-only
    if (!input.image_url) {
      return {
        ok: false,
        error: 'Instagram requires an image_url. Generate one via /api/og/social first.',
      };
    }

    if (!process.env.INSTAGRAM_ACCESS_TOKEN || !process.env.INSTAGRAM_USER_ID) {
      return stubResult('instagram', input.content);
    }

    return postToInstagram(input.content, input.image_url);
  },
};
