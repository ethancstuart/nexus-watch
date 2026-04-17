import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Record-assessments cron (daily, 10:30 UTC).
 *
 * For every country in today's cii_daily_snapshots, write an assessments
 * row committing to "our prediction for this country 7 days from now".
 * The prediction is a blended forecast:
 *   - 60% weight on today's score (momentum baseline)
 *   - 40% weight on today's score ± the 7-day delta (continuation of trend)
 *
 * Confidence mirrors the snapshot confidence. Rationale is filled with the
 * snapshot's contributing factors so readers can inspect the call later.
 *
 * Runs before the prediction-scorer (score-assessments.ts) and before the
 * daily-brief so the brief can reference yesterday's outcome.
 *
 * Idempotent: if today's row already exists for a country, we skip it.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    const snapshots = (await sql`
      WITH today AS (
        SELECT country_code, cii_score::float AS score, confidence, date AS today_date
        FROM cii_daily_snapshots
        WHERE date = (SELECT MAX(date) FROM cii_daily_snapshots)
      ),
      week_ago AS (
        SELECT DISTINCT ON (country_code) country_code, cii_score::float AS score
        FROM cii_daily_snapshots
        WHERE date <= (CURRENT_DATE - INTERVAL '7 days')
        ORDER BY country_code, date DESC
      )
      SELECT t.country_code, t.score, t.confidence, t.today_date,
             COALESCE(w.score, t.score) AS prior_score
      FROM today t
      LEFT JOIN week_ago w ON w.country_code = t.country_code
    `) as unknown as Array<{
      country_code: string;
      score: number;
      confidence: string;
      today_date: string;
      prior_score: number;
    }>;

    if (snapshots.length === 0) return res.json({ recorded: 0, skipped: 'no_snapshots' });

    let recorded = 0;
    for (const s of snapshots) {
      // Skip if we already logged a prediction today for this country.
      // Re-throw on genuine errors (schema/permission/connection) — we only
      // want to swallow the "nothing to do" case, not missing-table failures.
      let existing: unknown[];
      try {
        existing = (await sql`
          SELECT 1 FROM assessments
          WHERE country_code = ${s.country_code}
            AND DATE(created_at) = CURRENT_DATE
            AND prediction_kind = 'cii'
          LIMIT 1
        `) as unknown as unknown[];
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        // The only error we genuinely want to swallow is a benign "no rows".
        // Everything else (relation missing, column missing, permission denied)
        // should surface as a 500 so the operator sees it.
        console.error('[record-assessments] dedupe query failed:', msg);
        throw err;
      }
      if (Array.isArray(existing) && existing.length > 0) continue;

      const delta7 = s.score - s.prior_score;
      // Momentum-extrapolated 7-day forecast.
      const predicted = Math.max(0, Math.min(100, 0.6 * s.score + 0.4 * (s.score + delta7)));
      const rationale = `Baseline ${s.score.toFixed(1)}, 7d trend ${delta7 >= 0 ? '+' : ''}${delta7.toFixed(1)}. Forecast assumes trend continues at 40% weight.`;

      await sql`
        INSERT INTO assessments
          (date, country_code, assessment_type, assessment_text,
           cii_score_at_time, confidence,
           prediction_kind, predicted_value, predicted_confidence,
           rationale, horizon_days, snapshot_cii, snapshot_date)
        VALUES
          (${s.today_date}, ${s.country_code}, 'cii_snapshot', ${rationale},
           ${Math.round(s.score)}, ${s.confidence},
           'cii', ${predicted}, ${s.confidence},
           ${rationale}, 7, ${s.score}, ${s.today_date})
      `;
      recorded++;
    }
    return res.json({ recorded, candidates: snapshots.length });
  } catch (err) {
    console.error('[record-assessments]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'record_failed' });
  }
}
