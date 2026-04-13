/**
 * Scenario Simulation Engine
 *
 * "What happens if Iran closes the Strait of Hormuz?"
 *
 * The engine models cascading effects through interconnected geopolitical
 * systems. Nobody in the consumer geopolitical intel space does forward-
 * looking what-if analysis. This is the marquee feature.
 *
 * How it works:
 * 1. User describes a scenario (free text or preset)
 * 2. Engine identifies affected systems (chokepoints, countries, commodities)
 * 3. Cascades through CII components using defined propagation rules
 * 4. Estimates CII deltas for affected countries
 * 5. References historical precedents
 * 6. AI synthesizes a scenario brief with confidence levels
 */

import { getCachedCII } from './countryInstabilityIndex.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScenarioResult {
  /** Scenario name / title. */
  name: string;
  /** User's original query. */
  query: string;
  /** Affected countries with estimated CII deltas. */
  affectedCountries: Array<{
    code: string;
    name: string;
    currentCII: number;
    estimatedCII: number;
    delta: number;
    reason: string;
  }>;
  /** Affected infrastructure (chokepoints, pipelines, etc.). */
  affectedInfrastructure: Array<{
    name: string;
    type: string;
    lat: number;
    lon: number;
    impact: string;
  }>;
  /** Historical precedents. */
  precedents: Array<{
    event: string;
    date: string;
    outcome: string;
  }>;
  /** Cascade chains — how effects propagate. */
  cascades: Array<{
    from: string;
    to: string;
    mechanism: string;
    magnitude: 'high' | 'medium' | 'low';
  }>;
  /** Confidence level of the simulation. */
  confidence: 'high' | 'medium' | 'low';
  confidenceNote: string;
  /** Timestamp of simulation. */
  simulatedAt: number;
}

// ---------------------------------------------------------------------------
// Chokepoint & cascade definitions
// ---------------------------------------------------------------------------

interface Chokepoint {
  name: string;
  lat: number;
  lon: number;
  /** Percentage of global oil transit flowing through this point. */
  oilTransitPct: number;
  /** Countries most affected by closure. */
  dependentCountries: string[];
  /** Historical closure/disruption events. */
  precedents: Array<{ event: string; date: string; outcome: string }>;
}

const CHOKEPOINTS: Record<string, Chokepoint> = {
  hormuz: {
    name: 'Strait of Hormuz',
    lat: 26.56,
    lon: 56.25,
    oilTransitPct: 21,
    dependentCountries: ['JP', 'KR', 'IN', 'CN', 'DE', 'FR', 'IT', 'ES'],
    precedents: [
      {
        event: '2019 Strait of Hormuz tanker attacks',
        date: '2019-06',
        outcome: 'Oil spiked 15% in 48h. Insurance premiums for Gulf shipping tripled.',
      },
      {
        event: '2012 Iranian threat to close Strait',
        date: '2012-01',
        outcome: 'Oil prices rose 4% on threat alone. US deployed additional carrier group.',
      },
    ],
  },
  suez: {
    name: 'Suez Canal',
    lat: 30.46,
    lon: 32.34,
    oilTransitPct: 12,
    dependentCountries: ['DE', 'FR', 'IT', 'ES', 'GB', 'NL', 'TR', 'EG'],
    precedents: [
      {
        event: 'Ever Given blockage',
        date: '2021-03',
        outcome: '6-day blockage cost $9.6B/day in trade. 400+ ships queued. Container rates spiked 25%.',
      },
    ],
  },
  'bab-el-mandeb': {
    name: 'Bab el-Mandeb',
    lat: 12.58,
    lon: 43.33,
    oilTransitPct: 9,
    dependentCountries: ['EG', 'SA', 'IL', 'JO', 'IT', 'FR', 'DE'],
    precedents: [
      {
        event: 'Houthi shipping attacks',
        date: '2024-01',
        outcome: 'Major shipping lines rerouted via Cape of Good Hope. Transit time +10 days, costs +300%.',
      },
    ],
  },
  malacca: {
    name: 'Strait of Malacca',
    lat: 2.5,
    lon: 101.8,
    oilTransitPct: 28,
    dependentCountries: ['CN', 'JP', 'KR', 'TW', 'ID', 'MY', 'SG', 'PH'],
    precedents: [
      {
        event: 'Piracy surge 2014-2015',
        date: '2015',
        outcome: 'Insurance premiums doubled for Malacca transits. Joint patrols established.',
      },
    ],
  },
  taiwan: {
    name: 'Taiwan Strait',
    lat: 24.0,
    lon: 119.0,
    oilTransitPct: 0,
    dependentCountries: ['TW', 'JP', 'KR', 'US', 'CN', 'DE'],
    precedents: [
      {
        event: '2022 Pelosi visit military exercises',
        date: '2022-08',
        outcome:
          'TSMC stock dropped 3.5%. Semiconductor supply chain disruption fears. Live-fire drills encircled Taiwan.',
      },
    ],
  },
  panama: {
    name: 'Panama Canal',
    lat: 9.08,
    lon: -79.68,
    oilTransitPct: 6,
    dependentCountries: ['US', 'CN', 'JP', 'CL', 'PE', 'CO', 'MX'],
    precedents: [
      {
        event: '2023 drought transit restrictions',
        date: '2023-10',
        outcome: 'Daily transits cut from 36 to 24. Ships waited 21 days. LNG spot prices spiked.',
      },
    ],
  },
};

