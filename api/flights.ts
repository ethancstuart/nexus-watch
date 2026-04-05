import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://dashpulse.app';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Bounding box parameters (optional)
  const lamin = req.query.lamin as string | undefined;
  const lomin = req.query.lomin as string | undefined;
  const lamax = req.query.lamax as string | undefined;
  const lomax = req.query.lomax as string | undefined;

  try {
    let url = 'https://opensky-network.org/api/states/all';
    const params: string[] = [];

    if (lamin && lomin && lamax && lomax) {
      params.push(`lamin=${lamin}`, `lomin=${lomin}`, `lamax=${lamax}`, `lomax=${lomax}`);
    }

    if (params.length > 0) {
      url += `?${params.join('&')}`;
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      // OpenSky returns 429 frequently on free tier
      if (response.status === 429) {
        return res.status(429).json({ error: 'Rate limited — try again in 10s', aircraft: [] });
      }
      return res.status(response.status).json({ error: 'OpenSky API error' });
    }

    const data = (await response.json()) as {
      time: number;
      states: (string | number | boolean | null)[][] | null;
    };

    if (!data.states) {
      return res.setHeader('Cache-Control', 'public, max-age=10').json({ aircraft: [], count: 0 });
    }

    // OpenSky state vector format:
    // [0] icao24, [1] callsign, [2] origin_country, [3] time_position,
    // [4] last_contact, [5] longitude, [6] latitude, [7] baro_altitude,
    // [8] on_ground, [9] velocity, [10] true_track, [11] vertical_rate,
    // [12] sensors, [13] geo_altitude, [14] squawk, [15] spi, [16] position_source

    // Military callsign prefixes
    const MIL_PREFIXES = [
      'RCH',
      'REACH',
      'NAVY',
      'DUKE',
      'EVAC',
      'HOMER',
      'IRON',
      'JAKE',
      'KING',
      'MOOSE',
      'NCHO',
      'OTIS',
      'PACK',
      'RAGE',
      'SPAR',
      'TORQ',
      'VIPER',
      'WOLF',
      'RRR',
      'CNV',
      'CFC',
      'IAM',
      'MMF',
      'RFR',
      'SHF',
      'GAF',
      'BAF',
      'NAF',
      'PAF',
      'FAB',
      'HAF',
      'PLF',
      'HIF',
      'TAF',
    ];

    // Sample for performance — max 1500 aircraft
    const states =
      data.states.length > 1500
        ? data.states.filter((_, i) => i % Math.ceil(data.states!.length / 1500) === 0)
        : data.states;

    const aircraft = states
      .filter((s) => s[5] !== null && s[6] !== null && !s[8])
      .map((s) => {
        const callsign = ((s[1] as string) || '').trim();
        const isMilitary = MIL_PREFIXES.some((p) => callsign.startsWith(p));
        return {
          icao: s[0] as string,
          callsign,
          country: s[2] as string,
          lon: s[5] as number,
          lat: s[6] as number,
          altitude: (s[7] as number) || 0,
          velocity: (s[9] as number) || 0,
          heading: (s[10] as number) || 0,
          verticalRate: (s[11] as number) || 0,
          military: isMilitary,
        };
      });

    return res.setHeader('Cache-Control', 'public, max-age=10, s-maxage=10').json({
      aircraft,
      count: aircraft.length,
      timestamp: data.time,
    });
  } catch (err) {
    console.error('Flight API error:', err instanceof Error ? err.message : err);
    // Fallback: return simulated aircraft when OpenSky is unavailable
    return res.setHeader('Cache-Control', 'public, max-age=30').json({
      aircraft: FALLBACK_AIRCRAFT,
      count: FALLBACK_AIRCRAFT.length,
      timestamp: Math.floor(Date.now() / 1000),
      simulated: true,
    });
  }
}

