-- Prediction Ledger — Track what NexusWatch assessed vs what happened.
-- "Learning in public" — radical transparency about accuracy.
-- Created 2026-04-13 as part of the Verified Intelligence Platform.

CREATE TABLE IF NOT EXISTS assessments (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  country_code TEXT,
  assessment_type TEXT NOT NULL,        -- 'cii_snapshot', 'escalation_watch', 'sitrep_claim'
  assessment_text TEXT NOT NULL,        -- what we said
  cii_score_at_time INTEGER,
  confidence TEXT,                      -- 'high', 'medium', 'low'
  sources_cited TEXT[],                 -- array of source names
  outcome TEXT DEFAULT 'pending',       -- 'confirmed', 'partially_confirmed', 'not_confirmed', 'pending'
  outcome_date DATE,
  outcome_evidence TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying by date range and country
CREATE INDEX IF NOT EXISTS idx_assessments_date ON assessments (date DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_country ON assessments (country_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_assessments_outcome ON assessments (outcome);

-- Daily CII snapshots — one row per country per day, recording the CII
-- score and confidence at the time of the daily brief publication.
-- Used by the accuracy dashboard to track prediction accuracy over time.
CREATE TABLE IF NOT EXISTS cii_daily_snapshots (
  id SERIAL PRIMARY KEY,
  date DATE NOT NULL,
  country_code TEXT NOT NULL,
  cii_score INTEGER NOT NULL,
  confidence TEXT NOT NULL,             -- 'high', 'medium', 'low'
  component_conflict REAL,
  component_disasters REAL,
  component_sentiment REAL,
  component_infrastructure REAL,
  component_governance REAL,
  component_market_exposure REAL,
  source_count INTEGER DEFAULT 0,
  data_point_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (date, country_code)
);

CREATE INDEX IF NOT EXISTS idx_cii_snapshots_country ON cii_daily_snapshots (country_code, date DESC);
