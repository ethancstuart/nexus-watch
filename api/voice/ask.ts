/**
 * /api/voice/ask — text-in, audio-out single-shot voice agent.
 *
 * Body: { text: string }
 * Returns: { audio_url, transcript, ms }
 *
 * Pipeline:
 *   1. Pass text to /api/ai-analyst's single-persona prompt (Claude Haiku
 *      for latency)
 *   2. Capture full text response (no tool-use to keep response <8s)
 *   3. Synthesize via OpenAI tts-1 (voice=onyx)
 *   4. Upload mp3 to Vercel Blob, return URL
 *
 * Rate-limit: 10/day per IP. Budget gate enforces $10/day cap.
 *
 * 2026-05 tier-up Phase 4.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { uploadBlob, blobEnabled } from '../_lib/storage.js';
import { checkBudget, estimateOpenAiTtsCost, recordSpend } from '../_lib/llm-budget.js';
import { singleAnthropic } from '../_lib/anthropic-fanout.js';
import { rateLimit } from '../_lib/rateLimit.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

const SYSTEM = `You are the NexusWatch voice analyst. Reply to the user in 60 spoken words or fewer. Be terse, factual, and end with the single most important takeaway. Spell out numbers and acronyms ("C-I-I of seventy-three"). No markdown, no lists, no emojis — this is being read aloud.`;

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

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
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!anthropicKey || !openaiKey) return res.status(500).json({ error: 'missing_env' });
  if (!blobEnabled()) return res.status(503).json({ error: 'BLOB_READ_WRITE_TOKEN not configured' });

  const t0 = Date.now();

  // 1. Analyst response (Haiku for speed)
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
  if (!ai.ok || !ai.data) {
    return res.status(502).json({ error: 'analyst_failed', detail: ai.error });
  }
  const transcript = extractText(ai.data);
  if (!transcript) return res.status(502).json({ error: 'empty_response' });

  // 2. TTS via OpenAI
  const ttsRes = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'tts-1', voice: 'onyx', input: transcript, response_format: 'mp3' }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!ttsRes.ok) {
    const txt = await ttsRes.text().catch(() => '');
    return res.status(502).json({ error: 'tts_failed', status: ttsRes.status, body: txt.slice(0, 300) });
  }
  const mp3 = Buffer.from(await ttsRes.arrayBuffer());
  await recordSpend(estimateOpenAiTtsCost(transcript.length), 'voice-ask:tts');

  // 3. Upload — non-stable URL so each call gets its own blob
  const path = `voice/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`;
  const upload = await uploadBlob(path, mp3, {
    contentType: 'audio/mpeg',
    cacheMaxAge: 60,
    stableUrl: false,
  });

  return res.json({
    ok: true,
    audio_url: upload.url,
    transcript,
    ms: Date.now() - t0,
    bytes: mp3.length,
  });
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
