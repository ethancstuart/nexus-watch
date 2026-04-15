-- ============================================================================
-- Migration: new data source tables (batch 2026-04-15)
-- Date: 2026-04-15
-- Track: Data sources top-10 MUST-HAVE — free/public subset
--
-- Adds four tables backing four new free-tier data sources. Each table
-- is ingested by its own cron in api/cron/source-*.ts. The goal is to
-- widen CII inputs and unlock new alert surfaces without paying for
-- Kpler/MarineTraffic until there's revenue to justify it.
--
-- Tables:
--   sanctions_events      — OFAC SDN + UN consolidated sanctions changes
--   vdem_indicators       — Varieties of Democracy yearly indicators
--   noaa_storms           — active tropical storms (hurricanes, typhoons)
--   copernicus_damage     — post-disaster satellite damage assessments
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Sanctions events
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sanctions_events (
  id SERIAL PRIMARY KEY,

  -- 'ofac' (US Treasury OFAC SDN) or 'un' (UN Consolidated List)
  source TEXT NOT NULL CHECK (source IN ('ofac', 'un', 'ofsi', 'eu')),

  -- Internal dedup key: source-specific entity id, never changes for same entity
  source_entity_id TEXT NOT NULL,

  entity_name TEXT NOT NULL,
  entity_type TEXT,                -- 'individual' | 'entity' | 'vessel' | 'aircraft'

  -- Country code(s) the entity is linked to (ISO-2). Most entities have one
  -- primary country; stored as array to accommodate dual-citizenship, etc.
  country_codes TEXT[] DEFAULT '{}',

  -- 'add' | 'update' | 'remove' — change type relative to prior scan
  change_type TEXT NOT NULL CHECK (change_type IN ('add', 'update', 'remove')),

  -- Sanctions programs this entity falls under (e.g. SDGT, IRAN-EO13599)
  programs TEXT[] DEFAULT '{}',

  -- Free-form remarks from the source feed
  remarks TEXT,

  -- When the change was FIRST observed by our scanner (not source date)
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- When the source feed reports the change occurred (can be null)
  source_date DATE,

  UNIQUE (source, source_entity_id, change_type, source_date)
);

CREATE INDEX IF NOT EXISTS idx_sanctions_events_observed
  ON sanctions_events (observed_at DESC);
CREATE INDEX IF NOT EXISTS idx_sanctions_events_country
  ON sanctions_events USING GIN (country_codes);
CREATE INDEX IF NOT EXISTS idx_sanctions_events_entity
  ON sanctions_events (lower(entity_name) text_pattern_ops);

-- ----------------------------------------------------------------------------
-- 2. V-Dem indicators
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vdem_indicators (
  id SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,      -- ISO-2
  year INT NOT NULL,

  -- Core V-Dem indices (0-1 scale unless noted)
  electoral_dem NUMERIC(4,3),      -- Electoral Democracy Index
  liberal_dem NUMERIC(4,3),        -- Liberal Democracy Index
  participatory_dem NUMERIC(4,3),  -- Participatory Democracy Index
  deliberative_dem NUMERIC(4,3),   -- Deliberative Democracy Index
  egalitarian_dem NUMERIC(4,3),    -- Egalitarian Democracy Index

  -- Rule of law sub-indicator (higher = stronger)
  rule_of_law NUMERIC(4,3),

  -- Regime type classification
  regime_type TEXT CHECK (regime_type IN ('closed_autocracy', 'electoral_autocracy', 'electoral_democracy', 'liberal_democracy')),

  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (country_code, year)
);

CREATE INDEX IF NOT EXISTS idx_vdem_country
  ON vdem_indicators (country_code, year DESC);

-- ----------------------------------------------------------------------------
-- 3. NOAA active storms
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS noaa_storms (
  id SERIAL PRIMARY KEY,

  storm_id TEXT NOT NULL,          -- e.g. 'AL012026' — NOAA naming
  name TEXT NOT NULL,              -- e.g. 'Hurricane Alex'
  basin TEXT,                      -- 'atlantic' | 'east_pacific' | 'central_pacific' | 'west_pacific'

  category TEXT,                   -- 'td' | 'ts' | '1' | '2' | '3' | '4' | '5'
  max_wind_kt INT,                 -- current max sustained wind in knots
  min_pressure_mb INT,

  lat DOUBLE PRECISION,
  lon DOUBLE PRECISION,

  -- 5-day forecast cone as [[lat,lon], ...] JSON
  forecast_cone JSONB,

  -- List of countries in 72h forecast radius (ISO-2)
  affected_countries TEXT[] DEFAULT '{}',

  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_advisory_at TIMESTAMPTZ,

  -- When the storm was dissipated or merged. NULL while active.
  resolved_at TIMESTAMPTZ,

  UNIQUE (storm_id)
);

CREATE INDEX IF NOT EXISTS idx_noaa_storms_active
  ON noaa_storms (observed_at DESC)
  WHERE resolved_at IS NULL;

-- ----------------------------------------------------------------------------
-- 4. Copernicus Emergency Management Service damage assessments
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS copernicus_damage (
  id SERIAL PRIMARY KEY,

  activation_id TEXT NOT NULL,     -- CEMS activation code, e.g. 'EMSR688'
  event_type TEXT NOT NULL,        -- 'earthquake' | 'flood' | 'wildfire' | 'volcano' | 'conflict'

  country_code TEXT,               -- primary affected country
  region TEXT,                     -- free-form regional description

  -- Bounding box of the assessment
  bbox_minlat DOUBLE PRECISION,
  bbox_minlon DOUBLE PRECISION,
  bbox_maxlat DOUBLE PRECISION,
  bbox_maxlon DOUBLE PRECISION,

  -- Summary counts from the damage grade product
  destroyed_count INT,
  damaged_count INT,
  possibly_damaged_count INT,

  -- Link to the product page on emergency.copernicus.eu
  product_url TEXT,

  activated_at TIMESTAMPTZ,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (activation_id)
);

CREATE INDEX IF NOT EXISTS idx_copernicus_country
  ON copernicus_damage (country_code, activated_at DESC);

COMMENT ON TABLE sanctions_events IS
  'Tracks additions/removals/updates on OFAC SDN + UN Consolidated + OFSI + EU sanctions lists.';
COMMENT ON TABLE vdem_indicators IS
  'Varieties of Democracy (V-Dem) indicators. Feeds the CII governance component baseline.';
COMMENT ON TABLE noaa_storms IS
  'Active tropical storms with 5-day forecast cones. Feeds the CII disasters component.';
COMMENT ON TABLE copernicus_damage IS
  'Copernicus EMS satellite damage assessments. Feeds post-disaster infrastructure impact.';
