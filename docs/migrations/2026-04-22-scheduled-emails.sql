-- scheduled_emails: queue for timed onboarding and lifecycle emails.
-- Rows are inserted at checkout; the scheduled-emails cron delivers them.
CREATE TABLE IF NOT EXISTS scheduled_emails (
  id          SERIAL PRIMARY KEY,
  user_id     TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  tier        TEXT        NOT NULL,
  template    TEXT        NOT NULL,   -- 'welcome_d0' | 'nudge_d3' | 'upgrade_d7'
  send_at     TIMESTAMPTZ NOT NULL,
  sent_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS scheduled_emails_send_at_idx
  ON scheduled_emails (send_at)
  WHERE sent_at IS NULL;
