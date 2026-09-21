/**
 * Risk Cascade Engine
 *
 * Visualizes how geopolitical instability propagates across interconnected
 * systems. Sudan conflict → refugees to Chad → regional food insecurity →
 * humanitarian crisis cascade.
 *
 * Detects live cascades by analyzing CII scores and known dependency
 * chains, then produces animated arrows for the map overlay.
 */

import { getCachedCII } from './countryInstabilityIndex.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CascadeArrow {
  id: string;
  /** Origin country (the source of instability). */
  from: {
    code: string;
    name: string;
    lat: number;
    lon: number;
  };
  /** Destination country (affected by cascade). */
  to: {
    code: string;
    name: string;
    lat: number;
    lon: number;
  };
  /** Type of cascade mechanism. */
  mechanism:
    | 'refugee_flow'
    | 'energy_disruption'
    | 'trade_disruption'
    | 'conflict_spillover'
    | 'supply_chain'
    | 'market_contagion';
  /** How strong the cascade is (0-1). */
  intensity: number;
  /** Human-readable explanation. */
  description: string;
}

// ---------------------------------------------------------------------------
// Cascade rules — who affects whom and how
// ---------------------------------------------------------------------------

interface CascadeRule {
  from: string;
  to: string;
  mechanism: CascadeArrow['mechanism'];
  /** Minimum CII score on origin to trigger cascade. */
  triggerThreshold: number;
  /** Base intensity (multiplied by origin CII / 100). */
  baseIntensity: number;
  description: string;
}

/**
 * Real-world cascade dependency chains. Grouped by mechanism.
 * Each rule activates when the origin country's CII score exceeds the trigger.
 */
