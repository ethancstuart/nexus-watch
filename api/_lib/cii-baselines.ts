/**
 * CII Baselines — Single Source of Truth (2026-04-18).
 *
 * Imported by both:
 *   - api/cron/compute-cii.ts (server-side CII computation)
 *   - src/services/countryInstabilityIndex.ts (client-side CII display)
 *
 * All baseline values are editorial judgments reviewed by the NexusWatch
 * Council (2026-04-13 review). Changes must be made HERE ONLY — never
 * duplicate these values in other files.
 *
 * Version: 2.2.0 (synced 2026-04-18, baseline drift fixed)
 */

/** Conflict baselines (0-20). Ensures countries at war don't show 0 when ACLED is unavailable. */
export const BASELINE_CONFLICT: Record<string, number> = {
  // Active war zones
  UA: 19,
  RU: 12,
  SD: 19,
  SS: 17,
  YE: 18,
  SY: 17,
  PS: 19,
  IL: 16,
  IR: 14,
  LB: 14,
  // Insurgencies & civil conflict
  MM: 15,
  AF: 15,
  SO: 15,
  CD: 14,
  IQ: 11,
  LY: 12,
  ML: 13,
  BF: 13,
  CF: 13,
  NE: 11,
  HT: 12,
  NG: 10,
  MZ: 8,
  ET: 11,
  TD: 10,
  PK: 8,
  CO: 7,
  KP: 12,
  UG: 5,
  CM: 6,
  // Low-level / frozen conflicts
  VE: 6,
  PH: 4,
  TH: 3,
  DZ: 4,
  GE: 4,
  AZ: 5,
  AM: 5,
  LK: 2,
  NP: 1,
  RW: 3,
  ZW: 3,
  JO: 4,
  TR: 5,
  CN: 4,
  TW: 8,
};

/** Governance baselines (0-15). Authoritarian regimes, sanctions, election crises. */
export const BASELINE_GOVERNANCE: Record<string, number> = {
  KP: 12,
  VE: 10,
  AF: 10,
  SD: 9,
  MM: 10,
  IR: 9,
  RU: 8,
  SY: 10,
  BY: 9,
  NI: 8,
  CU: 8,
  CD: 7,
  SS: 8,
  YE: 9,
  SO: 8,
  CF: 7,
  LY: 8,
  HT: 8,
  ER: 10,
  CN: 8,
  PS: 7,
  IQ: 6,
  ML: 8,
  BF: 9,
  NE: 7,
};

/** Sentiment baselines (0-15). Persistently negative news coverage for war zones. */
export const BASELINE_SENTIMENT: Record<string, number> = {
  UA: 11,
  RU: 9,
  IL: 10,
  PS: 12,
  SY: 10,
  YE: 10,
  SD: 11,
  AF: 9,
  IR: 9,
  MM: 9,
  SO: 9,
  VE: 7,
  KP: 8,
  LB: 8,
  HT: 9,
  CD: 8,
  SS: 9,
};

/**
 * Static market risk weights (0-20).
 *
 * TODO (Phase 2 data improvement): Replace with live data from
 * World Bank Commodities API + FRED sovereign spreads + UN Comtrade.
 * See docs/DATA-SOURCES-ROADMAP.md for integration plan.
 */
export const MARKET_RISK: Record<string, number> = {
  KP: 20,
  AF: 19,
  SY: 18,
  YE: 18,
  IR: 18,
  SO: 17,
  SS: 17,
  VE: 17,
  SD: 16,
  TW: 16,
  CF: 16,
  HT: 16,
  CD: 15,
  UA: 15,
  PS: 15,
  MM: 14,
  RU: 14,
  LB: 14,
  BF: 14,
  TD: 14,
  ML: 13,
  NE: 13,
  LY: 13,
  CU: 12,
  IQ: 12,
  ET: 12,
  SA: 12,
  MZ: 11,
  NG: 11,
  RU_: 0, // placeholder for dedup (RU already above)
  CN: 10,
  PK: 10,
  UG: 9,
  TR: 9,
  EG: 8,
  BD: 7,
  CO: 7,
  KE: 7,
  PH: 6,
  BR: 6,
  ZA: 6,
  MX: 5,
  IN: 5,
  ID: 5,
  IL: 5,
  TH: 4,
  KR: 4,
  FR: 3,
  JP: 3,
  DE: 2,
  GB: 2,
  US: 2,
  AU: 2,
  CA: 2,
  IT: 3,
  ES: 3,
};

/** CII baseline version — bump when baselines change. */
export const CII_BASELINE_VERSION = '2.2.0';
