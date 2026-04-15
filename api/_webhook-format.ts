/**
 * Webhook payload formatters — auto-detects Slack/Discord/generic and
 * shapes the payload accordingly.
 *
 * Slack: Block Kit (https://api.slack.com/block-kit)
 * Discord: Embeds (https://discord.com/developers/docs/resources/webhook)
 * Generic: raw JSON
 */

export type WebhookEventType = 'cii_threshold' | 'verified_signal' | 'crisis_trigger' | 'scenario_match';

export interface WebhookEventPayload {
  event: WebhookEventType;
  country_code?: string;
  country_name?: string;
  cii_score?: number;
  confidence?: string;
  threshold?: number;
  description: string;
  timestamp: number;
  /** Link to relevant NexusWatch page. */
  link: string;
}

export function detectWebhookType(url: string): 'slack' | 'discord' | 'generic' {
  if (url.includes('hooks.slack.com')) return 'slack';
  if (url.includes('discord.com/api/webhooks') || url.includes('discordapp.com/api/webhooks')) return 'discord';
  return 'generic';
}

export function formatForWebhook(url: string, payload: WebhookEventPayload): Record<string, unknown> {
  const type = detectWebhookType(url);
  switch (type) {
    case 'slack':
      return formatSlack(payload);
    case 'discord':
      return formatDiscord(payload);
    default:
      return payload as unknown as Record<string, unknown>;
  }
}

function eventEmoji(event: WebhookEventType): string {
  switch (event) {
    case 'cii_threshold':
      return ':warning:';
    case 'verified_signal':
      return ':shield:';
    case 'crisis_trigger':
      return ':rotating_light:';
    case 'scenario_match':
      return ':bar_chart:';
  }
}

function scoreColor(score: number | undefined): string {
  if (score === undefined) return '#888888';
  if (score >= 75) return '#dc2626';
  if (score >= 50) return '#f97316';
  if (score >= 25) return '#eab308';
  return '#22c55e';
}

function formatSlack(payload: WebhookEventPayload): Record<string, unknown> {
  const name = payload.country_name || payload.country_code || '';
  const headerText =
    payload.event === 'cii_threshold'
      ? `CII Threshold Alert: ${name}`
      : payload.event === 'verified_signal'
        ? `Verified Signal: ${name}`
        : payload.event === 'crisis_trigger'
          ? `Crisis Triggered: ${name}`
          : `Scenario Matched: ${name}`;

  const fields: Array<{ type: string; text: string }> = [];
  if (payload.cii_score !== undefined) {
    fields.push({ type: 'mrkdwn', text: `*CII Score*\n${payload.cii_score}` });
  }
  if (payload.confidence) {
    fields.push({ type: 'mrkdwn', text: `*Confidence*\n${payload.confidence.toUpperCase()}` });
  }
  if (payload.threshold !== undefined) {
    fields.push({ type: 'mrkdwn', text: `*Threshold*\n${payload.threshold}` });
  }

  return {
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: `${eventEmoji(payload.event)}  ${headerText}` },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: payload.description },
        ...(fields.length > 0 ? { fields } : {}),
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'View on NexusWatch →' },
            url: payload.link,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `NexusWatch Intelligence · <https://nexuswatch.dev|nexuswatch.dev> · <!date^${Math.floor(payload.timestamp / 1000)}^{date_short_pretty} {time}|${new Date(payload.timestamp).toISOString()}>`,
          },
        ],
      },
    ],
  };
}

function formatDiscord(payload: WebhookEventPayload): Record<string, unknown> {
  const name = payload.country_name || payload.country_code || '';
  const title =
    payload.event === 'cii_threshold'
      ? `CII Threshold Alert — ${name}`
      : payload.event === 'verified_signal'
        ? `Verified Signal — ${name}`
        : payload.event === 'crisis_trigger'
          ? `Crisis Triggered — ${name}`
          : `Scenario Matched — ${name}`;

  const color = parseInt(scoreColor(payload.cii_score).replace('#', ''), 16);

  const fields: Array<{ name: string; value: string; inline: boolean }> = [];
  if (payload.cii_score !== undefined)
    fields.push({ name: 'CII Score', value: String(payload.cii_score), inline: true });
  if (payload.confidence) fields.push({ name: 'Confidence', value: payload.confidence.toUpperCase(), inline: true });
  if (payload.threshold !== undefined)
    fields.push({ name: 'Threshold', value: String(payload.threshold), inline: true });

  return {
    username: 'NexusWatch',
    avatar_url: 'https://nexuswatch.dev/favicon.svg',
    embeds: [
      {
        title,
        description: payload.description,
        url: payload.link,
        color,
        fields,
        footer: { text: 'NexusWatch Intelligence · nexuswatch.dev' },
        timestamp: new Date(payload.timestamp).toISOString(),
      },
    ],
  };
}