const CASCADE_RULES: CascadeRule[] = [
  // ── Refugee flows (conflict → neighboring countries) ──
  {
    from: 'SD',
    to: 'TD',
    mechanism: 'refugee_flow',
    triggerThreshold: 60,
    baseIntensity: 0.9,
    description: 'Darfur violence → refugees to Chad',
  },
  {
    from: 'SD',
    to: 'EG',
    mechanism: 'refugee_flow',
    triggerThreshold: 60,
    baseIntensity: 0.7,
    description: 'Sudanese displacement to Egypt',
  },
  {
    from: 'SD',
    to: 'ET',
    mechanism: 'refugee_flow',
    triggerThreshold: 60,
    baseIntensity: 0.6,
    description: 'Sudan → Ethiopia refugee corridor',
  },
  {
    from: 'SD',
    to: 'SS',
    mechanism: 'refugee_flow',
    triggerThreshold: 60,
    baseIntensity: 0.8,
    description: 'Sudan → South Sudan cross-border flows',
  },
  {
    from: 'SY',
    to: 'TR',
    mechanism: 'refugee_flow',
    triggerThreshold: 55,
    baseIntensity: 0.8,
    description: 'Syrian displacement to Turkey',
  },
  {
    from: 'SY',
    to: 'JO',
    mechanism: 'refugee_flow',
    triggerThreshold: 55,
    baseIntensity: 0.7,
    description: 'Syria → Jordan refugee pressure',
  },
  {
    from: 'SY',
    to: 'LB',
    mechanism: 'refugee_flow',
    triggerThreshold: 55,
    baseIntensity: 0.7,
    description: 'Syria → Lebanon refugee burden',
  },
  {
    from: 'UA',
    to: 'PL',
    mechanism: 'refugee_flow',
    triggerThreshold: 70,
    baseIntensity: 0.9,
    description: 'Ukrainian refugees to Poland',
  },
  {
    from: 'UA',
    to: 'RO',
    mechanism: 'refugee_flow',
    triggerThreshold: 70,
    baseIntensity: 0.7,
    description: 'Ukraine → Romania humanitarian corridor',
  },
  {
    from: 'UA',
    to: 'DE',
    mechanism: 'refugee_flow',
    triggerThreshold: 70,
    baseIntensity: 0.6,
    description: 'Ukraine → Germany secondary migration',
  },
  {
    from: 'AF',
    to: 'PK',
    mechanism: 'refugee_flow',
    triggerThreshold: 60,
    baseIntensity: 0.8,
    description: 'Afghanistan → Pakistan displacement',
  },
  {
    from: 'AF',
    to: 'IR',
    mechanism: 'refugee_flow',
    triggerThreshold: 60,
    baseIntensity: 0.7,
    description: 'Afghan refugees in Iran',
  },
  {
    from: 'VE',
    to: 'CO',
    mechanism: 'refugee_flow',
    triggerThreshold: 50,
    baseIntensity: 0.9,
    description: 'Venezuelan exodus to Colombia',
  },
  {
    from: 'MM',
    to: 'BD',
    mechanism: 'refugee_flow',
    triggerThreshold: 55,
    baseIntensity: 0.8,
    description: 'Rohingya displacement to Bangladesh',
  },
  {
    from: 'CD',
    to: 'UG',
    mechanism: 'refugee_flow',
    triggerThreshold: 55,
    baseIntensity: 0.6,
    description: 'DRC → Uganda refugee flows',
  },
  {
    from: 'SS',
    to: 'UG',
    mechanism: 'refugee_flow',
    triggerThreshold: 55,
    baseIntensity: 0.7,
    description: 'South Sudan → Uganda displacement',
  },

  // ── Energy disruption ──
  {
    from: 'RU',
    to: 'DE',
    mechanism: 'energy_disruption',
    triggerThreshold: 55,
    baseIntensity: 0.8,
    description: 'Russian gas cutoff → Germany',
  },
  {
    from: 'RU',
    to: 'IT',
    mechanism: 'energy_disruption',
    triggerThreshold: 55,
    baseIntensity: 0.7,
    description: 'Russian energy → Italy dependency',
  },
  {
    from: 'IR',
    to: 'JP',
    mechanism: 'energy_disruption',
    triggerThreshold: 60,
    baseIntensity: 0.8,
    description: 'Hormuz disruption → Japan oil imports',
  },
  {
    from: 'IR',
    to: 'KR',
    mechanism: 'energy_disruption',
    triggerThreshold: 60,
    baseIntensity: 0.8,
    description: 'Hormuz disruption → South Korea',
  },
  {
    from: 'IR',
    to: 'IN',
    mechanism: 'energy_disruption',
    triggerThreshold: 60,
    baseIntensity: 0.7,
    description: 'Iranian oil supply to India',
  },
  {
    from: 'IR',
    to: 'CN',
    mechanism: 'energy_disruption',
    triggerThreshold: 60,
    baseIntensity: 0.6,
    description: 'Hormuz → China energy corridor',
  },
  {
    from: 'SA',
    to: 'US',
    mechanism: 'energy_disruption',
    triggerThreshold: 50,
    baseIntensity: 0.4,
    description: 'Saudi energy → US refined imports',
  },
  {
    from: 'LY',
    to: 'IT',
    mechanism: 'energy_disruption',
    triggerThreshold: 55,
    baseIntensity: 0.6,
    description: 'Libyan oil → Italy',
  },
  {
    from: 'NG',
    to: 'DE',
    mechanism: 'energy_disruption',
    triggerThreshold: 50,
    baseIntensity: 0.4,
    description: 'Nigerian LNG → Europe',
  },

  // ── Trade / supply chain ──
  {
    from: 'TW',
    to: 'US',
    mechanism: 'supply_chain',
    triggerThreshold: 60,
    baseIntensity: 0.9,
    description: 'TSMC semiconductors → US tech sector',
  },
  {
    from: 'TW',
    to: 'JP',
    mechanism: 'supply_chain',
    triggerThreshold: 60,
    baseIntensity: 0.8,
    description: 'Taiwan chips → Japan manufacturing',
  },
  {
    from: 'TW',
    to: 'DE',
    mechanism: 'supply_chain',
    triggerThreshold: 60,
    baseIntensity: 0.7,
    description: 'Taiwan chips → European automotive',
  },
  {
    from: 'CN',
    to: 'US',
    mechanism: 'supply_chain',
    triggerThreshold: 50,
    baseIntensity: 0.8,
    description: 'China-US trade interdependency',
  },
  {
    from: 'CN',
    to: 'DE',
    mechanism: 'supply_chain',
    triggerThreshold: 50,
    baseIntensity: 0.7,
    description: 'China → Germany industrial imports',
  },
  {
    from: 'EG',
    to: 'IT',
    mechanism: 'trade_disruption',
    triggerThreshold: 55,
    baseIntensity: 0.7,
    description: 'Suez disruption → European shipping',
  },
  {
    from: 'EG',
    to: 'DE',
    mechanism: 'trade_disruption',
    triggerThreshold: 55,
    baseIntensity: 0.6,
    description: 'Suez Canal → Germany trade',
  },
  {
    from: 'EG',
    to: 'NL',
    mechanism: 'trade_disruption',
    triggerThreshold: 55,
    baseIntensity: 0.6,
    description: 'Suez → Netherlands port traffic',
  },
  {
    from: 'YE',
    to: 'EG',
    mechanism: 'trade_disruption',
    triggerThreshold: 60,
    baseIntensity: 0.7,
    description: 'Bab el-Mandeb Houthi → Suez revenue',
  },

  // ── Conflict spillover ──
  {
    from: 'IR',
    to: 'IL',
    mechanism: 'conflict_spillover',
    triggerThreshold: 55,
    baseIntensity: 0.9,
    description: 'Iran proxy escalation → Israel',
  },
  {
    from: 'IL',
    to: 'LB',
    mechanism: 'conflict_spillover',
    triggerThreshold: 55,
    baseIntensity: 0.8,
    description: 'Israeli ops → Hezbollah / Lebanon',
  },
  {
    from: 'SY',
    to: 'IL',
    mechanism: 'conflict_spillover',
    triggerThreshold: 55,
    baseIntensity: 0.6,
    description: 'Syrian conflict → Israeli border',
  },
  {
    from: 'RU',
    to: 'UA',
    mechanism: 'conflict_spillover',
    triggerThreshold: 55,
    baseIntensity: 0.9,
    description: 'Russian military ops → Ukraine',
  },
  {
    from: 'RU',
    to: 'PL',
    mechanism: 'conflict_spillover',
    triggerThreshold: 70,
    baseIntensity: 0.5,
    description: 'Russia-NATO proximity risk',
  },
  {
    from: 'KP',
    to: 'KR',
    mechanism: 'conflict_spillover',
    triggerThreshold: 55,
    baseIntensity: 0.7,
    description: 'North Korean provocations → South Korea',
  },
  {
    from: 'KP',
    to: 'JP',
    mechanism: 'conflict_spillover',
    triggerThreshold: 60,
    baseIntensity: 0.6,
    description: 'NK missile tests → Japan',
  },
  {
    from: 'ML',
    to: 'BF',
    mechanism: 'conflict_spillover',
    triggerThreshold: 55,
    baseIntensity: 0.7,
    description: 'Mali jihadist spread → Burkina Faso',
  },
  {
    from: 'BF',
    to: 'NE',
    mechanism: 'conflict_spillover',
    triggerThreshold: 55,
    baseIntensity: 0.7,
    description: 'Burkina Faso → Niger Sahel cascade',
  },
  {
    from: 'NE',
    to: 'NG',
    mechanism: 'conflict_spillover',
    triggerThreshold: 55,
    baseIntensity: 0.6,
    description: 'Niger → Nigeria border insecurity',
  },

  // ── Market contagion ──
  {
    from: 'TR',
    to: 'AR',
    mechanism: 'market_contagion',
    triggerThreshold: 55,
    baseIntensity: 0.5,
    description: 'Emerging market contagion TR→AR',
  },
  {
    from: 'AR',
    to: 'BR',
    mechanism: 'market_contagion',
    triggerThreshold: 55,
    baseIntensity: 0.6,
    description: 'Argentina crisis → Brazil',
  },
  {
    from: 'CN',
    to: 'AU',
    mechanism: 'market_contagion',
    triggerThreshold: 55,
    baseIntensity: 0.7,
    description: 'China slowdown → Australian commodities',
  },
  {
    from: 'RU',
    to: 'KZ',
    mechanism: 'market_contagion',
    triggerThreshold: 55,
    baseIntensity: 0.6,
    description: 'Russian ruble → Kazakh tenge',
  },
];

