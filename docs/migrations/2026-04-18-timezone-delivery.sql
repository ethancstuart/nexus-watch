-- Timezone-aware email delivery (D-2, 2026-04-18)
-- Adds timezone to subscriber tables and creates a delivery log for dedup.
-- Brief generates once at 10 UTC, deliver-briefs cron dispatches hourly
-- to timezone buckets at 7am local per subscriber.

-- 1. Add timezone column to email_subscribers
ALTER TABLE email_subscribers
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles';

-- 2. Add timezone column to email_alert_subscriptions
ALTER TABLE email_alert_subscriptions
  ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Los_Angeles';

-- 3. Delivery log for per-subscriber dedup
-- One row per subscriber per brief date. UNIQUE constraint prevents double-sends.
CREATE TABLE IF NOT EXISTS brief_subscriber_delivery (
  id SERIAL PRIMARY KEY,
  subscriber_email TEXT NOT NULL,
  brief_date DATE NOT NULL,
  channel TEXT NOT NULL DEFAULT 'resend',
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (subscriber_email, brief_date)
);

-- Index for the hourly dispatch query (find subscribers by timezone who haven't been sent today's brief)
CREATE INDEX IF NOT EXISTS idx_bsd_date ON brief_subscriber_delivery (brief_date);
