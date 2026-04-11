/**
 * Data source registry — Track D.1 (Data Accuracy Autonomy)
 *
 * Maps each of the 30 Intel Map layers to its primary upstream source plus any
 * known fallbacks. Consumed by:
 *   - api/cron/data-health.ts  — probes each layer's active source every 15m
 *   - api/admin/data-health.ts — surfaces current state to the admin dashboard
 *
 * Layer IDs mirror the `readonly id` declared on each MapDataLayer in
 * src/map/layers/*.ts. Keep this file in sync when adding new layers.
 *
 * Probe URL guidance
 * ------------------
 * Prefer probing the internal Vercel function proxy (e.g. /api/fires) rather
 * than hitting upstream APIs directly — the proxy fails fast when the upstream
 * is down and the cron can run the probe without CORS or auth concerns.
 * When probed from the cron, relative `/api/*` paths are expanded to the
 * deployment URL via process.env.VERCEL_URL.
 *
 * For static-dataset layers (cables, chokepoints, etc.) we point the primary
 * source at the source-of-truth URL used to refresh the hard-coded data, so
 * the cron can still detect "the upstream that would refresh this layer is
 * broken" even though the map itself renders from bundled JSON.
 */

export interface LayerSource {
  /** Short identifier used in logs/DB rows (e.g. 'usgs', 'proxy'). */
  name: string;
  /** Lightweight URL the cron will GET to check health. Relative `/api/*` allowed. */
  probeUrl: string;
  /** Per-probe timeout in milliseconds — cron enforces this with AbortSignal. */
  probeTimeoutMs: number;
  /** How stale is "too stale" — max acceptable age for the freshest record. */
  freshnessWindowSeconds: number;
}

export interface LayerConfig {
  /** Matches the `readonly id` on the corresponding MapDataLayer. */
  id: string;
  /** Primary upstream the layer uses in the happy path. */
  primary: LayerSource;
  /**
   * Ordered list of alternative sources to cycle through when the circuit
   * breaker opens. Empty array = no known fallback (cron handles gracefully).
   */
  fallbacks: LayerSource[];
}

// Default timeout and freshness windows used across most layers.
const DEFAULT_TIMEOUT_MS = 5000;
const FRESH_1H = 3600;
const FRESH_6H = 6 * 3600;
const FRESH_24H = 24 * 3600;
const FRESH_7D = 7 * 24 * 3600;
const FRESH_30D = 30 * 24 * 3600;

