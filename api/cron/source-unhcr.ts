import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 120 };

/**
 * UNHCR Refugee Population Ingestion (Phase 2, Conflict Signals).
 *
 * Refugee spike (10x increase from a country) is a 7-14 day early
 * warning for conflict escalation. High IDP count = unresolved
 * internal conflict. Free, no auth required.
 *
 * Source: UNHCR Population API (free, public)
 * Schedule: 0 3 15 * * (monthly, 15th at 3 AM UTC)
 */

const UNHCR_API = 'https://api.unhcr.org/population/v1/population';

// ISO3 → ISO2 mapping for CII countries
const ISO3_TO_ISO2: Record<string, string> = {
  AFG: 'AF', ARG: 'AR', AUS: 'AU', AZE: 'AZ', BGD: 'BD', BFA: 'BF',
  BRA: 'BR', CAN: 'CA', CAF: 'CF', TCD: 'TD', CHN: 'CN', COL: 'CO',
  COD: 'CD', CUB: 'CU', DEU: 'DE', DZA: 'DZ', EGY: 'EG', ETH: 'ET',
  FRA: 'FR', GBR: 'GB', GEO: 'GE', GHA: 'GH', HTI: 'HT', IDN: 'ID',
  IND: 'IN', IRN: 'IR', IRQ: 'IQ', ISR: 'IL', ITA: 'IT', JOR: 'JO',
  JPN: 'JP', KAZ: 'KZ', KEN: 'KE', KHM: 'KH', KOR: 'KR', LBN: 'LB',
  LBY: 'LY', LKA: 'LK', MAR: 'MA', MEX: 'MX', MLI: 'ML', MMR: 'MM',
  MOZ: 'MZ', MYS: 'MY', NER: 'NE', NGA: 'NG', NPL: 'NP', NZL: 'NZ',
  PAK: 'PK', PER: 'PE', PHL: 'PH', POL: 'PL', PSE: 'PS', QAT: 'QA',
  ROU: 'RO', RUS: 'RU', RWA: 'RW', SAU: 'SA', SDN: 'SD', SEN: 'SN',
  SGP: 'SG', SOM: 'SO', SSD: 'SS', SYR: 'SY', THA: 'TH', TUN: 'TN',
  TUR: 'TR', TWN: 'TW', TZA: 'TZ', UGA: 'UG', UKR: 'UA', ARE: 'AE',
  USA: 'US', UZB: 'UZ', VEN: 'VE', VNM: 'VN', YEM: 'YE', ZAF: 'ZA',
  ZWE: 'ZW', AGO: 'AO', ARM: 'AM', CMR: 'CM', CHL: 'CL', ESP: 'ES',
  PRK: 'KP',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const result = { ingested: 0, errors: [] as string[] };
  const currentYear = new Date().getFullYear();
  // Fetch current year and previous year for delta calculation
  const years = [currentYear, currentYear - 1];

  for (const year of years) {
    try {
      let page = 1;
      let hasMore = true;

      while (hasMore && page <= 10) {
        const url = `${UNHCR_API}/?year=${year}&limit=100&page=${page}&coo_all=true&coa_all=true`;
        const r = await fetch(url, {
          signal: AbortSignal.timeout(20000),
          headers: { 'User-Agent': 'NexusWatch/1.0' },
        });

        if (!r.ok) {
          result.errors.push(`year=${year} page=${page}: UNHCR returned ${r.status}`);
          break;
        }

        const data = (await r.json()) as {
          items?: Array<{
            coo_iso?: string;
            coa_iso?: string;
            refugees?: number;
            asylum_seekers?: number;
            idps?: number;
            stateless?: number;
          }>;
          maxPages?: number;
        };

        const items = data.items || [];
        if (items.length === 0) {
          hasMore = false;
          break;
        }

        for (const item of items) {
          const originIso3 = item.coo_iso || '';
          const asylumIso3 = item.coa_iso || '';
          const origin = ISO3_TO_ISO2[originIso3] || originIso3.slice(0, 2);
          const asylum = ISO3_TO_ISO2[asylumIso3] || asylumIso3.slice(0, 2);

          if (!origin || !asylum) continue;

          await sql`
            INSERT INTO refugee_populations
              (year, country_origin, country_asylum, refugees, asylum_seekers, idps, stateless)
            VALUES
              (${year}, ${origin}, ${asylum}, ${item.refugees || 0},
               ${item.asylum_seekers || 0}, ${item.idps || 0}, ${item.stateless || 0})
            ON CONFLICT (year, country_origin, country_asylum) DO UPDATE SET
              refugees = EXCLUDED.refugees,
              asylum_seekers = EXCLUDED.asylum_seekers,
              idps = EXCLUDED.idps,
              stateless = EXCLUDED.stateless
          `;
          result.ingested++;
        }

        hasMore = page < (data.maxPages || 1);
        page++;

        // Courtesy delay between pages
        await new Promise((r) => setTimeout(r, 200));
      }
    } catch (err) {
      result.errors.push(`year=${year}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`[source-unhcr] ingested=${result.ingested}, errors=${result.errors.length}`);
  return res.json(result);
}
