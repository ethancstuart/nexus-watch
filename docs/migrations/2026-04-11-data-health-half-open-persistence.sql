-- ============================================================================
-- Migration: data_health_current.half_open_successes persistence
-- Date: 2026-04-11 (follow-up to Track D.1 shipped earlier same day)
-- Source: NEXUSWATCH-FOLLOWUPS.md — "BUG (minor) — half_open_successes
--         is not persisted in data_health_current. The current implementation
--         re-derives it within a single cron run, so half-open → closed
--         recovery takes ~3 consecutive cron runs (~45 minutes) rather than
--         tracking across interruptions."
--
-- Fix: add the column + default 0, then update the data-health.ts upsert
-- logic to read/write it. Existing rows default to 0, which matches the
-- pre-fix behavior (effectively a fresh half_open state on every run).
-- ============================================================================

ALTER TABLE data_health_current
  ADD COLUMN IF NOT EXISTS half_open_successes INTEGER NOT NULL DEFAULT 0;
