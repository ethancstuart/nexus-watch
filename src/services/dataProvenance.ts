/**
 * Data Provenance & Freshness Tracking
 *
 * Every data point NexusWatch displays comes from a verifiable source.
 * This module tracks WHERE data comes from, WHEN it was last fetched,
 * and HOW fresh it is — the backbone of the trust & governance layer
 * that differentiates NexusWatch from competitors who show data without
 * attribution.
 *
 * Layers call `updateProvenance()` after each successful fetch.
 * The sidebar and methodology panel read from `getProvenance()` and
 * `getAllProvenance()` to render freshness indicators and source badges.
 */

export interface DataProvenance {
  /** Layer ID this provenance record belongs to (e.g., 'earthquakes', 'acled'). */
  layerId: string;
  /** Human-readable source name (e.g., "USGS Earthquake Hazards Program"). */
  source: string;
  /** Canonical URL of the upstream data source. */
  sourceUrl: string;
  /** Timestamp of the last successful data fetch. */
  fetchedAt: number;
  /** Expected refresh interval in milliseconds. */
  refreshIntervalMs: number;
  /** Number of data points returned in the last fetch. */
  dataPointCount: number;
  /** Brief methodology description. */
  methodology?: string;
  /** Whether the last fetch succeeded. */
  lastFetchOk: boolean;
  /** Error message from the last failed fetch, if any. */
  lastError?: string;
}

export type Freshness = 'live' | 'recent' | 'stale' | 'offline';

const provenanceMap = new Map<string, DataProvenance>();

/**
 * Compute freshness level from a provenance record.
 *   live    — within 1.5x refresh interval (green)
 *   recent  — within 3x refresh interval (yellow)
 *   stale   — within 10x refresh interval (orange)
 *   offline — beyond 10x or never fetched (red)
 */
export function computeFreshness(prov: DataProvenance): Freshness {
  if (!prov.lastFetchOk) return 'offline';
  const age = Date.now() - prov.fetchedAt;
  if (age < prov.refreshIntervalMs * 1.5) return 'live';
  if (age < prov.refreshIntervalMs * 3) return 'recent';
  if (age < prov.refreshIntervalMs * 10) return 'stale';
  return 'offline';
}

/** Color for freshness indicator dots. */
export function freshnessColor(f: Freshness): string {
  switch (f) {
    case 'live':
      return '#22c55e';
    case 'recent':
      return '#eab308';
    case 'stale':
      return '#f97316';
    case 'offline':
      return '#dc2626';
  }
}

/** Human-readable freshness label. */
export function freshnessLabel(f: Freshness): string {
  switch (f) {
    case 'live':
      return 'Live';
    case 'recent':
      return 'Recent';
    case 'stale':
      return 'Stale';
    case 'offline':
      return 'Offline';
  }
}

/**
 * Format a relative time string (e.g., "2m ago", "1h ago", "3d ago").
 */
export function relativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Update provenance for a layer. Called by each layer's fetch cycle
 * after a successful (or failed) data retrieval.
 */
export function updateProvenance(
  layerId: string,
  update: Omit<DataProvenance, 'layerId' | 'fetchedAt'> & { fetchedAt?: number },
): void {
  provenanceMap.set(layerId, {
    ...update,
    layerId,
    fetchedAt: update.fetchedAt ?? Date.now(),
  });
  // Dispatch event so the sidebar can update freshness indicators in real time
  document.dispatchEvent(
    new CustomEvent('dashview:provenance-update', {
      detail: { layerId },
    }),
  );
}

/** Get provenance for a specific layer. */
export function getProvenance(layerId: string): DataProvenance | undefined {
  return provenanceMap.get(layerId);
}

/** Get all provenance records. */
export function getAllProvenance(): Map<string, DataProvenance> {
  return provenanceMap;
}

/**
 * Pre-registered source metadata. Layers call updateProvenance() with
 * dynamic fetch data; this registry provides the static metadata that
 * doesn't change per fetch (source name, URL, methodology, refresh rate).
 *
 * Adding a new layer? Add its registry entry here first so the
 * methodology panel and source attribution can reference it even before
 * the first successful fetch.
 */
