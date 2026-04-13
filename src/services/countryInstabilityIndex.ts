/**
 * Country Instability Index (CII)
 *
 * 6-component per-country 0-100 risk score:
 *   Conflict (20%) + Disasters (15%) + Sentiment (15%) +
 *   Infrastructure (15%) + Governance (15%) + Market Exposure (20%)
 *
 * Computed from live layer data every 5 minutes.
 * Complements the global Tension Index (cinema mode) with per-country depth.
 */

export interface CIIScore {
  countryCode: string;
  countryName: string;
  score: number; // 0-100
  trend: 'rising' | 'falling' | 'stable';
  tier: CountryTier;
  components: {
    conflict: number; // 0-20
    disasters: number; // 0-15
    sentiment: number; // 0-15
    infrastructure: number; // 0-15
    governance: number; // 0-15
    marketExposure: number; // 0-20
  };
  topSignals: string[]; // Human-readable top 3 contributing factors
}

// Tier system for coverage depth transparency:
//   core     — 6-component live scoring, all feeds active, CII history tracked
//   extended — 6-component scoring, partial feed coverage, CII tracked
//   monitor  — baseline + global feed pass-through, lower refresh priority
export type CountryTier = 'core' | 'extended' | 'monitor';

// Countries to score — 86 nations across every inhabited continent.
// Core: geopolitical hotspots + G7/G20 + major US allies/adversaries.
// Extended: regionally significant nations with active risk vectors.
// Monitor: stable or small nations tracked for completeness and correlation detection.
const MONITORED_COUNTRIES: {
  code: string;
  name: string;
  lat: number;
  lon: number;
  radius: number;
  tier: CountryTier;
}[] = [
  // ── Active conflict zones & fragile states ──
  { code: 'UA', name: 'Ukraine', lat: 48.4, lon: 31.2, radius: 6, tier: 'core' },
  { code: 'RU', name: 'Russia', lat: 55.8, lon: 37.6, radius: 15, tier: 'core' },
  { code: 'IL', name: 'Israel', lat: 31.0, lon: 35.0, radius: 3, tier: 'core' },
  { code: 'PS', name: 'Palestine', lat: 31.9, lon: 35.2, radius: 2, tier: 'core' },
  { code: 'SY', name: 'Syria', lat: 34.8, lon: 38.9, radius: 4, tier: 'core' },
  { code: 'IQ', name: 'Iraq', lat: 33.2, lon: 43.7, radius: 5, tier: 'core' },
  { code: 'YE', name: 'Yemen', lat: 15.6, lon: 48.5, radius: 5, tier: 'core' },
  { code: 'SD', name: 'Sudan', lat: 15.5, lon: 32.5, radius: 8, tier: 'core' },
  { code: 'SS', name: 'South Sudan', lat: 4.9, lon: 31.6, radius: 5, tier: 'core' },
  { code: 'ET', name: 'Ethiopia', lat: 9.1, lon: 40.5, radius: 6, tier: 'core' },
  { code: 'SO', name: 'Somalia', lat: 2.0, lon: 45.3, radius: 5, tier: 'core' },
  { code: 'CD', name: 'DR Congo', lat: -1.5, lon: 29.0, radius: 8, tier: 'core' },
  { code: 'MM', name: 'Myanmar', lat: 19.8, lon: 96.1, radius: 5, tier: 'core' },
  { code: 'AF', name: 'Afghanistan', lat: 33.9, lon: 67.7, radius: 6, tier: 'core' },
  { code: 'LY', name: 'Libya', lat: 26.3, lon: 17.2, radius: 6, tier: 'core' },
  { code: 'ML', name: 'Mali', lat: 17.6, lon: -4.0, radius: 5, tier: 'core' },
  { code: 'BF', name: 'Burkina Faso', lat: 12.3, lon: -1.5, radius: 4, tier: 'core' },
  { code: 'HT', name: 'Haiti', lat: 18.5, lon: -72.3, radius: 3, tier: 'core' },
  { code: 'NE', name: 'Niger', lat: 17.6, lon: 8.1, radius: 5, tier: 'core' },
  { code: 'CF', name: 'Central African Rep.', lat: 6.6, lon: 20.9, radius: 5, tier: 'core' },

  // ── Major powers & G7/G20 ──
  { code: 'US', name: 'United States', lat: 39.8, lon: -98.5, radius: 15, tier: 'core' },
  { code: 'CN', name: 'China', lat: 35.9, lon: 104.2, radius: 12, tier: 'core' },
  { code: 'IN', name: 'India', lat: 20.6, lon: 78.9, radius: 10, tier: 'core' },
  { code: 'JP', name: 'Japan', lat: 36.2, lon: 138.3, radius: 5, tier: 'core' },
  { code: 'DE', name: 'Germany', lat: 52.5, lon: 13.4, radius: 5, tier: 'core' },
  { code: 'GB', name: 'United Kingdom', lat: 51.5, lon: -0.1, radius: 4, tier: 'core' },
  { code: 'FR', name: 'France', lat: 48.9, lon: 2.3, radius: 4, tier: 'core' },
  { code: 'BR', name: 'Brazil', lat: -15.8, lon: -47.9, radius: 10, tier: 'core' },
  { code: 'SA', name: 'Saudi Arabia', lat: 24.7, lon: 46.7, radius: 8, tier: 'core' },
  { code: 'TR', name: 'Turkey', lat: 39.9, lon: 32.9, radius: 5, tier: 'core' },
  { code: 'KR', name: 'South Korea', lat: 37.6, lon: 127.0, radius: 3, tier: 'core' },
  { code: 'IR', name: 'Iran', lat: 32.4, lon: 53.7, radius: 8, tier: 'core' },

  // ── Strategic flashpoints & energy chokepoints ──
  { code: 'TW', name: 'Taiwan', lat: 23.5, lon: 121.0, radius: 3, tier: 'core' },
  { code: 'KP', name: 'North Korea', lat: 40.0, lon: 127.0, radius: 4, tier: 'core' },
  { code: 'PK', name: 'Pakistan', lat: 30.4, lon: 69.3, radius: 6, tier: 'core' },
  { code: 'LB', name: 'Lebanon', lat: 33.9, lon: 35.5, radius: 2, tier: 'core' },
  { code: 'VE', name: 'Venezuela', lat: 8.0, lon: -66.0, radius: 5, tier: 'core' },

  // ── Extended: regionally significant ──
  { code: 'NG', name: 'Nigeria', lat: 9.1, lon: 7.5, radius: 6, tier: 'extended' },
  { code: 'EG', name: 'Egypt', lat: 30.0, lon: 31.2, radius: 5, tier: 'extended' },
  { code: 'ZA', name: 'South Africa', lat: -30.6, lon: 22.9, radius: 6, tier: 'extended' },
  { code: 'MX', name: 'Mexico', lat: 19.4, lon: -99.1, radius: 6, tier: 'extended' },
  { code: 'ID', name: 'Indonesia', lat: -2.5, lon: 118.0, radius: 10, tier: 'extended' },
  { code: 'PH', name: 'Philippines', lat: 14.6, lon: 121.0, radius: 5, tier: 'extended' },
  { code: 'BD', name: 'Bangladesh', lat: 23.7, lon: 90.4, radius: 4, tier: 'extended' },
  { code: 'CO', name: 'Colombia', lat: 4.6, lon: -74.3, radius: 5, tier: 'extended' },
  { code: 'KE', name: 'Kenya', lat: -1.3, lon: 36.8, radius: 5, tier: 'extended' },
  { code: 'MZ', name: 'Mozambique', lat: -15.4, lon: 40.5, radius: 5, tier: 'extended' },
  { code: 'UG', name: 'Uganda', lat: 0.3, lon: 32.6, radius: 4, tier: 'extended' },
  { code: 'TD', name: 'Chad', lat: 12.1, lon: 15.0, radius: 5, tier: 'extended' },
  { code: 'CU', name: 'Cuba', lat: 21.5, lon: -80.0, radius: 4, tier: 'extended' },
  { code: 'TH', name: 'Thailand', lat: 15.9, lon: 100.9, radius: 5, tier: 'extended' },
  { code: 'VN', name: 'Vietnam', lat: 14.1, lon: 108.3, radius: 5, tier: 'extended' },
  { code: 'MY', name: 'Malaysia', lat: 4.2, lon: 101.9, radius: 4, tier: 'extended' },
  { code: 'PL', name: 'Poland', lat: 51.9, lon: 19.1, radius: 4, tier: 'extended' },
  { code: 'RO', name: 'Romania', lat: 45.9, lon: 24.9, radius: 4, tier: 'extended' },
  { code: 'AU', name: 'Australia', lat: -25.3, lon: 133.8, radius: 12, tier: 'extended' },
  { code: 'CA', name: 'Canada', lat: 56.1, lon: -106.3, radius: 15, tier: 'extended' },
  { code: 'IT', name: 'Italy', lat: 41.9, lon: 12.6, radius: 4, tier: 'extended' },
  { code: 'ES', name: 'Spain', lat: 40.5, lon: -3.7, radius: 4, tier: 'extended' },
  { code: 'AR', name: 'Argentina', lat: -38.4, lon: -63.6, radius: 8, tier: 'extended' },
  { code: 'CL', name: 'Chile', lat: -35.7, lon: -71.5, radius: 6, tier: 'extended' },
  { code: 'PE', name: 'Peru', lat: -9.2, lon: -75.0, radius: 5, tier: 'extended' },
  { code: 'DZ', name: 'Algeria', lat: 28.0, lon: 1.7, radius: 6, tier: 'extended' },
  { code: 'MA', name: 'Morocco', lat: 31.8, lon: -7.1, radius: 4, tier: 'extended' },
  { code: 'TN', name: 'Tunisia', lat: 33.9, lon: 9.5, radius: 3, tier: 'extended' },

  // ── Monitor: correlation detection, completeness, emerging risk ──
  { code: 'GH', name: 'Ghana', lat: 7.9, lon: -1.0, radius: 4, tier: 'monitor' },
  { code: 'SN', name: 'Senegal', lat: 14.5, lon: -14.5, radius: 3, tier: 'monitor' },
  { code: 'CM', name: 'Cameroon', lat: 7.4, lon: 12.4, radius: 4, tier: 'monitor' },
  { code: 'AO', name: 'Angola', lat: -11.2, lon: 17.9, radius: 5, tier: 'monitor' },
  { code: 'TZ', name: 'Tanzania', lat: -6.4, lon: 34.9, radius: 5, tier: 'monitor' },
  { code: 'RW', name: 'Rwanda', lat: -1.9, lon: 29.9, radius: 2, tier: 'monitor' },
  { code: 'ZW', name: 'Zimbabwe', lat: -19.0, lon: 29.2, radius: 4, tier: 'monitor' },
  { code: 'KZ', name: 'Kazakhstan', lat: 48.0, lon: 68.0, radius: 8, tier: 'monitor' },
  { code: 'UZ', name: 'Uzbekistan', lat: 41.3, lon: 64.6, radius: 5, tier: 'monitor' },
  { code: 'GE', name: 'Georgia', lat: 42.3, lon: 43.4, radius: 3, tier: 'monitor' },
  { code: 'AZ', name: 'Azerbaijan', lat: 40.1, lon: 47.6, radius: 3, tier: 'monitor' },
  { code: 'AM', name: 'Armenia', lat: 40.1, lon: 44.5, radius: 2, tier: 'monitor' },
  { code: 'NP', name: 'Nepal', lat: 28.4, lon: 84.1, radius: 3, tier: 'monitor' },
  { code: 'LK', name: 'Sri Lanka', lat: 7.9, lon: 80.8, radius: 3, tier: 'monitor' },
  { code: 'KH', name: 'Cambodia', lat: 12.6, lon: 104.9, radius: 3, tier: 'monitor' },
  { code: 'SG', name: 'Singapore', lat: 1.4, lon: 103.8, radius: 1, tier: 'monitor' },
  { code: 'NZ', name: 'New Zealand', lat: -40.9, lon: 174.9, radius: 4, tier: 'monitor' },
  { code: 'JO', name: 'Jordan', lat: 30.6, lon: 36.2, radius: 3, tier: 'monitor' },
  { code: 'AE', name: 'UAE', lat: 23.4, lon: 53.8, radius: 3, tier: 'monitor' },
  { code: 'QA', name: 'Qatar', lat: 25.4, lon: 51.2, radius: 2, tier: 'monitor' },
];

