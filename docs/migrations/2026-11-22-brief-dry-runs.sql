-- ============================================================================
-- Migration: brief_dry_runs, the model's draft on a dry-run day, kept private
-- Date: 2026-11-22
--
-- WHY. Unless BRIEF_MODEL_MODE is exactly `live`, the daily brief does not
-- send a model-written draft that clears every gate: readers get the
-- mechanical edition, and the draft is kept here, with what each gate said
-- about it, so the owner can read real drafts before any reader does
-- (api/_lib/brief-dry-run.ts). Every attempt on a dry-run day writes one row,
-- including a failed model call, so a day with no draft says why.
--
-- NOTHING PUBLIC READS THIS TABLE. A draft must never be written into
-- daily_briefs, not even inside `content`: every reader-facing surface (the
-- brief page, /briefs, /api/v1/brief, both feeds, the sitemap, the share
-- images, the delivery job) reads that table.
--
-- Applied by hand per repo practice. Deploy order is not load-bearing for
-- readers: if this table is missing, the insert fails, the failure is logged
-- and alerted, and the brief still goes out as the mechanical edition. Apply
-- it before relying on dry-run evidence.
--
-- Idempotent.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS brief_dry_runs (
  id BIGSERIAL PRIMARY KEY,
  -- TEXT, like brief_delivery_log.brief_date: the job's own YYYY-MM-DD.
  brief_date TEXT NOT NULL,
  -- Shared with that run's brief_delivery_log rows.
  run_id TEXT NOT NULL,
  model TEXT,
  -- The job's label for the attempt before the dry run replaced it: 'ai-success
  -- (...)' when it would have shipped, else the refusal or failure label.
  outcome TEXT NOT NULL,
  would_have_shipped BOOLEAN NOT NULL,
  stop_reason TEXT,
  grounding_verdict TEXT NOT NULL CHECK (grounding_verdict IN ('pass', 'refused', 'not-run')),
  grounding_reason TEXT,
  structure_verdict TEXT NOT NULL CHECK (structure_verdict IN ('pass', 'refused', 'not-run')),
  structure_reason TEXT,
  claims_verdict TEXT NOT NULL CHECK (claims_verdict IN ('pass', 'refused', 'not-run')),
  claims_reason TEXT,
  -- The subject the draft declared, as it would have shipped (NULL when the
  -- line was missing or unusable as a subject).
  draft_subject TEXT,
  -- The reply exactly as the model wrote it, its SUBJECT line included.
  draft_text TEXT,
  -- As the API reported them, so the cost of a brief is known.
  input_tokens INTEGER,
  output_tokens INTEGER,
  cache_read_input_tokens INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_brief_dry_runs_brief_date ON brief_dry_runs (brief_date DESC);

COMMENT ON TABLE brief_dry_runs IS
  'Private. One row per daily-brief run while BRIEF_MODEL_MODE is not live: the '
  'model draft, each gate verdict and token counts. Nothing public reads it; '
  'the draft must never be copied into daily_briefs.';

COMMIT;
