/**
 * Slack message sender — zero dependencies, raw HTTP.
 *
 * Sends formatted alert messages via Slack Incoming Webhooks.
 * No bot token needed — just a webhook URL.
 */

interface SendResult {
  ok: boolean;
  deleted?: boolean;
  error?: string;
}

export async function sendSlackMessage(webhookUrl: string, blocks: unknown[]): Promise<SendResult> {
  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ blocks }),
    });

    if (res.ok) return { ok: true };

    // 404 = webhook deleted, 410 = webhook revoked
    if (res.status === 404 || res.status === 410) {
      return { ok: false, deleted: true, error: `Webhook ${res.status}` };
    }

    const text = await res.text().catch(() => '');
    return { ok: false, error: `Slack ${res.status}: ${text.slice(0, 100)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export function formatCiiSlackBlocks(alert: {
  countryCode: string;
  countryName: string;
  ciiScore: number;
  threshold: number;
}): unknown[] {
  const emoji = alert.ciiScore >= 70 ? ':red_circle:' : alert.ciiScore >= 50 ? ':large_orange_circle:' : ':warning:';
  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `${emoji} CII Alert: ${alert.countryName}`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Country:*\n${alert.countryName} (${alert.countryCode})` },
        { type: 'mrkdwn', text: `*CII Score:*\n${alert.ciiScore} / 100` },
        { type: 'mrkdwn', text: `*Threshold:*\n${alert.threshold}` },
        {
          type: 'mrkdwn',
          text: `*Severity:*\n${alert.ciiScore >= 70 ? 'CRITICAL' : alert.ciiScore >= 50 ? 'ELEVATED' : 'WATCH'}`,
        },
      ],
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View on NexusWatch' },
          url: `https://nexuswatch.dev/#/intel?country=${alert.countryCode}`,
        },
      ],
    },
  ];
}

export function formatCrisisSlackBlocks(trigger: {
  countryName: string;
  countryCode: string | null;
  triggerType: string;
  ciiScore?: number | null;
  ciiDelta?: number | null;
  notes?: string | null;
}): unknown[] {
  const blocks: unknown[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `:rotating_light: Crisis Trigger: ${trigger.countryName}`, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: [
          `*Type:* \`${trigger.triggerType}\``,
          trigger.ciiScore != null ? `*CII:* ${trigger.ciiScore}` : null,
          trigger.ciiDelta != null ? `*24h change:* +${trigger.ciiDelta} pts` : null,
          trigger.notes ? `_${trigger.notes}_` : null,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'View on Map' },
          url: trigger.countryCode
            ? `https://nexuswatch.dev/#/intel?country=${trigger.countryCode}`
            : 'https://nexuswatch.dev/#/intel',
        },
      ],
    },
  ];
  return blocks;
}
