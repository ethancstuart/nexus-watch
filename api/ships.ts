import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// SIMULATED vessel data — representative positions in major shipping lanes.
// These are not real-time AIS positions. For production: integrate AISStream.io
// WebSocket or MarineTraffic API for live vessel tracking.
const SHIPPING_LANES = [
  // Strait of Malacca
  { name: 'Container Ship', type: 'cargo', flag: 'SG', lat: 1.8, lon: 103.2, heading: 310, speed: 14 },
  { name: 'Oil Tanker', type: 'tanker', flag: 'PA', lat: 2.3, lon: 102.5, heading: 130, speed: 12 },
  { name: 'Bulk Carrier', type: 'cargo', flag: 'LR', lat: 1.5, lon: 104.0, heading: 290, speed: 11 },
  // Suez Canal approach
  { name: 'Container Ship', type: 'cargo', flag: 'HK', lat: 30.2, lon: 32.5, heading: 350, speed: 8 },
  { name: 'LNG Carrier', type: 'tanker', flag: 'QA', lat: 29.8, lon: 32.6, heading: 180, speed: 6 },
  // Strait of Hormuz
  { name: 'VLCC Tanker', type: 'tanker', flag: 'SA', lat: 26.4, lon: 56.5, heading: 230, speed: 10 },
  { name: 'Oil Tanker', type: 'tanker', flag: 'IR', lat: 26.7, lon: 56.1, heading: 50, speed: 11 },
  // English Channel
  { name: 'Ferry', type: 'passenger', flag: 'GB', lat: 51.0, lon: 1.3, heading: 230, speed: 18 },
  { name: 'Container Ship', type: 'cargo', flag: 'NL', lat: 51.2, lon: 1.8, heading: 70, speed: 15 },
  // South China Sea
  { name: 'Bulk Carrier', type: 'cargo', flag: 'CN', lat: 15.0, lon: 114.5, heading: 200, speed: 12 },
  { name: 'Container Ship', type: 'cargo', flag: 'JP', lat: 18.0, lon: 115.0, heading: 30, speed: 16 },
  // Panama Canal approach
  { name: 'Container Ship', type: 'cargo', flag: 'PA', lat: 9.3, lon: -79.9, heading: 350, speed: 5 },
  // Bab el-Mandeb
  { name: 'Oil Tanker', type: 'tanker', flag: 'GR', lat: 12.7, lon: 43.5, heading: 340, speed: 13 },
  { name: 'Cargo Ship', type: 'cargo', flag: 'CN', lat: 12.3, lon: 43.3, heading: 160, speed: 14 },
  // Mediterranean
  { name: 'Cruise Ship', type: 'passenger', flag: 'IT', lat: 38.0, lon: 15.5, heading: 270, speed: 20 },
  { name: 'Container Ship', type: 'cargo', flag: 'DE', lat: 36.5, lon: 5.0, heading: 90, speed: 16 },
  // US East Coast
  { name: 'Container Ship', type: 'cargo', flag: 'US', lat: 37.0, lon: -75.5, heading: 200, speed: 15 },
  { name: 'Tanker', type: 'tanker', flag: 'US', lat: 29.5, lon: -89.5, heading: 90, speed: 10 },
  // Cape of Good Hope
  { name: 'Bulk Carrier', type: 'cargo', flag: 'CN', lat: -34.5, lon: 18.8, heading: 90, speed: 14 },
  // Taiwan Strait
  { name: 'Container Ship', type: 'cargo', flag: 'TW', lat: 24.5, lon: 119.5, heading: 20, speed: 16 },
  // US West Coast
  { name: 'Container Ship', type: 'cargo', flag: 'KR', lat: 34.0, lon: -118.5, heading: 330, speed: 12 },
  // Red Sea (Houthi threat zone)
  { name: 'USN Destroyer', type: 'military', flag: 'US', lat: 14.5, lon: 42.0, heading: 180, speed: 22 },
  { name: 'Cargo Ship (rerouted)', type: 'cargo', flag: 'DK', lat: -33.0, lon: 28.0, heading: 240, speed: 15 },
  // Indian Ocean
  { name: 'PLAN Frigate', type: 'military', flag: 'CN', lat: 5.0, lon: 72.0, heading: 270, speed: 18 },
  // Black Sea
  { name: 'RFN Patrol', type: 'military', flag: 'RU', lat: 44.0, lon: 34.0, heading: 180, speed: 15 },
  // Western Pacific
  { name: 'USN Carrier Strike Group', type: 'military', flag: 'US', lat: 20.0, lon: 135.0, heading: 270, speed: 25 },
];

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);

  // Add slight random variation to simulate movement
  const now = Date.now();
  const vessels = SHIPPING_LANES.map((v, i) => {
    const drift = Math.sin(now / 60000 + i) * 0.1;
    return {
      ...v,
      lat: v.lat + drift,
      lon: v.lon + drift * 0.5,
      mmsi: `${200000000 + i}`,
    };
  });

  return res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30').json({
    vessels,
    count: vessels.length,
  });
}
