/**
 * _scenarios.ts — server-side scenario engine
 *
 * Vendored from src/services/scenarioEngine.ts (api/ can't reach into
 * src/). Keep synced when new rules are added. The rule table is the
 * model of record: each rule says "when trigger X fires, add `delta`
 * to component Y for each country in targets[]".
 *
 * Exported for use by api/v2/scenario.ts and future callers.
 */

export type ComponentKey = 'conflict' | 'disasters' | 'sentiment' | 'infrastructure' | 'governance' | 'marketExposure';

export interface CascadeRule {
  trigger: string;
  targets: string[];
  component: ComponentKey;
  delta: number;
  mechanism: string;
}

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

export const CASCADE_RULES: CascadeRule[] = [
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

export interface ScenarioCountryImpact {
  country_code: string;
  cii_before: number;
  cii_after: number;
  delta: number;
  reasons: string[];
  confidence: string | null;
}

export interface ScenarioResult {
  scenario: PresetScenario;
  snapshot_date: string | null;
  impacts: ScenarioCountryImpact[];
  cascades: Array<{ from: string; to: string; mechanism: string; magnitude: 'low' | 'medium' | 'high' }>;
  summary: {
    countries_affected: number;
    mean_delta: number;
    max_delta: number;
    most_affected: string | null;
  };
}

export function simulateScenario(
  presetId: string,
  currentCii: Map<string, { score: number; confidence: string }>,
  snapshotDate: string | null,
): ScenarioResult | null {
  const preset = PRESET_SCENARIOS.find((p) => p.id === presetId);
  if (!preset) return null;

  const applicable = CASCADE_RULES.filter((r) => preset.triggers.includes(r.trigger));
  const deltas = new Map<string, { delta: number; reasons: string[] }>();
  const cascades: ScenarioResult['cascades'] = [];

  for (const rule of applicable) {
    for (const target of rule.targets) {
      const entry = deltas.get(target) ?? { delta: 0, reasons: [] };
      entry.delta += rule.delta;
      entry.reasons.push(rule.mechanism);
      deltas.set(target, entry);

      cascades.push({
        from: preset.name,
        to: target,
        mechanism: rule.mechanism,
        magnitude: rule.delta >= 8 ? 'high' : rule.delta >= 4 ? 'medium' : 'low',
      });
    }
  }

  const impacts: ScenarioCountryImpact[] = [];
  for (const [code, { delta, reasons }] of deltas) {
    const cur = currentCii.get(code);
    const before = cur?.score ?? 0;
    const after = Math.min(100, Math.max(0, before + delta));
    impacts.push({
      country_code: code,
      cii_before: Math.round(before * 10) / 10,
      cii_after: Math.round(after * 10) / 10,
      delta: Math.round((after - before) * 10) / 10,
      reasons,
      confidence: cur?.confidence ?? null,
    });
  }
  impacts.sort((a, b) => b.delta - a.delta);

  const deltaValues = impacts.map((i) => i.delta);
  const meanDelta = deltaValues.length > 0 ? deltaValues.reduce((s, d) => s + d, 0) / deltaValues.length : 0;
  const maxDelta = deltaValues.length > 0 ? Math.max(...deltaValues) : 0;

  return {
    scenario: preset,
    snapshot_date: snapshotDate,
    impacts,
    cascades,
    summary: {
      countries_affected: impacts.length,
      mean_delta: Math.round(meanDelta * 10) / 10,
      max_delta: Math.round(maxDelta * 10) / 10,
      most_affected: impacts[0]?.country_code ?? null,
    },
  };
}
