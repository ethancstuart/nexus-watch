import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';
import { DATA_SOURCES, pickSource, type LayerConfig, type LayerSource } from '../../src/config/data-sources';

export const config = { runtime: 'nodejs', maxDuration: 60 };

/**
 * Data Health cron — Track D.1 (Data Accuracy Autonomy).
 *
 * Runs every 15 minutes. For each of the 30 Intel Map layers:
 *   1. Probes the currently active source (primary or fallback).
 *   2. Computes a 0-100 health score from reachability, freshness, record
 *      count, and latency.
 *   3. Appends a row to `data_health` and upserts `data_health_current`.
 *   4. Runs a simple circuit breaker: after 5 consecutive failures the
 *      breaker opens and cycles through the layer's fallback list; 3
 *      consecutive successes close it again and revert to primary.
 *
 * Designed to complete in well under 60s: probes run via Promise.allSettled
 * with bounded concurrency and a per-probe AbortSignal timeout. Test helpers
 * and the pure scoring/breaker logic are exported for unit coverage.
 */

export type CircuitState = 'closed' | 'open' | 'half_open';
export type HealthStatus = 'green' | 'amber' | 'red' | 'degraded';

export interface ProbeResult {
  ok: boolean;
  latencyMs: number;
  recordCount: number | null;
  freshnessSeconds: number | null;
  error: string | null;
}

export interface CurrentRow {
  layer: string;
  status: HealthStatus;
  score: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  consecutiveFailures: number;
  circuitState: CircuitState;
  activeSource: string | null;
}

// Concurrency cap to avoid thundering herds on shared upstreams (GDELT, etc).
const MAX_CONCURRENT_PROBES = 10;
const BREAKER_TRIP_THRESHOLD = 5;
const BREAKER_CLOSE_THRESHOLD = 3;
// A probe is "latency_ok" if it completes faster than this.
const LATENCY_OK_MS = 2500;

// ---------------------------------------------------------------------------
// Pure helpers — exported for unit tests
// ---------------------------------------------------------------------------

/**
 * Composite score 0-100. Weighted average:
 *   - api_reachable         × 0.4
 *   - freshness_ok          × 0.3
 *   - record_count_nonzero  × 0.2
 *   - latency_ok            × 0.1
 *
 * `freshnessWindowSeconds` is the per-layer "too stale" threshold. When the
 * probe can't parse a record count or freshness (e.g. HTML landing page), we
 * treat those inputs as neutral passes provided the probe itself succeeded —
 * otherwise static/landing-page probes would always score red.
 */
export function computeScore(probe: ProbeResult, freshnessWindowSeconds: number): number {
  const reachable = probe.ok ? 1 : 0;
  const freshOk =
    probe.freshnessSeconds == null ? (probe.ok ? 1 : 0) : probe.freshnessSeconds <= freshnessWindowSeconds ? 1 : 0;
  const countOk = probe.recordCount == null ? (probe.ok ? 1 : 0) : probe.recordCount > 0 ? 1 : 0;
  const latencyOk = probe.ok && probe.latencyMs <= LATENCY_OK_MS ? 1 : 0;
  const raw = reachable * 0.4 + freshOk * 0.3 + countOk * 0.2 + latencyOk * 0.1;
  return Math.round(raw * 100);
}

/**
 * Maps a numeric score to a human-readable status band.
 * >= 85 green, 60-84 amber, < 60 red.
 */
export function statusFromScore(score: number): HealthStatus {
  if (score >= 85) return 'green';
  if (score >= 60) return 'amber';
  return 'red';
}

/**
 * Transitions circuit breaker state after a probe result.
 *
 *   closed    → +1 failure if probe fails; open after BREAKER_TRIP_THRESHOLD
 *             → resets consecutiveFailures on success
 *   open      → stays open on failure, increments counter (drives fallback cycling)
 *             → on success, moves to half_open and resets counter
 *   half_open → on failure, returns to open and resets counter to threshold
 *             → on success, increments a success counter; after
 *               BREAKER_CLOSE_THRESHOLD successes, moves back to closed
 *
 * Pure function: takes the previous state + the probe result, returns the
 * next state. The DB layer is responsible for persistence.
 */
