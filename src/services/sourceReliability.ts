/**
 * Source Reliability Scoring
 *
 * Each data source gets a confidence score (0-100) based on:
 * - Authority: Is this an official government/institutional source?
 * - Timeliness: How fresh is the data?
 * - Verification: Is the data independently verifiable?
 * - Coverage: How comprehensive is the data?
 */

export interface SourceInfo {
  name: string;
  reliability: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D';
  type: 'government' | 'institutional' | 'academic' | 'commercial' | 'crowdsourced' | 'ai-derived';
  updateFrequency: string;
  description: string;
}

const SOURCES: Record<string, SourceInfo> = {
  // Government / Official
  earthquakes: { name: 'USGS', reliability: 98, grade: 'A', type: 'government', updateFrequency: '1 minute', description: 'US Geological Survey — authoritative seismic data' },
  fires: { name: 'NASA FIRMS', reliability: 95, grade: 'A', type: 'government', updateFrequency: '10 minutes', description: 'NASA Fire Information for Resource Management — satellite hotspots' },
  gdacs: { name: 'GDACS', reliability: 95, grade: 'A', type: 'institutional', updateFrequency: '1 hour', description: 'Global Disaster Alert Coordination System — UN-backed' },
  'weather-alerts': { name: 'Open-Meteo', reliability: 90, grade: 'A', type: 'institutional', updateFrequency: '15 minutes', description: 'Open-source weather API with WMO data' },
  'air-quality': { name: 'Open-Meteo AQ', reliability: 88, grade: 'A', type: 'institutional', updateFrequency: '1 hour', description: 'Air quality from CAMS (Copernicus) satellite data' },

  // Academic / Research
  acled: { name: 'ACLED', reliability: 92, grade: 'A', type: 'academic', updateFrequency: 'Weekly', description: 'Armed Conflict Location & Event Data — peer-reviewed conflict tracking' },
  'disease-outbreaks': { name: 'WHO DON', reliability: 94, grade: 'A', type: 'institutional', updateFrequency: 'As reported', description: 'World Health Organization Disease Outbreak News' },
  displacement: { name: 'UNHCR', reliability: 93, grade: 'A', type: 'institutional', updateFrequency: 'Annual', description: 'UN High Commissioner for Refugees — official displacement statistics' },
  'internet-outages': { name: 'IODA', reliability: 85, grade: 'B', type: 'academic', updateFrequency: '5 minutes', description: 'Internet Outage Detection & Analysis — Georgia Tech BGP monitoring' },

  // Commercial / Real-time tracking
  flights: { name: 'ADS-B / OpenSky', reliability: 88, grade: 'A', type: 'crowdsourced', updateFrequency: '10 seconds', description: 'ADS-B transponder data from global receiver network' },
  ships: { name: 'AISStream', reliability: 85, grade: 'B', type: 'commercial', updateFrequency: 'Real-time', description: 'AIS vessel transponder data — coverage depends on receiver network' },
  satellites: { name: 'CelesTrak', reliability: 96, grade: 'A', type: 'government', updateFrequency: '2 hours', description: 'NORAD orbital elements — official space catalog' },
  launches: { name: 'Launch Library 2', reliability: 90, grade: 'A', type: 'crowdsourced', updateFrequency: '5 minutes', description: 'Community-curated space launch database' },
  'market-data': { name: 'TwelveData / Finnhub', reliability: 92, grade: 'A', type: 'commercial', updateFrequency: '1 minute', description: 'Real-time market data from licensed exchange feeds' },

  // News / Sentiment
  news: { name: 'GDELT', reliability: 70, grade: 'C', type: 'ai-derived', updateFrequency: '15 minutes', description: 'AI-processed global news — broad coverage but variable accuracy' },
  sentiment: { name: 'GDELT Tone', reliability: 65, grade: 'C', type: 'ai-derived', updateFrequency: '15 minutes', description: 'Sentiment derived from GDELT article tone scores' },
  predictions: { name: 'Polymarket / Kalshi', reliability: 75, grade: 'B', type: 'crowdsourced', updateFrequency: '1 minute', description: 'Prediction market prices as probability estimates' },

  // Curated / Static
  'conflict-zones': { name: 'NexusWatch Curated', reliability: 80, grade: 'B', type: 'ai-derived', updateFrequency: 'Monthly', description: 'Curated conflict zone boundaries — reviewed Apr 2026' },
  'military-bases': { name: 'NexusWatch Curated', reliability: 82, grade: 'B', type: 'ai-derived', updateFrequency: 'Monthly', description: 'Known military installations — reviewed Apr 2026' },
  frontlines: { name: 'ISW / DeepState', reliability: 78, grade: 'B', type: 'institutional', updateFrequency: 'Monthly', description: 'Frontline traces from Institute for Study of War' },
  sanctions: { name: 'OFAC / EU', reliability: 95, grade: 'A', type: 'government', updateFrequency: 'Monthly', description: 'Official US/EU sanctions designations' },
  elections: { name: 'IFES / Wikipedia', reliability: 82, grade: 'B', type: 'crowdsourced', updateFrequency: 'Monthly', description: 'Curated from IFES ElectionGuide + Wikipedia' },
  cables: { name: 'TeleGeography', reliability: 88, grade: 'A', type: 'commercial', updateFrequency: 'Monthly', description: 'Submarine cable routes from TeleGeography data' },
  nuclear: { name: 'IAEA / NTI', reliability: 90, grade: 'A', type: 'institutional', updateFrequency: 'Monthly', description: 'Nuclear facility data from IAEA and NTI databases' },
  energy: { name: 'NexusWatch Curated', reliability: 78, grade: 'B', type: 'ai-derived', updateFrequency: 'Monthly', description: 'Oil/gas infrastructure from public sources' },
};

export function getSourceInfo(layerId: string): SourceInfo | null {
  return SOURCES[layerId] || null;
}

export function getReliabilityColor(score: number): string {
  if (score >= 90) return '#22c55e';
  if (score >= 75) return '#eab308';
  if (score >= 60) return '#f97316';
  return '#ef4444';
}

export function getReliabilityGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 75) return 'B';
  if (score >= 60) return 'C';
  return 'D';
}

export function getAllSources(): Record<string, SourceInfo> {
  return SOURCES;
}
