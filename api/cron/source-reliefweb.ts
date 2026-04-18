import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * ReliefWeb Humanitarian Disaster Ingestion.
 *
 * ReliefWeb (OCHA) is the canonical source for humanitarian crises.
 * Report volume spikes predict instability escalation 7-30 days ahead.
 * Covers floods, droughts, epidemics, conflicts, and displacement events
 * that GDACS and WHO miss — particularly strong for Central Africa,
 * Sahel, and Southeast Asia.
 *
 * Source: ReliefWeb API v1 (free, no auth, unlimited — just pass appname)
 * Schedule: daily at 4 AM UTC (0 4 * * *)
 */

const RELIEFWEB_API = 'https://api.reliefweb.int/v1/disasters';

// ISO3 → ISO2 mapping for CII countries
const ISO3_TO_ISO2: Record<string, string> = {
  AFG: 'AF',
  AGO: 'AO',
  ARG: 'AR',
  AUS: 'AU',
  AZE: 'AZ',
  BGD: 'BD',
  BFA: 'BF',
  BRA: 'BR',
  CAF: 'CF',
  CHL: 'CL',
  CHN: 'CN',
  CMR: 'CM',
  COD: 'CD',
  COL: 'CO',
  CUB: 'CU',
  DEU: 'DE',
  DZA: 'DZ',
  EGY: 'EG',
  ETH: 'ET',
  FRA: 'FR',
  GBR: 'GB',
  GEO: 'GE',
  GHA: 'GH',
  HTI: 'HT',
  IDN: 'ID',
  IND: 'IN',
  IRN: 'IR',
  IRQ: 'IQ',
  ISR: 'IL',
  ITA: 'IT',
  JOR: 'JO',
  JPN: 'JP',
  KAZ: 'KZ',
  KEN: 'KE',
  KHM: 'KH',
  KOR: 'KR',
  LBN: 'LB',
  LBY: 'LY',
  LKA: 'LK',
  MAR: 'MA',
  MEX: 'MX',
  MLI: 'ML',
  MMR: 'MM',
  MOZ: 'MZ',
  MYS: 'MY',
  NER: 'NE',
  NGA: 'NG',
  NPL: 'NP',
  PAK: 'PK',
  PER: 'PE',
  PHL: 'PH',
  POL: 'PL',
  PSE: 'PS',
  ROU: 'RO',
  RUS: 'RU',
  RWA: 'RW',
  SAU: 'SA',
  SDN: 'SD',
  SEN: 'SN',
  SOM: 'SO',
  SSD: 'SS',
  SYR: 'SY',
  TCD: 'TD',
  THA: 'TH',
  TUN: 'TN',
  TUR: 'TR',
  TWN: 'TW',
  TZA: 'TZ',
  UGA: 'UG',
  UKR: 'UA',
  ARE: 'AE',
  USA: 'US',
  UZB: 'UZ',
  VEN: 'VE',
  VNM: 'VN',
  YEM: 'YE',
  ZAF: 'ZA',
  ZWE: 'ZW',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const result = { ingested: 0, countries: new Set<string>(), errors: [] as string[] };

  try {
    // Fetch recent disasters (last 30 days)
    const url = `${RELIEFWEB_API}?appname=nexuswatch&sort[]=date:desc&limit=100&fields[include][]=name&fields[include][]=date.created&fields[include][]=primary_country.iso3&fields[include][]=type&fields[include][]=status`;

    const r = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'NexusWatch/1.0 (https://nexuswatch.dev)' },
    });

    if (!r.ok) throw new Error(`reliefweb_${r.status}`);

    const data = (await r.json()) as {
      data?: Array<{
        id: number;
        fields?: {
          name?: string;
          date?: { created?: string };
          primary_country?: { iso3?: string };
          type?: Array<{ name?: string }>;
          status?: string;
        };
      }>;
    };

    const items = data.data || [];

    for (const item of items) {
      const fields = item.fields;
      if (!fields?.name || !fields?.primary_country?.iso3) continue;

      const iso3 = fields.primary_country.iso3;
      const countryCode = ISO3_TO_ISO2[iso3] || '';
      if (!countryCode) continue;

      const title = fields.name.slice(0, 500);
      const date = fields.date?.created || new Date().toISOString();
      const disasterType = fields.type?.[0]?.name || 'Unknown';

      result.countries.add(countryCode);

      await sql`
        INSERT INTO event_snapshots (layer_id, country_code, title, timestamp, metadata)
        VALUES (
          'reliefweb',
          ${countryCode},
          ${title},
          ${date},
          ${JSON.stringify({ source: 'ReliefWeb', disaster_type: disasterType, reliefweb_id: item.id })}
        )
        ON CONFLICT DO NOTHING
      `;
      result.ingested++;
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  console.log(
    `[source-reliefweb] ingested=${result.ingested}, countries=${result.countries.size}, errors=${result.errors.length}`,
  );
  return res.json({
    ...result,
    countries: Array.from(result.countries),
  });
}
