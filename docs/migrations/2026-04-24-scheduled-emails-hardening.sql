-- 2026-04-24: scheduled_emails hardening
-- Run via: node -e (same pattern as initial migration)

-- Atomic cron row claiming (prevents duplicate sends under concurrent invocations)
ALTER TABLE scheduled_emails
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

-- Retry tracking (prevents infinite retries on permanent Resend failures)
ALTER TABLE scheduled_emails
  ADD COLUMN IF NOT EXISTS retry_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE scheduled_emails
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Idempotency: prevents duplicate rows on Stripe webhook retry.
-- ON CONFLICT DO NOTHING in the INSERT references this constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'scheduled_emails_user_template_unique'
  ) THEN
    ALTER TABLE scheduled_emails
      ADD CONSTRAINT scheduled_emails_user_template_unique
      UNIQUE (user_id, template);
  END IF;
END $$;

-- Replace simple index with a partial index covering unsent rows under the retry cap.
-- claimed_at is intentionally omitted: the cron's crash-recovery path
-- (claimed_at < NOW() - INTERVAL '10 minutes') requires rows with claimed_at set,
-- which an index filtered on claimed_at IS NULL would not cover.
-- If the retry cap (5) changes here, update the cron WHERE clause to match.
DROP INDEX IF EXISTS scheduled_emails_send_at_idx;
CREATE INDEX IF NOT EXISTS scheduled_emails_due_idx
  ON scheduled_emails (send_at)
  WHERE sent_at IS NULL AND retry_count < 5;
