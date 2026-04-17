import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { PRESET_SCENARIOS, simulateScenario } from './_scenarios.js';

export const config = { runtime: 'nodejs' };

/**
 * Intelligence API v2 — Scenario Simulation
 *
 * GET /api/v2/scenario          → list available scenarios
 * GET /api/v2/scenario?id=<id>  → run preset simulation against latest CII
 *
 * Returns affected countries with actual CII-before/CII-after deltas,
 * cascade chains, and a summary block. Cascade math is deterministic —
 * same inputs yield the same outputs — so downstream consumers can cache.
 *
 * Requires API key.
 */

function validateApiKey(req: VercelRequest): boolean {
  const key = req.headers['x-api-key'] || (typeof req.query.apikey === 'string' ? req.query.apikey : null);
  const validKeys = (process.env.API_V2_KEYS || '').split(',').filter(Boolean);
  if (validKeys.length === 0) return false;
  return typeof key === 'string' && validKeys.includes(key);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'X-API-Key, Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  if (!validateApiKey(req)) {
    return res.status(401).json({ error: 'unauthorized', message: 'Valid API key required.' });
  }

  const scenarioId = typeof req.query.id === 'string' ? req.query.id : null;

  if (!scenarioId) {
    return res.json({
      scenarios: PRESET_SCENARIOS,
      usage: 'GET /api/v2/scenario?id=hormuz-closure',
      note: 'Scenario simulations model cascading CII effects through defined dependency rules. Results are deterministic given a fixed CII snapshot — use `meta.snapshot_date` to track which day the result applies to.',
    });
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sql: any = neon(dbUrl);

  try {
    const latest = (await sql`SELECT MAX(date) AS d FROM cii_daily_snapshots`) as unknown as Array<{
      d: string | null;
    }>;
    const date = latest[0]?.d ?? null;

    const ciiMap = new Map<string, { score: number; confidence: string }>();
    if (date) {
      const rows = (await sql`
        SELECT country_code, cii_score::float AS score, confidence
        FROM cii_daily_snapshots
        WHERE date = ${date}
      `) as unknown as Array<{ country_code: string; score: number; confidence: string }>;
      for (const r of rows) ciiMap.set(r.country_code, { score: r.score, confidence: r.confidence });
    }

    const result = simulateScenario(scenarioId, ciiMap, date);
    if (!result) {
      return res.status(404).json({ error: 'scenario_not_found', available: PRESET_SCENARIOS.map((p) => p.id) });
    }

    res.setHeader('Cache-Control', 'public, max-age=300');
    return res.json({
      data: result,
      meta: {
        source: 'NexusWatch Scenario Engine v1',
        methodology:
          'Deterministic cascade-rule propagation. Each preset resolves to one or more triggers; each trigger has per-country component deltas. Deltas sum across rules and cap CII in [0, 100]. Baseline CII is the most recent day in cii_daily_snapshots.',
        snapshot_date: date,
        docs: 'https://nexuswatch.dev/#/api',
      },
    });
  } catch (err) {
    console.error('[api/v2/scenario] error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'internal_error' });
  }
}
