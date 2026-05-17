/**
 * /api/voice/ask — text-in, text-out analyst reply.
 *
 * Body: { text: string }
 * Returns: { transcript, ms }
 *
 * Browser-side speechSynthesis turns the transcript into audio — no
 * OpenAI TTS dependency, no Blob storage required. Truly free per call.
 *
 * Rate-limit: 10/day per IP. Budget gate enforces the LLM cap.
 *
 * 2026-05 tier-up Phase 4 (polish: free-only).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { checkBudget } from '../_lib/llm-budget.js';
import { singleAnthropic } from '../_lib/anthropic-fanout.js';
import { rateLimit } from '../_lib/rateLimit.js';

export const config = { runtime: 'nodejs', maxDuration: 20 };

const SYSTEM = `You are the NexusWatch voice analyst. Reply in 60 spoken words or fewer. Be terse and factual. End with the single most important takeaway. Spell out numbers and acronyms ("C-I-I of seventy-three"). No markdown, no lists, no emojis — this is being read aloud.`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const rl = await rateLimit(req, { key: 'voice-ask', limit: 10, windowSec: 86_400 });
  if (!rl.ok) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return res.status(429).json({ error: 'rate_limited', limit: rl.limit, retry_after_sec: rl.retryAfterSec });
  }

  const gate = await checkBudget({ endpoint: 'voice-ask', bypassCap: false });
  if (!gate.ok) return res.status(503).json(gate);

  const body = req.body as { text?: string };
  const text = (body?.text ?? '').trim();
  if (!text) return res.status(400).json({ error: 'text required' });
  if (text.length > 500) return res.status(400).json({ error: 'text too long (max 500 chars)' });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

  const t0 = Date.now();
  const ai = await singleAnthropic(
    {
      label: 'voice-ask:analyst',
      model: 'haiku',
      timeoutMs: 12_000,
      body: {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 250,
        system: SYSTEM,
        messages: [{ role: 'user', content: text }],
      },
    },
    anthropicKey,
  );
  if (!ai.ok || !ai.data) return res.status(502).json({ error: 'analyst_failed', detail: ai.error });

  const transcript = extractText(ai.data);
  if (!transcript) return res.status(502).json({ error: 'empty_response' });

  return res.json({ ok: true, transcript, ms: Date.now() - t0 });
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>;
}
function extractText(data: unknown): string {
  if (!data) return '';
  const r = data as AnthropicResponse;
  if (!Array.isArray(r.content)) return '';
  return r.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('');
}