// Simulated aircraft positions for when OpenSky is unavailable
const now = Date.now();
const FALLBACK_AIRCRAFT = [
  // Trans-Atlantic
  {
    icao: 'SIM001',
    callsign: 'BAW115',
    country: 'United Kingdom',
    lon: -30 + Math.sin(now / 60000) * 2,
    lat: 52,
    altitude: 11000,
    velocity: 250,
    heading: 270,
    verticalRate: 0,
    military: false,
  },
  {
    icao: 'SIM002',
    callsign: 'DAL100',
    country: 'United States',
    lon: -50 + Math.sin(now / 55000) * 2,
    lat: 48,
    altitude: 10500,
    velocity: 240,
    heading: 90,
    verticalRate: 0,
    military: false,
  },
  {
    icao: 'SIM003',
    callsign: 'AFR007',
    country: 'France',
    lon: -15 + Math.sin(now / 50000) * 2,
    lat: 50,
    altitude: 11200,
    velocity: 245,
    heading: 260,
    verticalRate: 0,
    military: false,
  },
  // Trans-Pacific
  {
    icao: 'SIM004',
    callsign: 'UAL881',
    country: 'United States',
    lon: -160 + Math.sin(now / 60000) * 3,
    lat: 38,
    altitude: 11500,
    velocity: 255,
    heading: 270,
    verticalRate: 0,
    military: false,
  },
  {
    icao: 'SIM005',
    callsign: 'JAL006',
    country: 'Japan',
    lon: 170 + Math.sin(now / 58000) * 2,
    lat: 40,
    altitude: 11000,
    velocity: 250,
    heading: 90,
    verticalRate: 0,
    military: false,
  },
  {
    icao: 'SIM006',
    callsign: 'CPA888',
    country: 'China',
    lon: -140 + Math.sin(now / 52000) * 3,
    lat: 35,
    altitude: 10800,
    velocity: 248,
    heading: 80,
    verticalRate: 0,
    military: false,
  },
  // Europe
  {
    icao: 'SIM007',
    callsign: 'DLH400',
    country: 'Germany',
    lon: 10 + Math.sin(now / 45000),
    lat: 50,
    altitude: 9500,
    velocity: 220,
    heading: 180,
    verticalRate: -5,
    military: false,
  },
  {
    icao: 'SIM008',
    callsign: 'EZY123',
    country: 'United Kingdom',
    lon: 2 + Math.sin(now / 40000),
    lat: 48,
    altitude: 8000,
    velocity: 200,
    heading: 150,
    verticalRate: 0,
    military: false,
  },
  // Middle East
  {
    icao: 'SIM009',
    callsign: 'UAE201',
    country: 'United Arab Emirates',
    lon: 55 + Math.sin(now / 50000),
    lat: 30,
    altitude: 11000,
    velocity: 250,
    heading: 315,
    verticalRate: 0,
    military: false,
  },
  {
    icao: 'SIM010',
    callsign: 'QTR77',
    country: 'Qatar',
    lon: 45 + Math.sin(now / 48000),
    lat: 35,
    altitude: 10500,
    velocity: 245,
    heading: 330,
    verticalRate: 0,
    military: false,
  },
  // Asia
  {
    icao: 'SIM011',
    callsign: 'SIA321',
    country: 'Singapore',
    lon: 110 + Math.sin(now / 55000),
    lat: 10,
    altitude: 10000,
    velocity: 240,
    heading: 0,
    verticalRate: 0,
    military: false,
  },
  {
    icao: 'SIM012',
    callsign: 'ANA008',
    country: 'Japan',
    lon: 135 + Math.sin(now / 42000),
    lat: 33,
    altitude: 9000,
    velocity: 230,
    heading: 90,
    verticalRate: 0,
    military: false,
  },
  // Military
  {
    icao: 'SIM013',
    callsign: 'RCH401',
    country: 'United States',
    lon: -40 + Math.sin(now / 60000) * 2,
    lat: 45,
    altitude: 10000,
    velocity: 240,
    heading: 90,
    verticalRate: 0,
    military: true,
  },
  {
    icao: 'SIM014',
    callsign: 'NAVY01',
    country: 'United States',
    lon: 135 + Math.sin(now / 55000),
    lat: 25,
    altitude: 5000,
    velocity: 180,
    heading: 270,
    verticalRate: 0,
    military: true,
  },
  {
    icao: 'SIM015',
    callsign: 'GAF601',
    country: 'Germany',
    lon: 15 + Math.sin(now / 50000),
    lat: 52,
    altitude: 8000,
    velocity: 200,
    heading: 90,
    verticalRate: 0,
    military: true,
  },
  // South America
  {
    icao: 'SIM016',
    callsign: 'AVA019',
    country: 'Colombia',
    lon: -70 + Math.sin(now / 48000),
    lat: 5,
    altitude: 9500,
    velocity: 230,
    heading: 180,
    verticalRate: 0,
    military: false,
  },
  {
    icao: 'SIM017',
    callsign: 'TAM802',
    country: 'Brazil',
    lon: -45 + Math.sin(now / 52000),
    lat: -15,
    altitude: 10000,
    velocity: 240,
    heading: 0,
    verticalRate: 0,
    military: false,
  },
  // Africa
  {
    icao: 'SIM018',
    callsign: 'ETH500',
    country: 'Ethiopia',
    lon: 38 + Math.sin(now / 46000),
    lat: 8,
    altitude: 11000,
    velocity: 250,
    heading: 180,
    verticalRate: 0,
    military: false,
  },
  // Australia
  {
    icao: 'SIM019',
    callsign: 'QFA001',
    country: 'Australia',
    lon: 140 + Math.sin(now / 54000),
    lat: -25,
    altitude: 11000,
    velocity: 250,
    heading: 0,
    verticalRate: 0,
    military: false,
  },
  {
    icao: 'SIM020',
    callsign: 'QFA007',
    country: 'Australia',
    lon: 100 + Math.sin(now / 50000) * 3,
    lat: -10,
    altitude: 11500,
    velocity: 255,
    heading: 315,
    verticalRate: 0,
    military: false,
  },
];
