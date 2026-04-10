import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

const CORS = 'https://nexuswatch.dev';

let cachedTension: { global: number; trend: string; components: Record<string, number> } | null = null;
let lastFetch = 0;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', CORS);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Read CII scores directly from Postgres — NOT self-referencing /api/cii
  if (!cachedTension || Date.now() - lastFetch > 60_000) {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      try {
        const sql = neon(dbUrl);
        const rows = await sql`
          SELECT DISTINCT ON (country_code) score
          FROM country_cii_history
          ORDER BY country_code, timestamp DESC
        `;
        const scores = rows.map((r) => r.score as number);
        const avgScore = scores.length > 0 ? Math.round(scores.reduce((s, c) => s + c, 0) / scores.length) : 0;
        const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
        cachedTension = {
          global: Math.round((avgScore + maxScore) / 2),
          trend: 'stable',
          components: { avgCII: avgScore, maxCII: maxScore, countriesMonitored: scores.length },
        };
        lastFetch = Date.now();
      } catch {
        // Use stale cache
      }
    }
  }

  return res.setHeader('Cache-Control', 'public, max-age=60').json({
    tension: cachedTension || { global: 0, trend: 'stable', components: {} },
    timestamp: Date.now(),
  });
}
