-- Slack alert subscriptions (mirrors telegram_subscriptions pattern)
-- Date: 2026-04-17

CREATE TABLE IF NOT EXISTS slack_subscriptions (
  id SERIAL PRIMARY KEY,
  webhook_url TEXT NOT NULL UNIQUE,
  team_name TEXT,
  channel_name TEXT,
  country_codes TEXT[] DEFAULT '{}',
  cii_threshold INTEGER DEFAULT 60,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_alerted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_slack_subs_active
  ON slack_subscriptions (active) WHERE active = TRUE;
