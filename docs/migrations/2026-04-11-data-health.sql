-- Track D.1 — Data Health cron + self-heal scaffolding
-- Creates the two tables that back NexusWatch's data accuracy autonomy layer:
--   1. data_health          — append-only time-series log of every probe result
--   2. data_health_current  — one row per layer, reflects the latest known state
--
-- Applied by the data-health cron (api/cron/data-health.ts) on first run via
-- CREATE TABLE IF NOT EXISTS, so this file is a documented mirror of that DDL
-- for easy manual application and review.

-- ---------------------------------------------------------------------------
-- data_health — append-only probe history
-- ---------------------------------------------------------------------------
-- Every cron tick inserts one row per probed layer. Retained for trend
-- analysis, incident forensics, and the /api/admin/data-health?layer=X view.
CREATE TABLE IF NOT EXISTS data_health (
  id                  SERIAL PRIMARY KEY,
  layer               TEXT NOT NULL,        -- layer id (matches src/map/layers/*.ts readonly id)
  status              TEXT NOT NULL,        -- 'green' | 'amber' | 'red' | 'degraded'
  score               INTEGER NOT NULL,     -- 0-100 composite health score
  last_success        TIMESTAMPTZ,          -- most recent successful probe time (may be null on first failure)
  last_failure        TIMESTAMPTZ,          -- most recent failed probe time (may be null if healthy)
  error               TEXT,                 -- human-readable error message on failure
  fallback_used       TEXT,                 -- name of fallback source in use, if any
  latency_ms          INTEGER,              -- probe round-trip latency in milliseconds
  record_count        INTEGER,              -- number of records returned by the probe, if parseable
  freshness_seconds   INTEGER,              -- age of newest record in seconds, if parseable
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookup of a specific layer's recent history (24h queries, dashboards).
CREATE INDEX IF NOT EXISTS idx_data_health_layer_created
  ON data_health (layer, created_at DESC);

-- ---------------------------------------------------------------------------
-- data_health_current — latest state per layer (upserted)
-- ---------------------------------------------------------------------------
-- Exactly one row per layer. Used by the admin dashboard and by the cron
-- itself to track circuit breaker state across invocations.
CREATE TABLE IF NOT EXISTS data_health_current (
  layer                TEXT PRIMARY KEY,                     -- layer id (matches src/map/layers/*.ts readonly id)
  status               TEXT NOT NULL,                        -- 'green' | 'amber' | 'red' | 'degraded'
  score                INTEGER NOT NULL,                     -- 0-100 latest health score
  last_success         TIMESTAMPTZ,                          -- most recent successful probe time
  last_failure         TIMESTAMPTZ,                          -- most recent failed probe time
  consecutive_failures INTEGER NOT NULL DEFAULT 0,           -- streak of consecutive failures, used by breaker
  circuit_state        TEXT NOT NULL DEFAULT 'closed',       -- 'closed' | 'open' | 'half_open'
  active_source        TEXT,                                 -- name of source currently being probed (primary or a fallback)
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
