import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Public self-heal action log.
 *
 * GET /api/public/self-heal-log → { actions: [...] }
 *
 * Returns recent automated healing actions — circuit breaker trips,
 * fallback activations, source recoveries. Radical transparency about
 * when NexusWatch's pipelines self-correct.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.json({ actions: [] });

  try {
    const sql = neon(dbUrl);

    // Actions from data_health_actions if it exists
    const actions = (await sql`
      SELECT layer, action, detail, created_at
      FROM data_health_actions
      WHERE created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 100
    `.catch(() => [])) as unknown as Array<{
      layer: string;
      action: string;
      detail: string;
      created_at: string;
    }>;

    // Also pull circuit breaker trips from data_health table
    const trips = (await sql`
      SELECT layer, status, error, fallback_used, created_at
      FROM data_health
      WHERE status IN ('red', 'degraded') AND created_at > NOW() - INTERVAL '7 days'
      ORDER BY created_at DESC
      LIMIT 50
    `.catch(() => [])) as unknown as Array<{
      layer: string;
      status: string;
      error: string | null;
      fallback_used: string | null;
      created_at: string;
    }>;

    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.json({
      actions,
      trips,
      note: 'Self-heal actions over the past 7 days. Empty means all layers healthy.',
    });
  } catch (err) {
    console.error('[self-heal-log]', err instanceof Error ? err.message : err);
    return res.json({ actions: [], trips: [] });
  }
}
