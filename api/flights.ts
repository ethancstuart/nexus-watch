import type { VercelRequest, VercelResponse } from '@vercel/node';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs' };

/**
 * Live aircraft, from adsb.lol ONLY.
 *
 * THE OPENSKY PATH IS DELIBERATELY GONE, not disabled. OpenSky's terms §3(vi)
 * require a written licence for "integration into a live product, service, or
 * automated system, REGARDLESS OF THE ENTITY'S NON-PROFIT STATUS" — verified
 * and recorded in docs/OPERATIONAL-KNOWLEDGE.md. NexusWatch has no such
 * licence, so this endpoint is exactly the integration the clause bars.
 *
 * The version this replaces read OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET and
 * preferred OpenSky whenever they were set, falling back to adsb.lol only when
 * they were absent. That makes compliance depend on an environment variable
 * staying unset — one `vercel env add` away from a breach, by someone who had
 * no reason to know. Deleting the branch is what makes it not happen.
 *
 * adsb.lol is community ADS-B under ODbL. It needs no credentials, which is
 * also why there is nothing here to misconfigure.
 *
 * The lamin/lomin/lamax/lomax bounding-box parameters are gone with it: they
 * only ever shaped the OpenSky query. fetchAdsbLol samples a fixed global grid
 * and has always ignored them, so accepting them would advertise filtering
 * this endpoint does not do.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    return await fetchAdsbLol(res);
  } catch (err) {
    console.error('[flights] adsb.lol failed:', err instanceof Error ? err.message : err);
    return res.setHeader('Cache-Control', 'public, max-age=30').json({
      aircraft: [],
      count: 0,
      timestamp: Math.floor(Date.now() / 1000),
      error: 'Flight data unavailable',
    });
  }
}

// Fallback flight data from adsb.lol (free, unfiltered ADS-B data)
async function fetchAdsbLol(res: VercelResponse) {
  // Global coverage via 60+ strategic sampling points covering every
  // populated region of the world. adsb.lol accepts max 250nm radius,
  // so we need dense coverage to capture worldwide air traffic.
  const regions = [
    // North America — dense grid
    { lat: 40.7, lon: -74.0, dist: 250 }, // NYC
    { lat: 38.9, lon: -77.0, dist: 250 }, // DC
    { lat: 33.7, lon: -84.4, dist: 250 }, // Atlanta
    { lat: 25.8, lon: -80.2, dist: 250 }, // Miami
    { lat: 32.8, lon: -96.8, dist: 250 }, // Dallas
    { lat: 29.8, lon: -95.4, dist: 250 }, // Houston
    { lat: 41.9, lon: -87.6, dist: 250 }, // Chicago
    { lat: 39.7, lon: -105.0, dist: 250 }, // Denver
    { lat: 47.6, lon: -122.3, dist: 250 }, // Seattle
    { lat: 37.8, lon: -122.4, dist: 250 }, // SF
    { lat: 34.0, lon: -118.2, dist: 250 }, // LA
    { lat: 36.2, lon: -115.1, dist: 250 }, // Las Vegas
    { lat: 45.5, lon: -73.6, dist: 250 }, // Montreal
    { lat: 43.7, lon: -79.4, dist: 250 }, // Toronto
    { lat: 49.3, lon: -123.1, dist: 250 }, // Vancouver
    { lat: 19.4, lon: -99.1, dist: 250 }, // Mexico City
    // Europe — dense grid
    { lat: 51.5, lon: -0.1, dist: 250 }, // London
    { lat: 48.9, lon: 2.3, dist: 250 }, // Paris
    { lat: 50.1, lon: 8.7, dist: 250 }, // Frankfurt
    { lat: 52.5, lon: 13.4, dist: 250 }, // Berlin
    { lat: 52.4, lon: 4.9, dist: 250 }, // Amsterdam
    { lat: 41.9, lon: 12.5, dist: 250 }, // Rome
    { lat: 40.4, lon: -3.7, dist: 250 }, // Madrid
    { lat: 55.7, lon: 12.6, dist: 250 }, // Copenhagen
    { lat: 59.3, lon: 18.1, dist: 250 }, // Stockholm
    { lat: 60.2, lon: 24.9, dist: 250 }, // Helsinki
    { lat: 55.8, lon: 37.6, dist: 250 }, // Moscow
    { lat: 50.5, lon: 30.5, dist: 250 }, // Kyiv
    { lat: 47.5, lon: 19.0, dist: 250 }, // Budapest
    { lat: 41.0, lon: 28.9, dist: 250 }, // Istanbul
    { lat: 37.9, lon: 23.7, dist: 250 }, // Athens
    { lat: 53.3, lon: -6.2, dist: 250 }, // Dublin
    // Middle East & North Africa
    { lat: 25.2, lon: 55.3, dist: 250 }, // Dubai
    { lat: 24.7, lon: 46.7, dist: 250 }, // Riyadh
    { lat: 31.8, lon: 35.2, dist: 250 }, // Jerusalem
    { lat: 33.5, lon: 44.4, dist: 250 }, // Baghdad
    { lat: 35.7, lon: 51.4, dist: 250 }, // Tehran
    { lat: 30.0, lon: 31.2, dist: 250 }, // Cairo
    { lat: 33.9, lon: -6.8, dist: 250 }, // Casablanca
    { lat: 36.8, lon: 10.2, dist: 250 }, // Tunis
    // Sub-Saharan Africa
    { lat: 6.5, lon: 3.4, dist: 250 }, // Lagos
    { lat: -1.3, lon: 36.8, dist: 250 }, // Nairobi
    { lat: -26.2, lon: 28.0, dist: 250 }, // Johannesburg
    { lat: -33.9, lon: 18.4, dist: 250 }, // Cape Town
    { lat: 9.0, lon: 38.7, dist: 250 }, // Addis Ababa
    { lat: -4.0, lon: 39.7, dist: 250 }, // Mombasa
    { lat: 14.7, lon: -17.4, dist: 250 }, // Dakar
    // Asia — dense grid
    { lat: 28.6, lon: 77.2, dist: 250 }, // Delhi
    { lat: 19.1, lon: 72.9, dist: 250 }, // Mumbai
    { lat: 13.1, lon: 80.3, dist: 250 }, // Chennai
    { lat: 12.9, lon: 77.6, dist: 250 }, // Bangalore
    { lat: 23.8, lon: 90.4, dist: 250 }, // Dhaka
    { lat: 13.7, lon: 100.5, dist: 250 }, // Bangkok
    { lat: 1.4, lon: 103.8, dist: 250 }, // Singapore
    { lat: 3.1, lon: 101.7, dist: 250 }, // Kuala Lumpur
    { lat: -6.2, lon: 106.8, dist: 250 }, // Jakarta
    { lat: 14.6, lon: 121.0, dist: 250 }, // Manila
    { lat: 22.3, lon: 114.2, dist: 250 }, // Hong Kong
    { lat: 31.2, lon: 121.5, dist: 250 }, // Shanghai
    { lat: 39.9, lon: 116.4, dist: 250 }, // Beijing
    { lat: 22.5, lon: 113.9, dist: 250 }, // Shenzhen
    { lat: 37.6, lon: 127.0, dist: 250 }, // Seoul
    { lat: 35.7, lon: 139.8, dist: 250 }, // Tokyo
    { lat: 34.7, lon: 135.5, dist: 250 }, // Osaka
    { lat: 25.0, lon: 121.5, dist: 250 }, // Taipei
    { lat: 43.2, lon: 76.9, dist: 250 }, // Almaty
    // Oceania
    { lat: -33.9, lon: 151.2, dist: 250 }, // Sydney
    { lat: -37.8, lon: 145.0, dist: 250 }, // Melbourne
    { lat: -31.9, lon: 115.9, dist: 250 }, // Perth
    { lat: -36.8, lon: 174.8, dist: 250 }, // Auckland
    // South America
    { lat: -23.5, lon: -46.6, dist: 250 }, // São Paulo
    { lat: -22.9, lon: -43.2, dist: 250 }, // Rio
    { lat: -34.6, lon: -58.4, dist: 250 }, // Buenos Aires
    { lat: -33.4, lon: -70.6, dist: 250 }, // Santiago
    { lat: -12.0, lon: -77.0, dist: 250 }, // Lima
    { lat: 4.7, lon: -74.0, dist: 250 }, // Bogotá
    { lat: 10.5, lon: -66.9, dist: 250 }, // Caracas
    // Caribbean / Central America
    { lat: 18.5, lon: -66.1, dist: 250 }, // San Juan
    { lat: 23.1, lon: -82.4, dist: 250 }, // Havana
    { lat: 14.6, lon: -90.5, dist: 250 }, // Guatemala City
    { lat: 9.0, lon: -79.5, dist: 250 }, // Panama City
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

  // EIGHTY-ONE REGIONS IN PARALLEL IS A RATE LIMIT, NOT A SWEEP.
  //
  // This fanned every region out at once with Promise.allSettled and returned
  // `[]` for any non-OK response. Measured against adsb.lol on 2026-09-21:
  // twenty simultaneous requests returned two 200s, the rest 429 and 420. So
  // the endpoint answered 200 with `count: 0` and `source: 'adsb.lol'` while
  // eighty-one requests were being refused — an empty sky and a throttled
  // client are indistinguishable in that response, and the layer simply drew
  // nothing.
  //
  // Same shape and same fix as source-ooni.ts: a small number in flight at
  // once, stop with slack before the budget rather than run into it, and
  // REPORT WHAT WAS SKIPPED instead of folding it into an empty result.
  const CONCURRENCY = 4;
  const BUDGET_MS = 6000;
  const startedAt = Date.now();
  let queried = 0;
  let rateLimited = 0;
  let failed = 0;
  let skipped = 0;
  const reasons = new Map<string, number>();

  const collected: Array<Array<Record<string, unknown>>> = [];
  for (let i = 0; i < regions.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > BUDGET_MS) {
      skipped = regions.length - i;
      break;
    }
    const batch = regions.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (r) => {
        const res = await fetch(`https://api.adsb.lol/v2/lat/${r.lat}/lon/${r.lon}/dist/${r.dist}`, {
          signal: AbortSignal.timeout(4000),
        });
        if (res.status === 429 || res.status === 420) {
          const e = new Error('rate-limited');
          e.name = 'RateLimited';
          throw e;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { ac?: Array<Record<string, unknown>> };
        return data.ac || [];
      }),
    );
    for (const r of settled) {
      queried++;
      if (r.status === 'fulfilled') {
        collected.push(r.value);
        continue;
      }
      const err = r.reason as Error;
      if (err?.name === 'RateLimited') {
        rateLimited++;
      } else {
        failed++;
        // WHY it failed, not just that it did. The first version of this
        // reported `failed: 81` and a note asserting the client was throttled
        // — which the counts then contradicted, because none of the 81 were
        // 429s. A failure count without a reason is the same dead end as the
        // silent `[]` it replaced, one step further along.
        const reason = err?.name === 'TimeoutError' ? 'timeout' : (err?.message ?? 'unknown');
        reasons.set(reason, (reasons.get(reason) ?? 0) + 1);
      }
    }
  }
  const results = collected.map((value) => ({ status: 'fulfilled' as const, value }));

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
    /**
     * What the sweep actually managed. A zero aircraft count means nothing
     * without these: an empty sky and a throttled client look identical
     * otherwise, which is how this endpoint reported success while every one
     * of its eighty-one requests was being refused.
     */
    regions: {
      total: regions.length,
      queried,
      rateLimited,
      failed,
      skipped,
      /** Distinct failure reasons, commonest first. Empty when nothing failed. */
      reasons: Object.fromEntries([...reasons].sort((a, b) => b[1] - a[1]).slice(0, 5)),
    },
    /** Aircraft in this response. `total` is before the 1500 display sample. */
    count: sampled.length,
    total: aircraft.length,
    sampled: aircraft.length > sampled.length,
    /**
     * Present only when the sweep produced nothing AND the reason was refusal
     * rather than an empty sky. Without it a caller cannot tell the two apart,
     * and the map would draw an empty layer as though that were the world.
     */
    ...(sampled.length === 0 && rateLimited + failed > 0
      ? {
          note:
            `No aircraft returned, and the upstream is the reason rather than the sky: ` +
            `of ${queried} region requests, ${rateLimited} were rate-limited and ${failed} failed` +
            `${reasons.size > 0 ? ` (${[...reasons].sort((a, b) => b[1] - a[1])[0][0]})` : ''}.`,
        }
      : {}),
    timestamp: Math.floor(Date.now() / 1000),
    source: 'adsb.lol',
  });
}
