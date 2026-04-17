import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 30 };

/**
 * Dedicated CII Snapshot Cron
 *
 * Reads latest scores from country_cii_history and inserts into
 * cii_daily_snapshots. Runs at 09:00 UTC daily — 1 hour before the
 * daily brief (10:00) and before record-assessments (10:30).
 *
 * Belt-and-suspenders: the daily-brief cron also inserts snapshots,
 * but this dedicated cron ensures snapshots exist even if the brief
 * fails (e.g. Anthropic API issues, timeout, etc.).
 *
 * ON CONFLICT DO NOTHING makes both paths safe to run.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.authorization?.replace('Bearer ', '');
    if (auth !== cronSecret) return res.status(401).json({ error: 'unauthorized' });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });

  try {
    const sql = neon(dbUrl);
    const today = new Date().toISOString().slice(0, 10);

    // Check if we already have snapshots for today
    const existing = (await sql`
      SELECT COUNT(*) as cnt FROM cii_daily_snapshots WHERE date = ${today}
    `) as unknown as Array<{ cnt: string }>;

    if (Number(existing[0].cnt) > 0) {
      return res.json({
        ok: true,
        date: today,
        inserted: 0,
        skipped: true,
        reason: `${existing[0].cnt} snapshots already exist for ${today}`,
      });
    }

    // Get latest CII score per country from history
    const rows = (await sql`
      SELECT DISTINCT ON (country_code)
        country_code, country_name, score, components
      FROM country_cii_history
      ORDER BY country_code, created_at DESC
    `) as unknown as Array<{
      country_code: string;
      country_name: string;
      score: number;
      components: Record<string, number>;
    }>;

    let inserted = 0;
    for (const r of rows) {
      const c = r.components || {};
      await sql`
        INSERT INTO cii_daily_snapshots (
          date, country_code, cii_score, confidence,
          component_conflict, component_disasters, component_sentiment,
          component_infrastructure, component_governance, component_market_exposure,
          source_count, data_point_count
        ) VALUES (
          ${today}, ${r.country_code}, ${r.score}, ${'medium'},
          ${c.conflict ?? null}, ${c.disasters ?? null}, ${c.sentiment ?? null},
          ${c.infrastructure ?? null}, ${c.governance ?? null}, ${c.marketExposure ?? null},
          ${0}, ${0}
        ) ON CONFLICT (date, country_code) DO NOTHING
      `;
      inserted++;
    }

    console.log(`[cii-snapshot] Recorded ${inserted} snapshots for ${today}`);
    return res.json({ ok: true, date: today, inserted });
  } catch (err) {
    console.error('[cii-snapshot]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'unknown' });
  }
}