interface CascadeRule {
  /** Trigger condition. */
  trigger: string;
  /** Countries affected. */
  targets: string[];
  /** Which CII component is impacted. */
  component: 'conflict' | 'disasters' | 'sentiment' | 'infrastructure' | 'governance' | 'marketExposure';
  /** How much the component increases (0-20 scale). */
  delta: number;
  /** Explanation. */
  mechanism: string;
}

const CASCADE_RULES: CascadeRule[] = [
  // Chokepoint closures → energy-dependent nations
  {
    trigger: 'hormuz_closure',
    targets: ['JP', 'KR', 'IN', 'CN', 'DE', 'FR'],
    component: 'marketExposure',
    delta: 8,
    mechanism: 'Oil supply disruption — 21% of global crude transits Hormuz',
  },
  {
    trigger: 'hormuz_closure',
    targets: ['IR', 'SA', 'AE', 'QA', 'IQ'],
    component: 'conflict',
    delta: 5,
    mechanism: 'Regional military escalation risk',
  },
  {
    trigger: 'suez_disruption',
    targets: ['DE', 'FR', 'IT', 'ES', 'GB'],
    component: 'marketExposure',
    delta: 5,
    mechanism: 'European trade route disruption',
  },
  {
    trigger: 'suez_disruption',
    targets: ['EG'],
    component: 'marketExposure',
    delta: 10,
    mechanism: 'Egypt loses $7B+ annual canal revenue',
  },
  {
    trigger: 'taiwan_blockade',
    targets: ['TW'],
    component: 'conflict',
    delta: 15,
    mechanism: 'Direct military confrontation',
  },
  {
    trigger: 'taiwan_blockade',
    targets: ['JP', 'KR', 'US', 'DE'],
    component: 'marketExposure',
    delta: 12,
    mechanism: 'Semiconductor supply chain collapse — TSMC produces 90% of advanced chips',
  },
  {
    trigger: 'taiwan_blockade',
    targets: ['CN'],
    component: 'marketExposure',
    delta: 8,
    mechanism: 'Global sanctions cascade + trade war escalation',
  },
  // Conflict escalation cascades
  {
    trigger: 'russia_nato_escalation',
    targets: ['PL', 'RO', 'DE', 'FR', 'GB'],
    component: 'conflict',
    delta: 6,
    mechanism: 'NATO Article 5 proximity risk',
  },
  {
    trigger: 'russia_nato_escalation',
    targets: ['UA'],
    component: 'conflict',
    delta: 2,
    mechanism: 'Intensified frontline operations',
  },
  {
    trigger: 'north_korea_test',
    targets: ['KR', 'JP'],
    component: 'conflict',
    delta: 5,
    mechanism: 'Immediate defense posture escalation',
  },
  {
    trigger: 'north_korea_test',
    targets: ['US', 'CN'],
    component: 'governance',
    delta: 3,
    mechanism: 'Diplomatic crisis, UN Security Council mobilization',
  },
  // Natural disaster cascades
  {
    trigger: 'major_earthquake_istanbul',
    targets: ['TR'],
    component: 'disasters',
    delta: 12,
    mechanism: 'Projected 7.0+ earthquake on North Anatolian Fault',
  },
  {
    trigger: 'major_earthquake_istanbul',
    targets: ['DE', 'FR', 'GB'],
    component: 'sentiment',
    delta: 3,
    mechanism: 'Refugee flow + humanitarian response mobilization',
  },
  {
    trigger: 'major_earthquake_tehran',
    targets: ['IR'],
    component: 'disasters',
    delta: 14,
    mechanism: 'Tehran sits on multiple active faults, 9M+ population',
  },
  {
    trigger: 'major_earthquake_tehran',
    targets: ['IQ', 'AF', 'PK'],
    component: 'infrastructure',
    delta: 3,
    mechanism: 'Cross-border infrastructure disruption',
  },
];

// ---------------------------------------------------------------------------
// Preset scenarios
// ---------------------------------------------------------------------------

export interface PresetScenario {
  id: string;
  name: string;
  description: string;
  triggers: string[];
  chokepoints: string[];
}

