/**
 * Temporal Pattern Fingerprinting Engine.
 *
 * "This looks like pre-invasion Ukraine 2022."
 *
 * Computes a multi-dimensional fingerprint of each country's current state
 * and performs cosine similarity search against a library of historical
 * crisis fingerprints. When a match exceeds 0.80 similarity, it surfaces:
 * "Sudan's current signature is 91% similar to Ethiopia's pre-Tigray
 * state in October 2020."
 *
 * Fingerprint vector (12 dimensions):
 *   [conflict, disasters, sentiment, infrastructure, governance, marketExposure,
 *    conflict_delta_7d, fx_volatility, ooni_blocked, wiki_z_score,
 *    compound_signal_count, acled_event_density]
 *
 * No competitor does this. This is the moat.
 */

export interface CrisisFingerprint {
  id: string;
  name: string;
  countryCode: string;
  date: string;
  description: string;
  vector: number[];
  outcome: string;
}

export interface PatternMatch {
  crisis: CrisisFingerprint;
  similarity: number;
  currentVector: number[];
}

/**
 * Library of known crisis fingerprints.
 * Each vector is normalized 0-1 per dimension.
 * Built from historical CII data + documented crisis timelines.
 */
const CRISIS_LIBRARY: CrisisFingerprint[] = [
  {
    id: 'ukraine-pre-invasion-2022',
    name: 'Pre-Invasion Ukraine (Feb 2022)',
    countryCode: 'UA',
    date: '2022-02-01',
    description: 'Russian troop buildup, diplomatic breakdown, Wikipedia spikes, CII rising for 6 weeks',
    //          [conf, dis, sent, infra, gov, mkt, Δconf, fxVol, ooni, wiki, compound, acled]
    vector: [0.85, 0.1, 0.8, 0.3, 0.5, 0.7, 0.9, 0.6, 0.2, 0.95, 0.8, 0.7],
    outcome: 'Full-scale Russian invasion February 24, 2022. CII jumped 25+ points in 48 hours.',
  },
  {
    id: 'ethiopia-tigray-2020',
    name: 'Pre-Tigray Conflict (Oct 2020)',
    countryCode: 'ET',
    date: '2020-10-15',
    description: 'Political tensions between federal government and TPLF, election dispute, military positioning',
    vector: [0.7, 0.15, 0.65, 0.2, 0.75, 0.4, 0.8, 0.3, 0.4, 0.6, 0.5, 0.6],
    outcome: 'Ethiopian federal forces attacked TPLF positions November 4, 2020. 2-year civil war.',
  },
  {
    id: 'myanmar-coup-2021',
    name: 'Pre-Coup Myanmar (Jan 2021)',
    countryCode: 'MM',
    date: '2021-01-25',
    description: 'Election fraud allegations, military threats, internet censorship beginning',
    vector: [0.5, 0.05, 0.7, 0.6, 0.9, 0.3, 0.6, 0.2, 0.8, 0.7, 0.6, 0.3],
    outcome: 'Military coup February 1, 2021. Democracy suspended, mass protests, civil war.',
  },
  {
    id: 'sudan-rsf-2023',
    name: 'Pre-RSF War Sudan (Mar 2023)',
    countryCode: 'SD',
    date: '2023-03-15',
    description: 'SAF-RSF integration deadline approaching, power struggle, military positioning in Khartoum',
    vector: [0.75, 0.2, 0.7, 0.3, 0.85, 0.6, 0.85, 0.5, 0.3, 0.5, 0.4, 0.65],
    outcome: 'RSF-SAF war began April 15, 2023. Ongoing conflict, 10M+ displaced.',
  },
  {
    id: 'israel-hamas-2023',
    name: 'Pre-October 7 (Sep 2023)',
    countryCode: 'IL',
    date: '2023-09-20',
    description: 'Judicial reform protests, Hamas military buildup, intelligence gaps, normalized relations focus',
    vector: [0.4, 0.05, 0.5, 0.15, 0.6, 0.3, 0.2, 0.15, 0.1, 0.3, 0.1, 0.2],
    outcome: 'Hamas attack October 7, 2023. Surprise attack — low pre-attack signal is the lesson.',
  },
  {
    id: 'argentina-crisis-2023',
    name: 'Argentina Economic Crisis (Aug 2023)',
    countryCode: 'AR',
    date: '2023-08-01',
    description: 'Peso devaluation, 100%+ inflation, primary election shock, IMF negotiations',
    vector: [0.1, 0.05, 0.6, 0.1, 0.5, 0.95, 0.1, 0.95, 0.05, 0.7, 0.6, 0.05],
    outcome: 'Milei elected November 2023. Peso devalued 54% on day one. Radical economic restructuring.',
  },
  {
    id: 'houthi-red-sea-2023',
    name: 'Houthi Red Sea Campaign (Nov 2023)',
    countryCode: 'YE',
    date: '2023-11-15',
    description: 'Houthi drone/missile attacks on commercial shipping, AIS dark vessels, NOTAM activity',
    vector: [0.8, 0.1, 0.7, 0.5, 0.7, 0.8, 0.7, 0.4, 0.1, 0.6, 0.7, 0.75],
    outcome: 'Global shipping diverted from Red Sea. Suez traffic dropped 40%. US/UK strikes on Houthis.',
  },
  {
    id: 'burkina-faso-coup-2022',
    name: 'Burkina Faso Coup (Jan 2022)',
    countryCode: 'BF',
    date: '2022-01-15',
    description: 'Military protests, jihadist attacks, government failures, internet censorship',
    vector: [0.8, 0.1, 0.6, 0.5, 0.85, 0.3, 0.7, 0.2, 0.7, 0.4, 0.5, 0.7],
    outcome: 'Military coup January 24, 2022. Second coup in September 2022.',
  },
  {
    id: 'niger-coup-2023',
    name: 'Niger Coup (Jul 2023)',
    countryCode: 'NE',
    date: '2023-07-15',
    description: 'Presidential guard tensions, regional instability contagion from Mali/Burkina',
    vector: [0.6, 0.1, 0.5, 0.3, 0.8, 0.3, 0.5, 0.2, 0.4, 0.3, 0.3, 0.5],
    outcome: 'Military coup July 26, 2023. President Bazoum detained. ECOWAS sanctions.',
  },
  {
    id: 'venezuela-crisis-2019',
    name: 'Venezuela Political Crisis (Jan 2019)',
    countryCode: 'VE',
    date: '2019-01-15',
    description: 'Guaidó challenge, hyperinflation, mass migration, sanctions escalation',
    vector: [0.4, 0.1, 0.7, 0.4, 0.9, 0.95, 0.3, 0.9, 0.3, 0.8, 0.5, 0.25],
    outcome: 'Failed power transition. Continued economic collapse. 7M+ refugees by 2023.',
  },
];

