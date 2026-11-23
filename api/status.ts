import type { VercelRequest, VercelResponse } from '@vercel/node';
import { kvCached } from './_lib/kvCache.js';
import { neon } from '@neondatabase/serverless';
import { overallHealthOf, type Health } from './_lib/status-health.js';
import { lookupBriefStatus, BRIEF_STATUS_WINDOW, type BriefRow, type BriefStatus } from './_lib/brief-edition.js';

export const config = { runtime: 'nodejs', maxDuration: 25 };

/**
 * Live status endpoint — pings each user-facing API and reports a
 * health snapshot. Powers the /#/status page.
 *
 * GET /api/status
 *   → { generatedAt, overallHealth, endpoints: [{ path, status, latencyMs, lastError? }, ...], brief }
 *
 * Cached 60s in KV so we don't hammer downstream services on every page load.
 *
 * 2026-05-02 G1.
 *
 * 2026-08-28 — two corrections, both of which had this endpoint lying:
 *
 * 1. ESCALATION. It required THREE down endpoints before saying anything but
 *    'ok'. Two core endpoints were down in production and it still read 'ok'.
 *    The threshold now lives in _lib/status-health.ts, with a test.
 *
 * 2. A SLOW ENDPOINT WAS REPORTED AS A DEAD ONE. The ping timeout was 5s and a
 *    timeout was recorded as `status: 'down', httpCode: 0` on the first
 *    attempt. Measured 2026-08-28: /api/cii and /api/briefs-sample hit exactly
 *    5004ms and 5001ms with "The operation was aborted due to timeout" while
 *    the origin was serving 200s — Vercel runtime logs for that window show
 *    200s only, no errors, and an outside request returned 200 in 0.26s. Their
 *    cold paths legitimately exceed 5s (/api/cii wakes a suspended Neon compute
 *    when its module cache is empty; /api/briefs-sample makes an Anthropic call
 *    on a KV miss, which is why it carries maxDuration 25). Everything else in
 *    that same snapshot was 10-20x slower than normal too (290-794ms vs
 *    29-37ms) — the whole fleet was cold at once.
 *
 *    So: the timeout is now 8s, and a TRANSPORT failure is retried ONCE before
 *    it counts. The retry is the part that matters — the first request warms
 *    the lambda and repopulates the CDN entry, so a genuine cold start answers
 *    the second time while a genuinely dead endpoint fails twice. An HTTP error
 *    response is NOT retried; that is a real answer, not a missing one.
 *
 *    Budget: 4 pings in parallel, worst case 2 x 8s = 16s, inside maxDuration 25.
 */

interface EndpointHealth {
  path: string;
  category: 'core' | 'data' | 'derived';
  status: Health;
  latencyMs: number;
  httpCode: number;
  /** How many requests this reading took. 2 means the first attempt failed. */
  attempts: number;
  lastError?: string;
}

interface StatusPayload {
  generatedAt: string;
  overallHealth: Health;
  endpoints: EndpointHealth[];
  /**
   * Which edition of the daily brief shipped last, and how many days running
   * the mechanical edition has shipped (2026-11-16: it shipped nine mornings
   * before anyone outside the owner's inbox could see it).
   *
   * Reported as its OWN field and deliberately NOT folded into overallHealth.
   * overallHealth answers "are the public endpoints up"; one mechanical day is
   * a publish gate refusing a draft, i.e. the system working, and anything
   * that pages on overallHealth must not change behaviour by surprise. A
   * monitor that wants to page on the streak reads the streak.
   *
   * Public by construction: a date, an edition and a count. No cause, error
   * text or vendor name — each archived brief's subject already says
   * "mechanical edition" in public.
   */
  brief: BriefStatus;
}

/** Above a cold start, below maxDuration once doubled by the retry. */
const PING_TIMEOUT_MS = 8000;
/** A response slower than this is real, but not healthy. */
const DEGRADED_ABOVE_MS = 3000;

