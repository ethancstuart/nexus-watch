import { describe, it, expect, vi } from 'vitest';
import {
  computeScore,
  statusFromScore,
  advanceBreaker,
  resolveProbeUrl,
  inferFromBody,
  probeSource,
  runBounded,
  type ProbeResult,
} from '../data-health';

// ---------------------------------------------------------------------------
// computeScore
// ---------------------------------------------------------------------------

const happyProbe = (over: Partial<ProbeResult> = {}): ProbeResult => ({
  ok: true,
  latencyMs: 300,
  recordCount: 42,
  freshnessSeconds: 60,
  error: null,
  httpStatus: 200,
  ...over,
});

describe('computeScore', () => {
  it('returns 100 for a perfectly healthy probe', () => {
    expect(computeScore(happyProbe(), 3600)).toBe(100);
  });

  it('returns 0 for a failed probe', () => {
    const probe: ProbeResult = {
      ok: false,
      latencyMs: 5000,
      httpStatus: null,
      recordCount: null,
      freshnessSeconds: null,
      error: 'ECONNREFUSED',
    };
    expect(computeScore(probe, 3600)).toBe(0);
  });

  it('docks freshness when record is older than the window', () => {
    const score = computeScore(happyProbe({ freshnessSeconds: 9999 }), 600);
    // Lost the 0.3 freshness component.
    expect(score).toBe(70);
  });

  it('docks record-count when upstream returned an empty list', () => {
    const score = computeScore(happyProbe({ recordCount: 0 }), 3600);
    // Lost the 0.2 count component.
    expect(score).toBe(80);
  });

  it('docks latency when probe took longer than the threshold', () => {
    const score = computeScore(happyProbe({ latencyMs: 4000 }), 3600);
    // Lost the 0.1 latency component.
    expect(score).toBe(90);
  });

  it('treats null record/freshness as neutral passes on a successful probe', () => {
    const score = computeScore(happyProbe({ recordCount: null, freshnessSeconds: null, latencyMs: 100 }), 3600);
    expect(score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// statusFromScore
// ---------------------------------------------------------------------------

describe('statusFromScore', () => {
  it('maps 100 to green', () => {
    expect(statusFromScore(100)).toBe('green');
  });
  it('maps 85 to green (boundary)', () => {
    expect(statusFromScore(85)).toBe('green');
  });
  it('maps 84 to amber', () => {
    expect(statusFromScore(84)).toBe('amber');
  });
  it('maps 60 to amber (boundary)', () => {
    expect(statusFromScore(60)).toBe('amber');
  });
  it('maps 59 to red', () => {
    expect(statusFromScore(59)).toBe('red');
  });
  it('maps 0 to red', () => {
    expect(statusFromScore(0)).toBe('red');
  });
});

// ---------------------------------------------------------------------------
// advanceBreaker — state transitions
// ---------------------------------------------------------------------------

describe('advanceBreaker', () => {
  it('keeps a closed circuit closed on success', () => {
    const next = advanceBreaker({ circuitState: 'closed', consecutiveFailures: 0 }, true);
    expect(next).toEqual({ circuitState: 'closed', consecutiveFailures: 0, halfOpenSuccesses: 0 });
  });

  it('increments failures on a closed circuit but does not trip under threshold', () => {
    const next = advanceBreaker({ circuitState: 'closed', consecutiveFailures: 2 }, false);
    expect(next.circuitState).toBe('closed');
    expect(next.consecutiveFailures).toBe(3);
  });

  it('trips from closed to open at 5 consecutive failures', () => {
    const next = advanceBreaker({ circuitState: 'closed', consecutiveFailures: 4 }, false);
    expect(next.circuitState).toBe('open');
    expect(next.consecutiveFailures).toBe(5);
  });

  it('resets failures to 0 when a closed circuit sees a success', () => {
    const next = advanceBreaker({ circuitState: 'closed', consecutiveFailures: 3 }, true);
    expect(next.consecutiveFailures).toBe(0);
  });

  it('transitions open → half_open on success', () => {
    const next = advanceBreaker({ circuitState: 'open', consecutiveFailures: 7 }, true);
    expect(next.circuitState).toBe('half_open');
    expect(next.halfOpenSuccesses).toBe(1);
  });

  it('keeps open on continued failure and advances the failure counter', () => {
    const next = advanceBreaker({ circuitState: 'open', consecutiveFailures: 5 }, false);
    expect(next.circuitState).toBe('open');
    expect(next.consecutiveFailures).toBe(6);
  });

  it('closes from half_open after 3 consecutive successes', () => {
    const step1 = advanceBreaker({ circuitState: 'open', consecutiveFailures: 5 }, true);
    expect(step1.circuitState).toBe('half_open');
    const step2 = advanceBreaker(
      {
        circuitState: step1.circuitState,
        consecutiveFailures: step1.consecutiveFailures,
        halfOpenSuccesses: step1.halfOpenSuccesses,
      },
      true,
    );
    expect(step2.circuitState).toBe('half_open');
    expect(step2.halfOpenSuccesses).toBe(2);
    const step3 = advanceBreaker(
      {
        circuitState: step2.circuitState,
        consecutiveFailures: step2.consecutiveFailures,
        halfOpenSuccesses: step2.halfOpenSuccesses,
      },
      true,
    );
    expect(step3.circuitState).toBe('closed');
  });

  it('re-opens from half_open on a single failure', () => {
    const next = advanceBreaker({ circuitState: 'half_open', consecutiveFailures: 0, halfOpenSuccesses: 1 }, false);
    expect(next.circuitState).toBe('open');
  });
});

// ---------------------------------------------------------------------------
// resolveProbeUrl
// ---------------------------------------------------------------------------

describe('resolveProbeUrl', () => {
  it('passes through absolute URLs unchanged', () => {
    expect(resolveProbeUrl('https://example.com/foo', 'whatever')).toBe('https://example.com/foo');
  });

  it('prefixes relative paths with a VERCEL_URL without scheme', () => {
    expect(resolveProbeUrl('/api/fires', 'nexuswatch.dev')).toBe('https://nexuswatch.dev/api/fires');
  });

  it('prefixes relative paths with a VERCEL_URL that already has scheme', () => {
    expect(resolveProbeUrl('/api/fires', 'https://preview.vercel.app')).toBe('https://preview.vercel.app/api/fires');
  });

  it('falls back to nexuswatch.dev when no base is provided', () => {
    expect(resolveProbeUrl('/api/fires', undefined)).toBe('https://nexuswatch.dev/api/fires');
  });
});

// ---------------------------------------------------------------------------
// inferFromBody
// ---------------------------------------------------------------------------

describe('inferFromBody', () => {
  it('counts top-level arrays', () => {
    expect(inferFromBody([1, 2, 3]).recordCount).toBe(3);
  });

  it('extracts count from common wrapper keys', () => {
    expect(inferFromBody({ items: [1, 2] }).recordCount).toBe(2);
    expect(inferFromBody({ features: [1, 2, 3, 4] }).recordCount).toBe(4);
  });

  it('returns null for opaque bodies', () => {
    expect(inferFromBody({ foo: 'bar' }).recordCount).toBeNull();
  });

  it('computes freshness from a timestamp field', () => {
    const twoMinAgo = new Date(Date.now() - 120_000).toISOString();
    const { freshnessSeconds } = inferFromBody([{ updated: twoMinAgo }]);
    expect(freshnessSeconds).not.toBeNull();
    expect(freshnessSeconds!).toBeGreaterThanOrEqual(119);
    expect(freshnessSeconds!).toBeLessThanOrEqual(130);
  });

  it('handles null/undefined bodies', () => {
    expect(inferFromBody(null)).toEqual({ recordCount: null, freshnessSeconds: null });
    expect(inferFromBody(undefined)).toEqual({ recordCount: null, freshnessSeconds: null });
  });
});

// ---------------------------------------------------------------------------
// probeSource — mocked fetch
// ---------------------------------------------------------------------------

describe('probeSource', () => {
  const source = {
    name: 'test',
    probeUrl: 'https://test.example.com/endpoint',
    probeTimeoutMs: 1000,
    freshnessWindowSeconds: 3600,
  };

  it('returns ok=true for a 200 JSON response and parses records', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ id: 1 }, { id: 2 }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await probeSource(source, mockFetch);
    expect(result.ok).toBe(true);
    expect(result.recordCount).toBe(2);
    expect(result.error).toBeNull();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('returns ok=false for a non-2xx HTTP status', async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response('oops', { status: 503 }));
    const result = await probeSource(source, mockFetch);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('HTTP 503');
  });

  it('returns ok=false when fetch throws', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await probeSource(source, mockFetch);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  /**
   * THE RETRY, AND THE REASON IT EXISTS.
   *
   * The OONI source failed 27.4% of its health probes over a week (46 of 168),
   * every one of them "This operation was aborted" and none an HTTP status,
   * while its successful probes ran p99 4,808ms against a 5,000ms timeout. It
   * was not down; it was slower than the timeout about a quarter of the time,
   * and /api/public/status published that to readers as red.
   *
   * api/status.ts already carries this lesson for the endpoint pingers. These
   * assertions are what stop it being lost again here.
   */
  it('retries ONCE when the transport fails, and succeeds on the second attempt', async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('This operation was aborted'))
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 1 }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      );
    const result = await probeSource(source, mockFetch);
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry an HTTP error — that is a real answer', async () => {
    // A 503 means the source replied. Retrying it would double the load on
    // something already struggling and change nothing about the verdict.
    const mockFetch = vi.fn().mockResolvedValue(new Response('oops', { status: 503 }));
    const result = await probeSource(source, mockFetch);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('HTTP 503');
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('still fails when BOTH attempts fail, so a dead source is still dead', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await probeSource(source, mockFetch);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('ECONNREFUSED');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('reports the total cost of a retried reading, not just the second attempt', async () => {
    // Otherwise a retried probe looks as cheap as a first-attempt one in the
    // latency figures, and the p99 that revealed this defect would hide the
    // next one.
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('aborted'))
      .mockResolvedValueOnce(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    const result = await probeSource(source, mockFetch);
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
    expect(result.attempts).toBe(2);
  });

  it('decides on the STATUS, not on how the error was worded', async () => {
    // The first version tested `error.startsWith('HTTP ')`, so whether a 503
    // got retried depended on the format of a human-readable string. An
    // independent review named it. attemptProxyCacheBust in this same file
    // already formats its errors differently (`HTTP 503: <body>`), so the
    // divergence was one edit away from doubling load on a failing source.
    //
    // This asserts the decision survives a reworded message.
    const mockFetch = vi.fn().mockResolvedValue(new Response('detail', { status: 503 }));
    const result = await probeSource(source, mockFetch);
    expect(result.httpStatus).toBe(503);
    expect(mockFetch).toHaveBeenCalledOnce();

    // And that a transport failure — which has NO status — is the retried one.
    const transport = vi.fn().mockRejectedValue(new Error('any wording at all'));
    const r2 = await probeSource(source, transport);
    expect(r2.httpStatus).toBeNull();
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('does not crash on JSON bodies that fail to parse', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('not-json', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    const result = await probeSource(source, mockFetch);
    // Response#json() on invalid JSON rejects; probe treats as success but null records.
    expect(result.ok).toBe(true);
    expect(result.recordCount).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// runBounded — concurrency cap
// ---------------------------------------------------------------------------

describe('runBounded', () => {
  it('preserves task ordering', async () => {
    const tasks = [1, 2, 3, 4, 5].map((n) => () => Promise.resolve(n * 10));
    const out = await runBounded(tasks, 2);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it('respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const tasks = Array.from({ length: 20 }, () => async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return 1;
    });
    await runBounded(tasks, 4);
    expect(peak).toBeLessThanOrEqual(4);
  });
});