/**
 * Compute cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom > 0 ? dot / denom : 0;
}

/**
 * Build a fingerprint vector for a country from current CII + data signals.
 *
 * All values normalized to 0-1 range.
 */
export function buildFingerprint(
  components: {
    conflict: number;
    disasters: number;
    sentiment: number;
    infrastructure: number;
    governance: number;
    marketExposure: number;
  },
  signals: {
    conflictDelta7d?: number;
    fxVolatility?: number;
    ooniBlocked?: number;
    wikiZScore?: number;
    compoundSignalCount?: number;
    acledEventCount?: number;
  },
): number[] {
  return [
    Math.min(1, components.conflict / 20),
    Math.min(1, components.disasters / 15),
    Math.min(1, components.sentiment / 15),
    Math.min(1, components.infrastructure / 15),
    Math.min(1, components.governance / 15),
    Math.min(1, components.marketExposure / 20),
    Math.min(1, Math.abs(signals.conflictDelta7d || 0) / 10),
    Math.min(1, (signals.fxVolatility || 0) / 10),
    Math.min(1, (signals.ooniBlocked || 0) / 100),
    Math.min(1, (signals.wikiZScore || 0) / 5),
    Math.min(1, (signals.compoundSignalCount || 0) / 3),
    Math.min(1, (signals.acledEventCount || 0) / 50),
  ];
}

/**
 * Find historical crisis patterns that match a country's current fingerprint.
 *
 * Returns matches above the similarity threshold, sorted by similarity descending.
 */
export function findPatternMatches(
  currentVector: number[],
  countryCode: string,
  threshold: number = 0.8,
): PatternMatch[] {
  return CRISIS_LIBRARY.filter((crisis) => crisis.countryCode !== countryCode) // Don't match against self
    .map((crisis) => ({
      crisis,
      similarity: Math.round(cosineSimilarity(currentVector, crisis.vector) * 100) / 100,
      currentVector,
    }))
    .filter((m) => m.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);
}

/**
 * Get all crisis fingerprints in the library.
 */
export function getCrisisLibrary(): CrisisFingerprint[] {
  return CRISIS_LIBRARY;
}
