/**
 * Geopolitical Entity Registry
 *
 * Non-state actors, armed groups, intelligence agencies, and
 * corporations that show up repeatedly in geopolitical analysis.
 * Used by the entity graph to show relationships — who is connected
 * to whom, and through which countries/conflicts/sanctions.
 *
 * Curated, not exhaustive. Entries must be verifiable from public
 * OSINT reporting.
 */

export type EntityType =
  | 'armed_group'
  | 'intelligence_agency'
  | 'terrorist_org'
  | 'private_military'
  | 'state_actor'
  | 'corporation'
  | 'proxy_force';

export interface Entity {
  id: string;
  name: string;
  aliases?: string[];
  type: EntityType;
  /** Primary country affiliation. */
  homeCountry: string;
  /** Countries where they operate. */
  operatesIn: string[];
  /** Key conflicts they're associated with. */
  associatedConflicts?: string[];
  /** OFAC sanctions status (if designated). */
  sanctioned?: boolean;
  /** Short description. */
  description: string;
  /** Parent/sponsor relationships. */
  sponsoredBy?: string[]; // entity IDs
  /** Proxy/affiliate relationships. */
  proxies?: string[]; // entity IDs
  /** Sources for verification. */
  sources?: string[];
}

export const ENTITIES: Entity[] = [
  // === Russian apparatus ===
  {
    id: 'wagner-group',
    name: 'Wagner Group',
    aliases: ['Africa Corps (successor)', 'PMC Wagner'],
    type: 'private_military',
    homeCountry: 'RU',
    operatesIn: ['UA', 'SY', 'LY', 'ML', 'CF', 'SD', 'MZ', 'VE'],
    associatedConflicts: ['ukraine-war', 'mali-insurgency', 'libya-civil-war', 'sudan-rsf-saf'],
    sanctioned: true,
    description:
      'Russian state-linked private military company. Active in Africa and Ukraine. Rebranded as Africa Corps after 2023 Prigozhin mutiny.',
    sponsoredBy: ['kremlin'],
  },
  {
    id: 'gru',
    name: 'GRU (Russian Military Intelligence)',
    aliases: ['Main Intelligence Directorate', 'Unit 29155', 'Unit 74455'],
    type: 'intelligence_agency',
    homeCountry: 'RU',
    operatesIn: ['UA', 'SY', 'GB', 'DE', 'CZ', 'BG', 'PL'],
    associatedConflicts: ['ukraine-war'],
    sanctioned: true,
    description:
      'Russian military intelligence. Linked to Salisbury poisoning (2018), DNC hack (2016), and sabotage operations across Europe.',
    proxies: ['wagner-group'],
  },
  {
    id: 'fsb',
    name: 'FSB (Russian Federal Security Service)',
    type: 'intelligence_agency',
    homeCountry: 'RU',
    operatesIn: ['RU', 'UA', 'BY', 'KZ'],
    associatedConflicts: ['ukraine-war'],
    sanctioned: true,
    description:
      'Russian domestic security and counter-intelligence service. Expanded role in Ukraine occupation operations.',
  },

  // === Iranian apparatus ===
  {
    id: 'irgc',
    name: 'Islamic Revolutionary Guard Corps',
    aliases: ['IRGC', 'Pasdaran'],
    type: 'armed_group',
    homeCountry: 'IR',
    operatesIn: ['IR', 'IQ', 'SY', 'LB', 'YE', 'GA'],
    associatedConflicts: ['syria-civil-war', 'yemen-civil-war', 'iraq-sectarian'],
    sanctioned: true,
    description: 'Iranian elite military/intelligence force. Designated FTO by US. Runs regional proxy network.',
    proxies: ['hezbollah', 'houthis', 'iraqi-pmf', 'hamas'],
  },
  {
    id: 'quds-force',
    name: 'Quds Force',
    type: 'armed_group',
    homeCountry: 'IR',
    operatesIn: ['IR', 'IQ', 'SY', 'LB', 'YE'],
    associatedConflicts: ['syria-civil-war', 'yemen-civil-war'],
    sanctioned: true,
    description: 'IRGC extraterritorial operations wing. Commanded by Qasem Soleimani until 2020 strike.',
    sponsoredBy: ['irgc'],
  },
  {
    id: 'hezbollah',
    name: 'Hezbollah',
    type: 'proxy_force',
    homeCountry: 'LB',
    operatesIn: ['LB', 'SY', 'IL'],
    associatedConflicts: ['israel-hezbollah', 'syria-civil-war'],
    sanctioned: true,
    description: 'Lebanese Shia militant group and political party. Primary Iranian proxy in the Levant.',
    sponsoredBy: ['irgc', 'quds-force'],
  },
  {
    id: 'hamas',
    name: 'Hamas',
    type: 'terrorist_org',
    homeCountry: 'PS',
    operatesIn: ['PS', 'IL', 'QA', 'TR'],
    associatedConflicts: ['israel-hamas'],
    sanctioned: true,
    description: 'Palestinian Islamist militant group governing Gaza until Oct 2023.',
    sponsoredBy: ['irgc'],
  },
  {
    id: 'houthis',
    name: 'Houthis (Ansar Allah)',
    type: 'proxy_force',
    homeCountry: 'YE',
    operatesIn: ['YE', 'SA'],
    associatedConflicts: ['yemen-civil-war', 'red-sea-shipping'],
    sanctioned: true,
    description: 'Yemeni Shia movement controlling northern Yemen. Targets Red Sea shipping. Iranian-armed.',
    sponsoredBy: ['irgc'],
  },
  {
    id: 'iraqi-pmf',
    name: 'Popular Mobilization Forces (Iraq)',
    aliases: ['PMF', 'Hashd al-Shaabi'],
    type: 'proxy_force',
    homeCountry: 'IQ',
    operatesIn: ['IQ', 'SY'],
    associatedConflicts: ['iraq-sectarian', 'syria-civil-war'],
    sanctioned: true,
    description: 'Iraqi Shia militia umbrella. Includes Iranian-aligned factions like Kataib Hezbollah.',
    sponsoredBy: ['irgc', 'quds-force'],
  },

  // === Sunni jihadist ===
  {
    id: 'isis',
    name: 'Islamic State',
    aliases: ['ISIS', 'ISIL', 'Daesh'],
    type: 'terrorist_org',
    homeCountry: 'SY',
    operatesIn: ['SY', 'IQ', 'AF', 'LY', 'NG', 'ML', 'BF', 'MZ', 'PH'],
    associatedConflicts: ['syria-civil-war', 'iraq-sectarian', 'sahel-insurgency'],
    sanctioned: true,
    description: 'Sunni jihadist group. Territorial caliphate defeated 2019; cellular networks persist globally.',
    proxies: ['isis-k', 'iswap', 'isis-mz'],
  },
  {
    id: 'isis-k',
    name: 'Islamic State Khorasan Province',
    aliases: ['ISIS-K', 'ISKP'],
    type: 'terrorist_org',
    homeCountry: 'AF',
    operatesIn: ['AF', 'PK', 'IR', 'TJ', 'RU'],
    associatedConflicts: ['afghan-insurgency'],
    sanctioned: true,
    description: 'ISIS Afghan affiliate. Behind Kabul airport bombing (2021) and Moscow attack (2024).',
    sponsoredBy: ['isis'],
  },
  {
    id: 'aqim',
    name: 'Al-Qaeda in the Islamic Maghreb',
    aliases: ['AQIM'],
    type: 'terrorist_org',
    homeCountry: 'DZ',
    operatesIn: ['DZ', 'ML', 'BF', 'NE', 'LY', 'TN'],
    associatedConflicts: ['sahel-insurgency'],
    sanctioned: true,
    description: 'Al-Qaeda affiliate in North Africa and Sahel.',
  },
  {
    id: 'jnim',
    name: 'Jamaat Nasr al-Islam wal Muslimin',
    aliases: ['JNIM'],
    type: 'terrorist_org',
    homeCountry: 'ML',
    operatesIn: ['ML', 'BF', 'NE'],
    associatedConflicts: ['sahel-insurgency'],
    sanctioned: true,
    description: 'Al-Qaeda-aligned Sahel coalition. Primary militant force in central Mali and northern Burkina Faso.',
    sponsoredBy: ['aqim'],
  },
  {
    id: 'al-shabaab',
    name: 'Al-Shabaab',
    type: 'terrorist_org',
    homeCountry: 'SO',
    operatesIn: ['SO', 'KE', 'ET'],
    associatedConflicts: ['somalia-civil-war'],
    sanctioned: true,
    description: 'Somali al-Qaeda affiliate. Controls territory in southern Somalia; attacks in Kenya.',
  },
  {
    id: 'boko-haram',
    name: 'Boko Haram',
    type: 'terrorist_org',
    homeCountry: 'NG',
    operatesIn: ['NG', 'CM', 'TD', 'NE'],
    associatedConflicts: ['lake-chad-insurgency'],
    sanctioned: true,
    description: 'Nigerian Sunni jihadist group. Split into BH and ISWAP factions.',
  },
  {
    id: 'iswap',
    name: 'Islamic State West Africa Province',
    aliases: ['ISWAP'],
    type: 'terrorist_org',
    homeCountry: 'NG',
    operatesIn: ['NG', 'CM', 'TD', 'NE'],
    associatedConflicts: ['lake-chad-insurgency'],
    sanctioned: true,
    description: 'ISIS-aligned Boko Haram offshoot. Strongest militant force around Lake Chad.',
    sponsoredBy: ['isis'],
  },

  // === Other significant ===
  {
    id: 'taliban',
    name: 'Taliban',
    aliases: ['Islamic Emirate of Afghanistan'],
    type: 'state_actor',
    homeCountry: 'AF',
    operatesIn: ['AF', 'PK'],
    associatedConflicts: ['afghan-insurgency'],
    sanctioned: true,
    description: 'Ruling regime of Afghanistan since 2021 US withdrawal.',
  },
  {
    id: 'rsf',
    name: 'Rapid Support Forces (Sudan)',
    aliases: ['RSF'],
    type: 'armed_group',
    homeCountry: 'SD',
    operatesIn: ['SD', 'TD', 'CF', 'LY'],
    associatedConflicts: ['sudan-rsf-saf'],
    sanctioned: true,
    description: 'Sudanese paramilitary. Originated from Janjaweed militias. Fighting SAF in ongoing civil war.',
  },
  {
    id: 'saf',
    name: 'Sudanese Armed Forces',
    aliases: ['SAF'],
    type: 'state_actor',
    homeCountry: 'SD',
    operatesIn: ['SD'],
    associatedConflicts: ['sudan-rsf-saf'],
    description: 'Sudan national army. Fighting RSF for territorial control since April 2023.',
  },
  {
    id: 'kim-regime',
    name: 'North Korean Regime (Kim)',
    type: 'state_actor',
    homeCountry: 'KP',
    operatesIn: ['KP', 'RU', 'CN'],
    associatedConflicts: ['korean-standoff'],
    sanctioned: true,
    description: 'DPRK ruling Kim dynasty. Nuclear weapons state. Growing Russia military ties since 2023.',
  },
  {
    id: 'lazarus',
    name: 'Lazarus Group',
    type: 'intelligence_agency',
    homeCountry: 'KP',
    operatesIn: ['KP', 'US', 'GB', 'KR', 'JP'],
    associatedConflicts: ['korean-standoff'],
    sanctioned: true,
    description: 'North Korean state-sponsored cyber APT. Major crypto theft operations, ransomware.',
    sponsoredBy: ['kim-regime'],
  },

  // === Chinese apparatus ===
  {
    id: 'mss',
    name: 'Ministry of State Security (China)',
    aliases: ['MSS', 'Guoanbu'],
    type: 'intelligence_agency',
    homeCountry: 'CN',
    operatesIn: ['CN', 'TW', 'HK', 'US', 'AU', 'GB'],
    associatedConflicts: ['taiwan-strait'],
    description: 'Primary Chinese civilian intelligence agency. Extensive foreign influence and cyber operations.',
  },
  {
    id: 'apt40',
    name: 'APT40 (Leviathan)',
    type: 'intelligence_agency',
    homeCountry: 'CN',
    operatesIn: ['CN', 'US', 'GB', 'AU', 'MY'],
    description: 'Chinese MSS-linked cyber APT targeting maritime, naval, research sectors.',
    sponsoredBy: ['mss'],
  },

  // === Corporations with geopolitical weight ===
  {
    id: 'tsmc',
    name: 'TSMC',
    type: 'corporation',
    homeCountry: 'TW',
    operatesIn: ['TW', 'US', 'JP', 'DE'],
    associatedConflicts: ['taiwan-strait'],
    description:
      'Taiwan Semiconductor Manufacturing Co. Produces 90%+ of advanced chips — focal point of Taiwan Strait risk.',
  },
  {
    id: 'gazprom',
    name: 'Gazprom',
    type: 'corporation',
    homeCountry: 'RU',
    operatesIn: ['RU', 'DE', 'IT', 'TR', 'CN'],
    description: 'Russian state energy giant. Kremlin foreign-policy tool via gas supply leverage.',
  },
  {
    id: 'aramco',
    name: 'Saudi Aramco',
    type: 'corporation',
    homeCountry: 'SA',
    operatesIn: ['SA', 'US', 'CN', 'JP', 'IN', 'KR'],
    description: 'World largest oil producer. Saudi state-controlled. Hormuz-dependent for 6.5M bpd exports.',
  },
];

export function getEntity(id: string): Entity | undefined {
  return ENTITIES.find((e) => e.id === id);
}

export function getEntitiesByCountry(countryCode: string): Entity[] {
  return ENTITIES.filter((e) => e.homeCountry === countryCode || e.operatesIn.includes(countryCode));
}

export function getEntitiesByType(type: EntityType): Entity[] {
  return ENTITIES.filter((e) => e.type === type);
}
