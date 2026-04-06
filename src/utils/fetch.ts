// Circuit breaker states per hostname
interface CircuitEntry {
  failures: number;
  openedAt: number | null;
  probing: boolean;
}

const circuits = new Map<string, CircuitEntry>();

// In-flight request deduplication
const inFlight = new Map<string, Promise<Response>>();
const FAILURE_THRESHOLD = 3;
const OPEN_DURATION_MS = 60 * 1000; // 60 seconds (was 5 minutes — too aggressive for real-time data)

function getEntry(hostname: string): CircuitEntry {
  let entry = circuits.get(hostname);
  if (!entry) {
    entry = { failures: 0, openedAt: null, probing: false };
    circuits.set(hostname, entry);
  }
  return entry;
}

export function getCircuitState(hostname: string): 'closed' | 'open' | 'half-open' {
  const entry = circuits.get(hostname);
  if (!entry || entry.openedAt === null) return 'closed';
  if (Date.now() - entry.openedAt >= OPEN_DURATION_MS) return 'half-open';
  return 'open';
}

export async function fetchWithRetry(url: string, options?: RequestInit, maxRetries = 2): Promise<Response> {
  // Check circuit breaker before dedup — bail early if circuit is open/blocked
  const parsed = new URL(url, window.location.origin);
  const hostname = parsed.hostname;
  const state = getCircuitState(hostname);
  if (state === 'open') {
    throw new Error(`Circuit open for ${hostname} — requests blocked`);
  }
  if (state === 'half-open') {
    const entry = getEntry(hostname);
    if (entry.probing) {
      throw new Error(`Circuit half-open for ${hostname} — probe in progress`);
    }
  }

  // Deduplicate GET requests — if an identical URL is already in-flight, return the same promise
  const method = options?.method?.toUpperCase() || 'GET';
  if (method === 'GET') {
    const pending = inFlight.get(url);
    if (pending) return pending.then((r) => r.clone());
  }

  const request = _fetchWithRetry(url, options, maxRetries);

  if (method === 'GET') {
    inFlight.set(url, request);
    request.then(
      () => inFlight.delete(url),
      () => inFlight.delete(url),
    );
  }

  return request;
}

async function _fetchWithRetry(url: string, options: RequestInit | undefined, maxRetries: number): Promise<Response> {
  const parsed = new URL(url, window.location.origin);
  const hostname = parsed.hostname;
  const entry = getEntry(hostname);
  const state = getCircuitState(hostname);

  if (state === 'open') {
    throw new Error(`Circuit open for ${hostname} — requests blocked`);
  }

  if (state === 'half-open') {
    if (entry.probing) {
      throw new Error(`Circuit half-open for ${hostname} — probe in progress`);
    }
    entry.probing = true;
  }

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 1000));
    }
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        const is5xx = response.status >= 500;
        const err = new Error(`HTTP ${response.status}: ${response.statusText}`);
        if (!is5xx) {
          // 4xx errors: reset circuit (not a server fault) but still throw for callers
          entry.failures = 0;
          entry.openedAt = null;
          entry.probing = false;
          throw err;
        }
        throw err;
      }
      // Success — reset circuit
      entry.failures = 0;
      entry.openedAt = null;
      entry.probing = false;
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Don't retry 4xx errors — they won't resolve with retries
      if (lastError.message.startsWith('HTTP 4')) {
        break;
      }
    }
  }

  // All retries exhausted — only count 5xx / network errors toward circuit breaker
  const is4xx = lastError?.message.startsWith('HTTP 4');
  if (!is4xx) {
    entry.failures++;
    if (entry.failures >= FAILURE_THRESHOLD) {
      entry.openedAt = Date.now();
    }
  }
  entry.probing = false;

  throw lastError!;
}