export function getMonitoredCountries(): typeof MONITORED_COUNTRIES {
  return MONITORED_COUNTRIES;
}

/** Total monitored country count — used in UI badges. */
export const COUNTRY_COUNT = MONITORED_COUNTRIES.length;

// ── Caching & trend computation ──

let cachedScores: CIIScore[] = [];
let previousScores: Map<string, number> = new Map();
let lastComputed = 0;

export function getCachedCII(): CIIScore[] {
  return cachedScores;
}

export function getLastComputed(): number {
  return lastComputed;
}

export function getCountryCII(code: string): CIIScore | undefined {
  return cachedScores.find((s) => s.countryCode === code);
}

// Distance check (simplified euclidean for speed — good enough for country-level)
function isNear(lat1: number, lon1: number, lat2: number, lon2: number, radius: number): boolean {
  return Math.sqrt((lat1 - lat2) ** 2 + (lon1 - lon2) ** 2) < radius;
}

/**
 * Compute CII scores for all monitored countries from live layer data.
 * Caches results and computes trends from previous scores.
 */
export function computeAllCII(layerData: Map<string, unknown>): CIIScore[] {
  // Save previous scores for trend computation
  if (cachedScores.length > 0) {
    previousScores = new Map(cachedScores.map((s) => [s.countryCode, s.score]));
  }

  const scores = MONITORED_COUNTRIES.map((country) => {
    const cii = computeCountryCII(country, layerData);
    // Compute trend from previous cycle
    const prev = previousScores.get(country.code);
    if (prev !== undefined) {
      const delta = cii.score - prev;
      cii.trend = delta >= 3 ? 'rising' : delta <= -3 ? 'falling' : 'stable';
    }
    return cii;
  });

  // Sort by score descending
  scores.sort((a, b) => b.score - a.score);

  cachedScores = scores;
  lastComputed = Date.now();

  return scores;
}

