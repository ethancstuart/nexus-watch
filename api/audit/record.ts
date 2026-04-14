import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

/**
 * Internal audit recording endpoint.
 * POST /api/audit/record
 * Body: { type: 'lineage' | 'audit' | 'ai-audit', record: {...} }
 *
 * Called server-side by cron jobs and (optionally) client-side to
 * persist lineage + audit records to Neon. Rate-limited by origin.
 */

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'db_not_configured' });

  const body = req.body as {
    type: 'lineage' | 'audit' | 'ai-audit';
    record: Record<string, unknown>;
  };

  if (!body?.type || !body?.record) {
    return res.status(400).json({ error: 'type and record required' });
  }

  try {
    const sql = neon(dbUrl);
    const r = body.record;

    if (body.type === 'lineage') {
      await sql`
        INSERT INTO data_lineage
          (id, layer_id, source, source_url, response_status, fetch_start_ms, fetch_end_ms,
           latency_ms, response_size_bytes, records_returned, records_accepted,
           quality_filters, diff, source_type, error)
        VALUES
          (${r.id}, ${r.layerId}, ${r.source}, ${r.sourceUrl}, ${r.responseStatus},
           ${r.fetchStartMs}, ${r.fetchEndMs}, ${r.latencyMs}, ${r.responseSizeBytes},
           ${r.recordsReturned}, ${r.recordsAccepted},
           ${JSON.stringify(r.qualityFilters ?? [])}, ${JSON.stringify(r.diff ?? null)},
           ${r.sourceType ?? 'primary'}, ${r.error ?? null})
        ON CONFLICT (id) DO NOTHING
      `;
    } else if (body.type === 'audit') {
      await sql`
        INSERT INTO audit_log
          (id, country_code, computed_at_ms, rule_version, input_lineage_ids, score,
           previous_score, components, confidence, applied_rules, gaps)
        VALUES
          (${r.id}, ${r.countryCode}, ${r.computedAtMs}, ${r.ruleVersion},
           ${r.inputLineageIds as string[]}, ${r.score}, ${r.previousScore ?? null},
           ${JSON.stringify(r.components)}, ${r.confidence},
           ${r.appliedRules as string[]}, ${r.gaps as string[]})
        ON CONFLICT (id) DO NOTHING
      `;
    } else if (body.type === 'ai-audit') {
      await sql`
        INSERT INTO ai_analyst_audit
          (id, query, computed_at_ms, tools_used, claims, overall_confidence, rule_version)
        VALUES
          (${r.id}, ${r.query}, ${r.computedAtMs}, ${r.toolsUsed as string[]},
           ${JSON.stringify(r.claims)}, ${r.overallConfidence}, ${r.ruleVersion ?? null})
        ON CONFLICT (id) DO NOTHING
      `;
    } else {
      return res.status(400).json({ error: 'unknown type' });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error('[audit/record]', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'insert_failed' });
  }
}
