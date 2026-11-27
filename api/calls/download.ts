import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import {
  buildDownloadRecords,
  toCsv,
  toJson,
  DOWNLOAD_CACHE_CONTROL,
  type CorrectionSourceRow,
  type DownloadSourceRow,
} from '../_lib/calls-download.js';

export const config = { runtime: 'nodejs', maxDuration: 20 };

/**
 * GET /data/calls.csv and /data/calls.json (vercel.json rewrites each here
 * with `format`): every call in the book, documented on /data.
 *
 * ONE HANDLER, ONE READ, TWO SERIALISERS. Both files come from the same two
 * queries and the same records (api/_lib/calls-download.ts), so they hold the
 * same rows in the same order by construction.
 *
 * NOTHING PARTIAL IS EVER SERVED. Both reads finish before a byte is written,
 * and a failure answers 500 with `no-store`, so the edge cannot cache an error
 * as the file. A file that silently held part of the book would be worse than
 * none: the daily snapshot workflow learned that once already.
 */

interface Failure {
  status: number;
  code: string;
}

function fail(res: VercelResponse, format: 'csv' | 'json' | null, f: Failure) {
  res.setHeader('Cache-Control', 'no-store');
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(f.status).send(JSON.stringify({ error: f.code }));
  }
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.status(f.status).send(f.code);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const raw = Array.isArray(req.query?.format) ? req.query.format[0] : req.query?.format;
  const format = raw === 'csv' || raw === 'json' ? raw : null;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    return fail(res, format, { status: 405, code: 'method_not_allowed' });
  }
  if (!format) return fail(res, null, { status: 404, code: 'not_found' });

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return fail(res, format, { status: 503, code: 'calls_unavailable' });

  try {
    const sql = neon(dbUrl);
    // Every call, by id. The timestamp is formatted in SQL, in UTC, so the
    // file does not depend on the database session's time zone or on how the
    // driver hands back a timestamptz.
    const calls = (await sql`
      SELECT id, kind, country_code, claim,
             probability::float AS probability, base_rate::float AS base_rate,
             made_on::text AS made_on, resolves_on::text AS resolves_on, status,
             to_char(resolved_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS resolved_at,
             void_reason, resolver, threshold,
             threshold_pct::float AS threshold_pct, reference_value::float AS reference_value,
             evidence_count
      FROM calls
      ORDER BY id
    `) as unknown as DownloadSourceRow[];

    // Every correction row, newest first within a call, the order the call
    // page reads them in (api/call.ts). Which one stands is decided by
    // standingCorrection, in buildDownloadRecords.
    const corrections = (await sql`
      SELECT id, call_id, issued_on::text AS issued_on, corrected_status
      FROM call_corrections
      ORDER BY call_id, issued_on DESC, id DESC
    `) as unknown as CorrectionSourceRow[];

    const records = buildDownloadRecords(calls, corrections);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', DOWNLOAD_CACHE_CONTROL);
    if (format === 'csv') {
      // header=present: RFC 4180's own parameter for a CSV whose first line is a header.
      res.setHeader('Content-Type', 'text/csv; charset=utf-8; header=present');
      return res.status(200).send(toCsv(records));
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.status(200).send(toJson(records, new Date()));
  } catch (err) {
    console.error('[calls/download] failed:', err instanceof Error ? err.message : err);
    return fail(res, format, { status: 500, code: 'calls_unavailable' });
  }
}
