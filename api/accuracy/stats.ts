import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Public accuracy statistics endpoint.
 * Powers the /accuracy page — the trust marketing feature.
 *
 * GET /api/accuracy/stats
 *   → { stats: { total_assessments, confirmed, ... }, countries: [...] }
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });

  try {
    const sql = neon(dbUrl);

    // Check if assessments table exists and has data
    const totals = (await sql`
      SELECT
        COUNT(*) FILTER (WHERE outcome = 'confirmed') as confirmed,
        COUNT(*) FILTER (WHERE outcome = 'partially_confirmed') as partially_confirmed,
        COUNT(*) FILTER (WHERE outcome = 'not_confirmed') as not_confirmed,
        COUNT(*) FILTER (WHERE outcome = 'pending') as pending,
        COUNT(*) as total,
        MIN(created_at) as first_recorded
      FROM assessments
    `) as unknown as Array<{
      confirmed: number;
      partially_confirmed: number;
      not_confirmed: number;
      pending: number;
      total: number;
      first_recorded: string | null;
    }>;

    const row = totals[0];
    const total = Number(row.total) || 0;

    // Accuracy rate: confirmed / (confirmed + partially + not_confirmed)
    // Pending are excluded — they haven't been scored yet
    const scored = Number(row.confirmed) + Number(row.partially_confirmed) + Number(row.not_confirmed);
    const accuracyRate =
      scored > 0 ? ((Number(row.confirmed) + Number(row.partially_confirmed) * 0.5) / scored) * 100 : 0;

    const daysActive = row.first_recorded
      ? Math.floor((Date.now() - new Date(row.first_recorded).getTime()) / 86400000)
      : 0;

    // Per-country breakdown
    const countries = (await sql`
      SELECT
        country_code,
        COUNT(*) as total_predictions,
        AVG(cii_score_at_time) as avg_cii,
        100.0 * COUNT(*) FILTER (WHERE outcome = 'confirmed') / NULLIF(COUNT(*) FILTER (WHERE outcome != 'pending'), 0) as accuracy_rate
      FROM assessments
      WHERE country_code IS NOT NULL
      GROUP BY country_code
      ORDER BY total_predictions DESC
      LIMIT 20
    `) as unknown as Array<{ country_code: string; total_predictions: number; avg_cii: number; accuracy_rate: number }>;

    // Join country names from a known lookup (inline to avoid import)
    const nameMap: Record<string, string> = {
      UA: 'Ukraine',
      RU: 'Russia',
      CN: 'China',
      TW: 'Taiwan',
      IR: 'Iran',
      IQ: 'Iraq',
      SY: 'Syria',
      IL: 'Israel',
      PS: 'Palestine',
      YE: 'Yemen',
      SD: 'Sudan',
      SS: 'South Sudan',
      ET: 'Ethiopia',
      SO: 'Somalia',
      CD: 'DR Congo',
      MM: 'Myanmar',
      AF: 'Afghanistan',
      PK: 'Pakistan',
      KP: 'North Korea',
      KR: 'South Korea',
      VE: 'Venezuela',
      NG: 'Nigeria',
      LY: 'Libya',
      LB: 'Lebanon',
      SA: 'Saudi Arabia',
      US: 'United States',
      JP: 'Japan',
      DE: 'Germany',
      GB: 'United Kingdom',
      FR: 'France',
      IN: 'India',
      BR: 'Brazil',
      MX: 'Mexico',
      PH: 'Philippines',
      ID: 'Indonesia',
      TR: 'Turkey',
      EG: 'Egypt',
      ZA: 'South Africa',
      KE: 'Kenya',
      BD: 'Bangladesh',
    };

    return res.json({
      stats: {
        total_assessments: total,
        confirmed: Number(row.confirmed),
        partially_confirmed: Number(row.partially_confirmed),
        not_confirmed: Number(row.not_confirmed),
        pending: Number(row.pending),
        accuracy_rate: accuracyRate,
        days_active: daysActive,
      },
      countries: countries.map((c) => ({
        country_code: c.country_code,
        country_name: nameMap[c.country_code] || c.country_code,
        total_predictions: Number(c.total_predictions),
        avg_cii: Number(c.avg_cii) || 0,
        accuracy_rate: Number(c.accuracy_rate) || 0,
      })),
    });
  } catch (err) {
    // Table might not exist yet — return empty structure
    console.error('[api/accuracy/stats]', err instanceof Error ? err.message : err);
    return res.json({
      stats: {
        total_assessments: 0,
        confirmed: 0,
        partially_confirmed: 0,
        not_confirmed: 0,
        pending: 0,
        accuracy_rate: 0,
        days_active: 0,
      },
      countries: [],
    });
  }
}