// The probe list matches the NARROWED product (2026-09): the register, the
// brief, and the CII that feeds it. It had probed six map-layer endpoints —
// including one already deleted — manufacturing failures for surfaces the
// product no longer has. A probe list is a claim about what matters.
// /api/briefs-sample was removed from this list on 2026-09-15 along with the
// endpoint itself. It generated model-written example briefs for the /briefs
// page to show when the archive was empty; that fallback was deleted when the
// invented samples came off the site, leaving an endpoint with no consumer
// that still paged the owner every time its six-hour cache expired and the
// model call made it slow. A health check on something nobody reads is a
// pager that only ever cries wolf.
const ENDPOINTS: Array<{ path: string; category: 'core' | 'data' | 'derived' }> = [
  { path: '/api/cii', category: 'core' },
  { path: '/api/briefs', category: 'core' },
  { path: '/api/calls/ledger', category: 'core' },
];

type Attempt =
  | { kind: 'response'; httpCode: number; latencyMs: number }
  | { kind: 'transport'; error: string; latencyMs: number };

async function attemptPing(host: string, path: string): Promise<Attempt> {
  const start = Date.now();
  try {
    const res = await fetch(`https://${host}${path}`, {
      signal: AbortSignal.timeout(PING_TIMEOUT_MS),
      headers: { 'User-Agent': 'NexusWatch-StatusCheck/1.0' },
    });
    return { kind: 'response', httpCode: res.status, latencyMs: Date.now() - start };
  } catch (err) {
    return {
      kind: 'transport',
      error: err instanceof Error ? err.message : String(err),
      latencyMs: Date.now() - start,
    };
  }
}

async function pingEndpoint(host: string, ep: (typeof ENDPOINTS)[number]): Promise<EndpointHealth> {
  let attempt = await attemptPing(host, ep.path);
  let attempts = 1;

  // Retry a TRANSPORT failure once — a cold start and an outage are
  // indistinguishable on a single try, and the first request is what warms it.
  // An HTTP status is an answer, and is never retried.
  if (attempt.kind === 'transport') {
    attempt = await attemptPing(host, ep.path);
    attempts = 2;
  }

  if (attempt.kind === 'transport') {
    return {
      path: ep.path,
      category: ep.category,
      status: 'down',
      latencyMs: attempt.latencyMs,
      httpCode: 0,
      attempts,
      lastError: attempt.error,
    };
  }

  const { httpCode, latencyMs } = attempt;
  let status: Health = 'ok';
  if (httpCode >= 500) status = 'down';
  else if (httpCode >= 400) status = 'degraded';
  else if (latencyMs > DEGRADED_ABOVE_MS) status = 'degraded';
  // Succeeded only on the retry: not healthy, but not down either. Say so
  // rather than rounding it to green.
  else if (attempts > 1) status = 'degraded';

  return {
    path: ep.path,
    category: ep.category,
    status,
    latencyMs,
    httpCode,
    attempts,
    ...(attempts > 1 ? { lastError: 'first attempt failed; succeeded on retry' } : {}),
  };
}

/** The latest rows, reduced to what the streak needs. Cheap: one indexed read. */
async function fetchRecentBriefRows(): Promise<BriefRow[]> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');
  const sql = neon(dbUrl);
  // content is cast to jsonb (a no-op if it already is) and read into scalars
  // here, so the stored briefText is never shipped to the lambda.
  const rows = await sql`
    SELECT brief_date::text AS brief_date,
           c ->> 'edition' AS edition,
           c ->> 'subject' AS subject,
           c ->> 'pending' AS pending,
           COALESCE(jsonb_typeof(c), 'null') AS kind
    FROM (
      SELECT brief_date, content::jsonb AS c
      FROM daily_briefs
      ORDER BY brief_date DESC
      LIMIT ${BRIEF_STATUS_WINDOW}
    ) recent
  `;
  return rows as unknown as BriefRow[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', 'https://nexuswatch.dev');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const host = req.headers.host || 'nexuswatch.dev';

  // Key bumped to v2: the payload shape gained `attempts` and the escalation
  // rule changed, so a v1 entry written by the old code would keep serving the
  // old verdict from cache after this deploys. Bumped to v3 for `brief`.
  const payload = await kvCached<StatusPayload>('nw:status:v3', 60, async () => {
    // The brief lookup runs beside the pings, so it adds no wall-clock time,
    // and it cannot throw or outlast its own 4s timeout (worst case stays
    // inside maxDuration).
    const [results, brief] = await Promise.all([
      Promise.all(ENDPOINTS.map((ep) => pingEndpoint(host, ep))),
      lookupBriefStatus(fetchRecentBriefRows),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      overallHealth: overallHealthOf(results),
      endpoints: results,
      brief,
    };
  });

  return res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60').json(payload);
}
