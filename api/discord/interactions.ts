import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { editApprovalMessage } from '../_discord/notify.js';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Discord Interactions endpoint — Chairman D-14 Phase 2.
 *
 * Handles button clicks from the approval-channel embeds:
 *   custom_id = "sq:approve:123"  → approve social_queue row 123
 *   custom_id = "sq:reject:123"   → reject
 *   custom_id = "sq:hold:123"     → hold
 *
 * Discord REQUIRES ed25519 signature verification on every interaction.
 * If DISCORD_PUBLIC_KEY is unset we refuse, because an unsigned endpoint
 * would let anyone fire approvals via HTTP.
 *
 * Works with the Web Crypto API available on Vercel's Node runtime via
 * `crypto.subtle.importKey` + `crypto.subtle.verify`. No external SDK.
 *
 * After transitioning the queue row, we edit the original Discord message
 * in place to show the decision (via editApprovalMessage) so the channel
 * reads as a decision log.
 *
 * Set DISCORD_PUBLIC_KEY to the "Public Key" from the Discord Developer
 * Portal → your application → General Information. Set the endpoint URL
 * in the same portal → Interactions Endpoint URL.
 */

const INTERACTION_TYPE_PING = 1;
const INTERACTION_TYPE_MESSAGE_COMPONENT = 3;

interface DiscordInteraction {
  type: number;
  id: string;
  data?: { custom_id?: string };
  member?: { user?: { id?: string; username?: string } };
  user?: { id?: string; username?: string };
  message?: { id?: string };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const publicKey = process.env.DISCORD_PUBLIC_KEY;
  if (!publicKey) {
    return res.status(503).json({
      error: 'discord_public_key_not_set',
      hint: 'Set DISCORD_PUBLIC_KEY env var (from Discord Developer Portal → your app → General Information).',
    });
  }

  const sig = (req.headers['x-signature-ed25519'] as string | undefined) ?? '';
  const ts = (req.headers['x-signature-timestamp'] as string | undefined) ?? '';
  const rawBody = await readRawBody(req);

  const verified = await verifyEd25519Signature(rawBody, sig, ts, publicKey);
  if (!verified) return res.status(401).send('invalid signature');

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(rawBody) as DiscordInteraction;
  } catch {
    return res.status(400).json({ error: 'invalid_json' });
  }

  // Discord sends a PING on endpoint verification. We must respond with a PONG (type 1).
  if (interaction.type === INTERACTION_TYPE_PING) {
    return res.status(200).json({ type: 1 });
  }

  if (interaction.type === INTERACTION_TYPE_MESSAGE_COMPONENT) {
    const customId = interaction.data?.custom_id ?? '';
    const parsed = parseSqCustomId(customId);
    if (!parsed) return res.status(200).json(immediateReply('Unrecognized action.'));

    const actor = interaction.member?.user?.username ?? interaction.user?.username ?? 'discord';
    const messageId = interaction.message?.id ?? null;

    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) return res.status(200).json(immediateReply('Database not configured.'));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql: any = neon(dbUrl);

    try {
      const existing = (await sql`
        SELECT id, status FROM social_queue WHERE id = ${parsed.queueId} LIMIT 1
      `) as unknown as Array<{ id: number; status: string }>;
      if (existing.length === 0) {
        return res.status(200).json(immediateReply(`Queue row #${parsed.queueId} not found.`));
      }
      const row = existing[0];
      const fromStatus = row.status;
      const toStatus = parsed.action === 'approve' ? 'approved' : parsed.action === 'reject' ? 'rejected' : 'held';

      if (fromStatus === toStatus) {
        return res.status(200).json(immediateReply(`#${parsed.queueId} already ${toStatus}.`));
      }
      if (fromStatus === 'sent' || fromStatus === 'retracted') {
        return res.status(200).json(immediateReply(`#${parsed.queueId} is ${fromStatus}; cannot change from Discord.`));
      }

      await sql`
        UPDATE social_queue
        SET status = ${toStatus}, reviewed_by = ${actor}, reviewed_at = NOW()
        WHERE id = ${parsed.queueId}
      `;
      await sql`
        INSERT INTO social_actions (queue_id, action, actor, from_status, to_status, note)
        VALUES (${parsed.queueId}, ${parsed.action}, ${'discord:' + actor}, ${fromStatus}, ${toStatus}, 'via Discord button')
      `;

      if (messageId) {
        await editApprovalMessage(messageId, toStatus as 'approved' | 'rejected' | 'held', actor).catch(() => null);
      }

      return res
        .status(200)
        .json(
          immediateReply(
            `${parsed.action === 'approve' ? '✅ Approved' : parsed.action === 'reject' ? '❌ Rejected' : '🕒 Held'} #${parsed.queueId}.`,
          ),
        );
    } catch (err) {
      console.error('[discord/interactions]', err instanceof Error ? err.message : err);
      return res.status(200).json(immediateReply('Transition failed — check logs.'));
    }
  }

  return res.status(200).json({ type: 4, data: { content: 'Unsupported interaction type.' } });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSqCustomId(id: string): { action: 'approve' | 'reject' | 'hold'; queueId: number } | null {
  const parts = id.split(':');
  if (parts.length !== 3 || parts[0] !== 'sq') return null;
  const action = parts[1];
  const queueId = parseInt(parts[2], 10);
  if (!Number.isFinite(queueId) || queueId <= 0) return null;
  if (action !== 'approve' && action !== 'reject' && action !== 'hold') return null;
  return { action, queueId };
}

function immediateReply(content: string): Record<string, unknown> {
  // Discord interaction response type 4 = ChannelMessageWithSource.
  // flags: 64 = ephemeral (only the clicker sees it).
  return { type: 4, data: { content, flags: 64 } };
}

async function readRawBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === 'string') return req.body;
  if (req.body && typeof req.body === 'object') return JSON.stringify(req.body);
  // Fallback — consume the stream.
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

async function verifyEd25519Signature(
  body: string,
  sigHex: string,
  timestamp: string,
  publicKeyHex: string,
): Promise<boolean> {
  if (!sigHex || !timestamp) return false;
  try {
    const signature = hexToBytes(sigHex);
    const publicKey = hexToBytes(publicKeyHex);
    const message = new TextEncoder().encode(timestamp + body);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const subtle = (crypto as any).subtle;
    const key = await subtle.importKey('raw', publicKey, { name: 'Ed25519' }, false, ['verify']);
    return (await subtle.verify({ name: 'Ed25519' }, key, signature, message)) as boolean;
  } catch (err) {
    console.warn('[discord/interactions] sig verify threw:', err instanceof Error ? err.message : err);
    return false;
  }
}
