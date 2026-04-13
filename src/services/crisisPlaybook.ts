/**
 * Crisis Playbooks
 *
 * When a crisis triggers (CII spike > 15 points in 24h, M7+ earthquake,
 * verified military escalation), NexusWatch activates crisis mode:
 *
 * 1. Map focuses on affected region
 * 2. Historical precedent displayed
 * 3. Affected infrastructure highlighted
 * 4. Monitoring priorities activated
 * 5. Running crisis timeline
 * 6. Push notification to relevant subscribers
 */

import { getCachedCII } from './countryInstabilityIndex.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrisisPlaybook {
  id: string;
  name: string;
  triggerType: 'cii_spike' | 'earthquake' | 'military_escalation' | 'infrastructure_disruption' | 'mass_casualty';
  /** Countries affected. */
  affectedCountries: string[];
  /** Map center for crisis focus. */
  focusPoint: { lat: number; lon: number; zoom: number };
  /** Which layers to prioritize in crisis mode. */
  priorityLayers: string[];
  /** Historical precedent. */
  precedent: {
    event: string;
    date: string;
    outcome: string;
  } | null;
  /** Monitoring checklist. */
  monitoringPriorities: string[];
  /** Infrastructure at risk. */
  atRiskInfrastructure: Array<{
    name: string;
    type: string;
    lat: number;
    lon: number;
  }>;
  /** Confidence in playbook relevance. */
  confidence: 'high' | 'medium' | 'low';
}

export interface ActiveCrisis {
  playbook: CrisisPlaybook;
  triggeredAt: number;
  triggerReason: string;
  /** Auto-generated timeline entries. */
  timeline: Array<{
    time: number;
    text: string;
    source: string;
  }>;
}

// ---------------------------------------------------------------------------
// Playbook definitions
// ---------------------------------------------------------------------------

const PLAYBOOKS: CrisisPlaybook[] = [
  {
    id: 'middle-east-escalation',
    name: 'Middle East Military Escalation',
    triggerType: 'military_escalation',
    affectedCountries: ['IL', 'IR', 'LB', 'SY', 'IQ', 'YE', 'SA', 'PS', 'JO'],
    focusPoint: { lat: 31.5, lon: 42.0, zoom: 5 },
    priorityLayers: ['acled', 'flights', 'ships', 'news', 'prediction-markets', 'chokepoint-threat'],
    precedent: {
      event: 'Iran-Israel missile exchange (April 2024)',
      date: '2024-04',
      outcome: 'Tit-for-tat strikes, oil spiked 3%, shipping diverted from Red Sea. De-escalated within 72h.',
    },
    monitoringPriorities: [
      'Iranian military aircraft activity (flights layer)',
      'Strait of Hormuz shipping density (ships layer)',
      'Red Sea / Bab el-Mandeb chokepoint status',
      'Houthi targeting announcements (GDELT)',
      'Polymarket escalation odds',
      'Israeli defense posture (ACLED + news)',
    ],
    atRiskInfrastructure: [
      { name: 'Strait of Hormuz', type: 'chokepoint', lat: 26.56, lon: 56.25 },
      { name: 'Bab el-Mandeb', type: 'chokepoint', lat: 12.58, lon: 43.33 },
      { name: 'Ras Tanura Terminal', type: 'energy', lat: 26.64, lon: 50.15 },
      { name: 'Bushehr NPP', type: 'nuclear', lat: 28.83, lon: 50.89 },
    ],
    confidence: 'high',
  },
  {
    id: 'ukraine-escalation',
    name: 'Ukraine Conflict Escalation',
    triggerType: 'military_escalation',
    affectedCountries: ['UA', 'RU', 'PL', 'RO', 'DE', 'GB', 'FR'],
    focusPoint: { lat: 48.4, lon: 35.0, zoom: 5 },
    priorityLayers: ['acled', 'frontlines', 'flights', 'nuclear', 'gps-jamming', 'news'],
    precedent: {
      event: 'Zaporizhzhia NPP shelling concerns (2022)',
      date: '2022-08',
      outcome: 'IAEA inspection deployed. European gas prices spiked 35%. NATO forces repositioned to eastern flank.',
    },
    monitoringPriorities: [
      'Frontline movement (frontlines layer)',
      'Zaporizhzhia NPP proximity events',
      'GPS jamming zones expansion',
      'NATO eastern flank activity (military bases + flights)',
      'Russian nuclear rhetoric (GDELT sentiment)',
      'Energy infrastructure targeting (pipelines layer)',
    ],
    atRiskInfrastructure: [
      { name: 'Zaporizhzhia NPP', type: 'nuclear', lat: 47.51, lon: 34.58 },
      { name: 'Druzhba Pipeline Hub', type: 'energy', lat: 52.1, lon: 23.7 },
    ],
    confidence: 'high',
  },
  {
    id: 'taiwan-crisis',
    name: 'Taiwan Strait Crisis',
    triggerType: 'military_escalation',
    affectedCountries: ['TW', 'CN', 'JP', 'KR', 'US', 'PH'],
    focusPoint: { lat: 24.0, lon: 121.0, zoom: 5 },
    priorityLayers: ['flights', 'ships', 'acled', 'news', 'prediction-markets'],
    precedent: {
      event: 'Pelosi visit PLA military exercises (2022)',
      date: '2022-08',
      outcome:
        'Live-fire drills encircled Taiwan. TSMC stock dropped 3.5%. Global semiconductor supply chain fears. De-escalated in ~2 weeks.',
    },
    monitoringPriorities: [
      'PLA naval activity in Taiwan Strait (ships layer)',
      'Military aircraft in ADIZ (flights layer)',
      'TSMC production status (news)',
      'US carrier group positioning (ships)',
      'Semiconductor supply chain disruption signals',
      'Polymarket unification/conflict odds',
    ],
    atRiskInfrastructure: [
      { name: 'Taiwan Strait', type: 'chokepoint', lat: 24.0, lon: 119.0 },
      { name: 'Malacca Strait', type: 'chokepoint', lat: 2.5, lon: 101.8 },
    ],
    confidence: 'high',
  },
  {
    id: 'major-earthquake',
    name: 'Major Earthquake (M7.0+)',
    triggerType: 'earthquake',
    affectedCountries: [], // Dynamic based on location
    focusPoint: { lat: 0, lon: 0, zoom: 6 }, // Dynamic
    priorityLayers: ['earthquakes', 'fires', 'nuclear', 'weather-alerts', 'news'],
    precedent: null, // Dynamic based on region
    monitoringPriorities: [
      'Aftershock sequence (earthquakes layer, 24h)',
      'Fire breakout from structural damage (fires layer)',
      'Nuclear facility proximity check',
      'Tsunami warnings (coastal zones)',
      'Infrastructure damage reports (GDELT)',
      'Casualty estimates and humanitarian response',
    ],
    atRiskInfrastructure: [], // Dynamic
    confidence: 'medium',
  },
  {
    id: 'african-conflict-cascade',
    name: 'Sahel Conflict Cascade',
    triggerType: 'cii_spike',
    affectedCountries: ['SD', 'SS', 'TD', 'CF', 'ML', 'BF', 'NE', 'NG', 'ET', 'CD'],
    focusPoint: { lat: 10.0, lon: 20.0, zoom: 4 },
    priorityLayers: ['acled', 'refugees', 'disease-outbreaks', 'fires', 'news'],
    precedent: {
      event: 'Sudan RSF-SAF war (2023-present)',
      date: '2023-04',
      outcome:
        '10M+ displaced, famine conditions in Darfur, refugee flows to Chad/Egypt/Ethiopia. Regional destabilization ongoing.',
    },
    monitoringPriorities: [
      'Conflict event density in Sahel band (ACLED)',
      'Refugee flow direction and volume (UNHCR)',
      'Disease outbreak risk in displacement camps (WHO)',
      'Wagner/Africa Corps activity patterns',
      'Food security indicators',
      'Coup risk signals (governance + sentiment)',
    ],
    atRiskInfrastructure: [],
    confidence: 'high',
  },
];

