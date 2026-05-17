/**
 * Data Lab manifest endpoint.
 *
 * Returns the latest Parquet export URLs for the browser-side DuckDB-WASM
 * lab to consume.
 *
 * GET /api/data/manifest
 *   → { exports: [{ name, url, bytes, rows, exported_at, schema }], generated_at }
 *
 * The Vercel rewrite /data/manifest.json → /api/data/manifest gives a
 * static-looking URL so users can curl/share it.
 *
 * 2026-05 tier-up Phase 1.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export const config = { runtime: 'nodejs' };

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, max-age=600, stale-while-revalidate=3600');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return res.json({ exports: [], generated_at: new Date().toISOString(), note: 'db_not_configured' });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sql: any = neon(dbUrl);
    const rows = (await sql`
      SELECT name, blob_url, bytes, rows, exported_at, schema_json
      FROM data_exports
      ORDER BY name
    `) as unknown as Array<Record<string, unknown>>;

    return res.json({
      exports: rows.map((r) => ({
        name: r.name,
        url: r.blob_url,
        bytes: Number(r.bytes),
        rows: Number(r.rows),
        exported_at: r.exported_at,
        schema: r.schema_json,
      })),
      generated_at: new Date().toISOString(),
      note:
        rows.length === 0 ? 'No exports yet. Run /api/cron/export-parquet or wait for the 03:00 UTC cron.' : undefined,
      duckdb_install_hint: "INSTALL httpfs; LOAD httpfs; CREATE TABLE cii AS SELECT * FROM read_parquet('<url>');",
    });
  } catch (e) {
    console.error('[api/data/manifest]', e instanceof Error ? e.message : e);
    return res.json({ exports: [], generated_at: new Date().toISOString(), error: 'query_failed' });
  }
}
