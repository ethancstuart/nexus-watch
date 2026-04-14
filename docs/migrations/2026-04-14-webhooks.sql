-- Webhook subscriptions for CII threshold alerts and verified signals.
-- Created 2026-04-14 — Pro tier feature.

CREATE TABLE IF NOT EXISTS webhook_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  webhook_url TEXT NOT NULL,
  secret TEXT,                   -- optional HMAC signing secret
  event_types TEXT[] NOT NULL,   -- ['cii_threshold', 'verified_signal', 'crisis_trigger', 'scenario_match']
  country_filter TEXT[],          -- optional ISO codes to filter by
  cii_threshold INTEGER,          -- for cii_threshold event type
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_fired_at TIMESTAMPTZ,
  failure_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_webhooks_user ON webhook_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_webhooks_active ON webhook_subscriptions (active) WHERE active = TRUE;

-- Log of all webhook deliveries for debugging + transparency
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id SERIAL PRIMARY KEY,
  webhook_id TEXT NOT NULL REFERENCES webhook_subscriptions (id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  delivered_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_webhook ON webhook_deliveries (webhook_id, delivered_at DESC);
