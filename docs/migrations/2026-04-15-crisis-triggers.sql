-- ============================================================================
-- Migration: crisis_triggers table
-- Date: 2026-04-15
-- Track: Phase 9 — Crisis Playbook auto-detection
--
-- Holds one row per auto-detected crisis trigger. Crisis detection cron
-- (api/cron/crisis-detection.ts) inserts rows when it finds:
--   (a) a country whose CII moved > threshold points within the last 24h, OR
--   (b) an earthquake with magnitude ≥ M7 (USGS feed)
--
-- Once a trigger fires, the crisis modal in the UI auto-opens on next
-- page load for any user whose watchlist intersects. The `resolved_at`
-- column is set when the CII retreats below threshold or the quake
-- passes beyond the relevance window — the cron manages both sides.
-- ============================================================================

CREATE TABLE IF NOT EXISTS crisis_triggers (
  id SERIAL PRIMARY KEY,

  -- Which playbook this trigger maps to. The UI resolves this into a
  -- human-readable playbook definition via src/services/crisisPlaybook.ts.
  playbook_key TEXT NOT NULL,

  -- Primary affected country when available (ISO 3166-1 alpha-2).
  -- NULL for global triggers (e.g. multi-region earthquake cluster).
  country_code TEXT,

  -- Discrete trigger taxonomy so the admin + API can filter.
  trigger_type TEXT NOT NULL CHECK (trigger_type IN (
    'cii_spike',      -- CII delta crossed the configured threshold
    'major_quake',    -- USGS M7+ event
    'verified_signal',-- verification engine flagged a CONFIRMED signal
    'manual'          -- admin-invoked playbook
  )),

  -- Snapshot data at the moment of trigger for forensics.
  cii_score NUMERIC(5,2),
  cii_delta NUMERIC(5,2),
  magnitude NUMERIC(3,1),
  source_ref TEXT,          -- USGS event id, signal id, etc.

  notes TEXT,

  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at  TIMESTAMPTZ,

  -- Idempotency key so repeated cron runs don't re-insert the same trigger.
  dedup_key TEXT UNIQUE
);

CREATE INDEX IF NOT EXISTS idx_crisis_triggers_active
  ON crisis_triggers (triggered_at DESC)
  WHERE resolved_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_crisis_triggers_country
  ON crisis_triggers (country_code, triggered_at DESC)
  WHERE resolved_at IS NULL;

COMMENT ON TABLE crisis_triggers IS
  'Auto-detected crisis triggers (CII spike, M7+ quake, verified signal). Cron-populated; UI surfaces active rows in crisis modal.';
