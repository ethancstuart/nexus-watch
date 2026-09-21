import type { VercelRequest, VercelResponse } from '@vercel/node';
import WebSocket from 'ws';

const CORS_ORIGIN = 'https://nexuswatch.dev';
function setCors(res: VercelResponse): VercelResponse {
  return res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
}

export const config = { runtime: 'nodejs', maxDuration: 15 };

interface AISVessel {
  mmsi: string;
  name: string;
  type: string;
  flag: string;
  lat: number;
  lon: number;
  heading: number;
  speed: number;
}

// Module-level cache for Fluid Compute instance reuse
let cachedVessels: AISVessel[] = [];
let lastFetch = 0;
const CACHE_TTL = 30_000;

// AIS ship type codes to human-readable categories
function classifyShipType(code: number): string {
  if (code >= 70 && code <= 79) return 'cargo';
  if (code >= 80 && code <= 89) return 'tanker';
  if (code >= 60 && code <= 69) return 'passenger';
  if (code >= 35 && code <= 39) return 'military';
  if (code >= 40 && code <= 49) return 'cargo';
  if (code >= 50 && code <= 59) return 'military';
  return 'cargo';
}

function collectAIS(apiKey: string, durationMs: number): Promise<AISVessel[]> {
  return new Promise((resolve) => {
    const vessels = new Map<string, AISVessel>();
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      resolve(Array.from(vessels.values()));
    };

    const timeout = setTimeout(finish, durationMs);

    try {
      const ws = new WebSocket('wss://stream.aisstream.io/v0/stream');

      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            APIKey: apiKey,
            BoundingBoxes: [
              [
                [-90, -180],
                [90, 180],
              ],
            ],
            FilterMessageTypes: ['PositionReport'],
          }),
        );
      });

      ws.on('message', (raw: WebSocket.RawData) => {
        try {
          const msg = JSON.parse(String(raw));
          if (msg.MessageType === 'PositionReport') {
            const report = msg.Message?.PositionReport;
            const meta = msg.MetaData;
            if (!report || !meta) return;
            const mmsi = String(meta.MMSI);
            vessels.set(mmsi, {
              mmsi,
              name: (meta.ShipName || '').trim() || `Vessel ${mmsi}`,
              type: classifyShipType(meta.ShipType ?? 0),
              flag: meta.country_iso3 || meta.CountryCode || 'XX',
              lat: report.Latitude,
              lon: report.Longitude,
              heading: report.TrueHeading !== 511 ? report.TrueHeading : report.Cog,
              speed: report.Sog,
            });
          }
        } catch {
          // skip malformed messages
        }
      });

      ws.on('error', () => {
        clearTimeout(timeout);
        finish();
      });

      ws.on('close', () => {
        clearTimeout(timeout);
        finish();
      });

      // Force close after duration
      setTimeout(() => {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }, durationMs - 200);
    } catch {
      clearTimeout(timeout);
      finish();
    }
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Serve from module-level cache if fresh (Fluid Compute reuses instances)
  if (Date.now() - lastFetch < CACHE_TTL && cachedVessels.length > 0) {
    return res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30').json({
      vessels: cachedVessels,
      count: cachedVessels.length,
      cached: true,
    });
  }

  const apiKey = process.env.AISSTREAM_API_KEY;
  if (!apiKey) {
    // NO KEY MEANS NO VESSELS, AND SAYS SO.
    //
    // This branch used to call buildCuratedFleet(): a hardcoded table of
    // invented positions for REAL NAMED WARSHIPS — USS Ronald Reagan, INS
    // Vikramaditya, ROKS Dokdo — offset by a five-minute timer so they
    // "appear to drift between refreshes". It was labelled `curated-fallback`
    // and shipped as live AIS on a map that presents itself as intelligence.
    //
    // This product's only asset is that its claims are checkable. Inventing
    // the position of another country's aircraft carrier is the furthest
    // possible thing from that, and the repo has already made this exact
    // decision once: the model-written sample briefs came off /briefs for the
    // same reason. An empty layer is a fact. A fabricated one is not.
    return res.setHeader('Cache-Control', 'public, max-age=120').json({
      vessels: [],
      count: 0,
      source: 'unconfigured',
      note: 'AISSTREAM_API_KEY is not set, so no vessel positions are available.',
    });
  }

  try {
    // Collect AIS position reports for 4 seconds via WebSocket
    const vessels = await collectAIS(apiKey, 4000);
    if (vessels.length > 0) {
      cachedVessels = vessels;
      lastFetch = Date.now();
      return res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30').json({
        vessels,
        count: vessels.length,
      });
    }

    // A COLLECTION THAT YIELDS NOTHING IS NOT A SEA WITH NO SHIPS.
    //
    // collectAIS listens for four seconds and can return an empty array
    // WITHOUT THROWING — a slow WebSocket handshake, a quiet moment, a
    // truncated stream. The catch below already serves the stale cache, but
    // this path never reached it: it returned `vessels: []` with a 200, so a
    // transient hiccup made the whole layer vanish while reporting success.
    // The cache write was already guarded by `length > 0`; the response was
    // not, which is the asymmetry that hid it.
    if (cachedVessels.length > 0) {
      return res.setHeader('Cache-Control', 'public, max-age=15').json({
        vessels: cachedVessels,
        count: cachedVessels.length,
        cached: true,
        stale: true,
      });
    }
    return res.setHeader('Cache-Control', 'public, max-age=15').json({
      vessels: [],
      count: 0,
      note: 'No AIS positions were received in this collection window.',
    });
  } catch (err) {
    console.error('AIS error:', err instanceof Error ? err.message : err);
    // Return stale cache if available
    if (cachedVessels.length > 0) {
      return res.setHeader('Cache-Control', 'public, max-age=15').json({
        vessels: cachedVessels,
        count: cachedVessels.length,
        cached: true,
        stale: true,
      });
    }
    return res.status(500).json({ vessels: [], count: 0, error: 'AIS connection failed' });
  }
}