export interface BreakerInput {
  circuitState: CircuitState;
  consecutiveFailures: number;
  halfOpenSuccesses?: number;
}

export interface BreakerOutput {
  circuitState: CircuitState;
  consecutiveFailures: number;
  halfOpenSuccesses: number;
}

export function advanceBreaker(prev: BreakerInput, probeOk: boolean): BreakerOutput {
  const prevHalfOpen = prev.halfOpenSuccesses ?? 0;
  if (probeOk) {
    if (prev.circuitState === 'closed') {
      return { circuitState: 'closed', consecutiveFailures: 0, halfOpenSuccesses: 0 };
    }
    if (prev.circuitState === 'open') {
      return { circuitState: 'half_open', consecutiveFailures: 0, halfOpenSuccesses: 1 };
    }
    // half_open
    const nextSuccesses = prevHalfOpen + 1;
    if (nextSuccesses >= BREAKER_CLOSE_THRESHOLD) {
      return { circuitState: 'closed', consecutiveFailures: 0, halfOpenSuccesses: 0 };
    }
    return { circuitState: 'half_open', consecutiveFailures: 0, halfOpenSuccesses: nextSuccesses };
  }
  // Failure path
  const nextFailures = prev.consecutiveFailures + 1;
  if (prev.circuitState === 'closed') {
    if (nextFailures >= BREAKER_TRIP_THRESHOLD) {
      return { circuitState: 'open', consecutiveFailures: nextFailures, halfOpenSuccesses: 0 };
    }
    return { circuitState: 'closed', consecutiveFailures: nextFailures, halfOpenSuccesses: 0 };
  }
  if (prev.circuitState === 'half_open') {
    return { circuitState: 'open', consecutiveFailures: BREAKER_TRIP_THRESHOLD, halfOpenSuccesses: 0 };
  }
  // open stays open, counter advances for fallback cycling.
  return { circuitState: 'open', consecutiveFailures: nextFailures, halfOpenSuccesses: 0 };
}

/**
 * Expands a layer config's probe URL into an absolute URL when running inside
 * a Vercel function. Relative `/api/*` paths are rewritten against VERCEL_URL.
 */
export function resolveProbeUrl(probeUrl: string, base: string | undefined): string {
  if (/^https?:\/\//i.test(probeUrl)) return probeUrl;
  const origin = base ? (base.startsWith('http') ? base : `https://${base}`) : 'https://nexuswatch.dev';
  return `${origin.replace(/\/$/, '')}${probeUrl}`;
}

/**
 * Attempts to infer record count and freshness from a response body. Fails
 * soft — returns nulls on any parse error so the scoring function can treat
 * them as neutral inputs.
 */
export function inferFromBody(body: unknown): { recordCount: number | null; freshnessSeconds: number | null } {
  if (body == null) return { recordCount: null, freshnessSeconds: null };
  try {
    if (Array.isArray(body)) {
      return { recordCount: body.length, freshnessSeconds: extractFreshness(body[0]) };
    }
    if (typeof body === 'object') {
      const obj = body as Record<string, unknown>;
      for (const key of ['items', 'results', 'features', 'events', 'vessels', 'articles', 'data']) {
        const v = obj[key];
        if (Array.isArray(v)) {
          return { recordCount: v.length, freshnessSeconds: extractFreshness(v[0]) };
        }
      }
      return { recordCount: null, freshnessSeconds: extractFreshness(obj) };
    }
  } catch {
    // Ignore — fall through to null.
  }
  return { recordCount: null, freshnessSeconds: null };
}

function extractFreshness(candidate: unknown): number | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const obj = candidate as Record<string, unknown>;
  for (const key of ['updated', 'updated_at', 'timestamp', 'time', 'date', 'published', 'last_seen']) {
    const v = obj[key];
    if (typeof v === 'string' || typeof v === 'number') {
      const ts = new Date(v).getTime();
      if (!Number.isNaN(ts)) {
        return Math.max(0, Math.round((Date.now() - ts) / 1000));
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Probe runner — network-facing, stubbed in tests via injected fetch.
// ---------------------------------------------------------------------------

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export async function probeSource(
  source: LayerSource,
  fetchImpl: FetchLike = fetch,
  base?: string,
): Promise<ProbeResult> {
  const url = resolveProbeUrl(source.probeUrl, base);
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), source.probeTimeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, method: 'GET' });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        ok: false,
        latencyMs,
        recordCount: null,
        freshnessSeconds: null,
        error: `HTTP ${res.status}`,
      };
    }
    let body: unknown = null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('application/json')) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }
    const { recordCount, freshnessSeconds } = inferFromBody(body);
    return { ok: true, latencyMs, recordCount, freshnessSeconds, error: null };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      recordCount: null,
      freshnessSeconds: null,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Runs the given async tasks with a concurrency cap. Preserves ordering so
 * the cron can zip results back to the DATA_SOURCES array.
 */
