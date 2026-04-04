import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

// Known internet disruption hotspots (curated from Cloudflare Radar reports + OONI)
// In production: Cloudflare Radar API with token
const OUTAGES = [
  {
    country: 'Iran',
    code: 'IR',
    lat: 32.4,
    lon: 53.7,
    severity: 'frequent',
    type: 'government-ordered',
    description: 'Recurring nationwide shutdowns during protests',
  },
  {
    country: 'Myanmar',
    code: 'MM',
    lat: 19.8,
    lon: 96.1,
    severity: 'frequent',
    type: 'military-ordered',
    description: 'Junta-imposed internet blackouts in conflict zones',
  },
  {
    country: 'Ethiopia',
    code: 'ET',
    lat: 9.1,
    lon: 40.5,
    severity: 'recurring',
    type: 'government-ordered',
    description: 'Regional shutdowns during Amhara unrest',
  },
  {
    country: 'Russia',
    code: 'RU',
    lat: 55.8,
    lon: 37.6,
    severity: 'moderate',
    type: 'censorship',
    description: 'VPN blocking, social media restrictions, RuNet isolation tests',
  },
  {
    country: 'Pakistan',
    code: 'PK',
    lat: 30.4,
    lon: 69.3,
    severity: 'recurring',
    type: 'government-ordered',
    description: 'Shutdowns during political protests and elections',
  },
  {
    country: 'India',
    code: 'IN',
    lat: 28.6,
    lon: 77.2,
    severity: 'recurring',
    type: 'regional',
    description: 'Kashmir, Manipur — longest shutdowns globally',
  },
  {
    country: 'China',
    code: 'CN',
    lat: 35.9,
    lon: 104.2,
    severity: 'permanent',
    type: 'censorship',
    description: 'Great Firewall — systematic blocking of foreign services',
  },
  {
    country: 'Cuba',
    code: 'CU',
    lat: 21.5,
    lon: -80.0,
    severity: 'recurring',
    type: 'government-ordered',
    description: 'Shutdowns during anti-government protests',
  },
  {
    country: 'Sudan',
    code: 'SD',
    lat: 15.5,
    lon: 32.5,
    severity: 'frequent',
    type: 'conflict',
    description: 'Internet disruptions during civil war',
  },
  {
    country: 'Iraq',
    code: 'IQ',
    lat: 33.2,
    lon: 43.7,
    severity: 'recurring',
    type: 'government-ordered',
    description: 'Nationwide shutdowns during exam periods and protests',
  },
  {
    country: 'Turkmenistan',
    code: 'TM',
    lat: 38.0,
    lon: 58.4,
    severity: 'permanent',
    type: 'censorship',
    description: 'Near-total internet isolation, single state ISP',
  },
  {
    country: 'North Korea',
    code: 'KP',
    lat: 39.0,
    lon: 125.8,
    severity: 'permanent',
    type: 'censorship',
    description: 'No public internet — intranet (Kwangmyong) only',
  },
  {
    country: 'Eritrea',
    code: 'ER',
    lat: 15.3,
    lon: 39.0,
    severity: 'permanent',
    type: 'censorship',
    description: 'Lowest internet penetration in the world',
  },
  {
    country: 'Venezuela',
    code: 'VE',
    lat: 8.0,
    lon: -66.0,
    severity: 'recurring',
    type: 'government-ordered',
    description: 'Social media throttling during political crises',
  },
  {
    country: 'Tanzania',
    code: 'TZ',
    lat: -6.8,
    lon: 35.7,
    severity: 'moderate',
    type: 'government-ordered',
    description: 'Social media taxes and election-period restrictions',
  },
];

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  setCors(res);
  return res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600').json({
    outages: OUTAGES,
    count: OUTAGES.length,
  });
}
