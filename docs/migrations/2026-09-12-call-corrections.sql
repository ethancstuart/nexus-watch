-- A call is never rewritten. A correction is recorded BESIDE it.
--
-- Two defects found on 2026-09-12 published misses that were, on the
-- evidence, hits:
--
--   ooni-hourly-bucket  The collector never stated `time_grain=day`, so OONI
--                       answered in hourly buckets and the day-keyed upsert
--                       kept whichever hour arrived last. Every evidence row
--                       from April to 2026-09-08 holds one hour labelled as a
--                       day.
--   final-day-unseen    resolve-calls ran at 09:45 UTC on the day a window
--                       closed, while OONI stores day D at D+1 00:00 UTC. The
--                       final day of every censorship call was scored before
--                       any evidence for it existed. The omission is
--                       one-sided: a hit resolves on evidence alone, so a
--                       missing day can only manufacture a miss.
--
-- The owner's decision (2026-09-12) was to ANNOTATE rather than re-resolve:
-- each affected call keeps the verdict it was published with, and carries the
-- corrected reading beside it. The register stays append-only, and the error
-- is part of the public record rather than erased from it.
--
-- This table is therefore append-only too. `published_status` is what the
-- ledger said on the day; `corrected_status` is what the evidence says now.
-- One row per (call, cause), so a call touched by both defects carries both.
--
-- Applied by hand per repo practice. Every read of this table is a LEFT JOIN,
-- so deploy order is not load-bearing: surfaces simply show no correction
-- until the table exists and is populated.
BEGIN;

CREATE TABLE IF NOT EXISTS call_corrections (
  id SERIAL PRIMARY KEY,
  call_id INTEGER NOT NULL REFERENCES calls (id),
  -- The date the correction was published, not the date the call resolved.
  issued_on DATE NOT NULL DEFAULT CURRENT_DATE,
  cause TEXT NOT NULL CHECK (cause IN ('ooni-hourly-bucket', 'final-day-unseen')),
  published_status TEXT NOT NULL CHECK (published_status IN ('hit', 'miss', 'unresolvable', 'void')),
  corrected_status TEXT NOT NULL CHECK (corrected_status IN ('hit', 'miss', 'unresolvable', 'void')),
  -- Human-readable, and specific: the numbers a reader can check for themselves.
  evidence_note TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (call_id, cause)
);

CREATE INDEX IF NOT EXISTS idx_call_corrections_call ON call_corrections (call_id);
CREATE INDEX IF NOT EXISTS idx_call_corrections_issued ON call_corrections (issued_on DESC);

COMMIT;
