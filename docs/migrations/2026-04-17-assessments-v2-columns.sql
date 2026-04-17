-- ============================================================================
-- Migration: Add V2 prediction columns to assessments table
-- Date: 2026-04-17
-- Track: Trust dashboard — numeric prediction scoring
--
-- The assessments table was created with V1 schema (2026-04-13) using
-- subjective outcome labels ('confirmed'/'not_confirmed'). The cron jobs
-- (record-assessments, score-assessments) expect V2 numeric columns for
-- predicted vs actual CII scoring. This adds V2 columns alongside V1.
-- ============================================================================

ALTER TABLE assessments ADD COLUMN IF NOT EXISTS prediction_kind TEXT DEFAULT 'cii';
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS predicted_value NUMERIC(6,2);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS predicted_confidence TEXT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS rationale TEXT;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS horizon_days INT DEFAULT 7;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS outcome_value NUMERIC(6,2);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS outcome_delta NUMERIC(6,2);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS outcome_scored_at TIMESTAMPTZ;
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS snapshot_cii NUMERIC(6,2);
ALTER TABLE assessments ADD COLUMN IF NOT EXISTS snapshot_date DATE;

CREATE INDEX IF NOT EXISTS idx_assessments_country_time
  ON assessments (country_code, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_assessments_unscored
  ON assessments (created_at)
  WHERE outcome_scored_at IS NULL;
