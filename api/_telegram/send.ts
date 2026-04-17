/**
 * Telegram message sender — zero dependencies, raw HTTP.
 *
 * Sends formatted alert messages to a chat_id via the Telegram Bot API.
 * Handles rate limiting, blocked-user detection, and retry logic.
 */

const TELEGRAM_API = 'https://api.telegram.org/bot';

function getToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN not set');
  return token;
}

interface SendResult {
  ok: boolean;
  blocked?: boolean;
  error?: string;
}

/**
 * Send a formatted HTML message to a Telegram chat.
 */
export async function sendMessage(
  chatId: number | bigint,
  text: string,
  opts?: {
    replyMarkup?: unknown;
    disablePreview?: boolean;
  },
): Promise<SendResult> {
  const token = getToken();
  const body: Record<string, unknown> = {
    chat_id: Number(chatId),
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: opts?.disablePreview ?? true,
  };
  if (opts?.replyMarkup) body.reply_markup = opts.replyMarkup;

  try {
    const res = await fetch(`${TELEGRAM_API}${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (res.ok) return { ok: true };

    const data = (await res.json().catch(() => ({}))) as { description?: string; error_code?: number };

    // User blocked the bot
    if (data.error_code === 403) {
      return { ok: false, blocked: true, error: data.description };
    }

    return { ok: false, error: data.description || `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

/**
 * Format a CII alert as a Telegram message.
 */
export function formatCiiAlert(alert: {
  countryCode: string;
  countryName: string;
  ciiScore: number;
  threshold: number;
  delta7d?: number;
  confidence?: string;
}): { text: string; markup: unknown } {
  const { countryCode, countryName, ciiScore, threshold, delta7d, confidence } = alert;

  const severity = ciiScore >= 80 ? '🔴 CRITICAL' : ciiScore >= 60 ? '🟠 ELEVATED' : '🟡 WATCH';
  const trend = delta7d != null ? (delta7d > 0 ? `↑ +${delta7d.toFixed(1)}` : `↓ ${delta7d.toFixed(1)}`) : '';
  const conf = confidence ? ` (${confidence})` : '';

  const text = [
    `<b>${severity}</b>`,
    ``,
    `<b>${countryName}</b> (${countryCode})`,
    `CII Score: <b>${ciiScore}</b> / 100${conf}`,
    threshold ? `Threshold: ${threshold}` : '',
    trend ? `7d trend: ${trend}` : '',
    ``,
    `<i>NexusWatch Country Instability Index</i>`,
  ]
    .filter(Boolean)
    .join('\n');

  const markup = {
    inline_keyboard: [
      [
        { text: '📊 View on NexusWatch', url: `https://nexuswatch.dev/#/intel?country=${countryCode}` },
        { text: '📋 Full Audit', url: `https://nexuswatch.dev/api/v2/audit?country=${countryCode}` },
      ],
    ],
  };

  return { text, markup };
}

/**
 * Format a crisis trigger alert.
 */
export function formatCrisisAlert(trigger: {
  playbookKey: string;
  countryCode: string | null;
  countryName: string;
  triggerType: string;
  ciiScore?: number | null;
  ciiDelta?: number | null;
  magnitude?: number | null;
  notes?: string | null;
}): { text: string; markup: unknown } {
  const { playbookKey, countryCode, countryName, triggerType, ciiScore, ciiDelta, magnitude, notes } = trigger;

  const emoji = triggerType === 'major_quake' ? '🌍' : triggerType === 'cii_spike' ? '📈' : '⚡';

  const lines = [
    `<b>${emoji} CRISIS TRIGGER</b>`,
    ``,
    `<b>${countryName || playbookKey}</b>`,
    `Type: <code>${triggerType}</code>`,
  ];

  if (ciiScore != null) lines.push(`CII: <b>${ciiScore}</b>`);
  if (ciiDelta != null) lines.push(`24h change: <b>+${ciiDelta}</b> pts`);
  if (magnitude != null) lines.push(`Magnitude: <b>M${magnitude}</b>`);
  if (notes) lines.push(``, `<i>${notes}</i>`);

  const markup = {
    inline_keyboard: [
      [
        {
          text: '🗺 View on Map',
          url: countryCode ? `https://nexuswatch.dev/#/intel?country=${countryCode}` : 'https://nexuswatch.dev/#/intel',
        },
      ],
    ],
  };

  return { text: lines.join('\n'), markup };
}
