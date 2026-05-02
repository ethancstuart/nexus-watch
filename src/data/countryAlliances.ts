/**
 * Country Alliances & Memberships — static lookup table.
 *
 * Used by the country detail panel to render the "Alliances & Conflicts"
 * section. Membership snapshots only — for active disputes use ACLED + the
 * conflict-zones layer at runtime.
 *
 * Last reviewed 2026-05-02. Updates welcome via PR; this is intentionally
 * a static file so it works offline.
 */

export interface AllianceMembership {
  /** Multilateral / regional bodies the country is a full member of. */
  alliances: string[];
  /** Defense / mutual-security arrangements. */
  defense: string[];
  /** Active or unresolved disputes (concise label). */
  disputes: string[];
}

const M = (a: string[], d: string[] = [], dis: string[] = []): AllianceMembership => ({
  alliances: a,
  defense: d,
  disputes: dis,
});

export const COUNTRY_ALLIANCES: Record<string, AllianceMembership> = {
  US: M(['G7', 'G20', 'NATO', 'OECD'], ['NATO', 'AUKUS', 'Five Eyes', 'Japan-US Treaty'], []),
  GB: M(['G7', 'G20', 'NATO', 'OECD', 'Commonwealth'], ['NATO', 'AUKUS', 'Five Eyes'], []),
  FR: M(['G7', 'G20', 'NATO', 'EU', 'OECD'], ['NATO'], []),
  DE: M(['G7', 'G20', 'NATO', 'EU', 'OECD'], ['NATO'], []),
  IT: M(['G7', 'G20', 'NATO', 'EU', 'OECD'], ['NATO'], []),
  JP: M(['G7', 'G20', 'OECD'], ['Japan-US Treaty', 'Quad'], ['Senkaku Islands (CN)', 'Northern Territories (RU)']),
  CA: M(['G7', 'G20', 'NATO', 'OECD', 'Commonwealth'], ['NATO', 'NORAD', 'Five Eyes'], []),
  AU: M(['G20', 'OECD', 'Commonwealth'], ['AUKUS', 'Five Eyes', 'Quad', 'ANZUS'], []),
  NZ: M(['OECD', 'Commonwealth'], ['Five Eyes', 'ANZUS'], []),
  KR: M(['G20', 'OECD'], ['ROK-US Treaty'], ['DPRK armistice']),

  CN: M(['G20', 'BRICS', 'SCO'], [], ['Taiwan Strait', 'South China Sea', 'India border', 'Senkaku (JP)']),
  RU: M(['G20', 'BRICS', 'CSTO', 'SCO'], ['CSTO'], ['Ukraine (active war)', 'Georgia disputed regions']),
  IN: M(['G20', 'BRICS', 'SCO', 'Commonwealth'], ['Quad'], ['Pakistan (Kashmir)', 'China (LAC)']),
  BR: M(['G20', 'BRICS', 'Mercosur'], [], []),
  ZA: M(['G20', 'BRICS', 'AU', 'Commonwealth'], [], []),

  IR: M(['SCO'], [], ['US sanctions', 'Israel proxy conflicts', 'Saudi rivalry']),
  SA: M(['G20', 'GCC', 'OPEC'], [], ['Yemen war (Houthi)', 'Iran rivalry']),
  IL: M(['OECD'], ['Israel-US strategic partnership'], ['Hamas (Gaza)', 'Hezbollah (Lebanon)', 'Iran proxy conflicts']),
  TR: M(['G20', 'NATO', 'OECD'], ['NATO'], ['PKK', 'Greece (Aegean)', 'Cyprus']),
  EG: M(['AU', 'Arab League'], ['Egypt-US partnership'], ['GERD with Ethiopia']),
  AE: M(['GCC', 'OPEC'], ['I2U2'], []),
  QA: M(['GCC'], ['Qatar-US partnership'], []),

  UA: M([], ['NATO partnership (non-member)'], ['Russia (active war)']),
  PL: M(['G20', 'NATO', 'EU', 'OECD'], ['NATO'], []),
  RO: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  HU: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  CZ: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  GR: M(['NATO', 'EU', 'OECD'], ['NATO'], ['Turkey (Aegean)']),
  ES: M(['G20', 'NATO', 'EU', 'OECD'], ['NATO'], []),
  NL: M(['G20', 'NATO', 'EU', 'OECD'], ['NATO'], []),
  BE: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  SE: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  FI: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  NO: M(['NATO', 'OECD'], ['NATO'], []),
  DK: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  CH: M(['OECD'], [], []),

  PK: M(['SCO'], [], ['India (Kashmir)', 'Internal — TTP']),
  BD: M(['Commonwealth'], [], []),
  ID: M(['G20', 'ASEAN'], [], []),
  TH: M(['ASEAN'], ['Thai-US partnership'], []),
  VN: M(['ASEAN'], [], ['South China Sea (CN)']),
  PH: M(['ASEAN'], ['Philippines-US Treaty'], ['South China Sea (CN)']),
  MY: M(['ASEAN', 'Commonwealth'], [], []),
  SG: M(['ASEAN', 'Commonwealth'], [], []),

  MX: M(['G20', 'OECD'], ['USMCA'], []),
  AR: M(['G20', 'Mercosur'], [], []),
  CL: M(['OECD'], [], []),
  CO: M(['OECD'], ['Major Non-NATO Ally (US)'], []),
  PE: M(['OECD'], [], []),
  VE: M([], [], ['US sanctions', 'Border with Guyana (Essequibo)']),
  CU: M([], [], ['US embargo']),

  NG: M(['ECOWAS', 'AU', 'OPEC'], [], ['Boko Haram', 'Banditry']),
  KE: M(['AU', 'EAC', 'Commonwealth'], [], ['Al-Shabaab spillover']),
  ET: M(['AU'], [], ['Tigray', 'Border with Sudan']),
  SD: M(['AU', 'Arab League'], [], ['Civil war (active)']),
  LY: M(['AU', 'Arab League', 'OPEC'], [], ['Civil war factions']),
  DZ: M(['AU', 'Arab League', 'OPEC'], [], []),
  MA: M(['AU', 'Arab League'], [], ['Western Sahara']),

  KP: M([], [], ['Sanctions regime', 'DPRK-ROK armistice']),
  TW: M([], ['Implicit US support (TRA)'], ['China sovereignty claim']),
  AF: M([], [], ['Taliban governance', 'Border with Pakistan']),
  YE: M(['Arab League'], [], ['Civil war (Houthi/Govt)']),
  SY: M(['Arab League'], [], ['Civil war legacy', 'Foreign forces']),
  IQ: M(['Arab League', 'OPEC'], [], ['Internal — ISIS remnants']),
  LB: M(['Arab League'], [], ['Hezbollah-Israel conflict']),

  // 2026-05-02 C3: extended coverage to remaining CII-monitored countries.
  // Snapshots only — see ACLED + conflict-zones layer for active disputes.
  AT: M(['EU', 'OECD'], [], []),
  IE: M(['EU', 'OECD', 'Commonwealth'], [], []),
  PT: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  SK: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  SI: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  HR: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  BG: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  EE: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  LV: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  LT: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  LU: M(['NATO', 'EU', 'OECD'], ['NATO'], []),
  IS: M(['NATO', 'OECD'], ['NATO'], []),
  CY: M(['EU', 'Commonwealth'], [], ['Northern Cyprus dispute']),
  MT: M(['EU', 'Commonwealth'], [], []),
  AL: M(['NATO'], ['NATO'], []),
  ME: M(['NATO'], ['NATO'], []),
  MK: M(['NATO'], ['NATO'], ['Greece naming legacy']),
  RS: M([], [], ['Kosovo recognition dispute']),
  BA: M([], [], ['Internal political deadlock']),
  XK: M([], [], ['Recognition disputes']),
  MD: M([], [], ['Transnistria frozen conflict']),
  BY: M(['CSTO'], ['CSTO'], ['EU sanctions']),
  AM: M(['CSTO'], [], ['Azerbaijan / Nagorno-Karabakh']),
  AZ: M([], [], ['Armenia border']),
  GE: M([], ['NATO partnership (non-member)'], ['Russia disputed regions']),
  KG: M(['CSTO', 'SCO'], [], []),
  TJ: M(['CSTO', 'SCO'], [], []),
  TM: M([], [], []),
  UZ: M(['SCO'], [], []),
  MN: M([], [], []),

  TZ: M(['AU', 'Commonwealth', 'EAC'], [], []),
  UG: M(['AU', 'Commonwealth', 'EAC'], [], []),
  GH: M(['ECOWAS', 'AU', 'Commonwealth'], [], []),
  CI: M(['ECOWAS', 'AU'], [], []),
  SN: M(['ECOWAS', 'AU'], [], []),
  CM: M(['AU', 'Commonwealth'], [], ['Anglophone insurgency']),
  AO: M(['AU', 'OPEC'], [], []),
  ZM: M(['AU', 'Commonwealth'], [], []),
  ZW: M(['AU'], [], []),
  MZ: M(['AU', 'Commonwealth'], [], ['Northern insurgency']),
  RW: M(['AU', 'Commonwealth'], [], []),
  BI: M(['AU'], [], []),
  CD: M(['AU'], [], ['Eastern conflict']),
  CG: M(['AU', 'OPEC'], [], []),
  GA: M(['AU', 'OPEC'], [], []),
  GQ: M(['AU', 'OPEC'], [], []),
  TD: M(['AU'], [], ['Sahel spillover']),
  CF: M(['AU'], [], ['Internal armed conflict']),
  SS: M(['AU'], [], ['Civil war']),
  SO: M(['AU', 'Arab League'], [], ['Al-Shabaab']),
  ER: M(['AU'], [], ['Sanctions']),
  TN: M(['AU', 'Arab League'], [], []),
  MR: M(['AU', 'Arab League'], [], []),
  ML: M(['ECOWAS', 'AU'], [], ['Jihadist insurgency']),
  BF: M(['ECOWAS', 'AU'], [], ['Jihadist insurgency']),
  NE: M(['ECOWAS', 'AU'], [], ['Jihadist insurgency', 'Coup government']),
  GN: M(['ECOWAS', 'AU'], [], ['Coup government']),
  GW: M(['ECOWAS', 'AU'], [], []),
  LR: M(['ECOWAS', 'AU'], [], []),
  SL: M(['ECOWAS', 'AU', 'Commonwealth'], [], []),
  TG: M(['ECOWAS', 'AU'], [], []),
  BJ: M(['ECOWAS', 'AU'], [], []),
  MG: M(['AU'], [], []),

  KW: M(['GCC', 'OPEC', 'Arab League'], [], []),
  BH: M(['GCC', 'Arab League'], [], []),
  OM: M(['GCC', 'Arab League'], [], []),
  JO: M(['Arab League'], ['Jordan-US partnership'], []),
  PS: M(['Arab League'], [], ['Hamas / Israel conflict']),

  KH: M(['ASEAN'], [], []),
  LA: M(['ASEAN'], [], []),
  MM: M(['ASEAN'], [], ['Civil war']),
  BN: M(['ASEAN', 'Commonwealth'], [], []),

  HK: M([], [], ['China NSL']),
  MO: M([], [], []),

  LK: M(['Commonwealth'], [], []),
  NP: M([], [], []),
  BT: M([], [], []),
  MV: M(['Commonwealth'], [], []),

  HT: M([], [], ['Gang violence']),
  DO: M([], [], []),
  JM: M(['Commonwealth'], [], []),
  TT: M(['Commonwealth'], [], []),
  GT: M([], [], []),
  HN: M([], [], []),
  SV: M([], [], []),
  NI: M([], [], ['US sanctions']),
  CR: M(['OECD'], [], []),
  PA: M([], [], []),
  EC: M(['OPEC'], [], []),
  BO: M([], [], []),
  PY: M(['Mercosur'], [], []),
  UY: M(['Mercosur', 'OECD'], [], []),
  GY: M(['Commonwealth'], [], ['Venezuela claim — Essequibo']),
  SR: M([], [], []),

  PG: M(['Commonwealth'], [], []),
  FJ: M(['Commonwealth'], [], []),
};

/** Get alliance/dispute info for a country. Returns null if unknown. */
export function getAllianceInfo(countryCode: string): AllianceMembership | null {
  return COUNTRY_ALLIANCES[countryCode.toUpperCase()] || null;
}
