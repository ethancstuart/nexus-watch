import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 15 };

/**
 * Network Graph Intelligence API.
 *
 * Exposes entity relationships (proxy networks, sponsorship chains,
 * alliances) enriched with live CII scores and ACLED activity data.
 *
 * GET /api/v2/network-graph?entity=iran     — Iran's full proxy network
 * GET /api/v2/network-graph?country=UA      — All entities operating in Ukraine
 * GET /api/v2/network-graph                 — Full graph
 *
 * Response includes:
 * - Entity nodes with type, country, sanctions status
 * - Relationship edges (sponsors, proxies, operates_in)
 * - Live CII scores for all involved countries
 * - Activity levels derived from entity operating country CII
 */

const CORS_ORIGIN = 'https://nexuswatch.dev';

// Inline entity registry for the API (mirrors src/services/entityRegistry.ts)
// In production, this would be shared via a common module
interface NetworkEntity {
  id: string;
  name: string;
  type: string;
  homeCountry: string;
  operatesIn: string[];
  sanctioned: boolean;
  sponsoredBy: string[];
  proxies: string[];
  description: string;
}

const ENTITIES: NetworkEntity[] = [
  // Russian apparatus
  {
    id: 'kremlin',
    name: 'Russian Federation',
    type: 'state_actor',
    homeCountry: 'RU',
    operatesIn: ['UA', 'SY', 'LY', 'ML', 'CF'],
    sanctioned: false,
    sponsoredBy: [],
    proxies: ['wagner-group', 'gru', 'fsb'],
    description: 'Russian state — primary sponsor of multiple proxy forces globally',
  },
  {
    id: 'wagner-group',
    name: 'Wagner Group / Africa Corps',
    type: 'private_military',
    homeCountry: 'RU',
    operatesIn: ['UA', 'SY', 'LY', 'ML', 'CF', 'SD', 'MZ'],
    sanctioned: true,
    sponsoredBy: ['kremlin'],
    proxies: [],
    description: 'Russian PMC. Active in Africa and Ukraine.',
  },
  {
    id: 'gru',
    name: 'GRU (Russian Military Intel)',
    type: 'intelligence_agency',
    homeCountry: 'RU',
    operatesIn: ['UA', 'SY', 'GB', 'DE'],
    sanctioned: true,
    sponsoredBy: ['kremlin'],
    proxies: [],
    description: 'Russian military intelligence. Cyber ops + covert action.',
  },
  {
    id: 'fsb',
    name: 'FSB',
    type: 'intelligence_agency',
    homeCountry: 'RU',
    operatesIn: ['UA', 'BY', 'KZ'],
    sanctioned: true,
    sponsoredBy: ['kremlin'],
    proxies: [],
    description: 'Russian domestic security + foreign intel.',
  },
  // Iranian apparatus
  {
    id: 'iran-state',
    name: 'Islamic Republic of Iran',
    type: 'state_actor',
    homeCountry: 'IR',
    operatesIn: ['IQ', 'SY', 'LB', 'YE', 'PS'],
    sanctioned: false,
    sponsoredBy: [],
    proxies: ['irgc', 'hezbollah', 'houthis', 'hamas-izz', 'pmu'],
    description: 'Iran — primary sponsor of Axis of Resistance proxy network',
  },
  {
    id: 'irgc',
    name: 'IRGC / Quds Force',
    type: 'state_actor',
    homeCountry: 'IR',
    operatesIn: ['IQ', 'SY', 'LB', 'YE'],
    sanctioned: true,
    sponsoredBy: ['iran-state'],
    proxies: ['hezbollah', 'houthis', 'hamas-izz', 'pmu'],
    description: 'Islamic Revolutionary Guard Corps. Manages all Iranian proxy relationships.',
  },
  {
    id: 'hezbollah',
    name: 'Hezbollah',
    type: 'armed_group',
    homeCountry: 'LB',
    operatesIn: ['LB', 'SY', 'IQ'],
    sanctioned: true,
    sponsoredBy: ['irgc', 'iran-state'],
    proxies: [],
    description: 'Lebanese militant group and political party. Most capable Iranian proxy.',
  },
  {
    id: 'houthis',
    name: 'Ansar Allah (Houthis)',
    type: 'armed_group',
    homeCountry: 'YE',
    operatesIn: ['YE'],
    sanctioned: true,
    sponsoredBy: ['irgc', 'iran-state'],
    proxies: [],
    description: 'Yemeni rebel movement. Controls northwest Yemen. Red Sea shipping attacks.',
  },
  {
    id: 'hamas-izz',
    name: 'Hamas / Izz al-Din al-Qassam',
    type: 'armed_group',
    homeCountry: 'PS',
    operatesIn: ['PS'],
    sanctioned: true,
    sponsoredBy: ['irgc', 'iran-state'],
    proxies: [],
    description: 'Palestinian militant group. October 7, 2023 attack on Israel.',
  },
  {
    id: 'pmu',
    name: 'Popular Mobilization Forces (PMF/PMU)',
    type: 'proxy_force',
    homeCountry: 'IQ',
    operatesIn: ['IQ', 'SY'],
    sanctioned: false,
    sponsoredBy: ['irgc'],
    proxies: [],
    description: 'Iraqi Shia paramilitary umbrella. Multiple Iran-aligned factions.',
  },
  // Chinese apparatus
  {
    id: 'pla',
    name: "PLA (People's Liberation Army)",
    type: 'state_actor',
    homeCountry: 'CN',
    operatesIn: ['CN', 'TW'],
    sanctioned: false,
    sponsoredBy: [],
    proxies: ['pla-ssf'],
    description: 'Chinese military. Taiwan Strait operations.',
  },
  {
    id: 'pla-ssf',
    name: 'PLA Strategic Support Force',
    type: 'intelligence_agency',
    homeCountry: 'CN',
    operatesIn: ['CN'],
    sanctioned: false,
    sponsoredBy: ['pla'],
    proxies: [],
    description: 'Chinese military cyber, space, and electronic warfare.',
  },
  // Sahel actors
  {
    id: 'jnim',
    name: 'JNIM (al-Qaeda Sahel)',
    type: 'terrorist_org',
    homeCountry: 'ML',
    operatesIn: ['ML', 'BF', 'NE', 'TD'],
    sanctioned: true,
    sponsoredBy: [],
    proxies: [],
    description: 'Al-Qaeda affiliate in the Sahel. Active across Mali, Burkina Faso, Niger.',
  },
  {
    id: 'isgs',
    name: 'ISGS (ISIS Greater Sahara)',
    type: 'terrorist_org',
    homeCountry: 'BF',
    operatesIn: ['BF', 'NE', 'ML', 'NG'],
    sanctioned: true,
    sponsoredBy: [],
    proxies: [],
    description: 'ISIS affiliate. Niger-Mali-Burkina border triangle.',
  },
  // East Africa
  {
    id: 'al-shabaab',
    name: 'al-Shabaab',
    type: 'terrorist_org',
    homeCountry: 'SO',
    operatesIn: ['SO', 'KE'],
    sanctioned: true,
    sponsoredBy: [],
    proxies: [],
    description: 'Al-Qaeda affiliate controlling parts of southern Somalia.',
  },
  {
    id: 'rsf',
    name: 'Rapid Support Forces (RSF)',
    type: 'armed_group',
    homeCountry: 'SD',
    operatesIn: ['SD', 'TD', 'LY'],
    sanctioned: false,
    sponsoredBy: [],
    proxies: [],
    description: 'Sudanese paramilitary. Fighting SAF in civil war since April 2023.',
  },
  {
    id: 'm23',
    name: 'M23 / AFC',
    type: 'armed_group',
    homeCountry: 'CD',
    operatesIn: ['CD'],
    sanctioned: true,
    sponsoredBy: [],
    proxies: [],
    description: 'Congolese rebel group with alleged Rwandan backing. Active in North Kivu.',
  },
  // North Korea
  {
    id: 'rgb',
    name: 'RGB (Reconnaissance General Bureau)',
    type: 'intelligence_agency',
    homeCountry: 'KP',
    operatesIn: ['KP', 'KR', 'JP'],
    sanctioned: true,
    sponsoredBy: [],
    proxies: ['lazarus'],
    description: 'DPRK primary intelligence agency. Cyber ops, WMD procurement.',
  },
  {
    id: 'lazarus',
    name: 'Lazarus Group',
    type: 'intelligence_agency',
    homeCountry: 'KP',
    operatesIn: ['KP'],
    sanctioned: true,
    sponsoredBy: ['rgb'],
    proxies: [],
    description: 'DPRK state-sponsored APT group. Cryptocurrency theft, financial cybercrime.',
  },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });

  const entityFilter = (req.query.entity as string)?.toLowerCase();
  const countryFilter = (req.query.country as string)?.toUpperCase();

  // Filter entities
  let filteredEntities = ENTITIES;
  if (entityFilter) {
    // Find the entity and all connected entities (1 degree)
    const root = ENTITIES.find((e) => e.id.includes(entityFilter) || e.name.toLowerCase().includes(entityFilter));
    if (!root) return res.json({ nodes: [], edges: [], error: `Entity "${entityFilter}" not found` });

    const connectedIds = new Set([root.id, ...root.proxies, ...root.sponsoredBy]);
    // Also find entities that sponsor or are proxied by the root
    for (const e of ENTITIES) {
      if (e.proxies.includes(root.id) || e.sponsoredBy.includes(root.id)) connectedIds.add(e.id);
    }
    filteredEntities = ENTITIES.filter((e) => connectedIds.has(e.id));
  } else if (countryFilter) {
    filteredEntities = ENTITIES.filter((e) => e.homeCountry === countryFilter || e.operatesIn.includes(countryFilter));
  }

  // Get live CII scores for enrichment
  let ciiMap = new Map<string, number>();
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const sql = neon(dbUrl);
      const rows = await sql`
        SELECT DISTINCT ON (country_code) country_code, score
        FROM country_cii_history
        ORDER BY country_code, timestamp DESC
      `;
      ciiMap = new Map(rows.map((r) => [String(r.country_code), Number(r.score)]));
    } catch {
      /* DB unavailable — continue without CII enrichment */
    }
  }

  // Build nodes
  const nodes = filteredEntities.map((e) => ({
    id: e.id,
    label: e.name,
    type: e.type,
    homeCountry: e.homeCountry,
    homeCII: ciiMap.get(e.homeCountry) || 0,
    operatesIn: e.operatesIn,
    sanctioned: e.sanctioned,
    description: e.description,
    // Activity level: average CII of operating countries (higher = more active theater)
    activityLevel:
      e.operatesIn.length > 0
        ? Math.round(e.operatesIn.reduce((s, c) => s + (ciiMap.get(c) || 0), 0) / e.operatesIn.length)
        : 0,
  }));

  // Build edges
  const entityIds = new Set(filteredEntities.map((e) => e.id));
  const edges: Array<{
    source: string;
    target: string;
    type: string;
    label: string;
    weight: number;
  }> = [];

  for (const e of filteredEntities) {
    // Sponsor edges
    for (const sponsorId of e.sponsoredBy) {
      if (entityIds.has(sponsorId)) {
        const sponsor = ENTITIES.find((s) => s.id === sponsorId);
        const maxCII = Math.max(ciiMap.get(e.homeCountry) || 0, ciiMap.get(sponsor?.homeCountry || '') || 0);
        edges.push({
          source: sponsorId,
          target: e.id,
          type: 'sponsors',
          label: 'sponsors',
          weight: Math.min(10, 5 + Math.round(maxCII / 25)),
        });
      }
    }
    // Proxy edges
    for (const proxyId of e.proxies) {
      if (entityIds.has(proxyId)) {
        edges.push({
          source: e.id,
          target: proxyId,
          type: 'controls',
          label: 'controls',
          weight: 7,
        });
      }
    }
    // Operates-in edges (entity → country)
    for (const cc of e.operatesIn) {
      const cii = ciiMap.get(cc) || 0;
      if (cii > 40) {
        // Only show operates-in edges for active conflict countries
        edges.push({
          source: e.id,
          target: cc,
          type: 'operates_in',
          label: `active in ${cc} (CII ${cii})`,
          weight: Math.min(10, Math.round(cii / 10)),
        });
      }
    }
  }

  return res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=300').json({
    nodes,
    edges,
    entityCount: nodes.length,
    edgeCount: edges.length,
    ciiEnriched: ciiMap.size > 0,
    generatedAt: new Date().toISOString(),
  });
}
