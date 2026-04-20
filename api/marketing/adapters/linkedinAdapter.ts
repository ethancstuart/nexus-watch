/**
 * LinkedIn Company Page adapter — posts via Typefully relay (preferred)
 * or LinkedIn Marketing API directly.
 *
 * Typefully (recommended): one credential covers X + LinkedIn + Threads.
 * Set TYPEFULLY_API_KEY and TYPEFULLY_LINKEDIN_ENABLED=true.
 *
 * Direct (fallback): LinkedIn Marketing API requires:
 *   LINKEDIN_ACCESS_TOKEN  — OAuth2 token with w_organization_social
 *   LINKEDIN_ORG_URN       — urn:li:organization:{id} of the Company Page
 */

import { type AdapterPostResult, type PlatformAdapter, shadowResult, stubResult } from './types.js';

const LINKEDIN_POSTS_URL = 'https://api.linkedin.com/v2/ugcPosts';
const TYPEFULLY_DRAFT_URL = 'https://api.typefully.com/v1/drafts/';

async function postViaTypefully(content: string): Promise<AdapterPostResult> {
  const apiKey = process.env.TYPEFULLY_API_KEY;
  if (!apiKey) return { ok: false, error: 'TYPEFULLY_API_KEY not set' };
  if (process.env.TYPEFULLY_LINKEDIN_ENABLED !== 'true') {
    return { ok: false, error: 'TYPEFULLY_LINKEDIN_ENABLED not enabled' };
  }
  try {
    const res = await fetch(TYPEFULLY_DRAFT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify({
        content,
        share: true,
        share_to: ['linkedin'],
        schedule_date: 'next-free-slot',
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: `typefully-li ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string; share_url?: string };
    return {
      ok: true,
      platform_post_id: data.id ? `typefully-li:${data.id}` : undefined,
      platform_url: data.share_url,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function postViaLinkedInAPI(content: string): Promise<AdapterPostResult> {
  const token = process.env.LINKEDIN_ACCESS_TOKEN;
  const orgUrn = process.env.LINKEDIN_ORG_URN;
  if (!token || !orgUrn) {
    return { ok: false, error: 'LINKEDIN_ACCESS_TOKEN or LINKEDIN_ORG_URN not set' };
  }
  try {
    const res = await fetch(LINKEDIN_POSTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Restli-Protocol-Version': '2.0.0',
      },
      body: JSON.stringify({
        author: orgUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
          'com.linkedin.ugc.ShareContent': {
            shareCommentary: { text: content },
            shareMediaCategory: 'NONE',
          },
        },
        visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: `linkedin ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string };
    return {
      ok: true,
      platform_post_id: data.id ? `linkedin:${data.id}` : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const linkedinAdapter: PlatformAdapter = {
  platform: 'linkedin',
  async post(input, shadow) {
    if (shadow) return shadowResult('linkedin', input.content);
    if (process.env.TYPEFULLY_API_KEY && process.env.TYPEFULLY_LINKEDIN_ENABLED === 'true') {
      return postViaTypefully(input.content);
    }
    if (process.env.LINKEDIN_ACCESS_TOKEN && process.env.LINKEDIN_ORG_URN) {
      return postViaLinkedInAPI(input.content);
    }
    return stubResult('linkedin', input.content);
  },
};