function computeCountryCII(
  country: { code: string; name: string; lat: number; lon: number; radius: number; tier: CountryTier },
  layerData: Map<string, unknown>,
): CIIScore {
  const signals: string[] = [];

  // ── Component 1: Conflict (0-20) — live data + baseline ──
  // Baseline ensures countries at war don't show 0 when ACLED is unavailable
  const BASELINE_CONFLICT: Record<string, number> = {
    // Active war zones
    UA: 18,
    RU: 10,
    SD: 18,
    SS: 16,
    YE: 17,
    SY: 17,
    PS: 18,
    IL: 8,
    // Insurgencies & civil conflict
    MM: 15,
    AF: 14,
    SO: 15,
    CD: 14,
    IQ: 10,
    LY: 12,
    ML: 12,
    BF: 13,
    CF: 13,
    NE: 10,
    HT: 11,
    NG: 9,
    MZ: 8,
    ET: 10,
    TD: 9,
    PK: 7,
    CO: 6,
    KP: 5,
    UG: 4,
    CM: 5,
    // Low-level / frozen conflicts
    LB: 6,
    VE: 4,
    PH: 3,
    TH: 2,
    DZ: 3,
    GE: 3,
    AZ: 3,
    AM: 3,
    LK: 2,
    NP: 1,
    RW: 2,
    ZW: 2,
    JO: 2,
  };
  let conflict = BASELINE_CONFLICT[country.code] ?? 0;
  const acled = layerData.get('acled') as
    | Array<{ lat: number; lon: number; fatalities?: number; event_type?: string }>
    | undefined;
  if (acled) {
    const nearby = acled.filter((e) => isNear(e.lat, e.lon, country.lat, country.lon, country.radius));
    const eventCount = nearby.length;
    const fatalities = nearby.reduce((sum, e) => sum + (e.fatalities || 0), 0);
    const liveConflict = (eventCount / 5) * 8 + (fatalities / 50) * 12;
    conflict = Math.min(20, Math.max(conflict, liveConflict));
    if (eventCount > 10) signals.push(`${eventCount} conflict events this week`);
    if (fatalities > 100) signals.push(`${fatalities} casualties reported`);
  }

  // ── Component 2: Disasters (0-15) ──
  let disasters = 0;
  const quakes = layerData.get('earthquakes') as Array<{ lat: number; lon: number; magnitude?: number }> | undefined;
  if (quakes) {
    const nearby = quakes.filter((e) => isNear(e.lat, e.lon, country.lat, country.lon, country.radius));
    const maxMag = Math.max(0, ...nearby.map((e) => e.magnitude || 0));
    disasters += Math.min(8, nearby.length * 1.5 + (maxMag > 5 ? (maxMag - 5) * 4 : 0));
    if (maxMag >= 5) signals.push(`M${maxMag.toFixed(1)} earthquake`);
  }
  const fires = layerData.get('fires') as Array<{ lat: number; lon: number }> | undefined;
  if (fires) {
    const nearby = fires.filter((e) => isNear(e.lat, e.lon, country.lat, country.lon, country.radius));
    disasters += Math.min(7, nearby.length / 10);
    if (nearby.length > 50) signals.push(`${nearby.length} active fire hotspots`);
  }
  disasters = Math.min(15, disasters);

  // ── Component 3: Sentiment (0-15) ──
  let sentiment = 0;
  const news = layerData.get('news') as
    | Array<{ lat?: number; lon?: number; tone?: number; country?: string }>
    | undefined;
  if (news) {
    const nearby = news.filter(
      (e) =>
        (e.lat && e.lon && isNear(e.lat, e.lon, country.lat, country.lon, country.radius)) ||
        (e.country && e.country.includes(country.name)),
    );
    if (nearby.length > 0) {
      const avgTone = nearby.reduce((s, e) => s + (e.tone || 0), 0) / nearby.length;
      // Negative tone = higher instability
      sentiment = Math.min(15, Math.max(0, (-avgTone / 10) * 15));
      if (avgTone < -5) signals.push(`Strongly negative sentiment (${avgTone.toFixed(1)})`);
    }
  }

  // ── Component 4: Infrastructure (0-15) ──
  let infrastructure = 0;
  const outages = layerData.get('internet-outages') as
    | Array<{ code?: string; severity?: string; score?: number }>
    | undefined;
  if (outages) {
    const match = outages.find((o) => o.code === country.code);
    if (match) {
      const outageScore =
        match.score || (match.severity === 'critical' ? 1.0 : match.severity === 'high' ? 0.75 : 0.25);
      infrastructure += outageScore * 10;
      if (outageScore > 0.5) signals.push(`Internet disruption: ${match.severity}`);
    }
  }
  // GPS jamming and cyber threats
  const gpsJamming = layerData.get('gps-jamming') as Array<{ lat: number; lon: number }> | undefined;
  if (gpsJamming) {
    const nearby = gpsJamming.filter((e) => isNear(e.lat, e.lon, country.lat, country.lon, country.radius));
    infrastructure += Math.min(5, nearby.length * 2.5);
    if (nearby.length > 0) signals.push(`GPS jamming zone detected`);
  }
  infrastructure = Math.min(15, infrastructure);

  // ── Component 5: Governance (0-15) ──
  let governance = 0;
  const elections = layerData.get('elections') as
    | Array<{ lat: number; lon: number; date?: string; significance?: string }>
    | undefined;
  if (elections) {
    const nearby = elections.filter((e) => isNear(e.lat, e.lon, country.lat, country.lon, country.radius));
    for (const el of nearby) {
      if (el.date) {
        const daysUntil = (new Date(el.date).getTime() - Date.now()) / 86400000;
        if (daysUntil > 0 && daysUntil < 90) {
          governance += Math.min(8, (90 - daysUntil) / 10);
          signals.push(`Election in ${Math.ceil(daysUntil)} days`);
        }
      }
    }
  }
  const sanctions = layerData.get('sanctions') as Array<{ code?: string; severity?: string }> | undefined;
  if (sanctions) {
    const match = sanctions.find((s) => s.code === country.code);
    if (match) {
      governance += match.severity === 'comprehensive' ? 7 : match.severity === 'targeted' ? 4 : 2;
      signals.push(`Under ${match.severity} sanctions`);
    }
  }
  governance = Math.min(15, governance);

  // ── Component 6: Market Exposure (0-20) ──
  // This component uses cached market data when available
  // For now, use static risk weights based on known economic vulnerability
  const MARKET_RISK: Record<string, number> = {
    // Sanctioned / isolated economies — highest market distortion
    KP: 20,
    AF: 19,
    SY: 18,
    YE: 18,
    IR: 18,
    SS: 17,
    SO: 17,
    VE: 17,
    SD: 16,
    CF: 16,
    TW: 16,
    HT: 16,
    UA: 15,
    CD: 15,
    PS: 15,
    RU: 14,
    MM: 14,
    LB: 14,
    BF: 14,
    TD: 14,
    LY: 13,
    ML: 13,
    NE: 13,
    IQ: 12,
    SA: 12,
    AR: 12,
    CU: 12,
    NG: 11,
    MZ: 11,
    CN: 10,
    PK: 10,
    TR: 9,
    UG: 9,
    EG: 8,
    CO: 7,
    KE: 7,
    BD: 7,
    BR: 6,
    ZA: 6,
    PH: 6,
    IN: 5,
    MX: 5,
    ID: 5,
    IL: 5,
    DZ: 5,
    PE: 5,
    KR: 4,
    TH: 4,
    VN: 4,
    RO: 4,
    GE: 4,
    AZ: 4,
    AM: 4,
    FR: 3,
    JP: 3,
    PL: 3,
    CL: 3,
    MA: 3,
    TN: 3,
    LK: 3,
    NP: 3,
    KH: 3,
    JO: 3,
    CM: 3,
    AO: 3,
    US: 2,
    DE: 2,
    GB: 2,
    IT: 2,
    ES: 2,
    CA: 2,
    AU: 2,
    NZ: 2,
    GH: 4,
    SN: 4,
    TZ: 4,
    RW: 3,
    ZW: 6,
    KZ: 4,
    UZ: 5,
    SG: 1,
    AE: 2,
    QA: 2,
  };
  const marketExposure = MARKET_RISK[country.code] ?? 8;

  // ── Total Score ──
  const score = Math.round(
    Math.min(100, conflict + disasters + sentiment + infrastructure + governance + marketExposure),
  );

  return {
    countryCode: country.code,
    countryName: country.name,
    score,
    trend: 'stable', // Overwritten by computeAllCII when previous scores exist
    tier: country.tier,
    components: {
      conflict: Math.round(conflict * 10) / 10,
      disasters: Math.round(disasters * 10) / 10,
      sentiment: Math.round(sentiment * 10) / 10,
      infrastructure: Math.round(infrastructure * 10) / 10,
      governance: Math.round(governance * 10) / 10,
      marketExposure: Math.round(marketExposure * 10) / 10,
    },
    topSignals: signals.slice(0, 3),
  };
}

/** Get a color for a CII score */
export function ciiColor(score: number): string {
  if (score >= 75) return '#dc2626';
  if (score >= 50) return '#f97316';
  if (score >= 25) return '#eab308';
  return '#22c55e';
}

/** Get a label for a CII score */
export function ciiLabel(score: number): string {
  if (score >= 75) return 'CRITICAL';
  if (score >= 50) return 'HIGH';
  if (score >= 25) return 'ELEVATED';
  return 'STABLE';
}
