-- Data Accuracy: 10 new tables for CII live scoring (2026-04-18)
-- Part of the full data moat build (18 sources, 7 phases).
-- All use IF NOT EXISTS — safe to run multiple times.

-- Phase 1: Market Exposure
CREATE TABLE IF NOT EXISTS commodity_prices (
  id SERIAL PRIMARY KEY,
  commodity TEXT NOT NULL,
  date DATE NOT NULL,
  price_usd NUMERIC(12,4) NOT NULL,
  source TEXT NOT NULL DEFAULT 'eia',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (commodity, date, source)
);

CREATE TABLE IF NOT EXISTS sovereign_yields (
  id SERIAL PRIMARY KEY,
  series_id TEXT NOT NULL,
  country_code TEXT NOT NULL,
  date DATE NOT NULL,
  yield_pct NUMERIC(8,4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (series_id, date)
);

CREATE TABLE IF NOT EXISTS fx_rates (
  id SERIAL PRIMARY KEY,
  currency_code TEXT NOT NULL,
  country_code TEXT NOT NULL,
  date DATE NOT NULL,
  rate_vs_usd NUMERIC(16,6) NOT NULL,
  volatility_7d NUMERIC(8,4),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (currency_code, date)
);

CREATE TABLE IF NOT EXISTS trade_volumes (
  id SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  year INT NOT NULL,
  month INT,
  imports_usd BIGINT,
  exports_usd BIGINT,
  source TEXT DEFAULT 'comtrade',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (country_code, year, month)
);

CREATE TABLE IF NOT EXISTS remittance_flows (
  id SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  year INT NOT NULL,
  remittances_usd BIGINT,
  remittances_pct_gdp NUMERIC(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (country_code, year)
);

-- Phase 2: Conflict & Displacement
CREATE TABLE IF NOT EXISTS refugee_populations (
  id SERIAL PRIMARY KEY,
  year INT NOT NULL,
  country_origin TEXT NOT NULL,
  country_asylum TEXT NOT NULL,
  refugees INT DEFAULT 0,
  asylum_seekers INT DEFAULT 0,
  idps INT DEFAULT 0,
  stateless INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (year, country_origin, country_asylum)
);

CREATE TABLE IF NOT EXISTS displacement_tracking (
  id SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  admin1 TEXT,
  idp_count INT DEFAULT 0,
  assessment_date DATE,
  displacement_driver TEXT,
  source TEXT DEFAULT 'iom_dtm',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (country_code, admin1, assessment_date)
);

-- Phase 3: Food Security
CREATE TABLE IF NOT EXISTS food_security_phases (
  id SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  region TEXT,
  ipc_phase INT NOT NULL CHECK (ipc_phase BETWEEN 1 AND 5),
  population_affected INT,
  assessment_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (country_code, region, assessment_date)
);

-- Phase 6: Data Moat Signals
CREATE TABLE IF NOT EXISTS wikipedia_pageviews (
  id SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  article_title TEXT NOT NULL,
  date DATE NOT NULL,
  views INT NOT NULL,
  z_score NUMERIC(6,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (country_code, article_title, date)
);

CREATE TABLE IF NOT EXISTS ooni_measurements (
  id SERIAL PRIMARY KEY,
  country_code TEXT NOT NULL,
  test_name TEXT NOT NULL,
  measurement_date DATE NOT NULL,
  anomaly_count INT DEFAULT 0,
  confirmed_blocked INT DEFAULT 0,
  total_measurements INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (country_code, test_name, measurement_date)
);

CREATE TABLE IF NOT EXISTS airspace_closures (
  id SERIAL PRIMARY KEY,
  notam_id TEXT NOT NULL UNIQUE,
  country_code TEXT,
  notam_type TEXT,
  effective_start TIMESTAMPTZ,
  effective_end TIMESTAMPTZ,
  keywords TEXT[],
  raw_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Performance indices
CREATE INDEX IF NOT EXISTS idx_commodity_prices_date ON commodity_prices (commodity, date DESC);
CREATE INDEX IF NOT EXISTS idx_sovereign_yields_date ON sovereign_yields (country_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_fx_rates_date ON fx_rates (country_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_wikipedia_date ON wikipedia_pageviews (country_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_ooni_date ON ooni_measurements (country_code, measurement_date DESC);
CREATE INDEX IF NOT EXISTS idx_refugee_origin ON refugee_populations (country_origin, year DESC);
CREATE INDEX IF NOT EXISTS idx_food_security ON food_security_phases (country_code, assessment_date DESC);
