-- ============================================================================
-- Migration: assessments (prediction ledger)
-- Date: 2026-04-15
-- Track: Phase 3 — Public prediction ledger
--
-- The "we were wrong about X" public accuracy surface. Every daily brief
-- records a CII prediction for every tracked country. Later runs score
-- whether the prediction held: outcome_score is the actual CII seven days
-- after the prediction; outcome_delta is the absolute error.
--
-- Public /#/accuracy dashboard reads this directly:
--   - brier-style calibration per confidence bin
--   - weekly mean absolute error
--   - "biggest misses" list
--
-- This table is deliberately thin — more columns can be added as the
-- scoring methodology matures. Keep predictions + outcomes in the same
-- row so queries stay single-table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS assessments (
  id SERIAL PRIMARY KEY,

  -- The date this assessment was RECORDED (prediction made). Not the date
  -- the assessment is about — see `horizon_days` for that.
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- What we're predicting.
  country_code TEXT NOT NULL,
  prediction_kind TEXT NOT NULL DEFAULT 'cii'
    CHECK (prediction_kind IN ('cii', 'cii_delta_7d', 'conflict_escalation', 'chokepoint_event')),

  -- Prediction payload.
  predicted_value NUMERIC(6,2),
  predicted_confidence TEXT CHECK (predicted_confidence IN ('high', 'medium', 'low')),
  rationale TEXT,

  -- Forecast horizon. 7 days by default — the CII moves slowly enough that
  -- this is the right unit for a "how did we do?" scoreboard.
  horizon_days INT NOT NULL DEFAULT 7,

  -- Outcome (populated by a scoring cron after horizon expires).
  outcome_value NUMERIC(6,2),
  outcome_delta NUMERIC(6,2),
  outcome_scored_at TIMESTAMPTZ,

  -- Raw CII snapshot at prediction time for audit.
  snapshot_cii NUMERIC(6,2),
  snapshot_date DATE
);

CREATE INDEX IF NOT EXISTS idx_assessments_country_time
  ON assessments (country_code, assessed_at DESC);

CREATE INDEX IF NOT EXISTS idx_assessments_unscored
  ON assessments (assessed_at)
  WHERE outcome_scored_at IS NULL;

COMMENT ON TABLE assessments IS
  'Public prediction ledger. Every daily brief records one row per country; a scoring cron later fills outcome_value + outcome_delta. Backs /#/accuracy.';
