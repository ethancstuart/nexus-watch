import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Webcam Catalog — proxies the Windy Webcams API and returns a cleaned-up
 * list of ~50 cams across strategic locations. Cached in module memory
 * for 1 hour (Fluid Compute reuses instances).
 *
 * GET /api/webcam-catalog
 *   → { cams: [{ id, name, type, lat, lon, region, thumbnail, viewerUrl, status }], generatedAt }
 *
 * Falls back to the curated live-iframe list if WINDY_WEBCAM_KEY not set.
 *
 * Honest envelope on every cam:
 *   - status: 'live' | 'thumbnail' | 'external'
 *   - thumbnail: URL of a real-frame preview (when type=thumbnail) or null
 *   - embedUrl: URL safe to iframe (when type=live) or null
 *   - viewerUrl: external link to vendor site (always present)
 */

interface CatalogCam {
  id: string;
  name: string;
  type: 'chokepoint' | 'port' | 'city' | 'space' | 'weather' | 'landscape';
  lat: number;
  lon: number;
  region: string;
  status: 'live' | 'thumbnail' | 'external';
  thumbnail: string | null;
  embedUrl: string | null;
  viewerUrl: string;
  source: string;
}

interface WindyWebcam {
  webcamId: number;
  title?: string;
  location?: { city?: string; region?: string; country?: string; latitude?: number; longitude?: number };
  images?: { current?: { preview?: string; thumbnail?: string } };
  player?: { day?: string; live?: string; month?: string };
  status?: string; // 'active' | 'inactive'
  categories?: { id: string; name: string }[];
}

const CACHE_TTL = 60 * 60 * 1000; // 1 hour
let cached: CatalogCam[] | null = null;
let cachedAt = 0;

// Always-included live-iframe showpiece cams (no Windy needed)
const LIVE_IFRAME_CAMS: CatalogCam[] = [
  {
    id: 'iss-hdev',
    name: 'ISS — High Definition Earth Viewing',
    type: 'space',
    lat: 0,
    lon: 0,
    region: 'Earth Orbit',
    status: 'live',
    thumbnail: null,
    embedUrl: 'https://www.youtube.com/embed/H999s0P1Er0?autoplay=1&mute=1',
    viewerUrl: 'https://eol.jsc.nasa.gov/ESRS/HDEV/',
    source: 'NASA',
  },
  {
    id: 'iceland-aurora',
    name: 'Reykjavik — Northern Lights',
    type: 'weather',
    lat: 64.15,
    lon: -21.94,
    region: 'Europe',
    status: 'live',
    thumbnail: null,
    embedUrl: 'https://www.youtube.com/embed/2tnLvhSF0Mw?autoplay=1&mute=1',
    viewerUrl: 'https://livefromiceland.is/webcams/',
    source: 'Live From Iceland',
  },
  {
    id: 'mt-etna',
    name: 'Mount Etna Volcano',
    type: 'weather',
    lat: 37.75,
    lon: 14.99,
    region: 'Europe',
    status: 'live',
    thumbnail: null,
    embedUrl: 'https://www.youtube.com/embed/TiASJqgmjQQ?autoplay=1&mute=1',
    viewerUrl: 'https://www.skylinewebcams.com/en/webcam/italia/sicilia/catania/vulcano-etna.html',
    source: 'Skyline Webcams',
  },
  {
    id: 'noaa-buoy-44025',
    name: 'NOAA Buoy 44025 — New York Harbor',
    type: 'port',
    lat: 40.25,
    lon: -73.16,
    region: 'Americas',
    status: 'live',
    thumbnail: 'https://www.ndbc.noaa.gov/buoycam.php?station=44025',
    embedUrl: null,
    viewerUrl: 'https://www.ndbc.noaa.gov/station_page.php?station=44025',
    source: 'NOAA',
  },
  {
    id: 'kennedy-launch-pad',
    name: 'Kennedy Space Center — Launch Pad 39A',
    type: 'space',
    lat: 28.61,
    lon: -80.6,
    region: 'Americas',
    status: 'live',
    thumbnail: null,
    embedUrl: 'https://www.youtube.com/embed/21X5lGlDOfg?autoplay=1&mute=1',
    viewerUrl: 'https://www.kennedyspacecenter.com/',
    source: 'NASA',
  },
];

function classifyCategory(cam: WindyWebcam): CatalogCam['type'] {
  const cats = (cam.categories || []).map((c) => c.id.toLowerCase()).join(',');
  if (cats.includes('harbor') || cats.includes('beach')) return 'port';
  if (cats.includes('airport')) return 'city';
  if (cats.includes('traffic')) return 'city';
  if (cats.includes('mountain') || cats.includes('weather')) return 'weather';
  return 'landscape';
}

