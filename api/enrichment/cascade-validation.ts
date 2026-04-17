import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { PRESET_SCENARIOS, simulateScenario } from '../v2/_scenarios.js';

export const config = { runtime: 'nodejs', maxDuration: 30 };

/**
 * GET /api/enrichment/cascade-validation?scenario=hormuz-closure&days=14
 *
 * Compares scenario-engine predictions against live CII outcomes.
 *
 * How it works:
 *   1. Pick a preset scenario.
 *   2. For each affected country in the scenario, fetch both the current
 *      CII snapshot AND the CII snapshot from `days` days ago.
 *   3. If the delta between "expected" (baseline + scenario's rule delta)
 *      and "actual" (observed CII) is small, the scenario is tracking
 *      reality. If large, the scenario over/under-predicted.
 *
 * This is the "we predicted X, reality delivered Y" surface — the
 * prediction ledger for scenarios. Makes the scenario engine's claims
 * falsifiable.
 *
 * Public endpoint (no auth). Results are cached 10 min via Cache-Control.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const scenarioId = typeof req.query.scenario === 'string' ? req.query.scenario : null;
  const days = Math.min(90, Math.max(1, parseInt(String(req.query.days ?? '14'), 10) || 14));

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    // Latest snapshot + snapshot `days` ago.
    const latest = (await sql`SELECT MAX(date) AS d FROM cii_daily_snapshots`) as unknown as Array<{
      d: string | null;
    }>;
    const snapDate = latest[0]?.d ?? null;
    if (!snapDate) return res.status(503).json({ error: 'data_not_ready' });

    const currentRows = (await sql`
      SELECT country_code, cii_score::float AS score, confidence
      FROM cii_daily_snapshots
      WHERE date = ${snapDate}
    `) as unknown as Array<{ country_code: string; score: number; confidence: string }>;
    const currentMap = new Map(currentRows.map((r) => [r.country_code, { score: r.score, confidence: r.confidence }]));

    const baselineRows = (await sql`
      SELECT DISTINCT ON (country_code) country_code, cii_score::float AS score, confidence
      FROM cii_daily_snapshots
      WHERE date <= (${snapDate}::date - make_interval(days => ${days}))::date
      ORDER BY country_code, date DESC
    `) as unknown as Array<{ country_code: string; score: number; confidence: string }>;
    const baselineMap = new Map(
      baselineRows.map((r) => [r.country_code, { score: r.score, confidence: r.confidence }]),
    );

    if (scenarioId) {
      const validation = validateScenario(scenarioId, baselineMap, currentMap, snapDate);
      if (!validation) return res.status(404).json({ error: 'scenario_not_found' });
      res.setHeader('Cache-Control', 'public, max-age=600');
      return res.json(validation);
    }

    // No specific scenario — return the whole suite.
    const validations = PRESET_SCENARIOS.map((p) => validateScenario(p.id, baselineMap, currentMap, snapDate)).filter(
      Boolean,
    );
    res.setHeader('Cache-Control', 'public, max-age=600');
    return res.json({
      snapshot_date: snapDate,
      window_days: days,
      scenarios: validations,
      methodology:
        'For each preset, we simulate using the CII snapshot from `days` days ago, then compare the predicted CII-after to the current CII. Mean absolute error is the headline number. Anything under ~5 points is "tracking"; 10+ is "diverging".',
    });
  } catch (err) {
    console.error('[enrichment/cascade-validation]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'validation_failed' });
  }
}

interface ScenarioValidation {
  scenario_id: string;
  scenario_name: string;
  baseline_date_approx: string;
  current_date: string;
  per_country: Array<{
    country_code: string;
    predicted_cii: number;
    actual_cii: number;
    abs_error: number;
    signed_error: number;
  }>;
  mean_abs_error: number;
  max_abs_error: number;
  tracking: 'aligned' | 'partial' | 'diverging';
}

function validateScenario(
  scenarioId: string,
  baselineMap: Map<string, { score: number; confidence: string }>,
  currentMap: Map<string, { score: number; confidence: string }>,
  currentDate: string,
): ScenarioValidation | null {
  const scenario = PRESET_SCENARIOS.find((s) => s.id === scenarioId);
  if (!scenario) return null;

  // Simulate starting from the baseline snapshot.
  const sim = simulateScenario(scenarioId, baselineMap, currentDate);
  if (!sim) return null;

  const perCountry: ScenarioValidation['per_country'] = [];
  for (const impact of sim.impacts) {
    const actual = currentMap.get(impact.country_code);
    if (!actual) continue;
    const error = actual.score - impact.cii_after;
    perCountry.push({
      country_code: impact.country_code,
      predicted_cii: impact.cii_after,
      actual_cii: actual.score,
      abs_error: Math.abs(error),
      signed_error: Math.round(error * 10) / 10,
    });
  }
  if (perCountry.length === 0) return null;

  const mae = perCountry.reduce((s, p) => s + p.abs_error, 0) / perCountry.length;
  const maxErr = Math.max(...perCountry.map((p) => p.abs_error));

  const tracking: ScenarioValidation['tracking'] = mae < 5 ? 'aligned' : mae < 10 ? 'partial' : 'diverging';

  return {
    scenario_id: scenarioId,
    scenario_name: scenario.name,
    baseline_date_approx: `${currentDate} minus window`,
    current_date: currentDate,
    per_country: perCountry.sort((a, b) => b.abs_error - a.abs_error),
    mean_abs_error: Math.round(mae * 10) / 10,
    max_abs_error: Math.round(maxErr * 10) / 10,
    tracking,
  };
}