export async function runBounded<T>(tasks: Array<() => Promise<T>>, limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, tasks.length) }, async () => {
    while (cursor < tasks.length) {
      const i = cursor++;
      results[i] = await tasks[i]!();
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Cron handler
// ---------------------------------------------------------------------------

interface StoredBreakerState {
  circuit_state: CircuitState;
  consecutive_failures: number;
  half_open_successes: number;
  last_success: string | null;
  last_failure: string | null;
  active_source: string | null;
}

// Loose shape for the Neon tagged-template SQL client. We avoid
// ReturnType<typeof neon> because its declared array-mode generics cause
// friction when the function is passed between helpers.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type NeonSql = any;

async function loadCurrentState(sql: NeonSql): Promise<Map<string, StoredBreakerState>> {
  const rows = (await sql`
    SELECT layer, circuit_state, consecutive_failures, last_success, last_failure, active_source
    FROM data_health_current
  `) as Array<Record<string, unknown>>;
  const map = new Map<string, StoredBreakerState>();
  for (const row of rows) {
    map.set(row.layer as string, {
      circuit_state: (row.circuit_state as CircuitState) ?? 'closed',
      consecutive_failures: (row.consecutive_failures as number) ?? 0,
      half_open_successes: 0, // not persisted; reset each cron run is fine
      last_success: (row.last_success as string | null) ?? null,
      last_failure: (row.last_failure as string | null) ?? null,
      active_source: (row.active_source as string | null) ?? null,
    });
  }
  return map;
}

async function ensureSchema(sql: NeonSql): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS data_health (
      id SERIAL PRIMARY KEY,
      layer TEXT NOT NULL,
      status TEXT NOT NULL,
      score INTEGER NOT NULL,
      last_success TIMESTAMPTZ,
      last_failure TIMESTAMPTZ,
      error TEXT,
      fallback_used TEXT,
      latency_ms INTEGER,
      record_count INTEGER,
      freshness_seconds INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_data_health_layer_created ON data_health (layer, created_at DESC)`;
  await sql`
    CREATE TABLE IF NOT EXISTS data_health_current (
      layer TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      score INTEGER NOT NULL,
      last_success TIMESTAMPTZ,
      last_failure TIMESTAMPTZ,
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      circuit_state TEXT NOT NULL DEFAULT 'closed',
      active_source TEXT,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) return res.status(500).json({ error: 'DATABASE_URL not configured' });

  try {
    const sql = neon(dbUrl);
    await ensureSchema(sql);
    const current = await loadCurrentState(sql);
    const base = process.env.VERCEL_URL;

    const tasks = DATA_SOURCES.map((layer) => async () => probeLayer(layer, current.get(layer.id), base));
    const probed = await runBounded(tasks, MAX_CONCURRENT_PROBES);

    // Persist results.
    const summary = { probed: probed.length, green: 0, amber: 0, red: 0, open_circuits: [] as string[] };
    for (const row of probed) {
      if (row.status === 'green') summary.green++;
      else if (row.status === 'amber') summary.amber++;
      else summary.red++;
      if (row.circuitState === 'open') summary.open_circuits.push(row.layer);

      await sql`
        INSERT INTO data_health (
          layer, status, score, last_success, last_failure, error,
          fallback_used, latency_ms, record_count, freshness_seconds
        ) VALUES (
          ${row.layer}, ${row.status}, ${row.score}, ${row.lastSuccess}, ${row.lastFailure}, ${row.error},
          ${row.fallbackUsed}, ${row.latencyMs}, ${row.recordCount}, ${row.freshnessSeconds}
        )
      `;
      await sql`
        INSERT INTO data_health_current (
          layer, status, score, last_success, last_failure, consecutive_failures, circuit_state, active_source, updated_at
        ) VALUES (
          ${row.layer}, ${row.status}, ${row.score}, ${row.lastSuccess}, ${row.lastFailure},
          ${row.consecutiveFailures}, ${row.circuitState}, ${row.activeSource}, NOW()
        )
        ON CONFLICT (layer) DO UPDATE SET
          status = EXCLUDED.status,
          score = EXCLUDED.score,
          last_success = EXCLUDED.last_success,
          last_failure = EXCLUDED.last_failure,
          consecutive_failures = EXCLUDED.consecutive_failures,
          circuit_state = EXCLUDED.circuit_state,
          active_source = EXCLUDED.active_source,
          updated_at = NOW()
      `;
    }

    // Prune >30d of history to keep table bounded.
    await sql`DELETE FROM data_health WHERE created_at < NOW() - INTERVAL '30 days'`;

    return res.json(summary);
  } catch (err) {
    console.error('data-health cron error:', err instanceof Error ? err.message : err);
    return res.status(500).json({ error: 'data-health cron failed' });
  }
}

// ---------------------------------------------------------------------------
// Per-layer probe result (internal shape)
// ---------------------------------------------------------------------------

interface ProbedRow {
  layer: string;
  status: HealthStatus;
  score: number;
  lastSuccess: string | null;
  lastFailure: string | null;
  error: string | null;
  fallbackUsed: string | null;
  latencyMs: number | null;
  recordCount: number | null;
  freshnessSeconds: number | null;
  consecutiveFailures: number;
  circuitState: CircuitState;
  activeSource: string | null;
}

async function probeLayer(
  layer: LayerConfig,
  prev: StoredBreakerState | undefined,
  base: string | undefined,
): Promise<ProbedRow> {
  const prevState: StoredBreakerState = prev ?? {
    circuit_state: 'closed',
    consecutive_failures: 0,
    half_open_successes: 0,
    last_success: null,
    last_failure: null,
    active_source: layer.primary.name,
  };

  const source = pickSource(layer, prevState.circuit_state, prevState.consecutive_failures);

  // No fallback available while open — record the outage without probing.
  if (!source) {
    const next = advanceBreaker(
      {
        circuitState: prevState.circuit_state,
        consecutiveFailures: prevState.consecutive_failures,
        halfOpenSuccesses: prevState.half_open_successes,
      },
      false,
    );
    return {
      layer: layer.id,
      status: 'red',
      score: 0,
      lastSuccess: prevState.last_success,
      lastFailure: new Date().toISOString(),
      error: 'no fallback available',
      fallbackUsed: null,
      latencyMs: null,
      recordCount: null,
      freshnessSeconds: null,
      consecutiveFailures: next.consecutiveFailures,
      circuitState: next.circuitState,
      activeSource: null,
    };
  }

  const probe = await probeSource(source, fetch, base);
  const score = computeScore(probe, source.freshnessWindowSeconds);
  const status = statusFromScore(score);
  const next = advanceBreaker(
    {
      circuitState: prevState.circuit_state,
      consecutiveFailures: prevState.consecutive_failures,
      halfOpenSuccesses: prevState.half_open_successes,
    },
    probe.ok,
  );
  const now = new Date().toISOString();

  return {
    layer: layer.id,
    status,
    score,
    lastSuccess: probe.ok ? now : prevState.last_success,
    lastFailure: probe.ok ? prevState.last_failure : now,
    error: probe.error,
    fallbackUsed: source.name === layer.primary.name ? null : source.name,
    latencyMs: probe.latencyMs,
    recordCount: probe.recordCount,
    freshnessSeconds: probe.freshnessSeconds,
    consecutiveFailures: next.consecutiveFailures,
    circuitState: next.circuitState,
    activeSource: source.name,
  };
}