// ---------------------------------------------------------------------------
// Active cascade detection
// ---------------------------------------------------------------------------

export function detectActiveCascades(): CascadeArrow[] {
  const ciiScores = getCachedCII();
  const ciiMap = new Map(ciiScores.map((s) => [s.countryCode, s]));

  const arrows: CascadeArrow[] = [];

  for (const rule of CASCADE_RULES) {
    const fromCII = ciiMap.get(rule.from);
    const toCII = ciiMap.get(rule.to);

    // Origin must exceed threshold
    if (!fromCII || fromCII.score < rule.triggerThreshold) continue;

    // Need coordinates for both countries — use monitored country list
    const fromCountries = getCachedCII().find((c) => c.countryCode === rule.from);
    if (!fromCountries) continue;

    // Get country coordinates from the evidence chain or monitored list
    // For simplicity, use a lookup based on known country centroids
    const fromCoords = COUNTRY_COORDS[rule.from];
    const toCoords = COUNTRY_COORDS[rule.to];
    if (!fromCoords || !toCoords) continue;

    // Intensity scales with origin CII
    const intensity = Math.min(1, rule.baseIntensity * (fromCII.score / 100) * 1.2);

    arrows.push({
      id: `${rule.from}-${rule.to}-${rule.mechanism}`,
      from: {
        code: rule.from,
        name: fromCII.countryName,
        lat: fromCoords[0],
        lon: fromCoords[1],
      },
      to: {
        code: rule.to,
        name: toCII?.countryName ?? rule.to,
        lat: toCoords[0],
        lon: toCoords[1],
      },
      mechanism: rule.mechanism,
      intensity,
      description: rule.description,
    });
  }

  // Sort by intensity
  arrows.sort((a, b) => b.intensity - a.intensity);

  return arrows;
}

