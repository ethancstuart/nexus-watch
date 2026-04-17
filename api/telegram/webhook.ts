import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { sendMessage } from '../_telegram/send.js';

export const config = { runtime: 'nodejs' };

/**
 * Telegram Bot Webhook Handler
 *
 * Receives updates from Telegram when users interact with the bot.
 * Commands:
 *   /start          — register and show help
 *   /watch UA,RU,CN — set country watchlist (ISO-2 codes)
 *   /threshold 50   — set CII alert threshold (0-100)
 *   /status         — show current subscription
 *   /stop           — unsubscribe
 *
 * Setup:
 *   1. Create bot via @BotFather, get token
 *   2. Set TELEGRAM_BOT_TOKEN env var
 *   3. Register webhook:
 *      curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
 *        -d '{"url":"https://nexuswatch.dev/api/telegram/webhook","secret_token":"<TELEGRAM_WEBHOOK_SECRET>"}'
 */

const NAME_MAP: Record<string, string> = {
  UA: 'Ukraine',
  RU: 'Russia',
  CN: 'China',
  TW: 'Taiwan',
  IR: 'Iran',
  IQ: 'Iraq',
  SY: 'Syria',
  IL: 'Israel',
  YE: 'Yemen',
  SD: 'Sudan',
  KP: 'North Korea',
  KR: 'South Korea',
  TR: 'Turkey',
  SA: 'Saudi Arabia',
  EG: 'Egypt',
  PK: 'Pakistan',
  AF: 'Afghanistan',
  MM: 'Myanmar',
  ET: 'Ethiopia',
  SO: 'Somalia',
  CD: 'DR Congo',
  LB: 'Lebanon',
  VE: 'Venezuela',
  NG: 'Nigeria',
  LY: 'Libya',
  US: 'United States',
  JP: 'Japan',
  DE: 'Germany',
  GB: 'United Kingdom',
  FR: 'France',
  IN: 'India',
  BR: 'Brazil',
  PL: 'Poland',
  RO: 'Romania',
};

interface TelegramUpdate {
  update_id: number;
  message?: {
    chat: { id: number };
    from?: { id: number; username?: string; first_name?: string };
    text?: string;
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // Verify webhook secret
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    return res.status(403).json({ error: 'invalid_secret' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });

  const update = req.body as TelegramUpdate;
  const msg = update.message;
  if (!msg?.text || !msg.chat) return res.status(200).json({ ok: true });

  const chatId = msg.chat.id;
  const username = msg.from?.username || msg.from?.first_name || null;
  const text = msg.text.trim();
  const sql = neon(dbUrl);

  try {
    // /start — register
    if (text === '/start') {
      await sql`
        INSERT INTO telegram_subscriptions (chat_id, username, active)
        VALUES (${chatId}, ${username}, TRUE)
        ON CONFLICT (chat_id) DO UPDATE SET active = TRUE, username = ${username}
      `;

      await sendMessage(
        chatId,
        [
          '<b>Welcome to NexusWatch Alerts</b> 🌍',
          '',
          "You'll receive alerts when countries on your watchlist breach your CII threshold.",
          '',
          '<b>Commands:</b>',
          '/watch UA,RU,CN — set countries (ISO-2 codes)',
          '/threshold 50 — set CII threshold (0-100)',
          '/status — view your subscription',
          '/stop — unsubscribe',
          '',
          `Default: all countries above CII 60.`,
          '',
          '<i>Powered by NexusWatch Country Instability Index</i>',
        ].join('\n'),
      );

      return res.status(200).json({ ok: true });
    }

    // /watch — set countries
    if (text.startsWith('/watch')) {
      const args = text.replace('/watch', '').trim().toUpperCase();
      if (!args) {
        await sendMessage(
          chatId,
          'Usage: <code>/watch UA,RU,CN</code>\n\nUse ISO-2 codes separated by commas. Send <code>/watch all</code> to watch everything.',
        );
        return res.status(200).json({ ok: true });
      }

      const codes = args === 'ALL' ? [] : args.split(/[,\s]+/).filter((c) => c.length === 2);

      await sql`
        UPDATE telegram_subscriptions
        SET country_codes = ${codes}
        WHERE chat_id = ${chatId}
      `;

      const label = codes.length === 0 ? 'all countries' : codes.map((c) => `${NAME_MAP[c] || c} (${c})`).join(', ');

      await sendMessage(chatId, `✅ Watchlist updated: <b>${label}</b>`);
      return res.status(200).json({ ok: true });
    }

    // /threshold — set CII threshold
    if (text.startsWith('/threshold')) {
      const num = parseInt(text.replace('/threshold', '').trim(), 10);
      if (isNaN(num) || num < 0 || num > 100) {
        await sendMessage(
          chatId,
          "Usage: <code>/threshold 50</code>\n\nSet a CII score (0-100). You'll be alerted when any watched country reaches this level.",
        );
        return res.status(200).json({ ok: true });
      }

      await sql`
        UPDATE telegram_subscriptions
        SET cii_threshold = ${num}
        WHERE chat_id = ${chatId}
      `;

      await sendMessage(
        chatId,
        `✅ Threshold set to <b>${num}</b>. You'll be alerted when watched countries hit CII ≥ ${num}.`,
      );
      return res.status(200).json({ ok: true });
    }

    // /status — show subscription
    if (text === '/status') {
      const rows = (await sql`
        SELECT country_codes, cii_threshold, active, created_at, last_alerted_at
        FROM telegram_subscriptions WHERE chat_id = ${chatId}
      `) as unknown as Array<Record<string, unknown>>;

      if (rows.length === 0) {
        await sendMessage(chatId, "You're not subscribed. Send /start to begin.");
        return res.status(200).json({ ok: true });
      }

      const sub = rows[0];
      const codes = sub.country_codes as string[];
      const watchLabel =
        !codes || codes.length === 0 ? 'All countries' : codes.map((c: string) => `${NAME_MAP[c] || c}`).join(', ');
      const lastAlert = sub.last_alerted_at
        ? new Date(String(sub.last_alerted_at)).toISOString().slice(0, 16)
        : 'Never';

      await sendMessage(
        chatId,
        [
          '<b>Your NexusWatch Subscription</b>',
          '',
          `Status: ${sub.active ? '✅ Active' : '⏸ Paused'}`,
          `Watching: ${watchLabel}`,
          `Threshold: CII ≥ ${sub.cii_threshold}`,
          `Last alert: ${lastAlert}`,
          `Since: ${new Date(String(sub.created_at)).toISOString().slice(0, 10)}`,
        ].join('\n'),
      );

      return res.status(200).json({ ok: true });
    }

    // /stop — unsubscribe
    if (text === '/stop') {
      await sql`
        UPDATE telegram_subscriptions SET active = FALSE WHERE chat_id = ${chatId}
      `;
      await sendMessage(chatId, '⏸ Alerts paused. Send /start to reactivate.');
      return res.status(200).json({ ok: true });
    }

    // Unknown command
    if (text.startsWith('/')) {
      await sendMessage(
        chatId,
        [
          '<b>Commands:</b>',
          '/start — subscribe to alerts',
          '/watch UA,RU,CN — set countries',
          '/threshold 50 — set CII threshold',
          '/status — view subscription',
          '/stop — unsubscribe',
        ].join('\n'),
      );
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[telegram/webhook]', err instanceof Error ? err.message : err);
    return res.status(200).json({ ok: true }); // Always 200 to Telegram
  }
}
