import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Public accuracy statistics endpoint.
 * Powers the /#/accuracy trust dashboard.
 *
 * GET /api/accuracy/stats
 *   → { overview, weekly, countries, cascades }
 *
 * Uses V2 numeric scoring: predicted_value vs outcome_value.
 * "Accurate" = outcome_delta < 5 CII points.
 * "Close" = 5 <= outcome_delta < 10.
 * "Miss" = outcome_delta >= 10.
 */

const NAME_MAP: Record<string, string> = {
  UA: 'Ukraine',
  RU: 'Russia',
  CN: 'China',
  TW: 'Taiwan',
  IR: 'Iran',
  IQ: 'Iraq',
  SY: 'Syria',
  IL: 'Israel',
  PS: 'Palestine',
  YE: 'Yemen',
  SD: 'Sudan',
  SS: 'South Sudan',
  ET: 'Ethiopia',
  SO: 'Somalia',
  CD: 'DR Congo',
  MM: 'Myanmar',
  AF: 'Afghanistan',
  PK: 'Pakistan',
  KP: 'North Korea',
  KR: 'South Korea',
  VE: 'Venezuela',
  NG: 'Nigeria',
  LY: 'Libya',
  LB: 'Lebanon',
  SA: 'Saudi Arabia',
  US: 'United States',
  JP: 'Japan',
  DE: 'Germany',
  GB: 'United Kingdom',
  FR: 'France',
  IN: 'India',
  BR: 'Brazil',
  MX: 'Mexico',
  PH: 'Philippines',
  ID: 'Indonesia',
  TR: 'Turkey',
  EG: 'Egypt',
  ZA: 'South Africa',
  KE: 'Kenya',
  BD: 'Bangladesh',
  TH: 'Thailand',
  PL: 'Poland',
  RO: 'Romania',
  CO: 'Colombia',
  MY: 'Malaysia',
  IT: 'Italy',
  ES: 'Spain',
  AU: 'Australia',
  CA: 'Canada',
  AR: 'Argentina',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });

  try {
    const sql = neon(dbUrl);

    // --- Overview stats ---
    const overview = (await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE outcome_scored_at IS NOT NULL) as scored,
        COUNT(*) FILTER (WHERE outcome_scored_at IS NULL) as pending,
        COUNT(*) FILTER (WHERE outcome_delta IS NOT NULL AND outcome_delta < 5) as accurate,
        COUNT(*) FILTER (WHERE outcome_delta IS NOT NULL AND outcome_delta >= 5 AND outcome_delta < 10) as close,
        COUNT(*) FILTER (WHERE outcome_delta IS NOT NULL AND outcome_delta >= 10) as miss,
        AVG(outcome_delta) FILTER (WHERE outcome_scored_at IS NOT NULL) as mean_abs_error,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY outcome_delta)
          FILTER (WHERE outcome_scored_at IS NOT NULL) as median_abs_error,
        MIN(created_at) as first_recorded,
        MAX(outcome_scored_at) as last_scored
      FROM assessments
      WHERE predicted_value IS NOT NULL
    `) as unknown as Array<Record<string, unknown>>;

    const o = overview[0];
    const total = Number(o.total) || 0;
    const scored = Number(o.scored) || 0;
    const accurate = Number(o.accurate) || 0;
    const close = Number(o.close) || 0;
    const miss = Number(o.miss) || 0;
    const mae = o.mean_abs_error != null ? Number(o.mean_abs_error) : null;
    const medianAE = o.median_abs_error != null ? Number(o.median_abs_error) : null;
    const accuracyRate = scored > 0 ? ((accurate + close * 0.5) / scored) * 100 : null;
    const daysActive = o.first_recorded
      ? Math.floor((Date.now() - new Date(String(o.first_recorded)).getTime()) / 86400000)
      : 0;

    // --- Confidence calibration (Brier-style) ---
    // Group by confidence, show accuracy per bin
    const calibration = (await sql`
      SELECT
        predicted_confidence as confidence,
        COUNT(*) as total,
        AVG(outcome_delta) as mean_delta,
        COUNT(*) FILTER (WHERE outcome_delta < 5) as accurate,
        COUNT(*) FILTER (WHERE outcome_delta < 10) as within_10
      FROM assessments
      WHERE outcome_scored_at IS NOT NULL AND predicted_value IS NOT NULL
      GROUP BY predicted_confidence
      ORDER BY
        CASE predicted_confidence
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          WHEN 'low' THEN 3
          ELSE 4
        END
    `) as unknown as Array<Record<string, unknown>>;

    // --- Weekly MAE trend (last 8 weeks) ---
    const weeklyTrend = (await sql`
      SELECT
        date_trunc('week', outcome_scored_at)::date as week,
        COUNT(*) as scored,
        AVG(outcome_delta) as mae,
        COUNT(*) FILTER (WHERE outcome_delta < 5) as accurate
      FROM assessments
      WHERE outcome_scored_at IS NOT NULL
        AND outcome_scored_at > NOW() - INTERVAL '8 weeks'
        AND predicted_value IS NOT NULL
      GROUP BY date_trunc('week', outcome_scored_at)
      ORDER BY week
    `) as unknown as Array<Record<string, unknown>>;

    // --- Biggest misses (top 10 by delta) ---
    const biggestMisses = (await sql`
      SELECT
        country_code,
        snapshot_date,
        predicted_value,
        outcome_value,
        outcome_delta,
        rationale
      FROM assessments
      WHERE outcome_scored_at IS NOT NULL
        AND outcome_delta IS NOT NULL
        AND predicted_value IS NOT NULL
      ORDER BY outcome_delta DESC
      LIMIT 10
    `) as unknown as Array<Record<string, unknown>>;

    // --- Per-country accuracy (top 20 by volume) ---
    const countries = (await sql`
      SELECT
        country_code,
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE outcome_scored_at IS NOT NULL) as scored,
        AVG(outcome_delta) FILTER (WHERE outcome_scored_at IS NOT NULL) as mae,
        COUNT(*) FILTER (WHERE outcome_delta < 5) as accurate,
        AVG(predicted_value) as avg_predicted,
        AVG(outcome_value) FILTER (WHERE outcome_scored_at IS NOT NULL) as avg_actual
      FROM assessments
      WHERE country_code IS NOT NULL AND predicted_value IS NOT NULL
      GROUP BY country_code
      HAVING COUNT(*) FILTER (WHERE outcome_scored_at IS NOT NULL) > 0
      ORDER BY COUNT(*) DESC
      LIMIT 20
    `) as unknown as Array<Record<string, unknown>>;

    // --- Cascade validation (from enrichment endpoint, summarized) ---
    // Inline a simplified version rather than self-calling
    const cascadeRows = (await sql`
      SELECT
        country_code,
        COUNT(*) as predictions,
        AVG(outcome_delta) FILTER (WHERE outcome_scored_at IS NOT NULL) as mae
      FROM assessments
      WHERE prediction_kind != 'cii'
        AND outcome_scored_at IS NOT NULL
        AND predicted_value IS NOT NULL
      GROUP BY country_code
      LIMIT 10
    `) as unknown as Array<Record<string, unknown>>;

    // --- Event-corroboration (does high-risk CII actually coincide with ACLED events?) ---
    // A high-risk prediction is corroborated if the country saw 3+ ACLED events in the
    // 7-day window after snapshot_date. We also surface "conviction misses": predictions
    // with predicted_value >= 70 where ZERO events occurred — the honest signal of
    // overconfidence.
    let corroboration: Record<string, unknown> = {
      enabled: false,
      note: 'ACLED corroboration unavailable.',
    };
    try {
      const corrOverview = (await sql`
        SELECT
          COUNT(*) as high_risk_total,
          COUNT(*) FILTER (WHERE event_count >= 3) as corroborated,
          COUNT(*) FILTER (WHERE event_count = 0) as zero_events,
          AVG(event_count)::float as mean_events
        FROM (
          SELECT
            a.id,
            (
              SELECT COUNT(*)::int FROM acled_events e
              WHERE e.country = a.country_code
                AND e.occurred_at >= a.snapshot_date::timestamptz
                AND e.occurred_at <  (a.snapshot_date + INTERVAL '7 days')::timestamptz
            ) AS event_count
          FROM assessments a
          WHERE a.predicted_value >= 65
            AND a.snapshot_date IS NOT NULL
            AND a.outcome_scored_at IS NOT NULL
            AND a.prediction_kind = 'cii'
        ) sub
      `.catch(() => [] as unknown)) as unknown as Array<{
        high_risk_total: number;
        corroborated: number;
        zero_events: number;
        mean_events: number | null;
      }>;

      const co = Array.isArray(corrOverview) ? corrOverview[0] : undefined;
      if (co && Number(co.high_risk_total) > 0) {
        const total = Number(co.high_risk_total);
        const corr = Number(co.corroborated);
        const zero = Number(co.zero_events);

        // Per-country event lift: high-risk predictions where window events > baseline.
        const corrCountries = (await sql`
          SELECT
            a.country_code,
            COUNT(*)::int as predictions,
            AVG(
              (SELECT COUNT(*)::int FROM acled_events e
               WHERE e.country = a.country_code
                 AND e.occurred_at >= a.snapshot_date::timestamptz
                 AND e.occurred_at <  (a.snapshot_date + INTERVAL '7 days')::timestamptz)
            )::float as mean_window_events,
            AVG(
              (SELECT COUNT(*)::int FROM acled_events e
               WHERE e.country = a.country_code
                 AND e.occurred_at >= (a.snapshot_date - INTERVAL '30 days')::timestamptz
                 AND e.occurred_at <   a.snapshot_date::timestamptz)
            )::float as mean_baseline_events
          FROM assessments a
          WHERE a.predicted_value >= 65
            AND a.snapshot_date IS NOT NULL
            AND a.outcome_scored_at IS NOT NULL
            AND a.prediction_kind = 'cii'
          GROUP BY a.country_code
          HAVING COUNT(*) >= 3
          ORDER BY COUNT(*) DESC
          LIMIT 12
        `.catch(() => [] as unknown)) as unknown as Array<{
          country_code: string;
          predictions: number;
          mean_window_events: number | null;
          mean_baseline_events: number | null;
        }>;

        // Conviction misses: very high-conviction predictions that saw zero events.
        const convictionMisses = (await sql`
          SELECT
            a.country_code,
            a.snapshot_date,
            a.predicted_value,
            a.predicted_confidence,
            a.rationale
          FROM assessments a
          WHERE a.predicted_value >= 70
            AND a.predicted_confidence = 'high'
            AND a.snapshot_date IS NOT NULL
            AND a.outcome_scored_at IS NOT NULL
            AND a.prediction_kind = 'cii'
            AND NOT EXISTS (
              SELECT 1 FROM acled_events e
              WHERE e.country = a.country_code
                AND e.occurred_at >= a.snapshot_date::timestamptz
                AND e.occurred_at <  (a.snapshot_date + INTERVAL '7 days')::timestamptz
            )
          ORDER BY a.snapshot_date DESC
          LIMIT 8
        `.catch(() => [] as unknown)) as unknown as Array<{
          country_code: string;
          snapshot_date: string;
          predicted_value: number;
          predicted_confidence: string;
          rationale: string | null;
        }>;

        corroboration = {
          enabled: true,
          overview: {
            high_risk_total: total,
            corroborated: corr,
            zero_events: zero,
            corroboration_rate_pct: total > 0 ? Number(((corr / total) * 100).toFixed(1)) : 0,
            zero_event_rate_pct: total > 0 ? Number(((zero / total) * 100).toFixed(1)) : 0,
            mean_events_in_window: co.mean_events != null ? Number(Number(co.mean_events).toFixed(2)) : null,
          },
          countries: (Array.isArray(corrCountries) ? corrCountries : []).map((c) => {
            const wnd = c.mean_window_events != null ? Number(c.mean_window_events) : 0;
            const base = c.mean_baseline_events != null ? Number(c.mean_baseline_events) : 0;
            const lift = base > 0 ? Number((wnd / (base / (30 / 7))).toFixed(2)) : null;
            return {
              country_code: c.country_code,
              country_name: NAME_MAP[String(c.country_code)] || String(c.country_code),
              predictions: Number(c.predictions),
              mean_window_events: Number(wnd.toFixed(2)),
              mean_baseline_window_events: Number((base / (30 / 7)).toFixed(2)),
              event_lift: lift,
            };
          }),
          conviction_misses: (Array.isArray(convictionMisses) ? convictionMisses : []).map((m) => ({
            country_code: m.country_code,
            country_name: NAME_MAP[String(m.country_code)] || String(m.country_code),
            date: m.snapshot_date,
            predicted: m.predicted_value != null ? Number(m.predicted_value) : null,
            confidence: m.predicted_confidence,
            rationale: m.rationale,
          })),
          methodology:
            'High-risk predictions (predicted CII ≥ 65) are corroborated by ACLED if the country saw ≥ 3 events in the 7 days after the snapshot. Event lift = window event rate / baseline event rate (prior 30 days, normalized). Conviction misses = predicted ≥ 70 + high confidence + zero ACLED events in window.',
        };
      }
    } catch (e) {
      corroboration = {
        enabled: false,
        note: 'ACLED corroboration query failed: ' + (e instanceof Error ? e.message : 'unknown'),
      };
    }

    return res.json({
      overview: {
        total_predictions: total,
        scored,
        pending: Number(o.pending) || 0,
        accurate,
        close,
        miss,
        accuracy_rate: accuracyRate,
        mean_abs_error: mae != null ? Number(mae.toFixed(2)) : null,
        median_abs_error: medianAE != null ? Number(Number(medianAE).toFixed(2)) : null,
        days_active: daysActive,
        first_recorded: o.first_recorded || null,
        last_scored: o.last_scored || null,
      },
      calibration: calibration.map((c) => ({
        confidence: c.confidence,
        total: Number(c.total),
        mean_delta: c.mean_delta != null ? Number(Number(c.mean_delta).toFixed(2)) : null,
        accuracy_pct: Number(c.total) > 0 ? Number(((Number(c.accurate) / Number(c.total)) * 100).toFixed(1)) : 0,
        within_10_pct: Number(c.total) > 0 ? Number(((Number(c.within_10) / Number(c.total)) * 100).toFixed(1)) : 0,
      })),
      weekly_trend: weeklyTrend.map((w) => ({
        week: w.week,
        scored: Number(w.scored),
        mae: w.mae != null ? Number(Number(w.mae).toFixed(2)) : null,
        accuracy_pct: Number(w.scored) > 0 ? Number(((Number(w.accurate) / Number(w.scored)) * 100).toFixed(1)) : 0,
      })),
      biggest_misses: biggestMisses.map((m) => ({
        country_code: m.country_code,
        country_name: NAME_MAP[String(m.country_code)] || String(m.country_code),
        date: m.snapshot_date,
        predicted: m.predicted_value != null ? Number(m.predicted_value) : null,
        actual: m.outcome_value != null ? Number(m.outcome_value) : null,
        delta: m.outcome_delta != null ? Number(m.outcome_delta) : null,
        rationale: m.rationale,
      })),
      countries: countries.map((c) => ({
        country_code: c.country_code,
        country_name: NAME_MAP[String(c.country_code)] || String(c.country_code),
        total: Number(c.total),
        scored: Number(c.scored),
        mae: c.mae != null ? Number(Number(c.mae).toFixed(2)) : null,
        accuracy_pct: Number(c.scored) > 0 ? Number(((Number(c.accurate) / Number(c.scored)) * 100).toFixed(1)) : 0,
        avg_predicted: c.avg_predicted != null ? Number(Number(c.avg_predicted).toFixed(1)) : null,
        avg_actual: c.avg_actual != null ? Number(Number(c.avg_actual).toFixed(1)) : null,
      })),
      cascade_predictions: cascadeRows.map((c) => ({
        country_code: c.country_code,
        country_name: NAME_MAP[String(c.country_code)] || String(c.country_code),
        predictions: Number(c.predictions),
        mae: c.mae != null ? Number(Number(c.mae).toFixed(2)) : null,
      })),
      event_corroboration: corroboration,
      meta: {
        methodology:
          'V2 numeric scoring: predicted CII vs actual CII after 7-day horizon. Accurate = delta < 5 pts, Close = 5-10 pts, Miss = >10 pts.',
        source: 'NexusWatch Prediction Ledger',
        scoring: {
          accurate: 'Absolute error < 5 CII points',
          close: 'Absolute error 5-10 CII points',
          miss: 'Absolute error > 10 CII points',
        },
      },
    });
  } catch (err) {
    console.error('[api/accuracy/stats]', err instanceof Error ? err.message : err);
    return res.json({
      overview: {
        total_predictions: 0,
        scored: 0,
        pending: 0,
        accurate: 0,
        close: 0,
        miss: 0,
        accuracy_rate: null,
        mean_abs_error: null,
        median_abs_error: null,
        days_active: 0,
        first_recorded: null,
        last_scored: null,
      },
      calibration: [],
      weekly_trend: [],
      biggest_misses: [],
      countries: [],
      cascade_predictions: [],
      event_corroboration: { enabled: false, note: 'No data.' },
      meta: {
        methodology: 'V2 numeric scoring',
        source: 'NexusWatch Prediction Ledger',
        note: 'No data available yet — predictions accumulate daily.',
      },
    });
  }
}