/** Country coordinates for cascade arrow endpoints. */
const COUNTRY_COORDS: Record<string, [number, number]> = {
  SD: [15.5, 32.5],
  TD: [12.1, 15.0],
  EG: [30.0, 31.2],
  ET: [9.1, 40.5],
  SS: [4.9, 31.6],
  SY: [34.8, 38.9],
  TR: [39.9, 32.9],
  JO: [30.6, 36.2],
  LB: [33.9, 35.5],
  UA: [48.4, 31.2],
  PL: [51.9, 19.1],
  RO: [45.9, 24.9],
  DE: [52.5, 13.4],
  AF: [33.9, 67.7],
  PK: [30.4, 69.3],
  IR: [32.4, 53.7],
  VE: [8.0, -66.0],
  CO: [4.6, -74.3],
  MM: [19.8, 96.1],
  BD: [23.7, 90.4],
  CD: [-1.5, 29.0],
  UG: [0.3, 32.6],
  RU: [55.8, 37.6],
  IT: [41.9, 12.6],
  JP: [36.2, 138.3],
  KR: [37.6, 127.0],
  IN: [20.6, 78.9],
  CN: [35.9, 104.2],
  SA: [24.7, 46.7],
  US: [39.8, -98.5],
  LY: [26.3, 17.2],
  NG: [9.1, 7.5],
  TW: [23.5, 121.0],
  NL: [52.5, 5.75],
  YE: [15.6, 48.5],
  IL: [31.0, 35.0],
  KP: [40.0, 127.0],
  ML: [17.6, -4.0],
  BF: [12.3, -1.5],
  NE: [17.6, 8.1],
  AR: [-38.4, -63.6],
  BR: [-15.8, -47.9],
  AU: [-25.3, 133.8],
  KZ: [48.0, 68.0],
};

export function cascadeColor(mechanism: CascadeArrow['mechanism']): string {
  switch (mechanism) {
    case 'refugee_flow':
      return '#eab308'; // yellow
    case 'energy_disruption':
      return '#f97316'; // orange
    case 'trade_disruption':
      return '#6366f1'; // indigo
    case 'conflict_spillover':
      return '#dc2626'; // red
    case 'supply_chain':
      return '#06b6d4'; // cyan
    case 'market_contagion':
      return '#a855f7'; // purple
  }
}
