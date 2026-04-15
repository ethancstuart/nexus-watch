-- ============================================================================
-- Migration: Discord approval integration
-- Date: 2026-04-15
-- Track: D.14 — Chairman-approved Discord approval channel for social_queue
--
-- Adds the Discord message reference column so we can edit the notification
-- message in place when a queue row's state changes (approve/reject/hold/
-- send/retract). Everything else is env-driven — see api/_discord/notify.ts
-- and api/discord/interactions.ts.
--
-- No-op if the column already exists.
-- ============================================================================

ALTER TABLE social_queue
  ADD COLUMN IF NOT EXISTS discord_message_id TEXT;

CREATE INDEX IF NOT EXISTS idx_social_queue_discord_message
  ON social_queue (discord_message_id)
  WHERE discord_message_id IS NOT NULL;

COMMENT ON COLUMN social_queue.discord_message_id IS
  'Discord webhook message id for the approval notification (if posted). Lets later transitions edit the message in-place.';
