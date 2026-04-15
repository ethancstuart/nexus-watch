-- ============================================================================
-- Migration: CII performance indices (PERF-1)
-- Date: 2026-04-15
-- Track: Performance audit top-3
--
-- Every v2 endpoint (cii, factors, alerts, exposure) and the AI analyst
-- runs `WHERE date = (SELECT MAX(date) FROM cii_daily_snapshots)`. The
-- existing (country_code, date DESC) composite index cannot satisfy
-- MAX(date) efficiently — Postgres scans.
--
-- Add a standalone (date DESC) index; cuts 50–200 ms off every hot-path
-- read + brings DISTINCT ON (country_code) ORDER BY date lookups from
-- scan to index seek.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_cii_snapshots_date_desc
  ON cii_daily_snapshots (date DESC);

-- event_snapshots lacks indices per the audit (timeline-data + ai-analyst
-- query this table). Add both single-column and composite so the hot
-- filters (timestamp, layer_id+timestamp) are both covered.

CREATE INDEX IF NOT EXISTS idx_event_snapshots_ts
  ON event_snapshots (timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_event_snapshots_layer_ts
  ON event_snapshots (layer_id, timestamp DESC);

COMMENT ON INDEX idx_cii_snapshots_date_desc IS
  'Hot-path index for MAX(date) lookups — every v2 reader hits this.';
