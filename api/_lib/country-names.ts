/**
 * Country names for the record-only edition (api/_lib/brief-record.ts), from
 * the repository: available on every run, with or without a model key or a
 * working country-index read.
 *
 * WHY STATIC. The edition used to take names only from the country-index rows
 * the brief reads at run time (country_cii_history). Seven countries the call
 * book covers are not index countries (Belarus, Switzerland, Czechia, Hungary,
 * Kuwait, Norway, Sweden: currency calls), and any country is missing on a run
 * whose index read fails, so a line could print "SE (SE)". The edition prints a
 * name from here first, then the index row's, then the code alone, once.
 *
 * THE NAMES ARE THE INDEX'S OWN. Every index country carries the name
 * api/cron/compute-cii.ts writes into country_cii_history (country-names.test.ts
 * pins the two together, so the edition and the index cannot name a country
 * differently). The seven others are their ISO 3166 English short names. Every
 * country in the committed ledger snapshot has an entry (also pinned).
 *
 * Reader-facing: new or changed names need sign-off.
 */
export const COUNTRY_NAMES: Readonly<Record<string, string>> = {
  AE: 'UAE',
  AF: 'Afghanistan',
  AM: 'Armenia',
  AO: 'Angola',
  AR: 'Argentina',
  AU: 'Australia',
  AZ: 'Azerbaijan',
  BD: 'Bangladesh',
  BF: 'Burkina Faso',
  BR: 'Brazil',
  BY: 'Belarus',
  CA: 'Canada',
  CD: 'DR Congo',
  CF: 'Central African Rep.',
  CH: 'Switzerland',
  CL: 'Chile',
  CM: 'Cameroon',
  CN: 'China',
  CO: 'Colombia',
  CU: 'Cuba',
  CZ: 'Czechia',
  DE: 'Germany',
  DZ: 'Algeria',
  EG: 'Egypt',
  ES: 'Spain',
  ET: 'Ethiopia',
  FR: 'France',
  GB: 'United Kingdom',
  GE: 'Georgia',
  GH: 'Ghana',
  HT: 'Haiti',
  HU: 'Hungary',
  ID: 'Indonesia',
  IL: 'Israel',
  IN: 'India',
  IQ: 'Iraq',
  IR: 'Iran',
  IT: 'Italy',
  JO: 'Jordan',
  JP: 'Japan',
  KE: 'Kenya',
  KH: 'Cambodia',
  KP: 'North Korea',
  KR: 'South Korea',
  KW: 'Kuwait',
  KZ: 'Kazakhstan',
  LB: 'Lebanon',
  LK: 'Sri Lanka',
  LY: 'Libya',
  MA: 'Morocco',
  ML: 'Mali',
  MM: 'Myanmar',
  MX: 'Mexico',
  MY: 'Malaysia',
  MZ: 'Mozambique',
  NE: 'Niger',
  NG: 'Nigeria',
  NO: 'Norway',
  NP: 'Nepal',
  NZ: 'New Zealand',
  PE: 'Peru',
  PH: 'Philippines',
  PK: 'Pakistan',
  PL: 'Poland',
  PS: 'Palestine',
  QA: 'Qatar',
  RO: 'Romania',
  RU: 'Russia',
  RW: 'Rwanda',
  SA: 'Saudi Arabia',
  SD: 'Sudan',
  SE: 'Sweden',
  SG: 'Singapore',
  SN: 'Senegal',
  SO: 'Somalia',
  SS: 'South Sudan',
  SY: 'Syria',
  TD: 'Chad',
  TH: 'Thailand',
  TN: 'Tunisia',
  TR: 'Turkey',
  TW: 'Taiwan',
  TZ: 'Tanzania',
  UA: 'Ukraine',
  UG: 'Uganda',
  US: 'United States',
  UZ: 'Uzbekistan',
  VE: 'Venezuela',
  VN: 'Vietnam',
  YE: 'Yemen',
  ZA: 'South Africa',
  ZW: 'Zimbabwe',
};

/** The name for an ISO 3166 alpha-2 code, or null when the repository has none. */
export function countryName(code: string): string | null {
  return Object.prototype.hasOwnProperty.call(COUNTRY_NAMES, code) ? COUNTRY_NAMES[code] : null;
}
