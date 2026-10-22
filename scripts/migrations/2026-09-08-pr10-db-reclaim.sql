-- PR-10: database reclaim — drop code-orphaned tables + history retention.
--
-- DO NOT RUN without the owner's explicit go. Dropping tables is the one
-- destructive step of the subtraction arc. Neon PITR is the rollback story;
-- note the execution timestamp when you run this.
--
-- HOW THE LIST WAS DERIVED (2026-09-08, re-derived at preparation as the plan
-- required — the queued list from 09-06 was NOT trusted):
--   1. Enumerate all 67 public base tables from pg_class (the live schema,
--      not a hand list — rule 5).
--   2. Scan every tracked .ts/.mjs/.js/.sql under api/, src/, scripts/ for
--      each table name as a whole word, with block and line comments
--      STRIPPED first — the raw scan matched prose three times (the
--      collector-health doc header, the personas prompt line, the api/v1
--      docs comment), the same grep-matches-prose trap as the Intel Map
--      reachability sweep.
--   3. References from scripts/migrations/* and the tier-up apply script are
--      historical, not consumers; they keep nothing alive.
--   4. Surviving edge cases were opened by hand:
--        - assessments: its only non-comment references are the guard test
--          api/_lib/assessments-not-published.test.ts, which scans sql``
--          template contents across api/ and PROVES no query touches the
--          table — the guard is the drop's justification, and it stays.
--        - vdem_indicators: referenced only as a fixture string in
--          collector-health.test.ts; the test never touches the DB.
--        - crisis_triggers: EXCLUDED — compute-cii.ts INSERTs into it
--          (lines ~511/558). Live, whatever reads it later.
--   5. collector-health derives its probe set from the 6 live collectors at
--      call time; it names no dead table in code.
--
-- Pre-drop counts (taken 2026-09-08, read-only). An orphaned table has no
-- writer, so these counts must still match at execution; the DO block below
-- aborts the transaction on any mismatch. A mismatch means something IS
-- writing — investigate, never override.

BEGIN;

DO $$
DECLARE
  expected CONSTANT jsonb := '{
    "airspace_closures": 0, "alert_history": 0, "alert_rules": 0,
    "api_keys": 0, "api_usage": 0, "assessments": 12000, "audio_briefs": 0,
    "commodity_prices": 236, "competitor_snapshots": 60,
    "copernicus_damage": 0, "council_persona_outputs": 5, "council_runs": 1,
    "data_exports": 0, "data_lake": 12049, "displacement_tracking": 0,
    "email_alert_sends": 0, "food_security_phases": 0,
    "forecast_backtests": 228, "forecast_weights": 14,
    "marketing_engagement": 0, "marketing_posts": 143,
    "marketing_prompt_variants": 0, "marketing_topics_used": 136,
    "marketing_voice_context": 0, "noaa_storms": 20,
    "refugee_populations": 945, "remittance_flows": 0,
    "scheduled_emails": 4, "social_actions": 0, "social_queue": 0,
    "sovereign_yields": 0, "trade_volumes": 0, "vessel_gaps": 436,
    "vessel_positions": 10883, "vdem_indicators": 0,
    "webhook_deliveries": 0, "webhook_subscriptions": 0, "x_alert_log": 229
  }'::jsonb;
  t text;
  want int;
  got int;
BEGIN
  FOR t, want IN SELECT key, value::int FROM jsonb_each_text(expected) LOOP
    EXECUTE format('SELECT COUNT(*) FROM %I', t) INTO got;
    IF got <> want THEN
      RAISE EXCEPTION 'PR-10 ABORT: % has % rows, expected % — something is writing to an "orphaned" table; investigate before dropping', t, got, want;
    END IF;
  END LOOP;
  RAISE NOTICE 'PR-10: all 38 pre-drop counts verified';
END $$;

DROP TABLE IF EXISTS
  airspace_closures, alert_history, alert_rules, api_keys, api_usage,
  assessments, audio_briefs, commodity_prices, competitor_snapshots,
  copernicus_damage, council_persona_outputs, council_runs, data_exports,
  data_lake, displacement_tracking, email_alert_sends, food_security_phases,
  forecast_backtests, forecast_weights, marketing_engagement, marketing_posts,
  marketing_prompt_variants, marketing_topics_used, marketing_voice_context,
  noaa_storms, refugee_populations, remittance_flows, scheduled_emails,
  social_actions, social_queue, sovereign_yields, trade_volumes, vessel_gaps,
  vessel_positions, vdem_indicators, webhook_deliveries, webhook_subscriptions,
  x_alert_log
CASCADE;

COMMIT;

-- Retention: country_cii_history to 90 days. SEPARATE transaction on
-- purpose — a 1.39M-row delete should not hold locks alongside the drops,
-- and either half is worth having without the other.
--
-- Safety at derivation time: 3,229,558 rows total, 1,385,417 older than 90
-- days (oldest 2026-04-08). Every live reader is latest-first with a small
-- LIMIT — api/v1/cii.ts LIMIT 168 (7 days of hourly rows) is the deepest
-- lookback, a 12x margin under the 90-day floor. api/cii.ts and api/og.ts
-- read LIMIT 1 / latest-per-country only.

BEGIN;
DELETE FROM country_cii_history WHERE "timestamp" < CURRENT_DATE - 90;
COMMIT;

-- Postscript, not run here: VACUUM cannot run inside a transaction block.
-- After both transactions, reclaim the space with:
--   VACUUM (ANALYZE) country_cii_history;
