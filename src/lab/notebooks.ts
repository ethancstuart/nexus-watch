/**
 * Starter notebook templates for the Data Lab.
 *
 * Each template is a single-cell SQL query against the public parquet
 * exports + an optional chart hint. Kept in-source (not JSON) so changes
 * ship via the build pipeline like any other content.
 *
 * 2026-05 tier-up Phase 1.
 */

export interface NotebookTemplate {
  id: string;
  title: string;
  description: string;
  sql: string;
  /** Suggested chart kind once the query has run. */
  chart?: { kind: 'line' | 'bar' | 'scatter'; x: string; y: string; series?: string };
}

export const NOTEBOOKS: NotebookTemplate[] = [
  {
    id: 'cii-trend-ukraine',
    title: 'Ukraine CII over time',
    description: 'Daily CII for Ukraine across the full snapshot history. Replace UA with any ISO-2 code.',
    sql: `SELECT date, cii_score
FROM cii
WHERE country_code = 'UA'
ORDER BY date
LIMIT 365`,
    chart: { kind: 'line', x: 'date', y: 'cii_score' },
  },
  {
    id: 'top-movers-30d',
    title: 'Biggest CII movers (last 30 days)',
    description: 'Countries whose CII changed the most between today and 30 days ago.',
    sql: `WITH today AS (
  SELECT country_code, country_name, cii_score AS today_score
  FROM cii
  WHERE date = (SELECT MAX(date) FROM cii)
),
month_ago AS (
  SELECT country_code, cii_score AS old_score
  FROM cii
  WHERE date = (SELECT MAX(date) - INTERVAL 30 DAY FROM cii)
)
SELECT t.country_name, t.country_code,
       t.today_score, m.old_score,
       ROUND(t.today_score - m.old_score, 1) AS delta
FROM today t
JOIN month_ago m USING (country_code)
ORDER BY ABS(t.today_score - m.old_score) DESC
LIMIT 25`,
    chart: { kind: 'bar', x: 'country_name', y: 'delta' },
  },
  {
    id: 'acled-heatmap',
    title: 'ACLED conflict-event volume (last 90 days)',
    description: 'Most-active countries by ACLED event count over the last 90 days.',
    sql: `SELECT country,
       COUNT(*) AS events,
       SUM(COALESCE(fatalities, 0)) AS total_fatalities
FROM acled
GROUP BY country
ORDER BY events DESC
LIMIT 30`,
    chart: { kind: 'bar', x: 'country', y: 'events' },
  },
];
