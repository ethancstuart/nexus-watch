/**
 * X (Twitter) adapter — posts via Typefully API by default.
 *
 * Why Typefully: a $15/mo Typefully subscription cross-posts to X +
 * LinkedIn + Threads from a single API call, which is much cheaper
 * than X's $100/mo Basic API tier and covers the LinkedIn/Threads
 * adapters with the same credential.
 *
 * Fallback: if TYPEFULLY_API_KEY is missing but X_BEARER_TOKEN is
 * present, post directly via X API v2.
 *
 * If neither is present, returns stub result so the cron pipeline
 * can be exercised end-to-end without credentials.
 */

import {
  type AdapterPostInput,
  type AdapterPostResult,
  type PlatformAdapter,
  shadowResult,
  stubResult,
} from './types.js';

const TYPEFULLY_DRAFT_URL = 'https://api.typefully.com/v1/drafts/';
const X_API_TWEETS_URL = 'https://api.x.com/2/tweets';

async function postViaTypefully(
  content: string,
  format: AdapterPostInput['format'],
  imageUrl?: string,
): Promise<AdapterPostResult> {
  const apiKey = process.env.TYPEFULLY_API_KEY;
  if (!apiKey) return { ok: false, error: 'TYPEFULLY_API_KEY not set' };

  // Typefully accepts threaded content with \n\n\n\n between tweets.
  const body: Record<string, unknown> = {
    content: format === 'thread' ? content.split(/\n\n+/).join('\n\n\n\n') : content,
    threadify: false,
    share: true,
    auto_retweet_enabled: false,
    auto_plug_enabled: false,
    schedule_date: new Date().toISOString(),
  };

  // Pass image URL to Typefully if available (D-5 visual posts)
  if (imageUrl) {
    body.media_urls = [imageUrl];
  }

  try {
    const res = await fetch(TYPEFULLY_DRAFT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-KEY': apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: `typefully ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { id?: string; share_url?: string };
    return {
      ok: true,
      platform_post_id: data.id ? `typefully:${data.id}` : undefined,
      platform_url: data.share_url,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function postViaXAPI(content: string): Promise<AdapterPostResult> {
  const bearer = process.env.X_BEARER_TOKEN;
  if (!bearer) return { ok: false, error: 'X_BEARER_TOKEN not set' };
  try {
    const res = await fetch(X_API_TWEETS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify({ text: content }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return { ok: false, error: `x ${res.status}: ${t.slice(0, 200)}` };
    }
    const data = (await res.json()) as { data?: { id?: string } };
    return {
      ok: true,
      platform_post_id: data.data?.id ? `x:${data.data.id}` : undefined,
      platform_url: data.data?.id ? `https://x.com/i/web/status/${data.data.id}` : undefined,
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const xAdapter: PlatformAdapter = {
  platform: 'x',
  async post(input, shadow) {
    if (shadow) return shadowResult('x', input.content);
    if (process.env.TYPEFULLY_API_KEY) {
      return postViaTypefully(input.content, input.format, input.image_url);
    }
    if (process.env.X_BEARER_TOKEN) {
      return postViaXAPI(input.content);
    }
    return stubResult('x', input.content);
  },
};
