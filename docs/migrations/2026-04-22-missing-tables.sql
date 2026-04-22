-- Migration: Create missing tables referenced in code
-- Date: 2026-04-22
-- Safe to re-run: all CREATE TABLE use IF NOT EXISTS

-- acled_events: stores ACLED conflict events for the signal pillar topic selector.
CREATE TABLE IF NOT EXISTS acled_events (
  id           TEXT PRIMARY KEY,
  country      TEXT NOT NULL,
  location     TEXT,
  event_type   TEXT,
  fatalities   INT DEFAULT 0,
  source_url   TEXT,
  occurred_at  TIMESTAMPTZ NOT NULL,
  raw          JSONB,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acled_occurred_at ON acled_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_acled_country ON acled_events (country, occurred_at DESC);

-- cached_layer_data: key-value store for GDELT layer responses.
CREATE TABLE IF NOT EXISTS cached_layer_data (
  id            SERIAL PRIMARY KEY,
  layer_id      TEXT NOT NULL UNIQUE,
  data          JSONB NOT NULL DEFAULT '{}',
  feature_count INT DEFAULT 0,
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cached_layer_updated ON cached_layer_data (updated_at DESC);

-- release_notes: product changelog entries for the product pillar topic selector.
CREATE TABLE IF NOT EXISTS release_notes (
  id           SERIAL PRIMARY KEY,
  title        TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  body         TEXT,
  published_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_release_notes_published ON release_notes (published_at DESC);
