import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Score-assessments cron (daily, 11:00 UTC).
 *
 * Walks every assessments row where outcome_scored_at IS NULL and the
 * horizon has expired, looks up the actual CII on the horizon date, and
 * fills outcome_value + outcome_delta. Runs BEFORE the daily brief so
 * /#/accuracy reflects yesterday's scoring on today's page.
 *
 * Idempotent: if a row was already scored it's skipped via the index
 * predicate.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    const unscored = (await sql`
      SELECT id, country_code, assessed_at, horizon_days, predicted_value, snapshot_cii
      FROM assessments
      WHERE outcome_scored_at IS NULL
        AND assessed_at + make_interval(days => horizon_days) < NOW()
      ORDER BY assessed_at ASC
      LIMIT 500
    `.catch(() => [] as unknown)) as unknown as Array<{
      id: number;
      country_code: string;
      assessed_at: string;
      horizon_days: number;
      predicted_value: number | null;
      snapshot_cii: number | null;
    }>;

    if (!Array.isArray(unscored) || unscored.length === 0) {
      return res.json({ scored: 0, skipped: true });
    }

    let scored = 0;
    for (const row of unscored) {
      const horizonDate = new Date(Date.parse(row.assessed_at) + row.horizon_days * 86400000);
      const iso = horizonDate.toISOString().slice(0, 10);
      const outcomeRows = (await sql`
        SELECT cii_score::float AS score
        FROM cii_daily_snapshots
        WHERE country_code = ${row.country_code}
          AND date <= ${iso}
        ORDER BY date DESC
        LIMIT 1
      `) as unknown as Array<{ score: number }>;
      if (outcomeRows.length === 0) continue;
      const actual = outcomeRows[0].score;
      const predicted = row.predicted_value ?? row.snapshot_cii ?? actual;
      const delta = Math.abs(actual - predicted);
      await sql`
        UPDATE assessments
        SET outcome_value = ${actual},
            outcome_delta = ${delta},
            outcome_scored_at = NOW()
        WHERE id = ${row.id}
      `;
      scored++;
    }
    return res.json({ scored, candidates: unscored.length });
  } catch (err) {
    console.error('[score-assessments]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'score_failed' });
  }
}
