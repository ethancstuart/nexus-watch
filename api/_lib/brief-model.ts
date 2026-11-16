/**
 * The daily brief's one model call: which model, and the request built for it.
 *
 * WHY THIS FILE EXISTS: the model id used to be typed twice in
 * api/cron/daily-brief.ts, once for the request and once for the spend record.
 * Anthropic retires Claude Sonnet 4.5 on 2026-11-30
 * (platform.claude.com/docs/en/about-claude/model-deprecations, "Recommended
 * replacement: claude-sonnet-5-5"); after that the call fails and every brief
 * falls back to the mechanical edition. One setting, read in one place, means
 * the request and the spend record cannot name different models, and the next
 * retirement is an env var rather than a code change.
 *
 * This file deliberately holds NO host name and no URL. scripts/check-llm-spend.ts
 * finds billed call sites by the host literal in code, so the literal stays in
 * the file that actually makes the call (api/cron/daily-brief.ts), where that
 * guard can see it and require a gate and a spend record. An exported URL
 * constant here would let any new file call the API without the guard noticing.
 */

/** Default brief model. Needs nothing set in production. */
export const DEFAULT_BRIEF_MODEL = 'claude-sonnet-5-5';

/** Unchanged from the call as it was before this file existed. */
export const BRIEF_MAX_TOKENS = 6000;
export const BRIEF_TIMEOUT_MS = 240000;

type Env = Record<string, string | undefined>;

/**
 * The model to use: `BRIEF_MODEL` if set to something, else the default.
 * Trimmed; an empty or whitespace-only value is ignored, so a blank variable
 * in a dashboard cannot send an empty model name to the API.
 */
export function getBriefModel(env: Env = process.env): string {
  const override = env.BRIEF_MODEL?.trim();
  return override ? override : DEFAULT_BRIEF_MODEL;
}

export interface BriefRequestInput {
  apiKey: string;
  system: string;
  dataContext: string;
}

export interface BriefRequestBody {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: 'user'; content: string }>;
  /**
   * Only ever `between_tools`, only on the default model. Sonnet 5.5 runs
   * adaptive thinking when this is omitted, and max_tokens covers thinking
   * plus text, so the brief's 6000 would be shared with reasoning the brief
   * never had. `between_tools` is the documented way to keep the old
   * no-up-front-thinking behaviour on this model
   * (platform.claude.com/docs/en/models/sonnet-5-5/migration-guide,
   * "Turn off up-front thinking"); it is accepted at effort high or below and
   * high is this model's default. An overridden model may reject it, so it is
   * not sent there.
   */
  thinking?: { type: 'between_tools' };
}

export interface BriefRequest {
  headers: Record<string, string>;
  body: BriefRequestBody;
}

/**
 * Build the brief request's headers and body. Pure: no network, no clock, no
 * environment read other than the `env` passed in, and `input` is not mutated.
 * The caller supplies the URL, stringifies `body` and sends it.
 */
export function buildBriefRequest(input: BriefRequestInput, env: Env = process.env): BriefRequest {
  const model = getBriefModel(env);
  const body: BriefRequestBody = {
    model,
    max_tokens: BRIEF_MAX_TOKENS,
    system: input.system,
    messages: [
      {
        role: 'user',
        content: `Generate today's intelligence briefing.\n\n${input.dataContext}`,
      },
    ],
  };
  if (model === DEFAULT_BRIEF_MODEL) body.thinking = { type: 'between_tools' };
  return {
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': input.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body,
  };
}

/**
 * The brief text from a Messages response: every `text` block, in order.
 * Not `content[0].text`: Sonnet 5.5 responses can begin with a `thinking`
 * block, and reading index 0 would see no text and send every brief to the
 * mechanical fallback. Joining (rather than taking the first block) means a
 * reply the API ever splits across text blocks is not silently cut short.
 */
export function extractBriefText(
  // Index signature: real blocks carry more fields (`thinking`, `signature`, ...).
  content: ReadonlyArray<{ type?: string; text?: string; [field: string]: unknown }> | undefined,
): string {
  return (content ?? [])
    .filter((b) => b?.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
}