export const SOURCE_REGISTRY: Record<
  string,
  {
    source: string;
    sourceUrl: string;
    refreshIntervalMs: number;
    methodology: string;
  }
> = {
  earthquakes: {
    source: 'USGS Earthquake Hazards Program',
    sourceUrl: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    refreshIntervalMs: 60_000,
    methodology:
      'All M1.0+ earthquakes from the past 24 hours. Magnitude, depth, and location from USGS real-time seismograph network. Updated every 60 seconds.',
  },
  acled: {
    source: 'Armed Conflict Location & Event Data (ACLED)',
    sourceUrl: 'https://acleddata.com/data-export-tool/',
    refreshIntervalMs: 3_600_000,
    methodology:
      'Conflict events sourced from ACLED via NexusWatch proxy. Includes battles, protests, riots, violence against civilians, strategic developments. Updated hourly.',
  },
  fires: {
    source: 'NASA FIRMS (Fire Information for Resource Management System)',
    sourceUrl: 'https://firms.modaps.eosdis.nasa.gov/',
    refreshIntervalMs: 600_000,
    methodology:
      'Active fire hotspots from MODIS and VIIRS satellite sensors. Thermal anomalies detected globally. Updated every 10 minutes.',
  },
  news: {
    source: 'GDELT Project (Global Database of Events, Language, and Tone)',
    sourceUrl: 'https://www.gdeltproject.org/',
    refreshIntervalMs: 900_000,
    methodology:
      'Global news events with tone analysis, location geocoding, and event classification. Monitors news sources in 65+ languages. Updated every 15 minutes.',
  },
  'disease-outbreaks': {
    source: 'World Health Organization (WHO) Disease Outbreak News',
    sourceUrl: 'https://www.who.int/emergencies/disease-outbreak-news',
    refreshIntervalMs: 3_600_000,
    methodology:
      'Active disease outbreaks reported to WHO by member states. Includes event type, affected country, and case counts. Updated hourly.',
  },
  'weather-alerts': {
    source: 'Open-Meteo Weather API',
    sourceUrl: 'https://open-meteo.com/',
    refreshIntervalMs: 900_000,
    methodology:
      'Severe weather alerts for 20 monitored cities. Temperature, wind, precipitation, and extreme event warnings. Updated every 15 minutes.',
  },
  flights: {
    source: 'OpenSky Network',
    sourceUrl: 'https://opensky-network.org/',
    refreshIntervalMs: 30_000,
    methodology:
      'Live aircraft positions from ADS-B transponder data collected by a global network of volunteer receivers. Updated every 30 seconds.',
  },
  ships: {
    source: 'AIS Marine Traffic Data',
    sourceUrl: 'https://www.marinetraffic.com/',
    refreshIntervalMs: 300_000,
    methodology:
      'Vessel positions from Automatic Identification System (AIS) transponders. Covers commercial shipping, naval vessels, and tankers. Updated every 5 minutes.',
  },
  'prediction-markets': {
    source: 'Polymarket',
    sourceUrl: 'https://polymarket.com/',
    refreshIntervalMs: 300_000,
    methodology:
      'Prediction market odds on geopolitical events. Prices reflect crowd-sourced probability estimates from real-money markets. Updated every 5 minutes.',
  },
  'internet-outages': {
    source: 'Cloudflare Radar',
    sourceUrl: 'https://radar.cloudflare.com/',
    refreshIntervalMs: 300_000,
    methodology:
      "Internet traffic anomalies and outages detected from Cloudflare's global network handling ~20% of web traffic. Updated every 5 minutes.",
  },
  sanctions: {
    source: 'US Treasury OFAC Sanctions List',
    sourceUrl: 'https://www.treasury.gov/ofac/downloads/',
    refreshIntervalMs: 86_400_000,
    methodology:
      'Sanctioned countries and entities from the US Office of Foreign Assets Control. Comprehensive, targeted, and sectoral classifications. Updated daily.',
  },
  elections: {
    source: 'NexusWatch Election Calendar',
    sourceUrl: 'https://nexuswatch.dev/#/methodology',
    refreshIntervalMs: 86_400_000,
    methodology:
      'Curated calendar of upcoming elections, referenda, and leadership transitions in monitored countries. Manual editorial review. Updated daily.',
  },
};
