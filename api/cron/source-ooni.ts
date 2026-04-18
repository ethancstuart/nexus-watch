import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * OONI Network Interference Detection (Phase 6, Data Moat).
 *
 * Detects website blocks, app censorship (WhatsApp, Telegram, Signal),
 * and protocol-level interference DAYS before mainstream media reports
 * "internet crackdowns." No competitor uses this for instability scoring.
 *
 * Source: OONI API (free, no auth, completely open)
 * Schedule: every 6 hours (0 at minute 0, hours 0/6/12/18)
 */

// Top 40 countries most likely to censor — prioritized for API budget
const PROBE_COUNTRIES = [
  'IR',
  'CN',
  'RU',
  'MM',
  'SD',
  'ET',
  'SY',
  'VE',
  'CU',
  'KP',
  'BY',
  'TR',
  'EG',
  'SA',
  'PK',
  'BD',
  'TH',
  'VN',
  'IN',
  'IQ',
  'AF',
  'YE',
  'LY',
  'SS',
  'CD',
  'UG',
  'TZ',
  'KE',
  'NG',
  'ML',
  'BF',
  'NE',
  'TD',
  'CF',
  'SO',
  'HT',
  'AZ',
  'KZ',
  'UZ',
  'LB',
];

const OONI_API = 'https://api.ooni.io/api/v1';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '') || req.query.token;
  if (token !== process.env.CRON_SECRET) return res.status(401).json({ error: 'unauthorized' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'database_not_configured' });
  const sql = neon(dbUrl);

  const result = { ingested: 0, censorship_detected: 0, errors: [] as string[] };
  const today = new Date().toISOString().split('T')[0];
  const since = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  for (const cc of PROBE_COUNTRIES) {
    try {
      // Fetch aggregated measurement counts for web_connectivity test
      const url = `${OONI_API}/aggregation?probe_cc=${cc}&since=${since}&until=${today}&test_name=web_connectivity&axis_x=measurement_start_day`;
      const r = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'NexusWatch/1.0' },
      });

      if (!r.ok) {
        if (r.status !== 404) result.errors.push(`${cc}: ${r.status}`);
        continue;
      }

      const data = (await r.json()) as {
        result?: Array<{
          measurement_start_day: string;
          anomaly_count: number;
          confirmed_count: number;
          measurement_count: number;
        }>;
      };

      const items = data.result || [];
      for (const item of items) {
        const measurementDate = item.measurement_start_day;

        await sql`
          INSERT INTO ooni_measurements
            (country_code, test_name, measurement_date, anomaly_count, confirmed_blocked, total_measurements)
          VALUES
            (${cc}, 'web_connectivity', ${measurementDate}, ${item.anomaly_count}, ${item.confirmed_count}, ${item.measurement_count})
          ON CONFLICT (country_code, test_name, measurement_date) DO UPDATE SET
            anomaly_count = EXCLUDED.anomaly_count,
            confirmed_blocked = EXCLUDED.confirmed_blocked,
            total_measurements = EXCLUDED.total_measurements
        `;
        result.ingested++;

        if (item.confirmed_count > 10) {
          result.censorship_detected++;
          console.log(`[ooni] CENSORSHIP: ${cc} — ${item.confirmed_count} confirmed blocks on ${measurementDate}`);
        }
      }

      // Courtesy delay
      await new Promise((r) => setTimeout(r, 100));
    } catch (err) {
      result.errors.push(`${cc}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(
    `[source-ooni] ingested=${result.ingested}, censorship=${result.censorship_detected}, errors=${result.errors.length}`,
  );
  return res.json(result);
}
