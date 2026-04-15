/**
 * _discord/notify.ts — Discord approval-channel notifier
 *
 * Posts a rich embed to the configured Discord webhook every time a new
 * social_queue row lands with status='pending'. Chairman reacts on mobile
 * (✅ approve / ❌ reject / 🕒 hold / 🌐 open) either via:
 *
 *   Phase 1 (works today — just paste a webhook URL):
 *     - embed contains a click-through link to the web approval page at
 *       https://nexuswatch.dev/#/admin/social-queue?id=N. The channel acts
 *       as a push-notification inbox; approval itself happens in the web UI.
 *
 *   Phase 2 (requires Ethan to register a Discord Application):
 *     - the embed carries ActionRow with Approve/Reject/Hold buttons.
 *     - button clicks hit /api/discord/interactions (signed by Discord).
 *     - The same embed is edited in-place to show the decided state.
 *
 * Phase 2 is wired if DISCORD_APPLICATION_ID is set; otherwise Phase 1
 * link-only embed is sent. Either way, the queue row is unaffected — if
 * the webhook fails, the row is still enqueued and visible at
 * /#/admin/social-queue.
 *
 * All environment is read per-call so tests / crons can override via
 * process.env before invoking.
 */

export interface DiscordNotifyInput {
  queue_id: number;
  platform: string;
  action_type: string;
  draft_content: string;
  rationale?: string | null;
  source?: string | null;
  source_url?: string | null;
  voice_score?: number | null;
}

export interface DiscordNotifyResult {
  ok: boolean;
  message_id?: string;
  error?: string;
  skipped?: 'no_webhook' | 'disabled';
}

const BASE_URL = 'https://nexuswatch.dev';

function approvalUrl(queueId: number): string {
  return `${BASE_URL}/#/admin/social-queue?id=${queueId}`;
}

function scoreColor(score: number | null | undefined): number {
  if (score === null || score === undefined) return 0x888888;
  if (score >= 80) return 0x16a34a;
  if (score >= 60) return 0xeab308;
  if (score >= 40) return 0xf97316;
  return 0xdc2626;
}

function platformLabel(p: string): string {
  return p.toUpperCase();
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

/**
 * Post a fresh "approval needed" notification to the Discord webhook.
 * Returns { ok: true, message_id } on success — caller is expected to
 * persist message_id alongside the queue row so later decisions can edit
 * the message in-place.
 *
 * Non-blocking by design: on any error returns ok=false so enqueue can
 * keep going — the queue row is the source of truth, Discord is just UX.
 */
export async function postApprovalNeeded(input: DiscordNotifyInput): Promise<DiscordNotifyResult> {
  const webhookUrl = process.env.DISCORD_APPROVAL_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, skipped: 'no_webhook' };
  if (process.env.DISCORD_APPROVAL_ENABLED === 'false') return { ok: false, skipped: 'disabled' };

  const appId = process.env.DISCORD_APPLICATION_ID;
  const payload = buildApprovalPayload(input, Boolean(appId));

  try {
    // The `?wait=true` suffix makes Discord return the created message with
    // its id so we can edit the embed later.
    const url = webhookUrl.includes('wait=')
      ? webhookUrl
      : `${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}wait=true`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `discord_${res.status}: ${text.slice(0, 200)}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, message_id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}

export function buildApprovalPayload(input: DiscordNotifyInput, withButtons: boolean): Record<string, unknown> {
  const color = scoreColor(input.voice_score ?? null);
  const title = `Approval needed — ${platformLabel(input.platform)} ${input.action_type}`;

  const fields: Array<{ name: string; value: string; inline?: boolean }> = [];
  if (input.source) {
    fields.push({
      name: 'Source',
      value: input.source_url ? `[${truncate(input.source, 100)}](${input.source_url})` : truncate(input.source, 200),
      inline: false,
    });
  }
  if (input.rationale) {
    fields.push({ name: 'Why drafted', value: truncate(input.rationale, 300), inline: false });
  }
  if (typeof input.voice_score === 'number') {
    fields.push({ name: 'Voice score', value: `${input.voice_score}/100`, inline: true });
  }
  fields.push({ name: 'Queue id', value: `#${input.queue_id}`, inline: true });
  fields.push({
    name: 'Web approve',
    value: `[Open on nexuswatch.dev →](${approvalUrl(input.queue_id)})`,
    inline: false,
  });

  const embed = {
    title,
    description: truncate(input.draft_content, 1800),
    url: approvalUrl(input.queue_id),
    color,
    fields,
    footer: { text: 'NexusWatch · react ✅ approve · ❌ reject · 🕒 hold · 🌐 web' },
    timestamp: new Date().toISOString(),
  };

  const base: Record<string, unknown> = {
    username: 'NexusWatch',
    avatar_url: 'https://nexuswatch.dev/favicon.svg',
    embeds: [embed],
  };

  if (withButtons) {
    // Phase 2 — requires a Discord Application (not a plain webhook).
    // custom_id format: "sq:<action>:<queue_id>" — parsed by /api/discord/interactions
    base.components = [
      {
        type: 1, // ActionRow
        components: [
          {
            type: 2, // Button
            style: 3, // Success/green
            label: 'Approve',
            emoji: { name: '✅' },
            custom_id: `sq:approve:${input.queue_id}`,
          },
          {
            type: 2,
            style: 4, // Danger/red
            label: 'Reject',
            emoji: { name: '❌' },
            custom_id: `sq:reject:${input.queue_id}`,
          },
          {
            type: 2,
            style: 2, // Secondary/gray
            label: 'Hold',
            emoji: { name: '🕒' },
            custom_id: `sq:hold:${input.queue_id}`,
          },
          {
            type: 2,
            style: 5, // Link
            label: 'Open',
            emoji: { name: '🌐' },
            url: approvalUrl(input.queue_id),
          },
        ],
      },
    ];
  }

  return base;
}

/**
 * Edit an existing Discord message to reflect a decision (so the channel
 * history shows the outcome without new rows). Called from the interactions
 * handler and from the /api/admin/social/queue approve/reject endpoints.
 *
 * Requires DISCORD_BOT_TOKEN + DISCORD_APPLICATION_ID. If either is unset
 * we silently skip — the web approval UI remains the source of truth.
 */
export async function editApprovalMessage(
  messageId: string,
  decision: 'approved' | 'rejected' | 'held' | 'sent' | 'retracted',
  actor: string,
): Promise<DiscordNotifyResult> {
  const webhookUrl = process.env.DISCORD_APPROVAL_WEBHOOK_URL;
  if (!webhookUrl) return { ok: false, skipped: 'no_webhook' };
  // Webhook message edits use /webhooks/{id}/{token}/messages/{message_id}.
  const editUrl = `${webhookUrl}/messages/${messageId}`;
  const emoji =
    decision === 'approved'
      ? '✅'
      : decision === 'rejected'
        ? '❌'
        : decision === 'held'
          ? '🕒'
          : decision === 'sent'
            ? '📤'
            : '↩️';
  try {
    const res = await fetch(editUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: `${emoji} **${decision.toUpperCase()}** by ${actor} at ${new Date().toISOString()}`,
        // Blank out components so the buttons stop working.
        components: [],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { ok: false, error: `edit_${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true, message_id: messageId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}
