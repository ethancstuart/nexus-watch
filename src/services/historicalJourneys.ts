/**
 * historicalJourneys.ts — pre-built time-travel journeys
 *
 * A "journey" is a narrative ordering of historical time-travel snapshots
 * the timeline scrubber can play as a guided tour. Each journey names
 * keyframes (dates + camera position + narration) that anchor the story.
 *
 * Consumed by timelineScrubber and the landing page "see this" links.
 * Pure data — no runtime state.
 */

export interface JourneyKeyframe {
  /** ISO date (YYYY-MM-DD) matching a cii_daily_snapshots row. */
  date: string;
  /** Narration shown while this keyframe is active. */
  caption: string;
  /** Optional camera bookmark for the globe. */
  camera?: {
    lat: number;
    lon: number;
    zoom: number;
  };
  /** Optional list of country codes to highlight. */
  focus_countries?: string[];
}

export interface HistoricalJourney {
  id: string;
  title: string;
  kicker: string;
  summary: string;
  start_date: string;
  end_date: string;
  /** Tag for filtering on the journey index page. */
  theme: 'conflict' | 'maritime' | 'disaster' | 'politics' | 'markets';
  keyframes: JourneyKeyframe[];
}

export const HISTORICAL_JOURNEYS: HistoricalJourney[] = [
  {
    id: 'khartoum',
    title: 'The Fall of Khartoum',
    kicker: 'SUDAN · CONFLICT',
    summary: "Sudan's slide from RSF-SAF tension to full-scale civil war and famine, tracked week-by-week through CII.",
    start_date: '2023-04-15',
    end_date: '2026-04-01',
    theme: 'conflict',
    keyframes: [
      {
        date: '2023-04-15',
        caption: 'RSF and SAF clash in Khartoum. The war begins with a single morning of fighting.',
        camera: { lat: 15.5, lon: 32.56, zoom: 5 },
        focus_countries: ['SD'],
      },
      {
        date: '2023-06-01',
        caption: '7 weeks in: SAF loses Khartoum airport, RSF sweeps western districts, 1M+ displaced.',
        camera: { lat: 15.5, lon: 32.56, zoom: 5 },
        focus_countries: ['SD', 'TD', 'SS'],
      },
      {
        date: '2023-11-01',
        caption: 'Darfur in flames. UN warns of ethnic cleansing. CII reaches 85.',
        focus_countries: ['SD'],
      },
      {
        date: '2024-06-15',
        caption: 'El Fasher siege intensifies. Famine declared in parts of Darfur and Kordofan.',
        focus_countries: ['SD'],
      },
      {
        date: '2025-10-01',
        caption:
          'Two years in: state collapse, no functioning central authority, neighboring CII rises on refugee loads.',
        camera: { lat: 13, lon: 28, zoom: 4 },
        focus_countries: ['SD', 'TD', 'SS', 'ET', 'CF'],
      },
      {
        date: '2026-04-01',
        caption: 'Present day. The war that never made the front page.',
        focus_countries: ['SD'],
      },
    ],
  },
  {
    id: 'red-sea-crisis',
    title: 'The Red Sea Crisis',
    kicker: 'YEMEN · MARITIME',
    summary:
      'Houthi missile campaign → rerouted shipping → Bab el-Mandeb becomes the second-most-watched chokepoint in the world.',
    start_date: '2023-10-19',
    end_date: '2026-04-01',
    theme: 'maritime',
    keyframes: [
      {
        date: '2023-10-19',
        caption: 'Houthi forces fire first missiles at Israel. Red Sea posture shifts.',
        camera: { lat: 13, lon: 45, zoom: 5 },
        focus_countries: ['YE', 'IL'],
      },
      {
        date: '2023-11-19',
        caption: 'Galaxy Leader seized. Commercial shipping at risk for the first time in decades.',
        camera: { lat: 12.58, lon: 43.33, zoom: 5 },
        focus_countries: ['YE', 'SA'],
      },
      {
        date: '2024-01-12',
        caption: 'US + UK strikes on Houthi positions. Operation Prosperity Guardian scales.',
        focus_countries: ['YE', 'US', 'GB'],
      },
      {
        date: '2024-06-01',
        caption: 'Suez transits down ~50% YoY. Containers reroute around the Cape of Good Hope.',
        camera: { lat: 15, lon: 35, zoom: 4 },
        focus_countries: ['EG', 'YE', 'DJ'],
      },
      {
        date: '2025-03-15',
        caption: 'Ceasefire between Israel and Hamas, but Houthi campaign continues at lower tempo.',
        focus_countries: ['YE', 'IL'],
      },
      {
        date: '2026-04-01',
        caption: 'Present: Red Sea CII elevated but stable. Chokepoint CII re-anchored at the new baseline.',
        focus_countries: ['YE', 'EG'],
      },
    ],
  },
  {
    id: 'ukraine-year-4',
    title: 'Ukraine — Year 4',
    kicker: 'UKRAINE · RUSSIA · CONFLICT',
    summary: 'The third winter, the fourth spring. Frontline evolution, drone warfare, and NATO eastern-flank posture.',
    start_date: '2022-02-24',
    end_date: '2026-04-01',
    theme: 'conflict',
    keyframes: [
      {
        date: '2022-02-24',
        caption: 'Full-scale invasion begins. Ukraine CII spikes to 90+.',
        camera: { lat: 49, lon: 32, zoom: 5 },
        focus_countries: ['UA', 'RU'],
      },
      {
        date: '2022-09-10',
        caption: 'Kharkiv counteroffensive. First major territorial reversal for Russia.',
        focus_countries: ['UA'],
      },
      {
        date: '2023-06-01',
        caption: 'Summer counteroffensive begins. Slow, heavily-mined advance.',
        focus_countries: ['UA'],
      },
      {
        date: '2024-02-17',
        caption: 'Avdiivka falls after 4-month Russian assault. Frontline equilibrium resets.',
        focus_countries: ['UA'],
      },
      {
        date: '2025-05-01',
        caption: 'Drones dominate both sides of the line. GPS jamming zones cover half the country.',
        focus_countries: ['UA', 'RU'],
      },
      {
        date: '2026-04-01',
        caption: 'Year 4. NATO eastern flank institutionalized. No armistice.',
        camera: { lat: 49, lon: 32, zoom: 5 },
        focus_countries: ['UA', 'RU', 'PL', 'RO'],
      },
    ],
  },
  {
    id: 'gaza',
    title: 'Gaza — The War and After',
    kicker: 'ISRAEL · PALESTINE · CONFLICT',
    summary: 'October 7 to the ceasefire: 18 months of urban combat, hostage exchanges, and regional escalation.',
    start_date: '2023-10-07',
    end_date: '2026-04-01',
    theme: 'conflict',
    keyframes: [
      {
        date: '2023-10-07',
        caption: 'Hamas cross-border attack kills 1,200 Israelis, takes 240+ hostages. War begins.',
        camera: { lat: 31.5, lon: 34.5, zoom: 6 },
        focus_countries: ['IL', 'PS'],
      },
      {
        date: '2023-11-24',
        caption: 'First hostage-prisoner exchange during temporary truce. 105 released.',
        focus_countries: ['IL', 'PS'],
      },
      {
        date: '2024-04-13',
        caption: 'Iran launches 300 drones and missiles at Israel. First direct state attack.',
        camera: { lat: 32.5, lon: 42, zoom: 5 },
        focus_countries: ['IL', 'IR', 'JO'],
      },
      {
        date: '2024-09-27',
        caption: 'Israeli strike kills Hezbollah leader Hassan Nasrallah. Lebanon theater opens.',
        focus_countries: ['IL', 'LB'],
      },
      {
        date: '2025-01-19',
        caption: 'Phase 1 ceasefire. Hostage-prisoner exchanges resume.',
        focus_countries: ['IL', 'PS'],
      },
      {
        date: '2026-04-01',
        caption: 'Present. Rebuild underway. Regional CII still elevated.',
        camera: { lat: 31.5, lon: 34.5, zoom: 5 },
        focus_countries: ['IL', 'PS', 'LB', 'SY'],
      },
    ],
  },
];

export function getJourney(id: string): HistoricalJourney | null {
  return HISTORICAL_JOURNEYS.find((j) => j.id === id) ?? null;
}

export function listJourneys(): HistoricalJourney[] {
  return HISTORICAL_JOURNEYS;
}
