-- ============================================================================
-- Migration: tier-up (Council + Forecast Tournament + Audio Briefs + Budget)
-- Date: 2026-05-17
-- Plan: /Users/ethanstuart/.claude/plans/lets-do-all-5-partitioned-kay.md
--
-- Adds the tables required by Phase 2 (Council), Phase 3 (Forecast
-- Tournament), Phase 4 (NexusWatch FM), and the Phase 0 LLM budget gate.
-- All CREATE TABLE statements use IF NOT EXISTS — safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Phase 0: LLM daily spend tracker (kill-switch backing).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS llm_spend_daily (
  day           DATE PRIMARY KEY,
  spend_usd     NUMERIC(10, 4) NOT NULL DEFAULT 0,
  calls         INT NOT NULL DEFAULT 0,
  last_updated  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE llm_spend_daily IS
  'Daily LLM spend totals across all endpoints. checkBudget() reads, recordSpend() writes.';

-- ---------------------------------------------------------------------------
-- Phase 1: Data Lab — parquet export manifest.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS data_exports (
  name        TEXT PRIMARY KEY,         -- 'cii_daily_snapshots' | 'acled_events_90d' | 'crisis_triggers' | 'verified_signals'
  blob_url    TEXT NOT NULL,
  bytes       INT NOT NULL,
  rows        INT NOT NULL,
  exported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  schema_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE data_exports IS
  'Parquet export manifest. Cron writes new rows after nightly bake; /api/data/manifest reads.';

-- ---------------------------------------------------------------------------
-- Phase 2: The Council (multi-persona agent runs).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS council_runs (
  id              SERIAL PRIMARY KEY,
  question        TEXT NOT NULL,
  context         TEXT,
  trigger_source  TEXT NOT NULL,                -- 'live-brief' | 'daily-brief' | 'audio-brief' | 'manual'
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  synthesis       TEXT,                          -- final consensus brief
  dissent_log     TEXT,                          -- where personas diverged
  total_spend_usd NUMERIC(10, 4),
  ok              BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_council_runs_started
  ON council_runs (started_at DESC);

COMMENT ON TABLE council_runs IS
  'One row per multi-persona Council run. Synthesizer output becomes the published brief.';

CREATE TABLE IF NOT EXISTS council_persona_outputs (
  id              SERIAL PRIMARY KEY,
  run_id          INT NOT NULL REFERENCES council_runs(id) ON DELETE CASCADE,
  persona         TEXT NOT NULL,                 -- 'analyst' | 'contrarian' | 'historian' | 'quant' | 'on_the_ground'
  output          TEXT,
  tools_used      JSONB NOT NULL DEFAULT '[]'::jsonb,
  ms              INT,
  ok              BOOLEAN NOT NULL DEFAULT FALSE,
  error           TEXT
);

CREATE INDEX IF NOT EXISTS idx_council_persona_outputs_run
  ON council_persona_outputs (run_id);

COMMENT ON TABLE council_persona_outputs IS
  'Per-persona transcript for a Council run. 5 rows per successful run.';

-- ---------------------------------------------------------------------------
-- Phase 3: Forecast Tournament (ensemble + backtest).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS forecasts (
  id              SERIAL PRIMARY KEY,
  country_code    TEXT NOT NULL,
  made_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  made_on         DATE NOT NULL,                 -- the date the forecast was issued (UTC)
  horizon_days    INT NOT NULL,                  -- 7, 14, or 30
  model           TEXT NOT NULL,                 -- 'ensemble' | 'kalman' | 'ar1' | 'holt' | 'acled_slope' | 'news_slope' | 'neighbor'
  p10             NUMERIC(6, 2),
  p25             NUMERIC(6, 2),
  p50             NUMERIC(6, 2),
  p75             NUMERIC(6, 2),
  p90             NUMERIC(6, 2),
  cii_now         NUMERIC(6, 2),                 -- snapshot CII at forecast time
  meta            JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Backtest fields, populated by forecast-backtest cron after horizon expires
  actual          NUMERIC(6, 2),
  abs_error       NUMERIC(6, 2),
  scored_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_forecasts_country_made
  ON forecasts (country_code, made_on DESC);

CREATE INDEX IF NOT EXISTS idx_forecasts_unscored
  ON forecasts (made_on)
  WHERE scored_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_forecasts_country_model_made
  ON forecasts (country_code, model, made_on, horizon_days);

COMMENT ON TABLE forecasts IS
  'Daily forecast log per (country, model, horizon). Backfilled with actuals by backtest cron.';

CREATE TABLE IF NOT EXISTS forecast_backtests (
  id               SERIAL PRIMARY KEY,
  run_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  model            TEXT NOT NULL,
  horizon_days     INT NOT NULL,
  sample_size      INT NOT NULL,
  mae              NUMERIC(8, 4),
  crps             NUMERIC(8, 4),                -- continuous ranked probability score
  brier            NUMERIC(8, 4),                -- threshold (CII ≥ 65) Brier score
  reliability_bins JSONB NOT NULL DEFAULT '[]'::jsonb,
  window_days      INT NOT NULL DEFAULT 30
);

CREATE INDEX IF NOT EXISTS idx_forecast_backtests_run
  ON forecast_backtests (run_at DESC);

COMMENT ON TABLE forecast_backtests IS
  'Weekly backtest of every model. Powers /api/accuracy/leaderboard.';

CREATE TABLE IF NOT EXISTS forecast_weights (
  id          SERIAL PRIMARY KEY,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weights     JSONB NOT NULL                     -- {kalman: 0.2, ar1: 0.15, ...} per horizon
);

COMMENT ON TABLE forecast_weights IS
  'Ensemble weights, re-fit weekly from backtest residuals via logistic SGD.';

-- ---------------------------------------------------------------------------
-- Phase 4: NexusWatch FM (audio briefs + podcast feed).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audio_briefs (
  id             SERIAL PRIMARY KEY,
  brief_date     DATE NOT NULL UNIQUE,           -- one audio brief per day
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_sec   INT,
  bytes          INT,
  blob_url       TEXT NOT NULL,                   -- Vercel Blob URL of the mp3
  cover_art_url  TEXT,
  script         TEXT NOT NULL,                   -- the full text fed to TTS
  voices         JSONB NOT NULL DEFAULT '[]'::jsonb, -- e.g. ['onyx', 'nova', 'shimmer']
  council_run_id INT REFERENCES council_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_audio_briefs_date
  ON audio_briefs (brief_date DESC);

COMMENT ON TABLE audio_briefs IS
  'Daily 90-second AI-narrated audio brief. Powers /podcast.xml.';
