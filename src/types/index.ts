// ── NexusWatch Types ──

export type MapLayerCategory = 'natural' | 'conflict' | 'infrastructure' | 'intelligence' | 'weather';

export interface EarthquakeFeature {
  id: string;
  magnitude: number;
  depth: number;
  place: string;
  time: number;
  lat: number;
  lon: number;
  url: string;
  tsunami: boolean;
}

export interface GdeltArticle {
  title: string;
  url: string;
  source: string;
  sourceCountry: string;
  tone: number;
  lat: number;
  lon: number;
  date: string;
  domain: string;
  language: string;
  image: string;
}

export interface FireHotspot {
  lat: number;
  lon: number;
  brightness: number;
  confidence: number | string;
  satellite: string;
  acqDate: string;
  acqTime: string;
  frp: number;
}

export interface WeatherAlert {
  lat: number;
  lon: number;
  city: string;
  country: string;
  type: 'extreme_heat' | 'extreme_cold' | 'heavy_rain' | 'heavy_snow' | 'high_wind';
  severity: 'moderate' | 'severe' | 'extreme';
  value: number;
  unit: string;
  description: string;
}

export interface IntelItem {
  id: string;
  type: 'earthquake' | 'fire' | 'weather' | 'news' | 'prediction' | 'convergence';
  priority: 0 | 1 | 2;
  text: string;
  icon: string;
  lat: number;
  lon: number;
  layerId?: string;
  expiry?: number;
}

export interface CountryIntelScore {
  code: string;
  name: string;
  score: number;
  components: {
    events: number;
    disasters: number;
    sentiment: number;
    predictions: number;
  };
  recentEvents: string[];
  lastUpdated: number;
}

// ── Sidebar: Markets ──

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
}

export interface StocksData {
  indices: StockQuote[];
  watchlist: StockQuote[];
  timestamp: number;
}

export interface CryptoCoin {
  id: string;
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  marketCap: number;
  volume: number;
  sparkline: number[];
  rank: number;
  high24h: number;
  low24h: number;
  ath: number;
  athChange: number;
}

export interface CryptoData {
  coins: CryptoCoin[];
  fetchedAt: number;
}

// ── Auth ──

/**
 * Binary tier flag — free vs any paid.
 * Kept for backward compatibility with existing `user.tier === 'premium'` checks
 * throughout the codebase. New code should prefer `PaidTier` for granular access.
 */
export type UserTier = 'free' | 'premium';

/**
 * Granular paid tier — corresponds to actual Stripe products.
 * - 'analyst' — $29/mo, daily brief + 5 NL alerts + 7-day timeline + email alerts
 * - 'pro'     — $99/mo, unlimited alerts + 90-day timeline + API + personalized brief
 * - 'founding'— $19/mo lifetime (first 100 subscribers), grants Analyst feature set
 *               at a locked price that never increases. Stored as a distinct Stripe
 *               product so the price is grandfathered.
 *
 * Locked 2026-04-11 — see project_nexuswatch_decisions_apr11.md.
 */
export type PaidTier = 'analyst' | 'pro' | 'founding';

export interface User {
  id: string;
  email: string;
  name: string;
  avatar: string;
  provider: 'google' | 'github';
  tier: UserTier;
  /**
   * Granular paid tier, populated by Stripe webhook on successful checkout.
   * Optional because free users have no paid tier. When present, supersedes
   * `tier === 'premium'` for access decisions — tierGating reads this first.
   */
  paidTier?: PaidTier;
  isAdmin?: boolean;
  createdAt: string;
}

// ── Sidebar: Feeds ──

export interface CustomFeed {
  id: string;
  url: string;
  name: string;
  lat?: number;
  lon?: number;
  enabled: boolean;
}

export type NewsCategory = 'us' | 'world' | 'markets' | 'tech' | 'science' | 'entertainment' | 'x' | 'custom';

export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description: string;
  sourceCountry: string;
  lat: number;
  lon: number;
}

export interface NewsData {
  articles: NewsArticle[];
  category: NewsCategory;
  fetchedAt: number;
}

export type GlobeNewsCategory = 'world' | 'us' | 'tech' | 'science' | 'markets';

export interface GlobeNewsArticle extends NewsArticle {
  category: GlobeNewsCategory;
}
