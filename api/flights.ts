import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://nexuswatch.dev';
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

    // Authenticated requests get 10x higher rate limits (4000 vs 400 credits/day)
    const headers: Record<string, string> = { Accept: 'application/json' };
    const osUser = process.env.OPENSKY_CLIENT_ID;
    const osPass = process.env.OPENSKY_CLIENT_SECRET;
    if (osUser && osPass) {
      headers['Authorization'] = `Basic ${Buffer.from(`${osUser}:${osPass}`).toString('base64')}`;
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers,
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
    console.error('OpenSky error:', err instanceof Error ? err.message : err);
    // Fallback: adsb.lol (free, no auth, no IP blocking)
    try {
      return await fetchAdsbLol(res);
    } catch {
      return res.setHeader('Cache-Control', 'public, max-age=30').json({
        aircraft: [],
        count: 0,
        timestamp: Math.floor(Date.now() / 1000),
        error: 'Flight data unavailable',
      });
    }
  }
}

// Fallback flight data from adsb.lol (free, unfiltered ADS-B data)
async function fetchAdsbLol(res: VercelResponse) {
  // Fetch aircraft from multiple regions for global coverage
  const regions = [
    { lat: 40, lon: -74, dist: 250 }, // US East
    { lat: 34, lon: -118, dist: 250 }, // US West
    { lat: 51, lon: 0, dist: 250 }, // Western Europe
    { lat: 55, lon: 37, dist: 250 }, // Eastern Europe / Russia
    { lat: 35, lon: 140, dist: 250 }, // East Asia / Japan
    { lat: 22, lon: 114, dist: 250 }, // South China / Hong Kong
    { lat: 25, lon: 55, dist: 250 }, // Middle East / Gulf
    { lat: 1, lon: 32, dist: 250 }, // East Africa / Kenya
    { lat: 6, lon: 3, dist: 250 }, // West Africa / Lagos
    { lat: -23, lon: -46, dist: 250 }, // South America / Brazil
    { lat: 13, lon: 100, dist: 250 }, // Southeast Asia / Thailand
    { lat: 19, lon: 73, dist: 250 }, // South Asia / India
    { lat: -33, lon: 151, dist: 250 }, // Australia / Sydney
    { lat: 15, lon: -60, dist: 250 }, // Caribbean
    { lat: -34, lon: -58, dist: 250 }, // South America / Argentina
    { lat: 50, lon: 10, dist: 250 }, // Central Europe / Germany
    { lat: 30, lon: 70, dist: 250 }, // Central Asia / Pakistan
    { lat: -15, lon: 28, dist: 250 }, // Southern Africa / Zambia
    { lat: 60, lon: 25, dist: 250 }, // Scandinavia / Finland
  ];

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
  ];

  const results = await Promise.allSettled(
    regions.map(async (r) => {
      const res = await fetch(`https://api.adsb.lol/v2/lat/${r.lat}/lon/${r.lon}/dist/${r.dist}`, {
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) return [];
      const data = (await res.json()) as { ac?: Array<Record<string, unknown>> };
      return data.ac || [];
    }),
  );

  const seen = new Set<string>();
  const aircraft: Array<Record<string, unknown>> = [];

  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    for (const ac of r.value) {
      const hex = String(ac.hex || '');
      if (seen.has(hex) || !ac.lat || !ac.lon) continue;
      seen.add(hex);
      const callsign = String(ac.flight || '').trim();
      const isMilitary = MIL_PREFIXES.some((p) => callsign.startsWith(p));
      aircraft.push({
        icao: hex,
        callsign,
        country: String(ac.r || ''),
        lon: ac.lon,
        lat: ac.lat,
        altitude: Number(ac.alt_baro) || 0,
        velocity: Number(ac.gs) || 0,
        heading: Number(ac.track) || 0,
        verticalRate: Number(ac.baro_rate) || 0,
        military: isMilitary,
      });
    }
  }

  // Sample if too many
  const sampled =
    aircraft.length > 1500 ? aircraft.filter((_, i) => i % Math.ceil(aircraft.length / 1500) === 0) : aircraft;

  return res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=15').json({
    aircraft: sampled,
    count: sampled.length,
    timestamp: Math.floor(Date.now() / 1000),
    source: 'adsb.lol',
  });
}