export const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: 'hormuz-closure',
    name: 'Strait of Hormuz Closure',
    description: 'Iran closes the Strait of Hormuz to commercial shipping',
    triggers: ['hormuz_closure'],
    chokepoints: ['hormuz'],
  },
  {
    id: 'taiwan-blockade',
    name: 'Taiwan Strait Blockade',
    description: 'China imposes a naval blockade around Taiwan',
    triggers: ['taiwan_blockade'],
    chokepoints: ['taiwan'],
  },
  {
    id: 'suez-disruption',
    name: 'Suez Canal Disruption',
    description: 'Suez Canal blocked or severely restricted',
    triggers: ['suez_disruption'],
    chokepoints: ['suez', 'bab-el-mandeb'],
  },
  {
    id: 'russia-nato',
    name: 'Russia-NATO Escalation',
    description: 'Direct military confrontation between Russia and a NATO member',
    triggers: ['russia_nato_escalation'],
    chokepoints: [],
  },
  {
    id: 'nk-nuclear',
    name: 'North Korea Nuclear Test',
    description: 'North Korea conducts a nuclear weapons test',
    triggers: ['north_korea_test'],
    chokepoints: [],
  },
  {
    id: 'istanbul-earthquake',
    name: 'Major Earthquake — Istanbul',
    description: 'M7.0+ earthquake strikes Istanbul on the North Anatolian Fault',
    triggers: ['major_earthquake_istanbul'],
    chokepoints: [],
  },
  {
    id: 'tehran-earthquake',
    name: 'Major Earthquake — Tehran',
    description: 'M7.0+ earthquake strikes Tehran',
    triggers: ['major_earthquake_tehran'],
    chokepoints: [],
  },
];

// ---------------------------------------------------------------------------
// Simulation engine
// ---------------------------------------------------------------------------

/**
 * Run a scenario simulation from a preset or free-text query.
 */
export function simulateScenario(presetId: string): ScenarioResult | null {
  const preset = PRESET_SCENARIOS.find((p) => p.id === presetId);
  if (!preset) return null;

  const currentScores = getCachedCII();
  const scoreMap = new Map(currentScores.map((s) => [s.countryCode, s]));

  // Collect all applicable cascade rules
  const applicableRules = CASCADE_RULES.filter((r) => preset.triggers.includes(r.trigger));

  // Compute CII deltas per country
  const deltas = new Map<string, { delta: number; reasons: string[] }>();
  const cascades: ScenarioResult['cascades'] = [];

  for (const rule of applicableRules) {
    for (const target of rule.targets) {
      const existing = deltas.get(target) || { delta: 0, reasons: [] };
      existing.delta += rule.delta;
      existing.reasons.push(rule.mechanism);
      deltas.set(target, existing);

      cascades.push({
        from: preset.name,
        to: target,
        mechanism: rule.mechanism,
        magnitude: rule.delta >= 8 ? 'high' : rule.delta >= 4 ? 'medium' : 'low',
      });
    }
  }

  // Build affected countries list
  const affectedCountries: ScenarioResult['affectedCountries'] = [];
  for (const [code, { delta, reasons }] of deltas) {
    const current = scoreMap.get(code);
    const currentCII = current?.score ?? 0;
    const estimatedCII = Math.min(100, currentCII + delta);
    const countryName = current?.countryName ?? currentScores.find((s) => s.countryCode === code)?.countryName ?? code;

    affectedCountries.push({
      code,
      name: countryName,
      currentCII,
      estimatedCII,
      delta,
      reason: reasons.join('; '),
    });
  }

  // Sort by delta descending
  affectedCountries.sort((a, b) => b.delta - a.delta);

  // Collect chokepoint infrastructure
  const affectedInfrastructure: ScenarioResult['affectedInfrastructure'] = [];
  for (const cpId of preset.chokepoints) {
    const cp = CHOKEPOINTS[cpId];
    if (cp) {
      affectedInfrastructure.push({
        name: cp.name,
        type: 'chokepoint',
        lat: cp.lat,
        lon: cp.lon,
        impact: `${cp.oilTransitPct}% of global oil transit affected`,
      });
    }
  }

  // Collect precedents
  const precedents: ScenarioResult['precedents'] = [];
  for (const cpId of preset.chokepoints) {
    const cp = CHOKEPOINTS[cpId];
    if (cp) precedents.push(...cp.precedents);
  }

  // Confidence assessment
  const hasHistoricalPrecedent = precedents.length > 0;
  const hasManyRules = applicableRules.length >= 3;

  return {
    name: preset.name,
    query: preset.description,
    affectedCountries,
    affectedInfrastructure,
    precedents,
    cascades,
    confidence: hasHistoricalPrecedent && hasManyRules ? 'medium' : 'low',
    confidenceNote: hasHistoricalPrecedent
      ? 'Based on historical precedent + defined cascade rules. Actual outcomes may differ significantly.'
      : 'Speculative simulation based on defined cascade rules. No direct historical precedent. Treat as analytical exercise.',
    simulatedAt: Date.now(),
  };
}

/**
 * Match a free-text query to the closest preset scenario.
 * Returns null if no match found.
 */
export function matchScenarioQuery(query: string): PresetScenario | null {
  const q = query.toLowerCase();
  for (const preset of PRESET_SCENARIOS) {
    const keywords = preset.name.toLowerCase().split(/\s+/);
    const matches = keywords.filter((k) => q.includes(k)).length;
    if (matches >= 2) return preset;
    // Also check description keywords
    const descWords = preset.description.toLowerCase().split(/\s+/);
    const descMatches = descWords.filter((w) => q.includes(w)).length;
    if (descMatches >= 3) return preset;
  }
  return null;
}
