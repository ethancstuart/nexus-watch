import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs', maxDuration: 10 };

/**
 * Trade Flows — OEC (Observatory of Economic Complexity) public API.
 *
 * GET /api/trade-flows?reporter=USA&year=2024
 *
 * Returns top 10 trading partners by export value for the given country
 * code. Powers the country panel "Trade Exposure" section.
 *
 * 24h cache. OEC has no API key requirement on their public CSV/JSON
 * endpoints; we hit their /tesseract endpoint. If it's down we return a
 * stale-or-empty envelope rather than 5xx.
 */

interface TradeFlow {
  partnerCode: string;
  partnerName: string;
  exportValue: number;
  importValue: number;
  share: number; // % of total exports
}

const CACHE_TTL = 24 * 60 * 60 * 1000;
const cache = new Map<string, { ts: number; data: TradeFlow[] }>();

interface OECDataRow {
  'Country ID': string;
  Country: string;
  'Trade Value': number;
  [k: string]: string | number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // OEC uses lowercase 3-letter codes (e.g. 'usa', 'chn', 'deu')
  const reporter = String(req.query.reporter || '')
    .toLowerCase()
    .slice(0, 3);
  const year = parseInt(String(req.query.year || new Date().getFullYear() - 1), 10);
  if (!reporter) return res.status(400).json({ error: 'reporter (ISO3 country code) required' });
  const key = `${reporter}:${year}`;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL) {
    return res.setHeader('Cache-Control', 'public, max-age=86400').json({ flows: hit.data, year, cached: true });
  }

  try {
    // OEC tesseract v2 — cube `trade_i_baci_a_92`. Verified via
    // /tesseract/cubes/trade_i_baci_a_92 schema:
    //   - dimension hierarchies are "Exporter Official" / "Importer Official"
    //   - leaf level is "Exporter Country Official" / "Importer Country Official"
    //   - country IDs are lowercase 3-letter codes (usa, chn, deu, ...).
    const url = `https://api-v2.oec.world/tesseract/data.jsonrecords?cube=trade_i_baci_a_92&drilldowns=Importer+Country+Official&measures=Trade+Value&Year=${year}&Exporter+Country+Official=${reporter}&parents=true&sort=Trade+Value:desc&limit=10`;
    const upstream = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!upstream.ok) throw new Error(`OEC HTTP ${upstream.status}`);
    const json = (await upstream.json()) as { data?: OECDataRow[] };
    const rows = json.data || [];
    const total = rows.reduce((sum, r) => sum + (Number(r['Trade Value']) || 0), 0);

    const flows: TradeFlow[] = rows.slice(0, 10).map((r) => ({
      partnerCode: String(r['Importer Country Official ID'] || '').toUpperCase(),
      partnerName: String(r['Importer Country Official'] || ''),
      exportValue: Number(r['Trade Value']) || 0,
      importValue: 0,
      share: total > 0 ? Math.round((Number(r['Trade Value']) / total) * 1000) / 10 : 0,
    }));

    cache.set(key, { ts: Date.now(), data: flows });
    return res.setHeader('Cache-Control', 'public, max-age=86400').json({ flows, year });
  } catch (err) {
    console.error('[trade-flows] upstream failed', err);
    if (hit) return res.setHeader('Cache-Control', 'public, max-age=300').json({ flows: hit.data, year, stale: true });
    return res
      .setHeader('Cache-Control', 'public, max-age=300')
      .json({ flows: [], year, status: 'upstream-error', upstream: 'oec-v2' });
  }
}
