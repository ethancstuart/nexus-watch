/**
 * Substack adapter — emails the long-form draft to the publication's
 * inbound email-to-post address. Substack does not expose a public
 * posting API on the free tier; email-to-post is the supported
 * integration path.
 *
 * Setup:
 *   1. Open the publication's settings → Publishing → Email-to-post
 *   2. Copy the inbound address (e.g. xxx@inbound.substack.com)
 *   3. Set SUBSTACK_EMAIL_TO_POST env var
 *
 * Uses Resend (already integrated for transactional email) to send.
 */

import { Resend } from 'resend';
import { type PlatformAdapter, shadowResult, stubResult } from './types';

interface MarkdownPost {
  title: string;
  body: string;
}

/**
 * Splits a Claude-generated long-form into a title (first line if it
 * starts with a heading or short hook) and body (rest). Falls back to
 * "NexusWatch — YYYY-MM-DD" if no clear title.
 */
function splitTitleAndBody(content: string): MarkdownPost {
  const lines = content.trim().split('\n');
  const first = lines[0]?.trim() ?? '';
  // Markdown H1
  if (first.startsWith('# ')) {
    return { title: first.slice(2).trim(), body: lines.slice(1).join('\n').trim() };
  }
  // Short first line (≤120 chars, no period at end → likely a title)
  if (first.length > 0 && first.length <= 120 && !/[.!?]$/.test(first) && lines.length > 1) {
    return { title: first, body: lines.slice(1).join('\n').trim() };
  }
  return {
    title: `NexusWatch — ${new Date().toISOString().slice(0, 10)}`,
    body: content.trim(),
  };
}

export const substackAdapter: PlatformAdapter = {
  platform: 'substack',
  async post(input, shadow) {
    if (shadow) return shadowResult('substack', input.content);
    const inboundAddr = process.env.SUBSTACK_EMAIL_TO_POST;
    const resendKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.MARKETING_FROM_EMAIL || 'engine@nexuswatch.dev';
    if (!inboundAddr || !resendKey) {
      return stubResult('substack', input.content);
    }
    const { title, body } = splitTitleAndBody(input.content);
    try {
      const resend = new Resend(resendKey);
      const result = await resend.emails.send({
        from: `NexusWatch Engine <${fromEmail}>`,
        to: inboundAddr,
        subject: title,
        text: body,
      });
      if (result.error) {
        return { ok: false, error: `resend: ${result.error.message}` };
      }
      return {
        ok: true,
        platform_post_id: result.data?.id ? `substack-email:${result.data.id}` : undefined,
        platform_url: undefined,
      };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  },
};
