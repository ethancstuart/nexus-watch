-- ============================================================================
-- Migration: brief_delivery_log
-- Date: 2026-04-11
-- Track: A.4 — Delivery observability
--
-- Records per-channel outcome of every daily-brief cron run, so we can see:
--   - Which channels succeeded / failed / partially delivered
--   - Per-run latency for each channel (beehiiv, Resend, Buffer, Notion, archive)
--   - Recipient and failure counts for the Resend batch path
--   - Raw error messages when a channel fails
--
-- Surfaced to the admin via GET /api/admin/brief/last-run. Intended as the
-- foundation for an eventual retry endpoint (Track A.4 follow-up — not in this
-- migration). Without this table, delivery failures are only visible in Vercel
-- function logs, which are hard to correlate across a single run.
-- ============================================================================

CREATE TABLE IF NOT EXISTS brief_delivery_log (
  id SERIAL PRIMARY KEY,

  -- Opaque but sortable run identifier. daily-brief.ts sets it to
  -- "{brief_date}-{Date.now()}" so (a) all channels for the same run share it,
  -- (b) multiple cron triggers on the same day each get distinct run_ids,
  -- (c) ORDER BY run_id DESC gives chronological order.
  run_id TEXT NOT NULL,

  -- The brief date this row belongs to, in YYYY-MM-DD form (America/New_York
  -- calendar per daily-brief.ts). Separate from run_id so we can query all
  -- deliveries for a given publication date without parsing the run_id.
  brief_date TEXT NOT NULL,

  -- Channel identifier. One of: 'archive' | 'beehiiv' | 'buffer' | 'resend' | 'notion'
  channel TEXT NOT NULL,

  -- 'success' | 'failed' | 'partial'
  --   success: all recipients / the operation completed cleanly
  --   failed:  the channel never accepted any work (beehiiv 500, DB insert error)
  --   partial: some recipients or sub-operations succeeded and some failed
  --            (currently only used by the Resend batch path)
  status TEXT NOT NULL,

  -- Resend-specific counts. NULL for channels that don't have a recipient concept.
  recipient_count INTEGER,
  failed_count INTEGER,

  -- Short error summary if status is 'failed' or 'partial'. Truncated by the
  -- instrumentation helper so the table never stores multi-KB error bodies.
  error TEXT,

  -- Wall-clock duration of the channel operation in milliseconds.
  latency_ms INTEGER,

  -- Channel-specific metadata blob. Examples:
  --   beehiiv: { post_id, subtitle_length }
  --   archive: { bytes }
  --   notion:  { page_id }
  --   resend:  { batches }
  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Primary access pattern: "last run" — newest brief_date, all channels for
-- that run. Also serves the per-date history query.
CREATE INDEX IF NOT EXISTS idx_brief_delivery_log_date_run
  ON brief_delivery_log (brief_date DESC, run_id, channel);

-- Secondary: "latest activity across all briefs" for dashboards.
CREATE INDEX IF NOT EXISTS idx_brief_delivery_log_created
  ON brief_delivery_log (created_at DESC);
