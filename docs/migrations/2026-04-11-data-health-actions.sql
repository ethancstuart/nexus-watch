-- ============================================================================
-- Migration: data_health_actions
-- Date: 2026-04-11
-- Track: D.2 — Active self-heal actions for data-health cron
--
-- Companion table to data_health + data_health_current (Track D.1). Records
-- every heal attempt the cron makes on a red/degraded layer, including what
-- action was tried, what triggered it, and whether the layer recovered on
-- the next probe.
--
-- D.2 ships ONE heal action type: `proxy_cache_bust` — forcing the layer's
-- proxy endpoint to bypass any edge/CDN cache by appending a cache-bust
-- query param. More action types (fallback_pin, upstream_retry, etc.) land
-- in D.3 once we have a week of telemetry from this table showing which
-- layers actually benefit from which interventions.
-- ============================================================================

CREATE TABLE IF NOT EXISTS data_health_actions (
  id SERIAL PRIMARY KEY,

  -- Layer the heal attempt targeted. Matches data_health.layer.
  layer TEXT NOT NULL,

  -- What action was tried. One of:
  --   'proxy_cache_bust' — refetch with ?cache-bust=<ts> (D.2)
  --   'fallback_pin'     — force active_source to first fallback (D.3)
  --   'upstream_retry'   — schedule an out-of-cron retry (D.3)
  --   'agent_fix'        — Claude agent proposed a code fix PR (D.3)
  action_type TEXT NOT NULL
    CHECK (action_type IN ('proxy_cache_bust', 'fallback_pin', 'upstream_retry', 'agent_fix')),

  -- Why the heal fired. Used to tune thresholds later.
  --   'red_threshold'  — status=red + consecutive_failures >= threshold
  --   'circuit_open'   — circuit breaker just opened
  --   'manual'         — admin triggered via API (D.3)
  triggered_by TEXT NOT NULL
    CHECK (triggered_by IN ('red_threshold', 'circuit_open', 'manual')),

  -- Structured payload for the specific action. For proxy_cache_bust,
  -- this holds { probe_url, cache_bust_token }. Intentionally JSONB so
  -- future action types can add fields without schema changes.
  action_details JSONB,

  -- Outcome of the heal itself — did the action *run*, not whether the
  -- layer recovered.
  --   'succeeded' — action executed without error
  --   'failed'    — action threw or the follow-up fetch returned non-2xx
  --   'pending'   — action in progress (for async out-of-cron actions)
  outcome TEXT NOT NULL DEFAULT 'pending'
    CHECK (outcome IN ('succeeded', 'failed', 'pending')),

  -- Error message if outcome='failed'. Truncated to 500 chars.
  error TEXT,

  -- Before/after status snapshot. `before_status` is the layer's status
  -- when the heal was triggered; `after_status` is populated when the
  -- NEXT cron probe re-evaluates the layer. Lets us answer "did this
  -- specific heal help?" without joining across data_health rows.
  before_status TEXT,
  after_status TEXT,

  -- Wall-clock duration of the heal action in milliseconds.
  latency_ms INTEGER,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary query: "show me all heal attempts for layer X, newest first"
CREATE INDEX IF NOT EXISTS idx_data_health_actions_layer_created
  ON data_health_actions (layer, created_at DESC);

-- Secondary query: "show me heals that haven't been evaluated yet
-- (after_status IS NULL)" — used by the next cron run to attribute
-- outcomes.
CREATE INDEX IF NOT EXISTS idx_data_health_actions_unattributed
  ON data_health_actions (after_status, created_at DESC)
  WHERE after_status IS NULL;

-- Analytics query: "which action types actually work" — group by
-- action_type and compute the recovery rate.
CREATE INDEX IF NOT EXISTS idx_data_health_actions_type_outcome
  ON data_health_actions (action_type, outcome, created_at DESC);
