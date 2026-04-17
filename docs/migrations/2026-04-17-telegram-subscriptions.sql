-- ============================================================================
-- Migration: Telegram alert subscriptions
-- Date: 2026-04-17
-- Track: Push alerts — Telegram bot integration
-- ============================================================================

CREATE TABLE IF NOT EXISTS telegram_subscriptions (
  id SERIAL PRIMARY KEY,
  chat_id BIGINT NOT NULL UNIQUE,
  username TEXT,
  country_codes TEXT[] DEFAULT '{}',
  cii_threshold INTEGER DEFAULT 60,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_alerted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_telegram_subs_active
  ON telegram_subscriptions (active) WHERE active = TRUE;
