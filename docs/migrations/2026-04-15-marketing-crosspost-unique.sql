-- ============================================================================
-- Migration: marketing cross-post uniqueness (P0 race fix)
-- Date: 2026-04-15
-- Track: Bug sweep P0 #4 (marketing-medium race condition)
--
-- The medium cross-post cron previously used SELECT-then-INSERT with a
-- NOT EXISTS check. Two concurrent invocations (cron retries, manual
-- trigger, etc.) could both read the same "most recent Substack" row
-- and insert duplicate medium rows before either committed.
--
-- Fix: a partial unique index on (platform, parent_post_id) for derivative
-- cross-posts. Combined with INSERT ... ON CONFLICT DO NOTHING RETURNING id
-- in the cron, this makes "claim this parent for cross-posting" atomic.
-- ============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_marketing_crosspost_parent
  ON marketing_posts (platform, parent_post_id)
  WHERE parent_post_id IS NOT NULL;

COMMENT ON INDEX uniq_marketing_crosspost_parent IS
  'Prevents two concurrent cross-post runs from claiming the same parent row.';
