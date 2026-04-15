-- ============================================================================
-- Migration: marketing automation V2 (prompt variants for A/B testing)
-- Date: 2026-04-15
-- Track: M.2 — V2 admin follow-up (Chairman D-4 roadmap)
--
-- Adds the prompt-variants surface so the admin UI can define, run, and
-- auto-promote A/B tests on voice / prompt variants across platforms.
--
-- The auto-promote logic runs in api/cron/marketing-abtest-promote.ts:
--   - After 14 days of wall time AND ≥ 10 posts per variant
--   - Winner = highest mean composite engagement score
--   - Variant with `is_control = true` stays; losing variants flip
--     `status = 'retired'`; winner takes the full weight.
--   - Tie or insufficient data → no-op (retry next run)
-- ============================================================================

CREATE TABLE IF NOT EXISTS marketing_prompt_variants (
  id SERIAL PRIMARY KEY,

  -- Logical experiment this variant belongs to (e.g. "x-signal-hook-v1").
  experiment_key TEXT NOT NULL,

  -- Target platform / pillar (null = applies to all).
  platform TEXT CHECK (platform IN ('x', 'linkedin', 'substack', 'medium', 'threads', 'bluesky', 'beehiiv')),
  pillar TEXT CHECK (pillar IN ('signal', 'pattern', 'methodology', 'product', 'context')),

  -- Variant label ("control", "B", "shorter-hook", …).
  label TEXT NOT NULL,

  -- The actual variant body — a snippet appended to the system prompt.
  -- This is deliberately simple: free-form text. The admin can put
  -- voice overrides, hook instructions, structural tweaks, etc.
  prompt_suffix TEXT NOT NULL,

  -- Traffic share [0, 1]. Normalized on read if they don't sum to 1.0.
  weight DOUBLE PRECISION NOT NULL DEFAULT 0.5,

  -- Bookkeeping.
  is_control BOOLEAN NOT NULL DEFAULT FALSE,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'retired', 'winner')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  retired_at TIMESTAMPTZ,
  notes TEXT,

  -- One control per experiment; other constraints left soft so admin can
  -- experiment with overlapping platform/pillar scopes.
  UNIQUE (experiment_key, label)
);

CREATE INDEX IF NOT EXISTS idx_prompt_variants_experiment
  ON marketing_prompt_variants (experiment_key, status);

CREATE INDEX IF NOT EXISTS idx_prompt_variants_scope
  ON marketing_prompt_variants (platform, pillar, status);

-- Join back from post → variant so the promotion cron can score variants.
-- Added as a nullable column on the existing marketing_posts table.
ALTER TABLE marketing_posts
  ADD COLUMN IF NOT EXISTS variant_id INT REFERENCES marketing_prompt_variants (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_marketing_posts_variant ON marketing_posts (variant_id);

COMMENT ON TABLE marketing_prompt_variants IS
  'V2 A/B testing: prompt suffix variants scoped by platform/pillar with weight + auto-promote.';
