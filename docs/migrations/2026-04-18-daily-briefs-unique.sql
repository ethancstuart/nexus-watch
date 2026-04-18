-- Ensure daily_briefs.brief_date has a UNIQUE constraint.
-- Required by the atomic idempotency guard in daily-brief.ts
-- (INSERT ... ON CONFLICT (brief_date) DO NOTHING).
-- Safe to run multiple times — IF NOT EXISTS.

CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_briefs_date_unique
  ON daily_briefs (brief_date);
