/**
 * Lazy Layer Registry — Dynamic Import Map.
 *
 * Instead of importing all 45 layer classes statically (which bundles
 * them into one ~500KB chunk), this registry maps layer IDs to dynamic
 * import functions. Layers are loaded on-demand when enabled.
 *
 * Performance impact: ~100KB gzip saved from initial bundle. Layers
 * that the user never enables are never downloaded.
 *
 * 2026-04-18: Converted from 45 static imports to lazy loading.
 */

import type { MapDataLayer } from './layers/LayerDefinition.ts';

type LayerFactory = () => Promise<MapDataLayer>;

// Core layers — loaded eagerly (always enabled by default)
// These stay in the main bundle since they're needed immediately
export { EarthquakeLayer } from './layers/earthquakeLayer.ts';
export { AcledLayer } from './layers/acledLayer.ts';
export { NewsLayer } from './layers/newsLayer.ts';
export { FireLayer } from './layers/fireLayer.ts';
export { FlightLayer } from './layers/flightLayer.ts';
export { ShipLayer } from './layers/shipLayer.ts';
export { CyberLayer } from './layers/cyberLayer.ts';
export { WeatherAlertLayer } from './layers/weatherLayer.ts';
export { MilitaryBasesLayer } from './layers/militaryBasesLayer.ts';
export { CablesLayer } from './layers/cablesLayer.ts';
export { ConflictZonesLayer } from './layers/conflictZonesLayer.ts';
export { FrontlinesLayer } from './layers/frontlinesLayer.ts';

// Non-core layers — loaded lazily when user enables them
export const LAZY_LAYERS: Record<string, LayerFactory> = {
  prediction: () => import('./layers/predictionLayer.ts').then((m) => new m.PredictionLayer()),
  'polymarket-divergence': () =>
    import('./layers/polymarketDivergenceLayer.ts').then((m) => new m.PolymarketDivergenceLayer()),
  nuclear: () => import('./layers/nuclearLayer.ts').then((m) => new m.NuclearLayer()),
  ports: () => import('./layers/portsLayer.ts').then((m) => new m.PortsLayer()),
  pipelines: () => import('./layers/pipelinesLayer.ts').then((m) => new m.PipelinesLayer()),
  'gps-jamming': () => import('./layers/gpsJammingLayer.ts').then((m) => new m.GpsJammingLayer()),
  satellites: () => import('./layers/satelliteLayer.ts').then((m) => new m.SatelliteLayer()),
  gdacs: () => import('./layers/gdacsLayer.ts').then((m) => new m.GdacsLayer()),
  'chokepoint-status': () => import('./layers/chokepointStatusLayer.ts').then((m) => new m.ChokepointStatusLayer()),
  'air-quality': () => import('./layers/airQualityLayer.ts').then((m) => new m.AirQualityLayer()),
  disease: () => import('./layers/diseaseLayer.ts').then((m) => new m.DiseaseLayer()),
  displacement: () => import('./layers/displacementLayer.ts').then((m) => new m.DisplacementLayer()),
  'internet-outages': () => import('./layers/internetOutagesLayer.ts').then((m) => new m.InternetOutagesLayer()),
  sanctions: () => import('./layers/sanctionsLayer.ts').then((m) => new m.SanctionsLayer()),
  elections: () => import('./layers/electionLayer.ts').then((m) => new m.ElectionLayer()),
  'trade-routes': () => import('./layers/tradeRoutesLayer.ts').then((m) => new m.TradeRoutesLayer()),
  launches: () => import('./layers/launchLayer.ts').then((m) => new m.LaunchLayer()),
  energy: () => import('./layers/energyLayer.ts').then((m) => new m.EnergyLayer()),
  sentiment: () => import('./layers/sentimentLayer.ts').then((m) => new m.SentimentLayer()),
  refugees: () => import('./layers/refugeeLayer.ts').then((m) => new m.RefugeeLayer()),
  'nuclear-threat': () => import('./layers/nuclearThreatLayer.ts').then((m) => new m.NuclearThreatLayer()),
  'cyber-threat': () => import('./layers/cyberThreatLayer.ts').then((m) => new m.CyberThreatLayer()),
  protest: () => import('./layers/protestLayer.ts').then((m) => new m.ProtestLayer()),
  'chokepoint-threat': () => import('./layers/chokepointThreatLayer.ts').then((m) => new m.ChokepointThreatLayer()),
  terrorism: () => import('./layers/terrorismLayer.ts').then((m) => new m.TerrorismLayer()),
  'food-security': () => import('./layers/foodSecurityLayer.ts').then((m) => new m.FoodSecurityLayer()),
  'migration-corridors': () =>
    import('./layers/migrationCorridorsLayer.ts').then((m) => new m.MigrationCorridorsLayer()),
  'space-launches-detail': () =>
    import('./layers/spaceLaunchDetailLayer.ts').then((m) => new m.SpaceLaunchDetailLayer()),
  'defense-contracts': () => import('./layers/defenseContractsLayer.ts').then((m) => new m.DefenseContractsLayer()),
  'commodity-flows': () => import('./layers/commodityFlowsLayer.ts').then((m) => new m.CommodityFlowsLayer()),
  'cyber-attack-campaigns': () =>
    import('./layers/cyberAttackCampaignsLayer.ts').then((m) => new m.CyberAttackCampaignsLayer()),
  'dark-web-osint': () => import('./layers/darkWebOsintLayer.ts').then((m) => new m.DarkWebOsintLayer()),
  'submarine-military': () => import('./layers/submarineMilitaryLayer.ts').then((m) => new m.SubmarineMilitaryLayer()),
};