export const DATA_SOURCES: LayerConfig[] = [
  // -------------------------------------------------------------------------
  // Conflict & Military (7)
  // -------------------------------------------------------------------------
  {
    id: 'acled',
    primary: {
      name: 'proxy-acled',
      probeUrl: '/api/acled',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_24H,
    },
    fallbacks: [
      {
        name: 'acled-api',
        probeUrl: 'https://api.acleddata.com/acled/read?limit=1',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_24H,
      },
    ],
  },
  {
    id: 'conflicts',
    // Static dataset; no upstream fetch. GDELT conflict events used for refresh.
    primary: {
      name: 'gdelt-conflict',
      probeUrl: 'https://api.gdeltproject.org/api/v2/doc/doc?query=conflict&mode=artlist&format=json&maxrecords=1',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_24H,
    },
    fallbacks: [],
  },
  {
    id: 'military',
    // Hard-coded registry of 28 bases; source-of-truth is public OSINT.
    primary: {
      name: 'static-bundle',
      probeUrl: '/api/feed',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_30D,
    },
    fallbacks: [],
  },
  {
    id: 'cyber',
    primary: {
      name: 'proxy-cyber',
      probeUrl: '/api/cyber',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_6H,
    },
    fallbacks: [
      {
        name: 'cloudflare-radar',
        probeUrl: 'https://radar.cloudflare.com/',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_6H,
      },
    ],
  },
  {
    id: 'sanctions',
    // OFAC SDN list refreshed from Treasury publications.
    primary: {
      name: 'ofac-treasury',
      probeUrl: 'https://www.treasury.gov/ofac/downloads/sdn.xml',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_7D,
    },
    fallbacks: [],
  },
  {
    id: 'gps-jamming',
    // Static curated dataset — public GPSJam.org is the reference source.
    primary: {
      name: 'gpsjam',
      probeUrl: 'https://gpsjam.org/',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_24H,
    },
    fallbacks: [],
  },
  {
    id: 'frontlines',
    // Static curated dataset; refresh from OSINT/ISW situation reports.
    primary: {
      name: 'isw',
      probeUrl: 'https://www.understandingwar.org/',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_7D,
    },
    fallbacks: [],
  },

  // -------------------------------------------------------------------------
  // Natural Hazards (5)
  // -------------------------------------------------------------------------
  {
    id: 'earthquakes',
    primary: {
      name: 'proxy-earthquakes',
      probeUrl: '/api/earthquakes?period=day&minMag=2.5',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: 600,
    },
    fallbacks: [
      {
        name: 'usgs-direct',
        probeUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_day.geojson',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: 900,
      },
      {
        name: 'emsc',
        probeUrl: 'https://www.seismicportal.eu/fdsnws/event/1/query?limit=1&format=json',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: 900,
      },
    ],
  },
  {
    id: 'fires',
    primary: {
      name: 'proxy-fires',
      probeUrl: '/api/fires?days=1',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_1H,
    },
    fallbacks: [
      {
        name: 'nasa-firms',
        probeUrl: 'https://firms.modaps.eosdis.nasa.gov/api/area/csv/',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_6H,
      },
    ],
  },
  {
    id: 'gdacs',
    primary: {
      name: 'proxy-gdacs',
      probeUrl: '/api/gdacs',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_6H,
    },
    fallbacks: [
      {
        name: 'gdacs-direct',
        probeUrl: 'https://www.gdacs.org/xml/rss.xml',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_6H,
      },
    ],
  },
  {
    id: 'diseases',
    primary: {
      name: 'proxy-disease',
      probeUrl: '/api/disease-outbreaks',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_24H,
    },
    fallbacks: [
      {
        name: 'who-don',
        probeUrl: 'https://www.who.int/feeds/entity/csr/don/en/rss.xml',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_24H,
      },
    ],
  },
  {
    id: 'weather-alerts',
    primary: {
      name: 'proxy-weather-alerts',
      probeUrl: '/api/weather-alerts',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_1H,
    },
    fallbacks: [
      {
        name: 'open-meteo',
        probeUrl: 'https://api.open-meteo.com/v1/forecast?latitude=0&longitude=0&current=temperature_2m',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_1H,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Infrastructure (9)
  // -------------------------------------------------------------------------
  {
    id: 'ships',
    primary: {
      name: 'proxy-ships',
      probeUrl: '/api/ships',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_1H,
    },
    fallbacks: [],
  },
  {
    id: 'chokepoints',
    // Static curated dataset; status updates derived from ship/news overlays.
    primary: {
      name: 'static-bundle',
      probeUrl: '/api/feed',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_24H,
    },
    fallbacks: [],
  },
  {
    id: 'cables',
    // Static curated dataset; TeleGeography is the public source of truth.
    primary: {
      name: 'telegeography',
      probeUrl: 'https://www.submarinecablemap.com/',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_30D,
    },
    fallbacks: [],
  },
  {
    id: 'pipelines',
    // Static curated dataset.
    primary: {
      name: 'static-bundle',
      probeUrl: '/api/feed',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_30D,
    },
    fallbacks: [],
  },
  {
    id: 'nuclear',
    // Static curated dataset; IAEA PRIS is the refresh source.
    primary: {
      name: 'iaea-pris',
      probeUrl: 'https://pris.iaea.org/PRIS/home.aspx',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_30D,
    },
    fallbacks: [],
  },
  {
    id: 'ports',
    // Static curated dataset.
    primary: {
      name: 'static-bundle',
      probeUrl: '/api/feed',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_30D,
    },
    fallbacks: [],
  },
  {
    id: 'trade-routes',
    // Static curated dataset.
    primary: {
      name: 'static-bundle',
      probeUrl: '/api/feed',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_30D,
    },
    fallbacks: [],
  },
  {
    id: 'launches',
    primary: {
      name: 'proxy-launches',
      probeUrl: '/api/launches',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_24H,
    },
    fallbacks: [
      {
        name: 'launchlibrary',
        probeUrl: 'https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=1',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_24H,
      },
    ],
  },
  {
    id: 'energy',
    // Static curated dataset of oil/gas facilities.
    primary: {
      name: 'static-bundle',
      probeUrl: '/api/feed',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_30D,
    },
    fallbacks: [],
  },

  // -------------------------------------------------------------------------
  // Intelligence (7)
  // -------------------------------------------------------------------------
  {
    id: 'news',
    primary: {
      name: 'proxy-gdelt',
      probeUrl: '/api/gdelt',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_1H,
    },
    fallbacks: [
      {
        name: 'gdelt-direct',
        probeUrl: 'https://api.gdeltproject.org/api/v2/doc/doc?query=world&mode=artlist&format=json&maxrecords=1',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_1H,
      },
    ],
  },
  {
    id: 'predictions',
    primary: {
      name: 'proxy-prediction',
      probeUrl: '/api/prediction',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_1H,
    },
    fallbacks: [
      {
        name: 'polymarket',
        probeUrl: 'https://gamma-api.polymarket.com/markets?limit=1',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_1H,
      },
    ],
  },
  {
    id: 'satellites',
    primary: {
      name: 'proxy-satellites',
      probeUrl: '/api/satellites',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_24H,
    },
    fallbacks: [
      {
        name: 'celestrak',
        probeUrl: 'https://celestrak.org/NORAD/elements/gp.php?GROUP=active&FORMAT=json',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_24H,
      },
    ],
  },
  {
    id: 'internet-outages',
    primary: {
      name: 'proxy-internet-outages',
      probeUrl: '/api/internet-outages',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_1H,
    },
    fallbacks: [
      {
        name: 'cloudflare-radar',
        probeUrl: 'https://radar.cloudflare.com/',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_1H,
      },
    ],
  },
  {
    id: 'elections',
    // Static curated calendar.
    primary: {
      name: 'static-bundle',
      probeUrl: '/api/feed',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_30D,
    },
    fallbacks: [],
  },
  {
    id: 'displacement',
    primary: {
      name: 'proxy-displacement',
      probeUrl: '/api/displacement',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_24H,
    },
    fallbacks: [
      {
        name: 'unhcr',
        probeUrl: 'https://api.unhcr.org/population/v1/population/?limit=1',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_7D,
      },
    ],
  },
  {
    id: 'sentiment',
    // Derived from the news layer — no independent fetch. Probe GDELT so the
    // breaker still opens when the upstream that feeds sentiment is down.
    primary: {
      name: 'proxy-gdelt',
      probeUrl: '/api/gdelt',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_1H,
    },
    fallbacks: [],
  },

  // -------------------------------------------------------------------------
  // Environment (2)
  // -------------------------------------------------------------------------
  {
    id: 'air-quality',
    primary: {
      name: 'proxy-air-quality',
      probeUrl: '/api/air-quality',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: FRESH_1H,
    },
    fallbacks: [
      {
        name: 'openaq',
        probeUrl: 'https://api.openaq.org/v2/latest?limit=1',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: FRESH_1H,
      },
    ],
  },
  {
    id: 'flights',
    primary: {
      name: 'proxy-flights',
      probeUrl: '/api/flights',
      probeTimeoutMs: DEFAULT_TIMEOUT_MS,
      freshnessWindowSeconds: 900,
    },
    fallbacks: [
      {
        name: 'opensky',
        probeUrl: 'https://opensky-network.org/api/states/all',
        probeTimeoutMs: DEFAULT_TIMEOUT_MS,
        freshnessWindowSeconds: 900,
      },
    ],
  },
];

/**
 * Picks the active source for a layer given its circuit breaker state.
 * - circuit 'closed' or 'half_open' → primary
 * - circuit 'open'                  → fallback at index (failures / 5 - 1)
 * If the fallback index exceeds the fallback list, wraps around to 0.
 * Returns null if the layer has no fallbacks and the circuit is open.
 */
export function pickSource(
  layer: LayerConfig,
  circuitState: 'closed' | 'open' | 'half_open',
  consecutiveFailures: number,
): LayerSource | null {
  if (circuitState !== 'open') return layer.primary;
  if (layer.fallbacks.length === 0) return null;
  // Each 5 consecutive failures, advance to the next fallback.
  const bucket = Math.max(0, Math.floor(consecutiveFailures / 5) - 1);
  const idx = bucket % layer.fallbacks.length;
  return layer.fallbacks[idx] ?? null;
}
