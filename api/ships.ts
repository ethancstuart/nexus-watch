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
    // Curated fallback: major shipping vessels + military fleets across all oceans
    // Used when no AIS API key is configured. Positions are approximate and
    // rotate slightly each refresh to simulate movement.
    const curated = buildCuratedFleet();
    return res.setHeader('Cache-Control', 'public, max-age=120').json({
      vessels: curated,
      count: curated.length,
      source: 'curated-fallback',
      note: 'Approximate positions. Configure AISSTREAM_API_KEY for live data.',
    });
  }

  try {
    // Collect AIS position reports for 4 seconds via WebSocket
    const vessels = await collectAIS(apiKey, 4000);
    if (vessels.length > 0) {
      cachedVessels = vessels;
      lastFetch = Date.now();
    }
    return res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30').json({
      vessels,
      count: vessels.length,
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

/**
 * Curated global fleet fallback — used when no AIS API key configured.
 * Covers major shipping lanes, military fleets, and chokepoints
 * across all oceans and continents. ~80 vessels for visual density
 * that demonstrates global reach.
 */
function buildCuratedFleet(): AISVessel[] {
  // Time-based offset so vessels appear to drift between refreshes
  const tick = Math.floor(Date.now() / 300_000); // changes every 5 min
  const drift = (tick % 20) - 10; // -10..+10 deg
  const flip = tick % 2 === 0 ? 1 : -1;

  const CURATED: Array<[string, string, string, string, number, number]> = [
    // [mmsi, name, type, flag, lat, lon]
    // === Asia-Pacific ===
    ['477000001', 'COSCO Shipping Universe', 'cargo', 'CN', 22.0, 120.0],
    ['477000002', 'CMA CGM Benjamin Franklin', 'cargo', 'CN', 30.5, 125.0],
    ['477000003', 'OOCL Hong Kong', 'cargo', 'CN', 24.5, 118.5],
    ['431000001', 'MOL Triumph', 'cargo', 'JP', 33.0, 138.0],
    ['431000002', 'NYK Line Vessel', 'cargo', 'JP', 35.5, 140.0],
    ['440000001', 'Hyundai Courage', 'cargo', 'KR', 36.5, 127.0],
    ['440000002', 'ROKS Dokdo', 'military', 'KR', 34.0, 129.5],
    ['525000001', 'Evergreen Ace', 'cargo', 'TW', 22.8, 120.5],
    ['525000002', 'Yang Ming Uniform', 'cargo', 'TW', 24.0, 119.0],
    ['563000001', 'Maersk Sovereign', 'cargo', 'SG', 1.3, 104.0],
    ['563000002', 'APL Singapore', 'cargo', 'SG', 2.0, 102.0],
    ['577000001', 'USS Ronald Reagan', 'military', 'US', 35.0, 135.0],
    ['577000002', 'USS Blue Ridge', 'military', 'US', 14.5, 121.0],

    // === South Asia / Middle East ===
    ['419000001', 'INS Vikramaditya', 'military', 'IN', 15.5, 73.8],
    ['419000002', 'JSW Steel Carrier', 'cargo', 'IN', 19.0, 72.5],
    ['470000001', 'UAE Hamdan', 'passenger', 'AE', 25.1, 55.1],
    ['432000001', 'IRGC Fast Attack', 'military', 'IR', 26.5, 56.0],
    ['403000001', 'Saudi Aramco VLCC', 'tanker', 'SA', 26.5, 50.5],
    ['403000002', 'Aramco Tanker II', 'tanker', 'SA', 27.0, 51.0],
    ['408000001', 'Bahri Tanker', 'tanker', 'SA', 12.5, 43.5], // Bab el-Mandeb
    ['235000002', 'HMS Queen Elizabeth', 'military', 'GB', 12.0, 44.0], // Red Sea ops
    ['366000001', 'USS Eisenhower', 'military', 'US', 13.0, 48.5], // Gulf of Aden

    // === Europe & Med ===
    ['247000001', 'MSC Gulsun', 'cargo', 'IT', 36.5, 14.5],
    ['247000002', 'MSC Oscar', 'cargo', 'IT', 40.0, 8.5],
    ['235000001', 'Maersk Triple-E', 'cargo', 'GB', 51.0, 2.5],
    ['228000001', 'CMA CGM Marco Polo', 'cargo', 'FR', 44.0, -2.0],
    ['205000001', 'MSC Lisbon', 'cargo', 'BE', 53.5, 2.0],
    ['211000001', 'Hapag-Lloyd Hamburg', 'cargo', 'DE', 54.0, 7.5],
    ['265000001', 'Stena Line Ferry', 'passenger', 'SE', 57.0, 11.5],
    ['224000001', 'Grimaldi Euro', 'cargo', 'ES', 37.0, -5.5],
    ['273000001', 'Sovcomflot Tanker', 'tanker', 'RU', 60.0, 30.0],
    ['273000002', 'Northern Fleet', 'military', 'RU', 69.0, 33.0],

    // === Black Sea / Turkey ===
    ['271000001', 'TCG Anadolu', 'military', 'TR', 41.0, 29.0],
    ['271000002', 'Akdeniz Bulker', 'cargo', 'TR', 36.5, 30.5],

    // === Africa ===
    ['670000001', 'CoteRostock Carrier', 'cargo', 'CI', 5.0, -4.0],
    ['620000001', 'PIL Durban', 'cargo', 'ZA', -33.5, 28.0],
    ['620000002', 'SA Agulhas II', 'cargo', 'ZA', -34.5, 18.0],
    ['657000001', 'Nigeria LNG Carrier', 'tanker', 'NG', 4.0, 6.0],
    ['603000001', 'Algeria Sonatrach', 'tanker', 'DZ', 36.0, 3.0],
    ['626000001', 'Angola LNG', 'tanker', 'AO', -8.0, 13.0],
    ['663000001', 'Suez Transit', 'cargo', 'EG', 30.5, 32.3], // Suez
    ['663000002', 'Port Said Tanker', 'tanker', 'EG', 31.3, 32.5],
    ['635000001', 'Djibouti Cargo', 'cargo', 'DJ', 11.5, 43.0],
    ['610000001', 'Mombasa Container', 'cargo', 'KE', -4.0, 39.8],
    ['663000003', 'NASSCO Tanker', 'tanker', 'EG', 29.9, 32.5],

    // === North America ===
    ['366000002', 'USS Gerald Ford', 'military', 'US', 36.5, -76.0],
    ['366000003', 'USS Nimitz', 'military', 'US', 32.5, -117.0],
    ['366000004', 'Crowley Container', 'cargo', 'US', 25.0, -80.0],
    ['303000001', 'USNS Supply', 'military', 'US', 36.0, -74.0],
    ['338000001', 'Alaska Marine Ferry', 'passenger', 'US', 58.0, -135.0],
    ['316000001', 'CSL Tadoussac', 'cargo', 'CA', 47.0, -60.0],

    // === Caribbean / Central America ===
    ['339000001', 'Seaboard Marine', 'cargo', 'JM', 18.0, -77.0],
    ['351000001', 'Panama Registry Tanker', 'tanker', 'PA', 9.3, -79.5], // Panama Canal
    ['351000002', 'Global Reefer', 'cargo', 'PA', 14.0, -80.0],

    // === South America ===
    ['710000001', 'Mercosul Line', 'cargo', 'BR', -23.5, -43.0],
    ['710000002', 'Petrobras Tanker', 'tanker', 'BR', -20.0, -39.0],
    ['701000001', 'Hapag Argentina', 'cargo', 'AR', -34.5, -58.5],
    ['725000001', 'Chile Copper Carrier', 'cargo', 'CL', -33.0, -71.5],
    ['730000001', 'Ecopetrol Tanker', 'tanker', 'CO', 10.5, -75.5],

    // === Oceania ===
    ['503000001', 'Australian Navy HMAS', 'military', 'AU', -33.5, 151.5],
    ['503000002', 'ANL Sydney', 'cargo', 'AU', -33.5, 151.0],
    ['503000003', 'North West Shelf LNG', 'tanker', 'AU', -21.0, 115.5],
    ['512000001', 'Interislander Ferry', 'passenger', 'NZ', -41.0, 174.0],

    // === Arctic / Remote ===
    ['273000003', 'Rosatomflot Icebreaker', 'military', 'RU', 75.0, 50.0],
    ['331000001', 'Greenland Nuuk Supply', 'cargo', 'GL', 64.0, -52.0],

    // === Indian Ocean ===
    ['571000001', 'Myanmar Cargo', 'cargo', 'MM', 16.5, 96.5],
    ['572000001', 'PIL Colombo', 'cargo', 'LK', 6.5, 80.0],
    ['457000001', 'Maldives Fast Ferry', 'passenger', 'MV', 4.0, 73.5],

    // === Gulf of Guinea / Pirate watch ===
    ['657000002', 'Maersk Alabama', 'cargo', 'NG', 3.5, 6.5],
    ['657000003', 'ENL Consortium', 'cargo', 'NG', 6.0, 3.5],

    // === South China Sea ===
    ['477000010', 'PLA Navy Shandong', 'military', 'CN', 18.0, 115.0],
    ['477000011', 'China Coast Guard', 'military', 'CN', 12.0, 118.0],
    ['477000012', 'COSCO Spratly', 'cargo', 'CN', 10.0, 114.0],

    // === Baltic ===
    ['275000001', 'Latvian Cargo', 'cargo', 'LV', 57.0, 21.0],
    ['277000001', 'Lithuanian Tanker', 'tanker', 'LT', 56.0, 21.5],

    // === English Channel & Irish Sea ===
    ['232000001', 'P&O Dover Ferry', 'passenger', 'GB', 51.0, 1.5],
    ['250000001', 'Irish Sea Freight', 'cargo', 'IE', 53.5, -6.0],
  ];

  return CURATED.map(([mmsi, name, type, flag, lat, lon]) => ({
    mmsi,
    name,
    type,
    flag,
    lat: lat + (drift / 20) * flip * 0.5,
    lon: lon + (drift / 20) * flip * 0.5,
    heading: (Math.abs(drift) * 18) % 360,
    speed: 8 + (Math.abs(drift) % 12),
  }));
}