async function fetchWindyCatalog(apiKey: string): Promise<CatalogCam[]> {
  // Strategic locations near chokepoints / capital harbors. Windy returns
  // nearby cams ranked by activity. We fan out to a few seed coords so the
  // catalog spans the globe without one region dominating.
  const seeds: Array<{ name: string; lat: number; lon: number; region: string; type: CatalogCam['type'] }> = [
    { name: 'Singapore', lat: 1.35, lon: 103.82, region: 'Asia', type: 'port' },
    { name: 'Rotterdam', lat: 51.92, lon: 4.48, region: 'Europe', type: 'port' },
    { name: 'Suez', lat: 30.6, lon: 32.27, region: 'Middle East', type: 'chokepoint' },
    { name: 'Panama', lat: 9.08, lon: -79.68, region: 'Americas', type: 'chokepoint' },
    { name: 'Istanbul', lat: 41.05, lon: 29.03, region: 'Europe', type: 'chokepoint' },
    { name: 'Hong Kong', lat: 22.32, lon: 114.17, region: 'Asia', type: 'city' },
    { name: 'NYC', lat: 40.71, lon: -74.01, region: 'Americas', type: 'city' },
    { name: 'Tokyo', lat: 35.69, lon: 139.69, region: 'Asia', type: 'city' },
    { name: 'Sydney', lat: -33.87, lon: 151.21, region: 'Oceania', type: 'city' },
    { name: 'Cape Town', lat: -33.92, lon: 18.42, region: 'Africa', type: 'port' },
  ];

  const out: CatalogCam[] = [];
  const seen = new Set<string>();

  for (const seed of seeds) {
    try {
      const url = `https://api.windy.com/webcams/api/v3/webcams?nearby=${seed.lat},${seed.lon},150&limit=8&include=images,location,player,categories`;
      const res = await fetch(url, {
        headers: { 'x-windy-api-key': apiKey, accept: 'application/json' },
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const data = (await res.json()) as { webcams?: WindyWebcam[] };
      const cams = data.webcams || [];

      for (const w of cams) {
        if (out.length >= 50) break;
        const id = `windy-${w.webcamId}`;
        if (seen.has(id)) continue;
        const lat = w.location?.latitude ?? seed.lat;
        const lon = w.location?.longitude ?? seed.lon;
        const thumb = w.images?.current?.preview || w.images?.current?.thumbnail || null;
        if (!thumb) continue; // skip cams without a real frame

        out.push({
          id,
          name: w.title || `${w.location?.city || seed.name} Webcam`,
          type: classifyCategory(w),
          lat,
          lon,
          region: seed.region,
          status: 'thumbnail',
          thumbnail: thumb,
          embedUrl: null,
          viewerUrl: w.player?.day || `https://www.windy.com/webcams/${w.webcamId}`,
          source: 'Windy.com',
        });
        seen.add(id);
      }
    } catch {
      // skip seed on error
    }
    if (out.length >= 50) break;
  }

  return out;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.WINDY_WEBCAM_KEY;

  // Serve from module cache if fresh
  if (cached && Date.now() - cachedAt < CACHE_TTL) {
    return res
      .setHeader('Cache-Control', 'public, max-age=900, s-maxage=900')
      .json({ cams: cached, generatedAt: new Date(cachedAt).toISOString(), cached: true });
  }

  if (!apiKey) {
    cached = LIVE_IFRAME_CAMS;
    cachedAt = Date.now();
    return res.setHeader('Cache-Control', 'public, max-age=300').json({
      cams: LIVE_IFRAME_CAMS,
      generatedAt: new Date().toISOString(),
      note: 'WINDY_WEBCAM_KEY not configured — showing 5 live-iframe cams only.',
    });
  }

  try {
    const windyCams = await fetchWindyCatalog(apiKey);
    const merged = [...LIVE_IFRAME_CAMS, ...windyCams];
    cached = merged;
    cachedAt = Date.now();
    return res.setHeader('Cache-Control', 'public, max-age=900, s-maxage=900').json({
      cams: merged,
      generatedAt: new Date().toISOString(),
      sources: { live: LIVE_IFRAME_CAMS.length, windy: windyCams.length },
    });
  } catch (err) {
    console.error('webcam-catalog error:', err instanceof Error ? err.message : err);
    return res.setHeader('Cache-Control', 'public, max-age=60').json({
      cams: LIVE_IFRAME_CAMS,
      generatedAt: new Date().toISOString(),
      error: 'Windy upstream failed — showing fallback only.',
    });
  }
}
