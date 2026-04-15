/**
 * Medium adapter — posts via Medium's official integration token API.
 *
 * Setup:
 *   1. Get integration token: https://medium.com/me/settings/security
 *   2. Get user id: GET https://api.medium.com/v1/me with Bearer token
 *   3. (Optional) Get publication id: GET /v1/users/{userId}/publications
 *   4. Set MEDIUM_INTEGRATION_TOKEN, MEDIUM_USER_ID, MEDIUM_PUBLICATION_ID
 *
 * Cross-post behavior: Medium posts ALWAYS include a canonical URL
 * pointing back to the original Substack issue. This is critical for
 * SEO — without canonical, Medium can outrank Substack on search.
 *
 * The cross-post lag (24h after Substack publish) is enforced by the
 * marketing-medium cron schedule, not by this adapter.
 */

import { type AdapterPostInput, type AdapterPostResult, type PlatformAdapter, shadowResult, stubResult } from './types';

const MEDIUM_API = 'https://api.medium.com/v1';

async function postToMedium(input: AdapterPostInput): Promise<AdapterPostResult> {
  const token = process.env.MEDIUM_INTEGRATION_TOKEN;
  const userId = process.env.MEDIUM_USER_ID;
  const pubId = process.env.MEDIUM_PUBLICATION_ID;
  if (!token || !userId) {
    return { ok: false, error: 'MEDIUM_INTEGRATION_TOKEN or MEDIUM_USER_ID not set' };
  }

  // Title heuristic — first line if it looks like a title.
  const lines = input.content.split('\n');
  const firstLine = (lines[0] ?? '').replace(/^#\s+/, '').trim();
  const title =
    firstLine.length > 0 && firstLine.length <= 120
      ? firstLine
      : `NexusWatch Brief — ${new Date().toISOString().slice(0, 10)}`;
  const bodyMarkdown = firstLine === title ? lines.slice(1).join('\n').trim() : input.content;

  const canonicalUrl =
    typeof input.metadata?.canonical_url === 'string' ? (input.metadata.canonical_url as string) : undefined;

  const endpoint = pubId
    ? `${MEDIUM_API}/publications/${encodeURIComponent(pubId)}/posts`
    : `${MEDIUM_API}/users/${encodeURIComponent(userId)}/posts`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      body: JSON.stringify({
        title,
        contentFormat: 'markdown',
        content: bodyMarkdown,
        canonicalUrl,
        publishStatus: 'public',
        tags: ['geopolitics', 'intelligence', 'OSINT', 'NexusWatch'],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: `medium ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { data?: { id?: string; url?: string } };
    return {
      ok: true,
      platform_post_id: data.data?.id ? `medium:${data.data.id}` : undefined,
      platform_url: data.data?.url,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const mediumAdapter: PlatformAdapter = {
  platform: 'medium',
  async post(input, shadow) {
    if (shadow) return shadowResult('medium', input.content);
    if (!process.env.MEDIUM_INTEGRATION_TOKEN) {
      return stubResult('medium', input.content);
    }
    return postToMedium(input);
  },
};
