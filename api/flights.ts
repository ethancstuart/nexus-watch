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
    return res.setHeader('Cache-Control', 'public, max-age=30').json({
      aircraft: [],
      count: 0,
      timestamp: Math.floor(Date.now() / 1000),
      error: 'OpenSky API unavailable',
    });
  }
}
