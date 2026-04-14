-- Audit Log + Data Lineage tables
-- Created 2026-04-14 — the persistence layer for the deep trust system.
-- Every CII computation logged. Every data fetch traceable.

CREATE TABLE IF NOT EXISTS data_lineage (
  id TEXT PRIMARY KEY,
  layer_id TEXT NOT NULL,
  source TEXT NOT NULL,
  source_url TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  fetch_start_ms BIGINT NOT NULL,
  fetch_end_ms BIGINT NOT NULL,
  latency_ms INTEGER NOT NULL,
  response_size_bytes INTEGER NOT NULL,
  records_returned INTEGER NOT NULL,
  records_accepted INTEGER NOT NULL,
  quality_filters JSONB,
  diff JSONB,
  source_type TEXT NOT NULL,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lineage_layer_time ON data_lineage (layer_id, fetch_start_ms DESC);
CREATE INDEX IF NOT EXISTS idx_lineage_created ON data_lineage (created_at DESC);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  country_code TEXT NOT NULL,
  computed_at_ms BIGINT NOT NULL,
  rule_version TEXT NOT NULL,
  input_lineage_ids TEXT[],
  score INTEGER NOT NULL,
  previous_score INTEGER,
  components JSONB NOT NULL,
  confidence TEXT NOT NULL,
  applied_rules TEXT[],
  gaps TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_country_time ON audit_log (country_code, computed_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_audit_rule_version ON audit_log (rule_version);

-- AI Analyst response audit
CREATE TABLE IF NOT EXISTS ai_analyst_audit (
  id TEXT PRIMARY KEY,
  query TEXT NOT NULL,
  computed_at_ms BIGINT NOT NULL,
  tools_used TEXT[],
  claims JSONB NOT NULL,
  overall_confidence TEXT NOT NULL,
  rule_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_audit_time ON ai_analyst_audit (computed_at_ms DESC);
