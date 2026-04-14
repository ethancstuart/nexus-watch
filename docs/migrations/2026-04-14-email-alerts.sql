-- Email alert subscriptions — simpler than webhooks, works without full auth.
-- Created 2026-04-14. Free tier with daily/weekly digest cadences.

CREATE TABLE IF NOT EXISTS email_alert_subscriptions (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  verification_token TEXT,
  country_codes TEXT[] NOT NULL,
  cii_threshold INTEGER DEFAULT 60,     -- alert when CII >= this value
  cadence TEXT NOT NULL DEFAULT 'daily', -- 'daily' | 'weekly' | 'immediate'
  active BOOLEAN DEFAULT TRUE,
  unsubscribe_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_sent_at TIMESTAMPTZ,
  UNIQUE (email, country_codes)
);

CREATE INDEX IF NOT EXISTS idx_email_alerts_email ON email_alert_subscriptions (email);
CREATE INDEX IF NOT EXISTS idx_email_alerts_active ON email_alert_subscriptions (active, cadence) WHERE active = TRUE;

-- Log of sent alert emails (for rate limiting + debugging)
CREATE TABLE IF NOT EXISTS email_alert_sends (
  id SERIAL PRIMARY KEY,
  subscription_id TEXT NOT NULL REFERENCES email_alert_subscriptions (id) ON DELETE CASCADE,
  country_code TEXT NOT NULL,
  cii_score INTEGER NOT NULL,
  confidence TEXT,
  resend_id TEXT,                        -- Resend message ID if successful
  error TEXT,
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_sends_sub ON email_alert_sends (subscription_id, sent_at DESC);