// ---------------------------------------------------------------------------
// Crisis detection
// ---------------------------------------------------------------------------

let activeCrises: ActiveCrisis[] = [];

export function getActiveCrises(): ActiveCrisis[] {
  return activeCrises;
}

export function getPlaybooks(): CrisisPlaybook[] {
  return PLAYBOOKS;
}

/**
 * Check if any crisis conditions are met based on current CII data.
 * Called from the layer-data event handler.
 */
export function checkCrisisTriggers(layerData: Map<string, unknown>): ActiveCrisis | null {
  const ciiScores = getCachedCII();

  // Check for CII spikes (simplified — production would compare to historical baseline)
  for (const score of ciiScores) {
    if (score.score >= 75 && score.trend === 'rising') {
      // Find a matching playbook
      const playbook = PLAYBOOKS.find(
        (p) => p.affectedCountries.includes(score.countryCode) && p.triggerType !== 'earthquake',
      );
      if (playbook) {
        // Don't re-trigger if already active
        if (activeCrises.some((c) => c.playbook.id === playbook.id)) continue;

        const crisis: ActiveCrisis = {
          playbook,
          triggeredAt: Date.now(),
          triggerReason: `${score.countryName} CII ${score.score} (RISING) — exceeds crisis threshold`,
          timeline: [
            {
              time: Date.now(),
              text: `Crisis detected: ${score.countryName} CII ${score.score} and rising`,
              source: 'NexusWatch CII',
            },
          ],
        };
        activeCrises.push(crisis);
        return crisis;
      }
    }
  }

  // Check for M7+ earthquakes
  const quakes = layerData.get('earthquakes') as
    | Array<{ magnitude?: number; place?: string; lat: number; lon: number }>
    | undefined;
  if (quakes) {
    const major = quakes.filter((q) => (q.magnitude || 0) >= 7.0);
    for (const quake of major) {
      const crisisId = `earthquake-${Math.round(quake.lat)}-${Math.round(quake.lon)}`;
      if (activeCrises.some((c) => c.playbook.id === crisisId)) continue;

      const eqPlaybook = { ...PLAYBOOKS.find((p) => p.id === 'major-earthquake')! };
      eqPlaybook.id = crisisId;
      eqPlaybook.focusPoint = { lat: quake.lat, lon: quake.lon, zoom: 6 };
      eqPlaybook.name = `M${(quake.magnitude || 7).toFixed(1)} Earthquake — ${quake.place || 'Unknown'}`;

      const crisis: ActiveCrisis = {
        playbook: eqPlaybook,
        triggeredAt: Date.now(),
        triggerReason: `M${(quake.magnitude || 7).toFixed(1)} earthquake detected at ${quake.place || 'unknown location'}`,
        timeline: [
          {
            time: Date.now(),
            text: `M${(quake.magnitude || 7).toFixed(1)} earthquake — ${quake.place || 'unknown'}`,
            source: 'USGS',
          },
        ],
      };
      activeCrises.push(crisis);
      return crisis;
    }
  }

  return null;
}

/**
 * Dismiss an active crisis.
 */
export function dismissCrisis(playbookId: string): void {
  activeCrises = activeCrises.filter((c) => c.playbook.id !== playbookId);
}
