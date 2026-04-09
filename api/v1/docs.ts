import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs' };

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  return res.json({
    name: 'NexusWatch Intelligence API',
    version: '1.0.0',
    description: 'Real-time geopolitical intelligence, risk scoring, and event data.',
    baseUrl: 'https://dashpulse.app/api/v1',
    authentication: {
      type: 'Bearer token',
      header: 'Authorization: Bearer <api_key>',
      note: 'Unauthenticated requests are rate-limited to 10/min. Contact for API key.',
    },
    endpoints: {
      'GET /api/v1/cii': {
        description: 'Country Instability Index — 50 countries scored 0-100',
        params: { country: 'Optional 2-letter country code for single country + history' },
        rateLimit: '10/min (free), 100/min (pro)',
      },
      'GET /api/v1/tension': {
        description: 'Global tension index — composite risk score',
        rateLimit: '10/min (free), 100/min (pro)',
      },
      'GET /api/v1/events': {
        description: 'Unified event stream across all data layers',
        params: {
          layer:
            'Optional layer filter: earthquakes, acled, fires, ships, flights, launches, satellites, disease-outbreaks, internet-outages, displacement, weather-alerts, air-quality, predictions',
        },
        rateLimit: '10/min (free), 100/min (pro)',
      },
      'GET /api/v1/correlations': {
        description: 'Cross-domain correlation alerts — auto-detected event connections',
        rateLimit: '10/min (free), 100/min (pro)',
      },
      'GET /api/v1/brief': {
        description: 'AI-generated daily intelligence briefing',
        params: { date: 'Optional YYYY-MM-DD for historical brief' },
        rateLimit: '10/min (free), 100/min (pro)',
      },
      'GET /api/v1/timeline': {
        description: '90-day historical event timeline',
        params: {
          from: 'ISO timestamp (default: 24h ago)',
          to: 'ISO timestamp (default: now)',
          layer: 'Optional layer filter',
        },
        rateLimit: '10/min (free), 100/min (pro)',
      },
      'GET /api/v1/market': {
        description: 'Real-time market data — stocks, commodities, FX, crypto',
        rateLimit: '10/min (free), 100/min (pro)',
      },
    },
    tiers: {
      free: { rateLimit: '10 requests/minute', features: 'All endpoints, 50 events per layer' },
      pro: { rateLimit: '100 requests/minute', features: 'Full data, priority support', price: '$99/month' },
      analyst: { rateLimit: '500 requests/minute', features: 'Bulk export, webhooks', price: '$249/month' },
    },
  });
}
