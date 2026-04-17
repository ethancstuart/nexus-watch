-- ============================================================================
-- Migration: Backfill cii_daily_snapshots from country_cii_history
-- Date: 2026-04-17
-- Track: Pipeline fix — the daily brief cron never ran, so snapshots were
--        empty. This one-off backfill populates from the 94K+ rows in
--        country_cii_history. Safe to re-run (ON CONFLICT DO NOTHING).
-- ============================================================================

INSERT INTO cii_daily_snapshots (
  date, country_code, cii_score, confidence,
  component_conflict, component_disasters, component_sentiment,
  component_infrastructure, component_governance, component_market_exposure,
  source_count, data_point_count
)
SELECT
  timestamp::date AS date,
  country_code,
  score,
  'medium',
  (components->>'conflict')::real,
  (components->>'disasters')::real,
  (components->>'sentiment')::real,
  (components->>'infrastructure')::real,
  (components->>'governance')::real,
  (components->>'marketExposure')::real,
  0, 0
FROM (
  SELECT DISTINCT ON (country_code, timestamp::date)
    country_code, score, components, timestamp
  FROM country_cii_history
  ORDER BY country_code, timestamp::date, timestamp DESC
) sub
ON CONFLICT (date, country_code) DO NOTHING;
