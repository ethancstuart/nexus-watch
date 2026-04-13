import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

/**
 * Intelligence API v2 — Scenario Simulation
 *
 * GET /api/v2/scenario?id=hormuz-closure → run preset scenario
 * GET /api/v2/scenario                   → list available scenarios
 *
 * Returns affected countries with CII deltas, cascade chains,
 * historical precedents, and confidence assessment.
 *
 * Requires API key.
 */

// Import scenario engine types (inline to avoid Vite/Node mismatch)
interface PresetScenario {
  id: string;
  name: string;
  description: string;
}

const PRESETS: PresetScenario[] = [
  {
    id: 'hormuz-closure',
    name: 'Strait of Hormuz Closure',
    description: 'Iran closes the Strait of Hormuz to commercial shipping',
  },
  {
    id: 'taiwan-blockade',
    name: 'Taiwan Strait Blockade',
    description: 'China imposes a naval blockade around Taiwan',
  },
  { id: 'suez-disruption', name: 'Suez Canal Disruption', description: 'Suez Canal blocked or severely restricted' },
  {
    id: 'russia-nato',
    name: 'Russia-NATO Escalation',
    description: 'Direct military confrontation between Russia and a NATO member',
  },
  { id: 'nk-nuclear', name: 'North Korea Nuclear Test', description: 'North Korea conducts a nuclear weapons test' },
  {
    id: 'istanbul-earthquake',
    name: 'Major Earthquake — Istanbul',
    description: 'M7.0+ earthquake strikes Istanbul on the North Anatolian Fault',
  },
  { id: 'tehran-earthquake', name: 'Major Earthquake — Tehran', description: 'M7.0+ earthquake strikes Tehran' },
];

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
    // List available scenarios
    return res.json({
      scenarios: PRESETS,
      usage: 'GET /api/v2/scenario?id=hormuz-closure',
      note: 'Scenario simulations model cascading effects through interconnected geopolitical systems. Results include affected countries with estimated CII deltas, cascade chains, and historical precedents.',
    });
  }

  const preset = PRESETS.find((p) => p.id === scenarioId);
  if (!preset) {
    return res.status(404).json({
      error: 'scenario_not_found',
      available: PRESETS.map((p) => p.id),
    });
  }

  // Return a reference to the live simulation
  // Full simulation requires client-side CII data; API provides the framework
  return res.json({
    scenario: preset,
    note:
      'Full scenario simulation requires live CII data. Use the NexusWatch platform at nexuswatch.dev/#/intel and run "scenario ' +
      scenarioId +
      '" in the terminal for real-time results.',
    methodology: {
      model: 'Cascade propagation through defined geopolitical dependency chains',
      components:
        'Chokepoint dependencies, trade route disruption, conflict spillover, refugee flows, market contagion',
      confidence:
        'Simulations are analytical exercises based on historical precedent and defined cascade rules. Actual outcomes may differ significantly.',
    },
  });
}
